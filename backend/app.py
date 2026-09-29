import os

import psycopg2
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from psycopg2 import IntegrityError
from werkzeug.exceptions import HTTPException

from auth import auth_bp, maybe_create_bootstrap_admin
from db import close_db, database_url_from_environment
from routes import api_bp

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.update(
        DATABASE_URL=database_url_from_environment(),
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY", ""),
        JWT_EXPIRATION_HOURS=int(os.getenv("JWT_EXPIRATION_HOURS", "12")),
    )
    if test_config:
        app.config.update(test_config)
    if not app.config["DATABASE_URL"]:
        raise RuntimeError("DATABASE_URL must be set before starting Reshopy.")
    if not app.config["JWT_SECRET_KEY"] or len(app.config["JWT_SECRET_KEY"]) < 32:
        raise RuntimeError("JWT_SECRET_KEY must be set to a random value of at least 32 characters.")

    allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
    CORS(app, resources={r"/api/*": {"origins": [origin.strip() for origin in allowed_origins.split(",")]}})
    app.register_blueprint(auth_bp)
    app.register_blueprint(api_bp)
    app.teardown_appcontext(close_db)

    @app.get("/")
    def index():
        return jsonify(name="Reshopy API", version="1.0", health="/api/health")

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify(error="Endpoint not found."), 404

    @app.errorhandler(IntegrityError)
    def integrity_error(_error):
        return jsonify(error="The request conflicts with existing data or a database constraint."), 409

    @app.errorhandler(psycopg2.OperationalError)
    def database_error(_error):
        app.logger.exception("Database connection failed")
        return jsonify(error="Database is unavailable."), 503

    @app.errorhandler(Exception)
    def unexpected_error(error):
        if isinstance(error, HTTPException):
            return jsonify(error=error.description), error.code
        app.logger.exception("Unhandled API error", exc_info=error)
        return jsonify(error="An unexpected server error occurred."), 500

    if os.getenv("BOOTSTRAP_ADMIN_EMAIL") and os.getenv("BOOTSTRAP_ADMIN_PASSWORD"):
        try:
            connection = psycopg2.connect(app.config["DATABASE_URL"], options="-c search_path=reshopy,public")
            try:
                maybe_create_bootstrap_admin(connection)
            finally:
                connection.close()
        except psycopg2.Error as error:
            raise RuntimeError("Could not create the bootstrap admin account.") from error
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")