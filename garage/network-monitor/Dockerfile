FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/data \
    && chown -R 10001:10001 /app

WORKDIR /app
COPY --chown=10001:10001 main.py /app/main.py

USER 10001:10001
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=60s --timeout=5s --start-period=15s --retries=3 CMD ["python", "-c", "import os; os.kill(1, 0)"]

CMD ["python", "/app/main.py"]
