# Arquitectura: Pagos/Cobros (wallet-ready) + KYC con cédula

> Estado: **blueprint de diseño** (2026-07-23). Decisión del usuario: construir la estructura de
> dinero **real** con separación de fondos, idempotencia y reconciliación, pero **sin conectar
> proveedor todavía** ("wallet lista, sin activar rieles"). Orden de trabajo: **Seguridad → KYC → Pagos**.
>
> Este doc es el plano de implementación. No cambia código; define el modelo de datos, las máquinas
> de estado y las invariantes que la implementación debe respetar.

---

## 0. Principios rectores (no negociables)

1. **El dinero real NUNCA es un `float`.** Se representa en **unidades menores enteras** (`BigInteger`)
   + un código de moneda ISO-4217. El `cash` actual (créditos virtuales) es `Float` y se queda como
   está — **no se mezcla** con el saldo real. Son dos mundos separados.
2. **Doble entrada obligatoria.** Todo movimiento de dinero real genera asientos que suman cero.
   La plataforma nunca "crea" ni "destruye" dinero: lo mueve entre cuentas.
3. **Segregación de fondos.** El dinero de los usuarios es un **pasivo** de la plataforma, no ingreso.
   `Σ saldos de usuarios == fondos en la cuenta de custodia`. La reconciliación verifica esto.
4. **Idempotencia en todo lo que toca un proveedor externo.** Los webhooks se reintentan; procesar
   dos veces el mismo evento debe ser un no-op.
5. **KYC es prerequisito de dinero real.** No se habilita ningún depósito/retiro sin identidad
   verificada (persona única, mayor de 18). Ver §2.
6. **Todo es auditable.** Cada transición de estado queda registrada con quién/cuándo/por qué.

---

## 1. Modelo de datos — Dinero real

### 1.1 Representación monetaria

```
amount_minor : BigInteger   # unidades menores. PYG no tiene centavos (multiplicador 1);
                            # USD sí (x100). Guardar SIEMPRE en menor unidad de la moneda.
currency     : String(3)    # ISO-4217: "PYG", "USD", ...
```

Helper único de conversión (a crear en `app/money.py`): `to_minor(amount, currency)` /
`format_minor(minor, currency)`. Prohibido hacer aritmética de dinero real con floats en cualquier
otro lado.

### 1.2 Ledger de doble entrada (`money_ledger`)

Análogo al `HouseLedger` actual pero para **dinero real**. Cada operación inserta ≥2 filas que
suman 0.

| campo | tipo | nota |
|---|---|---|
| id | UUID PK | |
| account_type | Enum | `USER` \| `CUSTODY` \| `FEE_REVENUE` \| `PAYMENT_PROVIDER` \| `PAYOUT_PAYABLE` |
| account_ref | String \| null | user_id si account_type=USER; null para cuentas de sistema |
| entry_group | UUID | agrupa los asientos de una misma operación (deben sumar 0) |
| amount_minor | BigInteger | con signo (+ crédito a la cuenta, − débito) |
| currency | String(3) | |
| kind | Enum | `DEPOSIT` \| `WITHDRAWAL` \| `TRADE_SETTLE` \| `FEE` \| `ADJUSTMENT` \| `REVERSAL` |
| ref_id | String \| null | id del Deposit/Withdrawal/… que originó el asiento |
| created_at | timestamptz | |

**Invariante 1 (por operación):** `Σ amount_minor WHERE entry_group = X == 0`.
**Invariante 2 (global, por moneda):** `Σ amount_minor de todas las cuentas USER == − Σ CUSTODY`
(el saldo de los usuarios es el pasivo cubierto por la custodia).

El **saldo real** de un usuario es una **vista derivada** (`Σ money_ledger WHERE account_ref=user`),
no un campo mutable. (Se puede cachear en una tabla `wallet_balances` para lectura rápida, pero la
verdad es el ledger.)

### 1.3 Depósitos (`deposits`)

| campo | tipo | nota |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| amount_minor | BigInteger | monto que el usuario intenta depositar |
| currency | String(3) | |
| status | Enum | ver máquina de estado abajo |
| provider | String | `manual` por ahora; luego `bancard`/`dlocal`/`stripe`/`crypto` |
| provider_ref | String \| null | id de la transacción en el proveedor |
| idempotency_key | String unique | clave que deduplica reintentos |
| failure_reason | String \| null | |
| created_at / updated_at | timestamptz | |

**Máquina de estado (depósito):**
```
INITIATED ──> PENDING ──> CONFIRMED   (acredita al ledger: +USER / −PAYMENT_PROVIDER→CUSTODY)
     │            │
     └──> FAILED  └──> FAILED
CONFIRMED ──> REVERSED   (chargeback / reverso: asiento REVERSAL que espeja el original)
```
- La acreditación al ledger ocurre **exactamente una vez**, en la transición `→ CONFIRMED`,
  bajo idempotencia (si el webhook llega dos veces, la segunda es no-op).

### 1.4 Retiros (`withdrawals`)

| campo | tipo | nota |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| amount_minor | BigInteger | |
| currency | String(3) | |
| status | Enum | ver máquina de estado |
| destination | JSONB | datos de destino (cuenta bancaria/CBU/alias/wallet) — cifrado/tokenizado |
| requested_at | timestamptz | |
| reviewed_by | UUID \| null | admin que aprobó/rechazó (capacidad `payments`) |
| reviewed_at | timestamptz \| null | |
| provider_ref | String \| null | |
| idempotency_key | String unique | |
| failure_reason | String \| null | |

**Máquina de estado (retiro):**
```
REQUESTED ──> APPROVED ──> PROCESSING ──> PAID
     │            │             │
     └──> REJECTED│             └──> FAILED (reintentable / o REVERSED del hold)
                  └──> REJECTED
```
- En `REQUESTED` se hace un **hold**: se debita del saldo disponible del usuario hacia
  `PAYOUT_PAYABLE` (el dinero queda reservado, no gastable). Si se rechaza → reverso del hold.
- Requiere: **KYC APPROVED**, **sin flag AML abierto** (o revisado), y saldo disponible suficiente.
- **Aprobación manual** por admin con capacidad `payments` (nueva capacidad, ver §3).

### 1.5 Webhooks / eventos de proveedor (`payment_events`)

Log append-only para idempotencia y auditoría de todo lo que llega de un proveedor.

| campo | tipo | nota |
|---|---|---|
| id | UUID PK | |
| provider | String | |
| event_id | String | id del evento en el proveedor |
| signature_valid | Boolean | verificación HMAC de la firma del webhook |
| payload | JSONB | crudo, tal como llegó |
| processed_at | timestamptz \| null | null hasta que se procesa |
| created_at | timestamptz | |

Unicidad `(provider, event_id)` → un evento se procesa una sola vez.

### 1.6 Abstracción de proveedor (código, no tabla)

`app/payments/provider.py` define una interfaz:
```python
class PaymentProvider(Protocol):
    async def create_deposit_intent(...) -> DepositIntent: ...
    async def verify_webhook(headers, body) -> WebhookVerification: ...
    async def execute_payout(withdrawal) -> PayoutResult: ...
```
Implementación **`ManualProvider`** ahora (todo queda en estado que exige acción de admin; no hay
red externa). Enchufar Bancard/dLocal/Stripe/crypto luego = una clase nueva + credenciales, sin
tocar el ledger ni las máquinas de estado.

---

## 2. Modelo de datos — KYC con cédula

### 2.1 Campos ya existentes en `User` (reutilizar)
`full_name, country, id_number, date_of_birth, kyc_completed_at, aml_flag, aml_note`.

### 2.2 Lo que falta agregar

**En `User` (o tabla `kyc_profiles` 1:1):**
| campo | tipo | nota |
|---|---|---|
| kyc_status | Enum | `NONE` \| `SUBMITTED` \| `UNDER_REVIEW` \| `APPROVED` \| `REJECTED` |
| kyc_rejection_reason | String \| null | |
| document_type | Enum | `CEDULA` \| `PASSPORT` |
| document_country | String(2) | |
| id_number_normalized | String, **UNIQUE** | clave de unicidad (ver §2.4) |

**Nueva tabla `kyc_documents`** (imágenes de la cédula):
| campo | tipo | nota |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| side | Enum | `FRONT` \| `BACK` \| `SELFIE` |
| storage_key | String | **puntero** a object storage privado — NO el binario en la DB |
| content_hash | String | SHA-256 del archivo (dedup + integridad) |
| uploaded_at | timestamptz | |

**Nueva tabla `kyc_extractions`** (datos leídos del documento por OCR/visión):
| campo | tipo | nota |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| raw | JSONB | salida cruda del extractor |
| extracted_name | String \| null | |
| extracted_id_number | String \| null | |
| extracted_dob | Date \| null | |
| extracted_expiry | Date \| null | |
| confidence | Float | |
| name_match | Boolean | ¿coincide con lo declarado? |
| created_at | timestamptz | |

### 2.3 Flujo de verificación

```
1. Usuario sube foto(s) de cédula (FRONT obligatorio; BACK/SELFIE opcional/configurable).
   → almacenamiento privado, kyc_status = SUBMITTED.
2. Extracción (OCR/visión): nombre, nº documento, fecha de nacimiento, vencimiento.
   Proveedor: Anthropic vision (Claude) como primer paso barato, o servicio ID dedicado
   (Truora/dLocal/Metamap) para producción con anti-fraude/liveness.
3. Validaciones automáticas:
   a. EDAD ≥ 18  (a partir de date_of_birth; regla dura, rechaza si <18).
   b. UNICIDAD   (id_number_normalized no usado por otra cuenta — una cédula = una cuenta).
   c. name_match (nombre extraído ≈ nombre declarado).
   d. documento no vencido.
4. Si todo OK y confianza alta → kyc_status = APPROVED (o UNDER_REVIEW si algún check es dudoso).
   Si algún check duro falla → REJECTED con motivo.
5. Cola de revisión manual (admin capacidad `kyc`) para los UNDER_REVIEW.
```

### 2.4 Regla de unicidad (una persona = una cuenta)

- `id_number_normalized` = `id_number` sin puntos/espacios/guiones, upper-case, + `document_country`.
  Constraint **UNIQUE** en DB → dos cuentas no pueden verificar la misma cédula.
- Al aprobar KYC, si ya existe otra cuenta APPROVED con ese `id_number_normalized` → rechazar y
  levantar alerta AML (posible multi-cuenta / fraude).
- La validación se hace en la **transición a APPROVED**, no en el submit (permite reintentos del
  mismo usuario con su propia cédula).

### 2.5 Regla de mayoría de edad (+18)

- Cálculo de edad a partir de `date_of_birth` en el momento de la aprobación.
- Regla dura en backend (nunca confiar en el frontend): `age < 18 → REJECTED`.
- Se agrega también validación en `KycIn` (schema) como primera barrera, pero la fuente de verdad
  es el check de backend contra la fecha extraída del documento, no solo la declarada.

### 2.6 Privacidad (Ley 6534/2020 PY, marco SEPRELAD/CNV)

- Imágenes de cédula en storage **privado** (no público, no en la DB como blob).
- Cifrado en reposo. Acceso solo a admins con capacidad `kyc`, y **cada acceso se registra**
  (audit log: quién vio qué documento y cuándo).
- Retención definida (ej. borrar imágenes N años después de baja de cuenta, conservando solo el
  registro mínimo requerido por AML).
- `id_number` / `aml_note` NUNCA se exponen en endpoints públicos (ya verificado en `users.py`;
  la auditoría de seguridad lo confirma).

---

## 3. Impacto en el panel de admin

Dos capacidades **nuevas** en `ADMIN_CAPABILITIES` (deps.py):
- **`payments`** — ver/aprobar/rechazar retiros, ver el ledger de dinero real, reconciliación.
- **`kyc`** — cola de revisión KYC, ver documentos (con audit log), aprobar/rechazar.

Nuevas secciones de frontend: `/admin/payments` (retiros pendientes + reconciliación) y
`/admin/kyc` (cola de revisión). Gateadas por capacidad (backend = verdad; frontend = UX).

---

## 4. Orden de implementación (una vez cerrada la seguridad)

**Fase KYC:**
1. Migración: campos `kyc_status`, `id_number_normalized` (UNIQUE), tablas `kyc_documents` /
   `kyc_extractions`.
2. `money.py` no; primero KYC. Endpoint de upload de cédula + storage abstraction.
3. Extracción (empezar con visión de Claude, gateada por API key; fallback a revisión manual).
4. Validaciones duras: +18 + unicidad + name_match. `KycIn` con validación de edad.
5. Cola de revisión admin (`/admin/kyc`) + capacidad `kyc` + audit log de accesos.

**Fase Pagos (wallet-ready, sin proveedor):**
6. `money.py` (unidades menores) + tabla `money_ledger` + vista de saldo.
7. Tablas `deposits` / `withdrawals` / `payment_events` + máquinas de estado.
8. `PaymentProvider` protocol + `ManualProvider`.
9. Endpoints usuario (solicitar depósito/retiro, gateados por KYC APPROVED) + admin (`/admin/payments`).
10. Job de reconciliación (verifica invariantes 1 y 2) + reporte en admin.

**Gate legal (recordatorio, no técnico):** activar rieles reales de dinero en un mercado de
predicción probablemente requiere autorización regulatoria (PY: CNV/SEPRELAD). El diseño queda
listo; la activación es una decisión legal separada.

---

## 5. Invariantes que los tests deben cubrir

- `money_ledger`: cada `entry_group` suma 0.
- `Σ saldos USER == − Σ CUSTODY` por moneda tras cualquier secuencia de dep/ret.
- Depósito: webhook duplicado (mismo `event_id`) acredita **una sola vez**.
- Retiro: hold reserva fondos; rechazo revierte exactamente; no se puede retirar sin KYC APPROVED.
- KYC: `<18` rechaza; segunda cuenta con misma cédula rechaza + alerta AML.
- Ningún endpoint expone `id_number`, `aml_note`, `password_hash`, ni documentos de otro usuario.
