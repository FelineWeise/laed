# LAED backend

FastAPI application for LAED (project space, chat, RAG, AI).

## Local commands

From this directory:

```bash
poetry install
poetry run alembic heads
poetry run uvicorn app.main:app --reload
```

Migrations use `alembic.ini` in this folder — run Alembic from `backend/`, not repo root.
