FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    OBJECT_STORAGE_PATH=/var/data/object_store

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 demsta \
    && mkdir -p /var/data/object_store \
    && chown -R demsta:demsta /var/data /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY scripts ./scripts

RUN sed -i 's/\r$//' ./scripts/start.sh \
    && chmod +x ./scripts/start.sh \
    && chown -R demsta:demsta /app

USER demsta

EXPOSE 8000

# Render sets PORT; start.sh honors it
CMD ["./scripts/start.sh"]
