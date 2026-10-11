-- FINOVA — Migrasi 001: Skema inti
-- gen_random_uuid() tersedia bawaan sejak PostgreSQL 13 (tidak perlu pgcrypto)
BEGIN;

-- ======================= USERS & AUTH =======================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     TEXT NOT NULL,
    username      TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','DELETED')),
    email_verified_at TIMESTAMPTZ,
    onboarding_completed_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_profiles (
    user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    avatar_url   TEXT,
    currency     CHAR(3) NOT NULL DEFAULT 'IDR',
    timezone     TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    notify_email BOOLEAN NOT NULL DEFAULT true,
    notify_push  BOOLEAN NOT NULL DEFAULT true,
    monthly_income NUMERIC(20,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash TEXT NOT NULL UNIQUE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_agent TEXT,
    ip         TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_sessions_expiry ON user_sessions(expires_at);

CREATE TABLE password_reset_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ======================= SAVINGS =======================
CREATE TABLE savings_goals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    target_amount NUMERIC(20,2) NOT NULL CHECK (target_amount > 0),
    balance       NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency      CHAR(3) NOT NULL DEFAULT 'IDR',
    target_date   DATE,
    interest_rate NUMERIC(7,4),            -- asumsi perencanaan pengguna, % per tahun
    interest_method TEXT CHECK (interest_method IN ('SIMPLE_DAILY','MONTHLY','COMPOUND')),
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','COMPLETED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_savings_user ON savings_goals(user_id, status);

CREATE TABLE savings_transactions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id       UUID NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          TEXT NOT NULL CHECK (type IN ('DEPOSIT','WITHDRAWAL','INTEREST')),
    amount        NUMERIC(20,2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(20,2) NOT NULL,
    note          TEXT,
    idempotency_key TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (goal_id, idempotency_key)
);
CREATE INDEX idx_savtx_goal ON savings_transactions(goal_id, created_at DESC);

-- ======================= INTEREST =======================
CREATE TABLE interest_rates (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_code TEXT NOT NULL,              -- e.g. SAVINGS_GOAL_PLAN
    name        TEXT NOT NULL,
    rate_annual NUMERIC(7,4) NOT NULL,       -- % per tahun
    method      TEXT NOT NULL CHECK (method IN ('SIMPLE_DAILY','MONTHLY','COMPOUND','AVERAGE_BALANCE')),
    effective_from DATE NOT NULL,
    effective_to   DATE,
    notes       TEXT,
    created_by  UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_intrates_product ON interest_rates(product_code, effective_from DESC);

CREATE TABLE interest_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id     UUID REFERENCES savings_goals(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    rate_annual NUMERIC(7,4) NOT NULL,
    method      TEXT NOT NULL,
    base_amount NUMERIC(20,2) NOT NULL,
    interest_amount NUMERIC(20,2) NOT NULL,
    is_estimate BOOLEAN NOT NULL DEFAULT true,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (goal_id, period_end)
);
CREATE INDEX idx_intrec_user ON interest_records(user_id, period_end DESC);

-- ======================= INSTALLMENTS =======================
CREATE TABLE installments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    principal     NUMERIC(20,2) NOT NULL CHECK (principal > 0),
    down_payment  NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
    interest_rate NUMERIC(7,4) NOT NULL DEFAULT 0,  -- % per tahun
    tenor_months  INT NOT NULL CHECK (tenor_months > 0),
    start_date    DATE NOT NULL,
    due_day       INT NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
    method        TEXT NOT NULL DEFAULT 'FLAT' CHECK (method IN ('FLAT','ANNUITY','EFFECTIVE')),
    status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ARCHIVED')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inst_user ON installments(user_id, status);

CREATE TABLE installment_payments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installment_id UUID NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_no      INT NOT NULL,
    due_date       DATE NOT NULL,
    amount_due     NUMERIC(20,2) NOT NULL,
    principal_part NUMERIC(20,2) NOT NULL,
    interest_part  NUMERIC(20,2) NOT NULL,
    amount_paid    NUMERIC(20,2),
    paid_at        TIMESTAMPTZ,
    recorded_via   TEXT NOT NULL DEFAULT 'MANUAL' CHECK (recorded_via IN ('MANUAL','BANK_CONFIRMED')),
    status         TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','PAID','LATE')),
    idempotency_key TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (installment_id, period_no),
    UNIQUE (installment_id, idempotency_key)
);
CREATE INDEX idx_instpay_due ON installment_payments(user_id, due_date);

-- ======================= BANKING =======================
CREATE TABLE bank_connections (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT NOT NULL DEFAULT 'MANDIRI',
    state          TEXT NOT NULL DEFAULT 'NOT_CONNECTED'
                   CHECK (state IN ('NOT_CONNECTED','IN_PROGRESS','CONNECTED','EXPIRED','UNAVAILABLE','ERROR')),
    external_id    TEXT,
    consent_id     TEXT,
    access_token_enc TEXT,
    refresh_token_enc TEXT,
    token_expires_at TIMESTAMPTZ,
    capabilities   JSONB NOT NULL DEFAULT '[]',
    last_sync_at   TIMESTAMPTZ,
    state_message  TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider)
);

CREATE TABLE bank_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id   UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_id     TEXT NOT NULL,
    masked_number   TEXT NOT NULL,
    holder_name     TEXT,
    account_type    TEXT,
    currency        CHAR(3) NOT NULL DEFAULT 'IDR',
    balance         NUMERIC(20,2),
    available_balance NUMERIC(20,2),
    balance_updated_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connection_id, external_id)
);

CREATE TABLE beneficiaries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank_code   TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    alias       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, bank_code, account_number)
);

CREATE TABLE transfer_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id   UUID REFERENCES bank_connections(id) ON DELETE SET NULL,
    source_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    beneficiary_id  UUID REFERENCES beneficiaries(id) ON DELETE SET NULL,
    amount          NUMERIC(20,2) NOT NULL CHECK (amount > 0),
    currency        CHAR(3) NOT NULL DEFAULT 'IDR',
    note            TEXT,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SUBMITTED','CONFIRMED','FAILED','REJECTED')),
    provider_ref    TEXT,
    failure_reason  TEXT,
    idempotency_key TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

-- ======================= FINANCIAL TRANSACTIONS =======================
CREATE TABLE financial_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('INCOME','EXPENSE','TRANSFER')),
    category    TEXT NOT NULL DEFAULT 'OTHER',
    amount      NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
    currency    CHAR(3) NOT NULL DEFAULT 'IDR',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    description TEXT,
    source      TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','BANK_SYNC','SYSTEM')),
    bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    external_ref TEXT,
    idempotency_key TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key),
    UNIQUE (bank_account_id, external_ref)
);
CREATE INDEX idx_fintx_user ON financial_transactions(user_id, occurred_at DESC);
CREATE INDEX idx_fintx_cat ON financial_transactions(user_id, category, occurred_at DESC);

-- ======================= LEDGER =======================
CREATE TABLE ledger_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = akun sistem
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','INCOME','EXPENSE')),
    currency    CHAR(3) NOT NULL DEFAULT 'IDR',
    UNIQUE (user_id, code)
);

CREATE TABLE ledger_transactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference   TEXT NOT NULL UNIQUE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id  UUID NOT NULL REFERENCES ledger_transactions(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES ledger_accounts(id),
    amount          NUMERIC(20,2) NOT NULL CHECK (amount <> 0), -- +debit / -credit konvensi akun
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_entries_tx ON ledger_entries(transaction_id);

-- ======================= MARKET =======================
CREATE TABLE market_assets (
    symbol      TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    exchange    TEXT,
    asset_type  TEXT NOT NULL DEFAULT 'STOCK',
    currency    CHAR(3) NOT NULL DEFAULT 'IDR',
    sector      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE market_quotes (
    symbol      TEXT PRIMARY KEY REFERENCES market_assets(symbol),
    price       NUMERIC(20,4) NOT NULL,
    open        NUMERIC(20,4),
    high        NUMERIC(20,4),
    low         NUMERIC(20,4),
    prev_close  NUMERIC(20,4),
    volume      BIGINT,
    quoted_at   TIMESTAMPTZ NOT NULL,
    is_delayed  BOOLEAN NOT NULL DEFAULT true,
    source      TEXT NOT NULL DEFAULT 'SNAPSHOT',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE market_candles (
    symbol   TEXT NOT NULL REFERENCES market_assets(symbol),
    ts       TIMESTAMPTZ NOT NULL,
    interval TEXT NOT NULL DEFAULT '1D',
    open     NUMERIC(20,4) NOT NULL,
    high     NUMERIC(20,4) NOT NULL,
    low      NUMERIC(20,4) NOT NULL,
    close    NUMERIC(20,4) NOT NULL,
    volume   BIGINT,
    PRIMARY KEY (symbol, interval, ts)
);

CREATE TABLE watchlists (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE watchlist_items (
    watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol       TEXT NOT NULL REFERENCES market_assets(symbol),
    added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (watchlist_id, symbol)
);

CREATE TABLE price_alerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol       TEXT NOT NULL REFERENCES market_assets(symbol),
    direction    TEXT NOT NULL CHECK (direction IN ('ABOVE','BELOW')),
    target_price NUMERIC(20,4) NOT NULL CHECK (target_price > 0),
    enabled      BOOLEAN NOT NULL DEFAULT true,
    triggered_at TIMESTAMPTZ,
    trigger_price NUMERIC(20,4),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_user ON price_alerts(user_id, enabled);

-- ======================= NOTIFICATIONS & AUDIT =======================
CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    actor_id    UUID REFERENCES users(id),
    actor_role  TEXT,
    action      TEXT NOT NULL,
    entity_type TEXT,
    entity_id   TEXT,
    detail      JSONB,
    ip          TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

-- Username unik (case-insensitive)
CREATE UNIQUE INDEX idx_users_username_ci ON users (lower(username));

COMMIT;
