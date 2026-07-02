# Migraciones (Alembic) — convención

**Importante:** el schema base de Pulso lo crea `Base.metadata.create_all()` al
arrancar (ver `app/main.py`), y **corre ANTES que Alembic**. El baseline
`0001_baseline` es intencionalmente vacío: registra ese estado pre-Alembic.

Por eso las migraciones tienen dos reglas que **hay que respetar siempre**:

## 1. `create_all` es dueño de la creación de tablas

Cuando agregás un modelo nuevo en `app/models.py`, `create_all` ya crea la tabla
en el arranque. **No necesitás una migración solo para crear la tabla** (así se
crean hoy `notifications`, `commissions`, `house_ledger`, `market_comments`).

## 2. Toda migración debe ser IDEMPOTENTE

Como `create_all` corre primero, una migración que haga `create_table` /
`add_column` sobre algo que `create_all` ya creó **falla** (esto causó el crash de
prod con `0004`/`0005`). Entonces: **chequeá antes de actuar**.

```python
def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # crear tabla solo si falta
    if "mi_tabla" not in insp.get_table_names():
        op.create_table("mi_tabla", ...)

    # agregar columna solo si falta
    cols = {c["name"] for c in insp.get_columns("users")}
    if "mi_columna" not in cols:
        op.add_column("users", sa.Column("mi_columna", ...))
```

## 3. El CI lo valida

`.github/workflows/ci.yml` corre `create_all` + `alembic upgrade head` contra una
DB efímera (`scripts/ci_startup_check.py`). Si tu migración no es idempotente,
**el CI se pone rojo antes de llegar a prod**.

## Deuda técnica conocida (Fase 2)

El objetivo ideal es que **Alembic sea la única fuente de verdad** (baseline real
que cree las 18 tablas + sacar `create_all` de prod). Requiere
`alembic revision --autogenerate` contra una DB de dev y reconciliar con la prod
actual (que ya está en `0006`). No hacerlo a ciegas: puede romper deploys nuevos.
