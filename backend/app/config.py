from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://app:changeme@postgres:5432/projectspace"

    # Auth
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    # MinIO
    minio_url: str = "minio:9000"
    minio_access_key: str = "changeme"
    minio_secret_key: str = "changeme"

    # LLM — gateway (primary, used by app)
    llm_gateway_url: str = "http://litellm:4000/v1"
    llm_gateway_key: str = ""
    llm_model: str = "laed-chat"
    embedding_model: str = "laed-embed"
    thirdparty_litellm_url: str = "https://ai-gateway.eraneos.com"
    thirdparty_litellm_key: str = ""
    model_catalog_ttl_seconds: int = 300

    # LLM — direct Ollama (fallback / legacy)
    ollama_url: str = "http://localhost:11434"

    # STT — Parakeet
    stt_url: str = "http://parakeet:5092"

    # Task queue
    redis_url: str = "redis://redis:6379/0"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
