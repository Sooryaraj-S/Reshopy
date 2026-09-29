from decimal import Decimal, InvalidOperation
from io import BytesIO
import re

from flask import Blueprint, g, jsonify, request, send_file
from markupsafe import escape
import psycopg2
from psycopg2 import IntegrityError
from psycopg2.extras import RealDictCursor
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from auth import jwt_required
from db import get_db

api_bp = Blueprint("api", __name__, url_prefix="/api")


def _json_rows(cursor):
    return [dict(row) for row in cursor.fetchall()]


def _body():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _positive_int(value, name, maximum=100000):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name} must be an integer.")
    if parsed <= 0 or parsed > maximum:
        raise ValueError(f"{name} must be between 1 and {maximum}.")
    return parsed


@api_bp.get("/health")
def health():
    try:
        with get_db().cursor() as cursor:
            cursor.execute("SELECT 1")
        return jsonify(status="ok", database="connected")
    except Exception:
        return jsonify(error="Database is unavailable."), 503


@api_bp.get("/products")
def list_products():
    filters = ["p.is_active = true", "c.is_active = true"]
    values = []
    search = request.args.get("q", "").strip()
    category_id = request.args.get("category_id")
    if search:
        filters.append("(p.name ILIKE %s OR p.description ILIKE %s OR p.sku ILIKE %s)")
        values.extend([f"%{search}%"] * 3)
    if category_id:
        try:
            filters.append("p.category_id = %s")
            values.append(_positive_int(category_id, "category_id"))
        except ValueError as error:
            return jsonify(error=str(error)), 400
    try:
        page = max(1, int(request.args.get("page", 1)))
        per_page = min(100, max(1, int(request.args.get("per_page", 48))))
    except ValueError:
        return jsonify(error="page and per_page must be integers."), 400
    order_by = {
        "price_asc": "p.price ASC, p.id ASC",
        "price_desc": "p.price DESC, p.id ASC",
        "name": "p.name ASC, p.id ASC",
        "newest": "p.created_at DESC, p.id DESC",
    }.get(request.args.get("sort", "newest"), "p.created_at DESC, p.id DESC")
    connection = get_db()
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        where_clause = " AND ".join(filters)
        cursor.execute(f"SELECT count(*) AS total FROM products p WHERE {where_clause}", values)
        total = cursor.fetchone()["total"]
        cursor.execute(
            f"""SELECT p.id, p.category_id, c.name AS category_name, p.sku, p.name,
                       p.description, p.price, p.stock_quantity, p.low_stock_threshold,
                       p.image_url, p.created_at
                FROM products p JOIN categories c ON c.id = p.category_id
                WHERE {where_clause} ORDER BY {order_by} LIMIT %s OFFSET %s""",
            [*values, per_page, (page - 1) * per_page],
        )
        products = _json_rows(cursor)
        cursor.execute("SELECT id, name, slug FROM categories WHERE is_active ORDER BY name")
        categories = _json_rows(cursor)
    return jsonify(products=products, categories=categories, page=page, per_page=per_page, total=total)


@api_bp.get("/categories")
def list_categories():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT c.id, c.name, c.slug, c.description, count(p.id) AS product_count
               FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active
               WHERE c.is_active GROUP BY c.id ORDER BY c.name"""
        )
        return jsonify(categories=_json_rows(cursor))


@api_bp.get("/admin/categories")
@jwt_required("admin")
def admin_categories():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT c.id, c.name, c.slug, c.description, c.is_active,
                      count(p.id) AS product_count
               FROM categories c LEFT JOIN products p ON p.category_id = c.id
               GROUP BY c.id ORDER BY c.name"""
        )
        return jsonify(categories=_json_rows(cursor))


@api_bp.post("/admin/categories")
@jwt_required("admin")
def create_category():
    payload = _body()
    name = str(payload.get("name", "")).strip()
    slug = str(payload.get("slug", "")).strip().lower()
    description = payload.get("description")
    if not name:
        return jsonify(error="Category name is required."), 400
    if not slug:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    if len(name) > 120 or len(slug) > 140 or not slug:
        return jsonify(error="Category name or slug is invalid or too long."), 400
    connection = get_db()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """INSERT INTO categories (name, slug, description)
                   VALUES (%s, %s, %s) RETURNING id, name, slug, description, is_active""",
                (name, slug, description),
            )
            category = dict(cursor.fetchone())
        connection.commit()
    except IntegrityError:
        connection.rollback()
        return jsonify(error="Category slug must be unique."), 409
    return jsonify(category=category), 201


@api_bp.put("/admin/categories/<int:category_id>")
@jwt_required("admin")
def update_category(category_id):
    payload = _body()
    fields = ("name", "slug", "description", "is_active")
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return jsonify(error="Provide at least one category field to update."), 400
    for field in ("name", "slug"):
        if field in updates:
            updates[field] = str(updates[field]).strip().lower() if field == "slug" else str(updates[field]).strip()
            maximum = 140 if field == "slug" else 120
            if not updates[field] or len(updates[field]) > maximum:
                return jsonify(error=f"{field.title()} must be between 1 and {maximum} characters."), 400
    if "is_active" in updates and not isinstance(updates["is_active"], bool):
        return jsonify(error="is_active must be true or false."), 400
    assignments = ", ".join(f"{field} = %s" for field in updates)
    connection = get_db()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                f"UPDATE categories SET {assignments}, updated_at = now() WHERE id = %s "
                "RETURNING id, name, slug, description, is_active",
                [*updates.values(), category_id],
            )
            category = cursor.fetchone()
        connection.commit()
    except IntegrityError:
        connection.rollback()
        return jsonify(error="Category slug must be unique."), 409
    if not category:
        return jsonify(error="Category not found."), 404
    return jsonify(category=dict(category))


@api_bp.delete("/admin/categories/<int:category_id>")
@jwt_required("admin")
def archive_category(category_id):
    connection = get_db()
    with connection.cursor() as cursor:
        cursor.execute("UPDATE categories SET is_active = false, updated_at = now() WHERE id = %s", (category_id,))
        changed = cursor.rowcount
    connection.commit()
    if not changed:
        return jsonify(error="Category not found."), 404
    return jsonify(message="Category archived.")


@api_bp.post("/admin/products")
@jwt_required("admin")
def create_product():
    payload = _body()
    required = ("category_id", "sku", "name", "price")
    if any(payload.get(key) in (None, "") for key in required):
        return jsonify(error="category_id, sku, name, and price are required."), 400
    try:
        category_id = _positive_int(payload["category_id"], "category_id")
        stock = int(payload.get("stock_quantity", 0))
        threshold = int(payload.get("low_stock_threshold", 5))
        price = Decimal(str(payload["price"]))
        if stock < 0 or threshold < 0 or price < 0 or not price.is_finite():
            raise ValueError("Price, stock, and threshold must be non-negative.")
    except (ValueError, InvalidOperation) as error:
        return jsonify(error=str(error)), 400
    connection = get_db()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """INSERT INTO products (category_id, sku, name, description, price,
                       stock_quantity, low_stock_threshold, image_url)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id, category_id, sku, name, description, price,
                             stock_quantity, low_stock_threshold, image_url, is_active""",
                (category_id, str(payload["sku"]).strip(), str(payload["name"]).strip(),
                 payload.get("description"), price, stock, threshold, payload.get("image_url")),
            )
            product = dict(cursor.fetchone())
        connection.commit()
    except IntegrityError as error:
        connection.rollback()
        return jsonify(error="SKU must be unique and category_id must exist."), 409
    return jsonify(product=product), 201


@api_bp.put("/admin/products/<int:product_id>")
@jwt_required("admin")
def update_product(product_id):
    payload = _body()
    fields = ("category_id", "sku", "name", "description", "price", "stock_quantity", "low_stock_threshold", "image_url", "is_active")
    updates = {key: payload[key] for key in fields if key in payload}
    if not updates:
        return jsonify(error="Provide at least one product field to update."), 400
    if "category_id" in updates:
        try:
            updates["category_id"] = _positive_int(updates["category_id"], "category_id")
        except ValueError as error:
            return jsonify(error=str(error)), 400
    for field in ("stock_quantity", "low_stock_threshold"):
        if field in updates:
            try:
                updates[field] = int(updates[field])
            except (TypeError, ValueError):
                return jsonify(error=f"{field} must be an integer."), 400
            if updates[field] < 0:
                return jsonify(error=f"{field} cannot be negative."), 400
    if "price" in updates:
        try:
            updates["price"] = Decimal(str(updates["price"]))
        except InvalidOperation:
            return jsonify(error="price must be numeric."), 400
        if updates["price"] < 0 or not updates["price"].is_finite():
            return jsonify(error="price must be a non-negative finite number."), 400
    assignments = ", ".join(f"{field} = %s" for field in updates)
    values = list(updates.values()) + [product_id]
    connection = get_db()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                f"UPDATE products SET {assignments}, updated_at = now() WHERE id = %s "
                "RETURNING id, category_id, sku, name, description, price, stock_quantity, low_stock_threshold, image_url, is_active",
                values,
            )
            product = cursor.fetchone()
        connection.commit()
    except IntegrityError:
        connection.rollback()
        return jsonify(error="SKU must be unique and category_id must exist."), 409
    if not product:
        return jsonify(error="Product not found."), 404
    return jsonify(product=dict(product))


@api_bp.delete("/admin/products/<int:product_id>")
@jwt_required("admin")
def archive_product(product_id):
    connection = get_db()
    with connection.cursor() as cursor:
        cursor.execute("UPDATE products SET is_active = false, updated_at = now() WHERE id = %s", (product_id,))
        changed = cursor.rowcount
    connection.commit()
    if not changed:
        return jsonify(error="Product not found."), 404
    return jsonify(message="Product archived.")


def _get_or_create_cart(cursor, customer_id):
    cursor.execute(
        """INSERT INTO carts (customer_id) VALUES (%s)
           ON CONFLICT (customer_id) DO UPDATE SET updated_at = now()
           RETURNING id""",
        (customer_id,),
    )
    return cursor.fetchone()["id"]


@api_bp.get("/cart")
@jwt_required()
def get_cart():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cart_id = _get_or_create_cart(cursor, g.customer_id)
        cursor.execute(
            """SELECT ci.product_id, p.name, p.sku, p.image_url, p.stock_quantity,
                      ci.quantity, p.price, p.price * ci.quantity AS line_total
               FROM cart_items ci JOIN products p ON p.id = ci.product_id
               WHERE ci.cart_id = %s ORDER BY ci.created_at""",
            (cart_id,),
        )
        items = _json_rows(cursor)
    get_db().commit()
    return jsonify(items=items, subtotal=sum((item["line_total"] for item in items), Decimal("0.00")))


@api_bp.post("/cart/items")
@jwt_required()
def add_cart_item():
    payload = _body()
    try:
        product_id = _positive_int(payload.get("product_id"), "product_id")
        quantity = _positive_int(payload.get("quantity", 1), "quantity", 99)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    connection = get_db()
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cart_id = _get_or_create_cart(cursor, g.customer_id)
        cursor.execute("SELECT stock_quantity, is_active FROM products WHERE id = %s FOR UPDATE", (product_id,))
        product = cursor.fetchone()
        if not product or not product["is_active"]:
            connection.rollback()
            return jsonify(error="Product is unavailable."), 404
        cursor.execute("SELECT quantity FROM cart_items WHERE cart_id = %s AND product_id = %s", (cart_id, product_id))
        existing = cursor.fetchone()
        requested = quantity + (existing["quantity"] if existing else 0)
        if requested > product["stock_quantity"]:
            connection.rollback()
            return jsonify(error="Requested quantity exceeds available stock."), 409
        cursor.execute(
            """INSERT INTO cart_items (cart_id, product_id, quantity)
               VALUES (%s, %s, %s)
               ON CONFLICT (cart_id, product_id) DO UPDATE
               SET quantity = cart_items.quantity + EXCLUDED.quantity, updated_at = now()""",
            (cart_id, product_id, quantity),
        )
    connection.commit()
    return get_cart()


@api_bp.put("/cart/items/<int:product_id>")
@jwt_required()
def update_cart_item(product_id):
    payload = _body()
    try:
        quantity = _positive_int(payload.get("quantity"), "quantity", 99)
    except ValueError as error:
        return jsonify(error=str(error)), 400
    connection = get_db()
    with connection.cursor() as cursor:
        cursor.execute(
            """UPDATE cart_items ci SET quantity = %s, updated_at = now()
               FROM carts c, products p
               WHERE ci.cart_id = c.id AND c.customer_id = %s
                 AND ci.product_id = p.id AND p.id = %s AND p.is_active AND p.stock_quantity >= %s""",
            (quantity, g.customer_id, product_id, quantity),
        )
        changed = cursor.rowcount
    if not changed:
        connection.rollback()
        return jsonify(error="Cart item not found or quantity exceeds available stock."), 404
    connection.commit()
    return get_cart()


@api_bp.delete("/cart/items/<int:product_id>")
@jwt_required()
def remove_cart_item(product_id):
    connection = get_db()
    with connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM cart_items ci USING carts c WHERE ci.cart_id = c.id AND c.customer_id = %s AND ci.product_id = %s",
            (g.customer_id, product_id),
        )
        changed = cursor.rowcount
    connection.commit()
    if not changed:
        return jsonify(error="Cart item not found."), 404
    return get_cart()


@api_bp.post("/orders")
@jwt_required()
def place_order():
    payload = _body()
    fields = ("shipping_name", "shipping_address1", "shipping_city", "shipping_postal_code", "shipping_country", "payment_method")
    if any(not isinstance(payload.get(key), str) or not payload[key].strip() for key in fields):
        return jsonify(error="Shipping details and payment_method are required."), 400
    if len(payload["shipping_country"].strip()) != 2:
        return jsonify(error="shipping_country must be a two-letter country code."), 400
    if payload["payment_method"] not in ("card", "paypal", "cash_on_delivery"):
        return jsonify(error="Unsupported payment method."), 400
    connection = get_db()
    try:
        with connection.cursor(cursor_factory=psycopg2.extensions.cursor) as cursor:
            cursor.execute(
                """CALL place_order(%s, %s, %s, %s, %s, %s, %s, %s, %s, NULL)""",
                (g.customer_id, payload["shipping_name"], payload["shipping_address1"],
                 payload.get("shipping_address2"), payload["shipping_city"], payload.get("shipping_region"),
                 payload["shipping_postal_code"], payload["shipping_country"], payload["payment_method"]),
            )
            result = cursor.fetchone()
        connection.commit()
    except Exception as error:
        connection.rollback()
        if getattr(error, "pgcode", None) in ("22023", "P0002"):
            return jsonify(error=str(error).splitlines()[0]), 409
        raise
    order_id = result[0] if result else None
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT id, invoice_number, status, payment_status, total_amount, placed_at FROM orders WHERE id = %s", (order_id,))
        order = cursor.fetchone()
    return jsonify(order=dict(order)), 201


@api_bp.get("/orders")
@jwt_required()
def list_orders():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT id, invoice_number, status, payment_status, currency, total_amount, placed_at
               FROM orders WHERE customer_id = %s ORDER BY placed_at DESC""",
            (g.customer_id,),
        )
        return jsonify(orders=_json_rows(cursor))


@api_bp.get("/orders/<int:order_id>")
@jwt_required()
def get_order(order_id):
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        if g.customer_role == "admin":
            cursor.execute("SELECT * FROM orders WHERE id = %s", (order_id,))
        else:
            cursor.execute("SELECT * FROM orders WHERE id = %s AND customer_id = %s", (order_id, g.customer_id))
        order = cursor.fetchone()
        if not order:
            return jsonify(error="Order not found."), 404
        cursor.execute(
            """SELECT product_id, product_name, product_sku, unit_price, quantity, line_total
               FROM order_items WHERE order_id = %s ORDER BY id""",
            (order_id,),
        )
        order["items"] = _json_rows(cursor)
    return jsonify(order=dict(order))


@api_bp.get("/orders/<int:order_id>/invoice")
@jwt_required()
def download_invoice(order_id):
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        if g.customer_role == "admin":
            cursor.execute(
                """SELECT o.*, c.first_name, c.last_name, c.email
                   FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = %s""",
                (order_id,),
            )
        else:
            cursor.execute(
                """SELECT o.*, c.first_name, c.last_name, c.email
                   FROM orders o JOIN customers c ON c.id = o.customer_id
                   WHERE o.id = %s AND o.customer_id = %s""",
                (order_id, g.customer_id),
            )
        order = cursor.fetchone()
        if not order:
            return jsonify(error="Order not found."), 404
        cursor.execute(
            """SELECT product_name, product_sku, unit_price, quantity, line_total
               FROM order_items WHERE order_id = %s ORDER BY id""",
            (order_id,),
        )
        items = _json_rows(cursor)

    buffer = BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=22 * mm, leftMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("RESHOPY", styles["Title"]),
        Paragraph(f"Invoice {escape(order['invoice_number'])}", styles["Heading2"]),
        Paragraph(f"Placed {order['placed_at'].strftime('%B %d, %Y')}", styles["Normal"]),
        Spacer(1, 8 * mm),
        Paragraph(f"<b>Bill to</b><br/>{escape(order['shipping_name'])}<br/>{escape(order['shipping_address1'])}<br/>{escape(order['shipping_city'])}, {escape(order['shipping_region'] or '')} {escape(order['shipping_postal_code'])}<br/>{escape(order['shipping_country'])}<br/>{escape(order['email'])}", styles["Normal"]),
        Spacer(1, 8 * mm),
    ]
    table_rows = [["Item", "SKU", "Qty", "Unit price", "Line total"]]
    for item in items:
        table_rows.append([
            Paragraph(str(escape(item["product_name"])), styles["BodyText"]),
            str(escape(item["product_sku"])),
            str(item["quantity"]),
            f"{item['unit_price']:,.2f} {order['currency']}",
            f"{item['line_total']:,.2f} {order['currency']}",
        ])
    invoice_table = Table(table_rows, colWidths=[67 * mm, 31 * mm, 15 * mm, 28 * mm, 30 * mm], repeatRows=1)
    invoice_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#275848")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#d9ded9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([invoice_table, Spacer(1, 6 * mm)])
    totals = [
        ["Subtotal", f"{order['subtotal']:,.2f} {order['currency']}"],
        ["Tax", f"{order['tax_amount']:,.2f} {order['currency']}"],
        ["Shipping", f"{order['shipping_amount']:,.2f} {order['currency']}"],
        ["Discount", f"-{order['discount_amount']:,.2f} {order['currency']}"],
        ["Total", f"{order['total_amount']:,.2f} {order['currency']}"],
    ]
    total_table = Table(totals, colWidths=[130 * mm, 41 * mm], hAlign="RIGHT")
    total_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor("#275848")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.extend([total_table, Spacer(1, 12 * mm), Paragraph("Thank you for choosing Reshopy.", styles["Italic"])])
    document.build(story)
    buffer.seek(0)
    return send_file(buffer, mimetype="application/pdf", as_attachment=True, download_name=f"{order['invoice_number']}.pdf")


@api_bp.get("/admin/orders")
@jwt_required("admin")
def admin_orders():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT o.id, o.invoice_number, o.customer_id,
                      c.first_name || ' ' || c.last_name AS customer_name,
                      o.status, o.payment_status, o.currency, o.total_amount, o.placed_at
               FROM orders o JOIN customers c ON c.id = o.customer_id
               ORDER BY o.placed_at DESC LIMIT 200"""
        )
        return jsonify(orders=_json_rows(cursor))


@api_bp.patch("/admin/orders/<int:order_id>/status")
@jwt_required("admin")
def update_order_status(order_id):
    payload = _body()
    status = payload.get("status")
    allowed = {"pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"}
    if not isinstance(status, str) or status not in allowed:
        return jsonify(error="Invalid order status."), 400
    connection = get_db()
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            "UPDATE orders SET status = %s, updated_at = now() WHERE id = %s RETURNING id, invoice_number, status, payment_status",
            (status, order_id),
        )
        order = cursor.fetchone()
    connection.commit()
    if not order:
        return jsonify(error="Order not found."), 404
    return jsonify(order=dict(order))


@api_bp.get("/admin/customers")
@jwt_required("admin")
def admin_customers():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT c.id, c.first_name, c.last_name, c.email, c.role, c.is_active,
                      c.created_at, count(o.id) AS order_count,
                      coalesce(sum(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded')), 0) AS lifetime_value
               FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
               GROUP BY c.id ORDER BY c.created_at DESC"""
        )
        return jsonify(customers=_json_rows(cursor))


@api_bp.patch("/admin/customers/<int:customer_id>/status")
@jwt_required("admin")
def update_customer_status(customer_id):
    payload = _body()
    if not isinstance(payload.get("is_active"), bool):
        return jsonify(error="is_active must be true or false."), 400
    if customer_id == g.customer_id and not payload["is_active"]:
        return jsonify(error="You cannot deactivate your own administrator account."), 400
    connection = get_db()
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            "UPDATE customers SET is_active = %s, updated_at = now() WHERE id = %s RETURNING id, is_active",
            (payload["is_active"], customer_id),
        )
        customer = cursor.fetchone()
    connection.commit()
    if not customer:
        return jsonify(error="Customer not found."), 404
    return jsonify(customer=dict(customer))


@api_bp.get("/admin/reports/<report_name>")
@jwt_required("admin")
def admin_report(report_name):
    reports = {
        "sales": ("SELECT * FROM v_sales_report ORDER BY sales_date DESC LIMIT 90", ()),
        "revenue": ("SELECT * FROM v_revenue_report ORDER BY revenue_date DESC LIMIT 90", ()),
        "best-sellers": ("SELECT * FROM v_best_selling_products ORDER BY units_sold DESC, sales_total DESC LIMIT 10", ()),
        "inventory": ("SELECT * FROM v_inventory_report ORDER BY is_low_stock DESC, stock_quantity ASC, product_name", ()),
        "categories": ("SELECT * FROM v_category_sales_analysis ORDER BY product_sales DESC", ()),
        "customers": ("SELECT * FROM v_customer_purchase_history ORDER BY placed_at DESC LIMIT 100", ()),
    }
    if report_name not in reports:
        return jsonify(error="Unknown report."), 404
    query, params = reports[report_name]
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(query, params)
        rows = _json_rows(cursor)
    return jsonify(report=report_name, rows=rows)