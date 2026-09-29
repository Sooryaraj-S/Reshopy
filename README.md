# Reshopy

Reshopy is a full-stack commerce management application for a curated home and lifestyle shop. The project pairs a PostgreSQL relational database with a Flask REST API and a React storefront/admin console. It includes customer accounts, JWT authentication, product and inventory management, carts, transactional checkout, order tracking, downloadable PDF invoices, and sales reporting.

## Stack

- PostgreSQL 14+ with foreign keys, checks, indexes, views, and a PL/pgSQL checkout procedure
- Python 3.10+ and Flask REST APIs
- React 19, Vite, Tailwind CSS, React Router, Recharts, and lucide-react
- Playfair Display headings and Inter body text

## Project Layout

```text
database.sql        Schema, constraints, indexes, views, stored procedure, and seed data
reports.sql         Admin reporting queries
backend/
  app.py            Flask application entry point and error handling
  auth.py           Registration, login, profile, password, and JWT access control
  db.py             Per-request PostgreSQL connection management
  routes.py         Product, cart, order, invoice, admin, and report APIs
  requirements.txt  Python dependencies
frontend/
  src/              React routes, storefront, dashboard, and API client
```

The schema inserts at least five records into every required table. Seeded password hashes are random and cannot be used to sign in. Configure the optional bootstrap admin environment variables after loading the SQL script to set a usable password for the seeded `admin@reshopy.test` administrator.

## Requirements

- PostgreSQL 14 or newer, with `psql` available on your terminal path
- Python 3.10 or newer
- Node.js 20 or newer and npm

## Database Setup

Create a database and application role using your normal PostgreSQL administration method. For a local development instance, a superuser can run:

```sql
CREATE ROLE reshopy_user WITH LOGIN PASSWORD 'use-a-local-secret';
CREATE DATABASE reshopy OWNER reshopy_user;
```

Load the schema and sample data:

```powershell
psql -U reshopy_user -d reshopy -f database.sql
```

The script creates the `reshopy` schema and uses the `pgcrypto` extension for non-usable randomized seed password hashes. The reporting definitions are installed by the same script. The standalone dashboard queries are in `reports.sql`; the customer-history query uses `$1` as a PostgreSQL driver bind parameter.

## Start the Backend

Create and activate a virtual environment from the project root, then install the backend requirements:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` and set `DATABASE_URL` and a unique `JWT_SECRET_KEY` of at least 32 characters. For local development, set `BOOTSTRAP_ADMIN_EMAIL=admin@reshopy.test` and choose a unique `BOOTSTRAP_ADMIN_PASSWORD` of 12–72 UTF-8 bytes. The application will initialize or reset that seeded admin account's password; it refuses to promote an existing non-admin account.

Start the API:

```powershell
py backend/app.py
```

The API listens at `http://localhost:5000`. Verify connectivity at `http://localhost:5000/api/health`.

### Python Dependencies

`backend/requirements.txt` contains the pinned runtime packages: Flask, Flask-Cors, psycopg2-binary, PyJWT, bcrypt, python-dotenv, and ReportLab. Install them with `py -m pip install -r backend/requirements.txt` from the repository root.

## Start the Frontend

In a second terminal:

```powershell
Push-Location frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The default API URL is `http://localhost:5000/api`; set `VITE_API_URL` in `frontend/.env` if the backend runs elsewhere. The `/admin` route requires an administrator JWT. Sign in with the bootstrap administrator account at the storefront, then open `/admin`.

Create a production bundle with `npm run build` from `frontend/`.

## API Overview

All endpoints are under `/api`. Protected endpoints accept `Authorization: Bearer <token>`.

| Area | Endpoints |
| --- | --- |
| Health and catalog | `GET /health`, `GET /products`, `GET /categories` |
| Customer auth/profile | `POST /auth/register`, `POST /auth/login`, `GET/PATCH /auth/me`, `POST /auth/change-password` |
| Cart | `GET /cart`, `POST /cart/items`, `PUT/DELETE /cart/items/<product_id>` |
| Customer orders | `POST /orders`, `GET /orders`, `GET /orders/<order_id>`, `GET /orders/<order_id>/invoice` |
| Admin products | `POST /admin/products`, `PUT/DELETE /admin/products/<product_id>` |
| Admin operations | `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/<category_id>`, `POST /admin/products`, `PUT/DELETE /admin/products/<product_id>`, `GET /admin/orders`, `PATCH /admin/orders/<order_id>/status`, `GET /admin/customers`, `PATCH /admin/customers/<customer_id>/status` |
| Admin reports | `GET /admin/reports/sales`, `/revenue`, `/best-sellers`, `/inventory`, `/categories`, `/customers` |

Registration, login, product browsing, cart updates, checkout, order history, and invoice downloads are wired into the customer UI. The admin UI covers product CRUD/archive, stock visibility, order status updates, customer activation, and all six report views.

## Assessment Notes

- PostgreSQL foreign keys and check constraints protect relationships, order/payment states, and non-negative stock/prices.
- The `place_order` stored procedure locks the cart and stock rows, validates current availability, snapshots product details, decrements inventory, and empties the cart within the caller's transaction.
- Passwords are bcrypt-hashed by the API. JWT and database credentials are read from environment variables; do not commit `.env` files.
- Payment method selection is a demo checkout only. No card data is collected or charged; connect a payment provider before accepting real payments.
- Restrict CORS, rotate secrets, serve only over HTTPS, and use managed PostgreSQL credentials for deployment.