# LedgerFlow finance workflow

A Next.js 16 / Clerk / Neon finance operations workspace. Amounts remain in their original transaction currency. Consolidated reports use KHR and each USD transaction's recorded KHR-per-USD rate.

## Run and verify

Use Node 22 and pnpm 10.28.0:

```sh
pnpm install --frozen-lockfile
pnpm env:check
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

On Windows PowerShell, use `pnpm.cmd` and `vercel.cmd` if the execution policy blocks the `.ps1` command shims. `.nvmrc` selects Node 22 for version managers.

Tests run real PostgreSQL in memory using PGlite, with a test-only Clerk/Neon adapter. They never connect to the configured production database. They cover approval permissions, metadata retention, partial payments, duplicate and overpayment protection, concurrent settlements, tenant isolation, draft requests, evidence, reports, CSV parsing and closing locks.

## Access configuration

Set `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. To assign a workspace administrator, set `FINANCE_ADMIN_EMAILS` to a comma-separated list of verified Clerk email addresses. `FINANCE_ORGANIZATION_ID` defaults to `ledgerflow-org`, preserving existing records. Environment values belong in `.env` locally and in the deployment project's environment settings when deploying; never commit `.env`.

For a fresh local setup, copy `.env.example` to `.env.local` only if you do not already have local configuration, then fill in the required values. `pnpm env:check` checks required settings, URL formats and Clerk test/live key consistency without printing secrets or connecting to services. Existing `.env` files remain supported; `.env.local` takes precedence. Optional `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` configure live AI answers. Leave `SITE_URL` unset to use Vercel's deployment URL or localhost.

For Vercel, use the linked `ledgerflow-finance-operations` project, Node 22, and pnpm 10.28.0. Configure the required values for each target environment; keep preview data separate from production.

### Automatic release after fixes

After completing a fix, run `pnpm test`, `pnpm typecheck`, and `pnpm build`, review the changes, commit them, and push to the `github` remote (`https://github.com/thysokunthea/Finance-Operation.git`). The production branch is `vercel-deployment`. Vercel's connected GitHub integration automatically deploys this branch; other branches create previews. Do not create a second CLI deployment for the same push.

GitHub Actions runs the finance workflow tests and TypeScript checks on pushes and pull requests without production secrets. Vercel also runs the tests before its production build using `vercel.json`; failing tests or builds prevent that deployment from becoming live. Vercel deployment credentials stay with the native Git integration, so no Vercel token is required in GitHub Actions.

Wait for the deployment matching the pushed commit to reach READY, then verify `/sign-in`, `/api/health`, and relevant changed routes. Sign in with an assigned workspace role to verify the private workflow when an authenticated session is available. Follow `AGENTS.md` for the required release steps on future fixes.

Other members require server-managed Clerk **public metadata**:

```json
{
  "financeOrganizationId": "ledgerflow-org",
  "financeRole": "finance"
}
```

Roles:

| Role | Access |
| --- | --- |
| viewer | Read records and generate reports |
| finance | Read, create/edit unpaid records, submit, record payments, review evidence and update closing checks |
| approver | Read and approve/reject submitted transactions |
| admin | All operations, settings, closing and reopening periods |

Users without an assigned workspace and recognized role receive 403 from private APIs. Identity comes from Clerk, not caller-supplied identity headers. Workspace scoping is resolved per request; record IDs for new workspaces are namespaced. Admin assignment is configuration, not a self-service role change in the application.

## Operational workflow

1. **Record income or expense.** Enter counterparty, date, reference, category, amount, tax, department and currency. USD requires a positive KHR-per-USD rate. Subtotal plus tax must equal total. Saving submits the transaction for finance review. Legacy `/sales-invoices` and `/expenses-ap` URLs redirect to `/income` and `/expenses`.
2. **Request an expense.** Payment Requests saves an editable draft with real details. Complete old drafts through Edit / complete draft. Submit creates one linked expense transaction, which enters Approvals. Its approval and payment status are derived from that transaction.
3. **Attach evidence.** Upload files in Documents, enter a unique transaction ID or reference, and choose Link & verify after reviewing the file. Uploading alone leaves evidence Pending review. Previously auto-verified files are reset for actual review. One verified link belongs to one transaction.
4. **Approve or reject.** Approver/admin can review submitted transactions. Rejection requires a reason. Correct rejected records from Transactions and save to resubmit. Audit events and metadata are stored separately, so reviewing never removes account tags, exchange rates or other details.
5. **Receive or pay.** Open an approved transaction and record a payment/receipt with its date, amount, method, reference and exchange rate. Partial payments reduce outstanding balances. Duplicate references, retries and concurrent payments cannot overpay an invoice. Paid/part-paid records cannot be edited or deleted; use separate adjustment records. Recording a settlement does not transfer money through a bank.
6. **Monitor and report.** AR/AP shows approved open balances in original currencies, and consolidated KHR totals. Dashboard cash and Cash Flow reports use recorded settlement dates. Recognized revenue/expense totals use approved transactions. Select a month in Reports; exported results and history are persisted. Aging reports calculate historical month-end balances. Tax Summary totals recorded tax; it does not determine tax deductibility or file a return. KHR budgets include USD spending translated at recorded transaction rates; USD budgets compare USD spending only. Missing rates are excluded and must be corrected before relying on consolidated totals.
7. **Close the month.** Select the period, complete all checks, resolve approvals and verify linked evidence for every transaction. Admin closes and locks the period with a reason. Locked periods reject transaction creation, edits, deletion, approval, evidence changes, checklist changes and payments dated in that period. An older invoice can still be settled in a later open period. Admin can reopen with an audited reason.

Financial mutations and their audit records run in a database transaction; a workspace advisory lock serializes payment/approval/closing changes. Edits also check the record version. Schema updates are additive and initialized by the data layer; take the normal database backup before a production rollout.

## Automatic transaction creation

On Transactions, enable **Automatic Transaction Creation from Uploaded Documents**, select Income or Expense, and enter the KHR-per-USD rate when the source does not include it. Upload Excel (.xlsx or .xls), PDF, images, TXT, or a single-invoice CSV. The browser extracts cell values/text/OCR locally (English and Khmer); the server checks explicitly labeled reference, party, date, description, currency, total and tax arithmetic. Each complete document creates one Pending transaction for finance review and links its evidence atomically. It never automatically approves or pays.

The single-invoice Excel reader supports one populated worksheet containing labeled invoice fields (labels and values may have empty cells between them). Transaction tables use the multi-row import below. Native Excel dates are normalized to ISO dates and displayed currency is preserved. Formula errors or formulas without saved results require review. Recalculate and save formulas before uploading; the app does not evaluate them. Sheets are limited to 1,000 rows and 64 columns; a workbook may contain at most 100,000 extracted characters. Failed document readers show their cause without a cascade of missing financial fields.

### Cash book uploads

The Transactions **Upload files** button also imports multi-row Excel cash books directly from the stored source workbook. A table with **Date, Description, Receipt, Payment, Balance** maps Receipt to Income / Cash Receipts and Payment to Expense / Cash Disbursements. Opening/closing balances, balance-only rows and totals are excluded. Headers may follow title rows; tables in multiple sheets are supported. A reference is generated from the sheet and source row when absent. Missing counterparties are explicitly labeled `Cash book entry`; the source description is retained. Account suggestions follow the description and require finance review.

Khmer, English and mixed headers are recognized, including two-row movement/currency headers such as `ចំណាយ` over separate KHR and USD columns. Each movement retains its source currency; a default never relabels KHR as USD. Khmer month names/digits and English dates are normalized. Zero-width header characters, formatted zero amounts such as `$-`, balances, totals and signature rows are handled separately. Unknown cash book layouts remain a batch review with an explanation instead of falling back to an empty invoice form. CSV tables use the same multi-row path and preserve explicit tax/subtotal values.

Choose the workbook currency when the source does not specify it and supply its KHR-per-USD rate. Missing USD rates create Draft records with no converted reporting value; retrying the same workbook with a rate updates these drafts without creating them again. Invalid dates, conflicting Receipt/Payment values and other malformed rows stay in the row review list. Import runs in chunks of 20, up to 1,000 transaction rows per workbook. Every row links to its original document, sheet and row using a many-to-many evidence table. File hashes, workspace-scoped deterministic IDs and transaction guards prevent duplicates on retry or concurrent uploads.

Word `.docx` documents are read locally as plain text, preserving Khmer/English text without rendering document HTML or loading external files. They use the invoice validation path, including Khmer month dates. Legacy `.doc`, encrypted files and unreadable or unsupported formats require conversion or review; the app does not claim that every possible binary format can be extracted.

Transactions, Income and Expense use the same saved register. Accounting journal tabs show Pending/Draft entries for review and native amounts; accounting totals and official reports include approved entries only. Import never approves records or records payments. The ordinary review, approval and payment workflow remains required. Verifying an imported workbook verifies the evidence for all its linked rows and respects closed periods.

Missing/ambiguous fields, unsupported formats such as Word, large/unreadable files and multi-invoice spreadsheet/CSV exports go to **Needs review**. Extracted suggestions and processing status remain in Documents after reloading. Use **Create transaction record**, then **Create automatically**, to process an existing uploaded document. The file hash, invoice duplicate checks, deterministic record ID and database locking protect retries and concurrent uploads from duplicate financial records. Oversized requests report a clear upload error instead of claiming success.

## Boundaries

This is an operational register with journal/account tags, not a double-entry general ledger. Cash reports cover recorded receipts and payments, not unrecorded opening bank balances. Historical Paid records without settlement detail use their transaction date as a legacy estimate; review those before treating historical cash reports as official. Old USD records without rates are explicitly excluded from consolidated totals. AI answers require `OPENROUTER_API_KEY` and remain read-only; a limited rule-based fallback is available.
