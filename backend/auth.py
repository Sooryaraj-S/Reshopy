import functools
import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from flask import Blueprint, current_app, g, jsonify, request
from psycopg2 import IntegrityError
from psycopg2.extras import RealDictCursor

from db import get_db

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _payload():
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def issue_token(customer):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(customer["id"]),
            "role": customer["role"],
            "iat": now,
            "exp": now + timedelta(hours=current_app.config["JWT_EXPIRATION_HOURS"]),
        },
        current_app.config["JWT_SECRET_KEY"],
        algorithm="HS256",
    )


def jwt_required(role=None):
    def decorator(view):
        @functools.wraps(view)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get("Authorization", "")
            scheme, _, token = authorization.partition(" ")
            if scheme.lower() != "bearer" or not token:
                return jsonify(error="A bearer token is required."), 401
            try:
                claims = jwt.decode(
                    token,
                    current_app.config["JWT_SECRET_KEY"],
                    algorithms=["HS256"],
                )
                g.customer_id = int(claims["sub"])
                with get_db().cursor() as cursor:
                    cursor.execute("SELECT role, is_active FROM customers WHERE id = %s", (g.customer_id,))
                    account = cursor.fetchone()
                if not account or not account["is_active"]:
                    return jsonify(error="This customer account is inactive or unavailable."), 401
                g.customer_role = account["role"]
            except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
                return jsonify(error="The access token is invalid or expired."), 401
            if role and g.customer_role != role:
                return jsonify(error="Administrator access is required."), 403
            return view(*args, **kwargs)

        return wrapped

    return decorator


def _customer_by_email(email):
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT id, first_name, last_name, email, password_hash, role, is_active
               FROM customers WHERE lower(email) = lower(%s)""",
            (email,),
        )
        return cursor.fetchone()


@auth_bp.post("/register")
def register():
    payload = _payload()
    first_name = str(payload.get("first_name", "")).strip()
    last_name = str(payload.get("last_name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = payload.get("password", "")
    if not first_name or not last_name or not email or not isinstance(password, str):
        return jsonify(error="First name, last name, email, and password are required."), 400
    if len(first_name) > 80 or len(last_name) > 80 or len(email) > 254:
        return jsonify(error="One or more fields exceed the allowed length."), 400
    if "@" not in email or len(password) < 10 or len(password.encode("utf-8")) > 72:
        return jsonify(error="Provide a valid email and a password between 10 and 72 characters."), 400

    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    connection = get_db()
    try:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                """INSERT INTO customers (first_name, last_name, email, password_hash)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, first_name, last_name, email, role""",
                (first_name, last_name, email, password_hash),
            )
            customer = cursor.fetchone()
            cursor.execute("INSERT INTO carts (customer_id) VALUES (%s)", (customer["id"],))
        connection.commit()
    except IntegrityError:
        connection.rollback()
        return jsonify(error="An account with this email already exists."), 409
    return jsonify(customer=dict(customer), token=issue_token(customer)), 201


@auth_bp.post("/login")
def login():
    payload = _payload()
    email = str(payload.get("email", "")).strip().lower()
    password = payload.get("password", "")
    if not email or not isinstance(password, str):
        return jsonify(error="Email and password are required."), 400
    customer = _customer_by_email(email)
    if (
        not customer
        or not customer["is_active"]
        or not bcrypt.checkpw(password.encode("utf-8"), customer["password_hash"].encode("utf-8"))
    ):
        return jsonify(error="Email or password is incorrect."), 401
    public_customer = {key: customer[key] for key in ("id", "first_name", "last_name", "email", "role")}
    return jsonify(customer=public_customer, token=issue_token(customer))


@auth_bp.get("/me")
@jwt_required()
def me():
    with get_db().cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            """SELECT id, first_name, last_name, email, phone, address_line1,
                      address_line2, city, region, postal_code, country_code, role
               FROM customers WHERE id = %s AND is_active""",
            (g.customer_id,),
        )
        customer = cursor.fetchone()
    if not customer:
        return jsonify(error="Customer account was not found."), 404
    return jsonify(customer=dict(customer))


@auth_bp.patch("/me")
@jwt_required()
def update_profile():
    payload = _payload()
    allowed = {
        "first_name", "last_name", "phone", "address_line1", "address_line2",
        "city", "region", "postal_code", "country_code",
    }
    updates = {key: payload[key] for key in allowed if key in payload}
    if not updates:
        return jsonify(error="No editable profile fields were provided."), 400
    for key in ("first_name", "last_name"):
        if key in updates and not str(updates[key]).strip():
            return jsonify(error=f"{key.replace('_', ' ').title()} cannot be blank."), 400
    assignments = ", ".join(f"{key} = %s" for key in updates)
    values = [str(value).strip() if value is not None else None for value in updates.values()]
    values.append(g.customer_id)
    connection = get_db()
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute(
            f"UPDATE customers SET {assignments}, updated_at = now() WHERE id = %s "
            "RETURNING id, first_name, last_name, email, phone, address_line1, address_line2, city, region, postal_code, country_code, role",
            values,
        )
        customer = cursor.fetchone()
    connection.commit()
    return jsonify(customer=dict(customer))


@auth_bp.post("/change-password")
@jwt_required()
def change_password():
    payload = _payload()
    current_password = payload.get("current_password", "")
    new_password = payload.get("new_password", "")
    if not isinstance(current_password, str) or not isinstance(new_password, str):
        return jsonify(error="Current and new passwords are required."), 400
    if len(new_password) < 10 or len(new_password.encode("utf-8")) > 72:
        return jsonify(error="New password must be between 10 and 72 characters."), 400
    connection = get_db()
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("SELECT password_hash FROM customers WHERE id = %s FOR UPDATE", (g.customer_id,))
        row = cursor.fetchone()
        if not row or not bcrypt.checkpw(current_password.encode(), row["password_hash"].encode()):
            return jsonify(error="Current password is incorrect."), 401
        digest = bcrypt.hashpw(new_password.encode(), bcrypt.gensalt()).decode()
        cursor.execute("UPDATE customers SET password_hash = %s, updated_at = now() WHERE id = %s", (digest, g.customer_id))
    connection.commit()
    return jsonify(message="Password updated successfully.")


def maybe_create_bootstrap_admin(connection):
    """Create an admin only when both bootstrap environment variables are set."""
    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    if len(password) < 12 or len(password) > 72:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be 12-72 characters.")
    digest = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    with connection.cursor() as cursor:
        cursor.execute("SELECT id, role FROM customers WHERE lower(email) = lower(%s)", (email,))
        existing = cursor.fetchone()
        if existing:
            if existing[1] != "admin":
                raise RuntimeError("BOOTSTRAP_ADMIN_EMAIL belongs to a non-admin account.")
            cursor.execute("UPDATE customers SET password_hash = %s, updated_at = now() WHERE id = %s", (digest, existing[0]))
            connection.commit()
            return
        cursor.execute(
            """INSERT INTO customers (first_name, last_name, email, password_hash, role)
               VALUES ('Reshopy', 'Admin', %s, %s, 'admin')""",
            (email, digest),
        )
    connection.commit()