"""Application settings loaded from environment."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Pulso"
    environment: str = "development"
    debug: bool = True

    database_url: str = "postgresql+asyncpg://pulso:pulso@localhost:5432/pulso"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 60 * 24

    cors_origins: str = "http://localhost:3000"

    starting_credits: float = 10_000.0
    commission_rate: float = 0.05  # house fee charged on each realized gain (5% of profit)
    tick_size: float = 0.01

    # ----- Pagos / dinero real (wallet-ready) -----
    # Rieles APAGADOS por defecto: la estructura existe y el admin la ve, pero los
    # endpoints de usuario (depositar/retirar) están gateados hasta activar esto.
    payments_enabled: bool = False
    default_currency: str = "PYG"

    # ----- KYC / verificación de identidad con documentos -----
    # Toda cuenta nueva pasa por revisión manual (datos + selfie + cédula frente/dorso)
    # antes de poder operar. Los usuarios existentes al momento del deploy quedan
    # grandfathered (APPROVED) por la migración, así no se les corta el acceso.
    kyc_required_to_trade: bool = True
    kyc_review_sla_hours: int = 48            # texto de demora que se le muestra al usuario
    kyc_max_file_bytes: int = 8 * 1024 * 1024  # límite por imagen subida (8 MB)

    # Storage de documentos KYC. Backend: "r2" (Cloudflare R2, S3-compatible) o
    # "filesystem" (solo dev; en Render el disco es efímero). Las imágenes NUNCA
    # van en la DB: se guarda solo un puntero (storage_key).
    kyc_storage_backend: str = "filesystem"
    kyc_local_storage_dir: str = ".kyc_store"  # solo para filesystem (dev)
    # Cloudflare R2 (S3-compatible). Endpoint: https://<account_id>.r2.cloudflarestorage.com
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = ""
    r2_endpoint: str = ""                      # opcional; si vacío se arma con r2_account_id

    seed_on_startup: bool = True
    # Datos demo (usuarios/mercados/posiciones de ejemplo). ON por ahora (fase
    # demo/preview): se siembran al arrancar de forma idempotente, sin tocar los
    # mercados reales. Al ir a producción real, poné SEED_DEMO_DATA=false.
    seed_demo_data: bool = True
    # Limpieza ÚNICA de datos demo ya existentes en la base (ver seed.purge_demo_data).
    # Se corre una sola vez (marcador en app_settings). Setealo en true para el deploy
    # de limpieza y luego podés dejarlo o volverlo a false.
    purge_demo_data: bool = False
    # Al arrancar, esta cuenta (por email) se marca como admin principal (superadmin).
    # Prod-friendly: se setea en la env var SUPERADMIN_EMAIL y toma efecto en el próximo deploy.
    superadmin_email: str = ""
    admin_email: str = "admin@pulso.local"
    admin_password: str = "admin123"
    create_default_admin: bool = False  # set true ONLY when bootstrapping a fresh DB

    frontend_base_url: str = "http://localhost:3000"
    expose_verification_link_in_dev: bool = True
    require_email_verification_to_trade: bool = True

    # ----- Email (SendGrid) -----
    sendgrid_api_key: str = ""             # leave empty to keep stub behaviour
    email_from: str = "noreply@pulso.local"
    email_from_name: str = "Pulso"

    # ----- Equity snapshots (item #9: P&L histórico) -----
    equity_snapshot_interval_minutes: int = 15   # cada cuánto se muestrea el patrimonio
    equity_snapshot_retention_days: int = 400    # se podan snapshots más viejos que esto

    # ----- News (item #10: noticias de última hora) -----
    news_provider: str = "newsapi"               # "newsapi" (NewsAPI.org)
    news_api_key: str = ""                        # vacío => endpoint deshabilitado (enabled:false)
    news_lang: str = "es"
    news_cache_ttl_seconds: int = 600            # cache en memoria para no quemar el free tier
    news_page_size: int = 12                     # headlines por categoría

    # ----- Resolution -----
    resolution_loop_interval_seconds: int = 60
    resolution_auto_finalize_hours_default: int = 24

    # ----- AML rules engine -----
    aml_scan_interval_seconds: int = 60
    aml_wash_window_minutes: int = 60
    aml_velocity_window_minutes: int = 60
    aml_velocity_notional_threshold: float = 5_000.0
    aml_velocity_trade_count_threshold: int = 50
    aml_new_account_hours: int = 24
    aml_new_account_notional_threshold: float = 2_000.0
    aml_concentration_pct: float = 0.40
    aml_concentration_min_market_volume: float = 500.0
    aml_structuring_window_hours: int = 24
    aml_structuring_trade_count: int = 30
    aml_structuring_notional_band: float = 100.0
    aml_reciprocal_pair_min_trades: int = 6

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
