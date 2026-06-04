from pydantic import AliasChoices, Field
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
    llm_gateway_url: str = Field(
        default="http://litellm:4000/v1",
        validation_alias=AliasChoices("LLM_GATEWAY_URL", "OPENAI_BASE_URL"),
    )
    llm_gateway_key: str = Field(
        default="",
        validation_alias=AliasChoices("LLM_GATEWAY_KEY", "OPENAI_API_KEY"),
    )
    llm_model: str = "ollama/qwen3:14b-instruct"
    embedding_model: str = "ollama/nomic-embed-text"

    # Dedicated RAG Postgres (pgvector + rag.*); same URL pattern as llm-gateway RAG_DATABASE_URL
    rag_database_url: str = Field(
        default="",
        validation_alias=AliasChoices("RAG_DATABASE_URL"),
    )
    laed_tenant_id: str = Field(
        default="",
        validation_alias=AliasChoices("LAED_TENANT_ID"),
    )

    # STT — Parakeet
    stt_url: str = "http://parakeet:5092"

    # Task queue
    redis_url: str = "redis://redis:6379/0"

    # Demo account (empty email disables bootstrap)
    demo_email: str = Field(
        default="",
        validation_alias=AliasChoices("LAED_DEMO_EMAIL"),
    )
    demo_password: str = Field(
        default="",
        validation_alias=AliasChoices("LAED_DEMO_PASSWORD"),
    )
    demo_display_name: str = Field(
        default="Demo User",
        validation_alias=AliasChoices("LAED_DEMO_DISPLAY_NAME"),
    )

    search_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices("SEARCH_ENABLED"),
    )
    search_provider: str = Field(
        default="tavily",
        validation_alias=AliasChoices("SEARCH_PROVIDER"),
    )
    tavily_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("TAVILY_API_KEY"),
    )
    serper_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("SERPER_API_KEY"),
    )
    ai_history_max_chars: int = Field(
        default=12000,
        validation_alias=AliasChoices("AI_HISTORY_MAX_CHARS"),
    )
    ai_max_tokens: int = Field(
        default=800,
        validation_alias=AliasChoices("AI_MAX_TOKENS"),
    )

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
