-- Reshopy admin reporting queries (PostgreSQL 14+).
SET search_path TO reshopy, public;

-- Daily sales totals include paid and unpaid non-cancelled orders, grouped by currency.
WITH eligible_orders AS (
    SELECT id, date_trunc('day', placed_at)::date AS sales_date, currency,
           subtotal, tax_amount, shipping_amount, discount_amount, total_amount
    FROM orders
    WHERE status NOT IN ('cancelled', 'refunded')
), daily_amounts AS (
    SELECT sales_date, currency, count(*) AS order_count,
           sum(subtotal) AS subtotal, sum(tax_amount) AS tax_amount,
           sum(shipping_amount) AS shipping_amount, sum(discount_amount) AS discount_amount,
           sum(total_amount) AS sales_total
    FROM eligible_orders
    GROUP BY sales_date, currency
), daily_units AS (
    SELECT eo.sales_date, eo.currency, sum(oi.quantity) AS units_sold
    FROM eligible_orders eo
    JOIN order_items oi ON oi.order_id = eo.id
    GROUP BY eo.sales_date, eo.currency
)
SELECT d.sales_date, d.currency, d.order_count, coalesce(u.units_sold, 0) AS units_sold,
       d.subtotal, d.tax_amount, d.shipping_amount, d.discount_amount, d.sales_total
FROM daily_amounts d
LEFT JOIN daily_units u USING (sales_date, currency)
ORDER BY d.sales_date DESC, d.currency;

-- Recognized revenue counts only paid orders that have not been cancelled or refunded.
SELECT date_trunc('day', placed_at)::date AS revenue_date,
       currency, count(*) AS paid_order_count, sum(total_amount) AS recognized_revenue
FROM orders
WHERE payment_status = 'paid' AND status NOT IN ('cancelled', 'refunded')
GROUP BY date_trunc('day', placed_at)::date, currency
ORDER BY revenue_date DESC, currency;

-- Best sellers rank active products by units sold, then by product sales value.
SELECT p.id AS product_id, p.sku, p.name AS product_name, c.name AS category_name,
       sum(oi.quantity) AS units_sold, sum(oi.line_total) AS sales_total
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
JOIN categories c ON c.id = p.category_id
WHERE o.status NOT IN ('cancelled', 'refunded')
GROUP BY p.id, p.sku, p.name, c.name
ORDER BY sum(oi.quantity) DESC, sum(oi.line_total) DESC
LIMIT 10;

-- Customer purchase history lists orders and item totals for the selected customer ID.
SELECT customer_id, first_name, last_name, email, order_id, invoice_number,
       placed_at, order_status, payment_status, currency, line_count,
       units_purchased, total_amount
FROM v_customer_purchase_history
WHERE customer_id = $1
ORDER BY placed_at DESC;

-- Inventory report highlights active products at or below their low-stock threshold.
SELECT product_id, sku, product_name, category_name, price, stock_quantity,
       low_stock_threshold, is_low_stock
FROM v_inventory_report
WHERE is_active AND is_low_stock
ORDER BY stock_quantity ASC, product_name;

-- Category sales analysis aggregates item quantity and value by category and currency.
SELECT category_id, category_name, currency, units_sold, product_sales, order_count
FROM v_category_sales_analysis
ORDER BY product_sales DESC, category_name;