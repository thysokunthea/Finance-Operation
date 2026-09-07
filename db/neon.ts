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
): Promise<void> {
  await ensureCoreSchema();
  for (const statement of statements) {
    await getSql().query(statement.text, statement.parameters ?? []);
  }
}

export async function ensureCoreSchema(): Promise<void> {
  initialized ??= initializeCoreSchema();
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
    `CREATE INDEX IF NOT EXISTS idx_transactions_org_date_status
      ON transactions (organization_id, transaction_date, posting_status)`,
    `CREATE INDEX IF NOT EXISTS idx_audit_resource_time
      ON audit_logs (resource_type, resource_id, occurred_at)`,
  ];
  for (const statement of statements) await sql.query(statement);
}
