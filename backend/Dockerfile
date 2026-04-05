FROM python:3.12-slim AS builder

RUN pip install --no-cache-dir poetry==2.1.1 && \
    poetry config virtualenvs.in-project true

WORKDIR /build
COPY pyproject.toml poetry.lock ./
RUN poetry install --only main --no-root --no-interaction

COPY app/ app/

FROM python:3.12-slim

WORKDIR /app
COPY --from=builder /build/.venv /app/.venv
COPY --from=builder /build/app /app/app

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
