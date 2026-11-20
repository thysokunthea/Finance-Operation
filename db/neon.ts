import { neon } from '@neondatabase/serverless';

type SqlClient = ReturnType<typeof neon>;

let client: SqlClient | null = null;
let initialized: Promise<void> | null = null;

export function getSql(): SqlClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'LedgerFlow database is not connected. Add DATABASE_URL in the Vercel project settings.',
    );
  }
  client ??= neon(databaseUrl);
  return client;
}

export async function query<T extends Record<string, unknown>>(
  statement: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  await ensureCoreSchema();
  return getSql().query(statement, parameters) as Promise<T[]>;
}

export async function execute(
  statement: string,
  parameters: unknown[] = [],
): Promise<void> {
  await ensureCoreSchema();
  await getSql().query(statement, parameters);
}

export async function executeBatch(
  statements: Array<{ text: string; parameters?: unknown[] }>,
  control?: { organizationId: string; dates?: string[] },
): Promise<void> {
  await ensureCoreSchema();
  const sql = getSql();
  const guards = control
    ? [
        {
          text: 'SELECT pg_advisory_xact_lock(hashtext($1))',
          parameters: [control.organizationId],
        },
        ...(control.dates || []).map((date) => ({
          text: 'SELECT ledgerflow_assert_open($1, $2)',
          parameters: [control.organizationId, date.slice(0, 7)],
        })),
      ]
    : [];
  await sql.transaction(
    [...guards, ...statements].map((statement) =>
      sql.query(statement.text, statement.parameters ?? []),
    ),
  );
}

export async function ensureCoreSchema(): Promise<void> {
  initialized ??= initializeCoreSchema().catch((error) => {
    initialized = null;
    throw error;
  });
  return initialized;
}

async function initializeCoreSchema(): Promise<void> {
  const sql = getSql();
  const statements = [
    `CREATE TABLE IF NOT EXISTS organizations (
      id text PRIMARY KEY, name text NOT NULL, code text NOT NULL UNIQUE,
      functional_currency text NOT NULL DEFAULT 'KHR', timezone text NOT NULL DEFAULT 'Asia/Phnom_Penh',
      fiscal_year_start_month integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(), created_by text,
      updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      external_user_id text NOT NULL, email text NOT NULL, display_name text NOT NULL,
      status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(),
      created_by text, updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
      UNIQUE (organization_id, external_user_id), UNIQUE (organization_id, email)
    )`,
    `CREATE TABLE IF NOT EXISTS counterparties (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      type text NOT NULL, code text NOT NULL, name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE (organization_id, code)
    )`,
    `CREATE TABLE IF NOT EXISTS departments (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      code text NOT NULL, name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE (organization_id, code)
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      transaction_number text NOT NULL, transaction_date date NOT NULL, type text NOT NULL,
      reference_number text, description text NOT NULL,
      counterparty_id text REFERENCES counterparties(id), department_id text REFERENCES departments(id),
      currency text NOT NULL, subtotal_minor bigint NOT NULL, tax_minor bigint NOT NULL DEFAULT 0,
      total_minor bigint NOT NULL, due_date date, payment_status text NOT NULL DEFAULT 'unpaid',
      approval_status text NOT NULL DEFAULT 'draft', posting_status text NOT NULL DEFAULT 'unposted',
      responsible_user_id text REFERENCES users(id), created_by text REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE (organization_id, transaction_number),
      CHECK (total_minor = subtotal_minor + tax_minor),
      CHECK (subtotal_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      actor_user_id text REFERENCES users(id), action text NOT NULL, resource_type text NOT NULL,
      resource_id text NOT NULL, previous_json text, new_json text, reason text,
      correlation_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS outbox_events (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      event_type text NOT NULL, aggregate_type text NOT NULL, aggregate_id text NOT NULL,
      payload_json text NOT NULL, idempotency_key text NOT NULL UNIQUE,
      status text NOT NULL DEFAULT 'pending', available_at timestamptz NOT NULL DEFAULT now(),
      attempt_count integer NOT NULL DEFAULT 0, processed_at timestamptz, last_error text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS documents (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      file_name text NOT NULL, mime_type text NOT NULL, size_bytes integer NOT NULL,
      category text NOT NULL DEFAULT 'Other', status text NOT NULL DEFAULT 'Verified',
      linked_reference text, content_base64 text NOT NULL,
      uploaded_by text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS budgets (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      department text NOT NULL, monthly_limit_minor bigint NOT NULL, currency text NOT NULL DEFAULT 'USD',
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE (organization_id, department)
    )`,
    `CREATE TABLE IF NOT EXISTS payment_requests (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      request_number text NOT NULL, title text NOT NULL, category text NOT NULL,
      amount_minor bigint NOT NULL, currency text NOT NULL DEFAULT 'USD',
      status text NOT NULL DEFAULT 'Draft', requested_by text REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      version integer NOT NULL DEFAULT 1, UNIQUE (organization_id, request_number)
    )`,
    `CREATE TABLE IF NOT EXISTS closing_tasks (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      period text NOT NULL, task_name text NOT NULL, completed boolean NOT NULL DEFAULT false,
      completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (organization_id, period, task_name)
    )`,
    `CREATE TABLE IF NOT EXISTS finance_tasks (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      title text NOT NULL, category text NOT NULL DEFAULT 'Manual', related_reference text,
      due_label text, priority text NOT NULL DEFAULT 'Medium', status text NOT NULL DEFAULT 'Not Started',
      created_by text REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_transactions_org_date_status
      ON transactions (organization_id, transaction_date, posting_status)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_resource_time
      ON audit_logs (resource_type, resource_id, occurred_at)`,
    `CREATE INDEX IF NOT EXISTS idx_documents_org_created
      ON documents (organization_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_finance_tasks_org_status
      ON finance_tasks (organization_id, status)`,
  ];
  statements.push(
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS content_hash text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'Uploaded'`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_json text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS linked_transaction_id text REFERENCES transactions(id)`,
    `CREATE TABLE IF NOT EXISTS document_transaction_links (
      document_id text NOT NULL REFERENCES documents(id), transaction_id text NOT NULL REFERENCES transactions(id),
      organization_id text NOT NULL REFERENCES organizations(id), source_sheet text NOT NULL, source_row integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(document_id, transaction_id),
      UNIQUE(document_id, source_sheet, source_row)
    )`,
    `UPDATE documents d SET status='Pending review' WHERE status='Verified' AND NOT EXISTS(SELECT 1 FROM audit_logs a WHERE a.organization_id=d.organization_id AND a.resource_type='document' AND a.resource_id=d.id AND a.action='review')`,
    `CREATE TABLE IF NOT EXISTS report_runs(id text PRIMARY KEY,organization_id text NOT NULL REFERENCES organizations(id),payload_json text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())`,
    `ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS metadata_json text`,
    `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS metadata_json text`,
    `CREATE TABLE IF NOT EXISTS transaction_payments (
      id text PRIMARY KEY, organization_id text NOT NULL REFERENCES organizations(id),
      transaction_id text NOT NULL REFERENCES transactions(id), payment_date date NOT NULL,
      amount_minor bigint NOT NULL CHECK(amount_minor > 0), exchange_rate numeric NOT NULL CHECK(exchange_rate > 0),
      method text NOT NULL, reference text NOT NULL, recorded_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, transaction_id, reference)
    )`,
    `CREATE TABLE IF NOT EXISTS closed_periods (
      organization_id text NOT NULL REFERENCES organizations(id), period text NOT NULL,
      closed_by text NOT NULL, closed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id, period)
    )`,
    `CREATE OR REPLACE FUNCTION ledgerflow_assert_open(org text, month_key text) RETURNS void AS $$
      BEGIN IF EXISTS(SELECT 1 FROM closed_periods WHERE organization_id = org AND period = month_key)
      THEN RAISE EXCEPTION 'This accounting period is closed. Reopen it before changing records.'; END IF; END;
      $$ LANGUAGE plpgsql`,
    `CREATE OR REPLACE FUNCTION ledgerflow_assert(ok boolean, message text) RETURNS void AS $$
      BEGIN IF NOT COALESCE(ok, false) THEN RAISE EXCEPTION '%', message; END IF; END;
      $$ LANGUAGE plpgsql`,
    `CREATE INDEX IF NOT EXISTS idx_payments_org_date ON transaction_payments(organization_id, payment_date)`,
    `UPDATE transactions t SET metadata_json = (SELECT a.new_json FROM audit_logs a
      WHERE a.organization_id = t.organization_id AND a.resource_type = 'transaction' AND a.resource_id = t.id
      AND a.action IN ('create', 'update') ORDER BY a.occurred_at DESC LIMIT 1)
      WHERE metadata_json IS NULL`,
  );
  for (const statement of statements) await sql.query(statement);
}
