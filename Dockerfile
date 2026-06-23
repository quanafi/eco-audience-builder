FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Install deps first for layer caching.
COPY pyproject.toml ./
RUN pip install flask>=3.0 "sqlalchemy>=2.0" psycopg2-binary "python-dotenv>=1.0" "gunicorn>=22.0"

COPY app ./app
COPY static ./static
COPY skills ./skills

EXPOSE 8080

# DATABASE_URL is provided at runtime (Cloud Run env / secret), not baked in.
CMD exec gunicorn --bind :$PORT --workers 2 --threads 4 --timeout 60 app.server:app
