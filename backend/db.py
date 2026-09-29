import os

import psycopg2
from flask import current_app, g
from psycopg2.extras import RealDictCursor


def get_db():
    """Return this request's PostgreSQL connection, opening it lazily."""
    if "db" not in g:
        g.db = psycopg2.connect(
            current_app.config["DATABASE_URL"],
            cursor_factory=RealDictCursor,
            options="-c search_path=reshopy,public",
            connect_timeout=5,
        )
    return g.db


def close_db(_error=None):
    connection = g.pop("db", None)
    if connection is not None:
        if connection.status != psycopg2.extensions.STATUS_READY:
            connection.rollback()
        connection.close()


def database_url_from_environment():
    return os.getenv("DATABASE_URL", "").strip()