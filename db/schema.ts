import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const tracked = {
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  createdBy: text('created_by'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  version: integer('version').notNull().default(1),
};

export const organizations = sqliteTable('organizations', {
  id: text('id').primaryKey(), name: text('name').notNull(), code: text('code').notNull(),
  functionalCurrency: text('functional_currency').notNull().default('USD'), timezone: text('timezone').notNull().default('UTC'),
  fiscalYearStartMonth: integer('fiscal_year_start_month').notNull().default(1), ...tracked,
}, (t) => [uniqueIndex('uq_organizations_code').on(t.code), check('ck_org_fiscal_month', sql`${t.fiscalYearStartMonth} between 1 and 12`)]);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), externalUserId: text('external_user_id').notNull(),
  email: text('email').notNull(), displayName: text('display_name').notNull(), status: text('status').notNull().default('active'), ...tracked,
}, (t) => [uniqueIndex('uq_users_org_external').on(t.organizationId, t.externalUserId), uniqueIndex('uq_users_org_email').on(t.organizationId, t.email), index('idx_users_org_status').on(t.organizationId, t.status)]);

export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), name: text('name').notNull(), code: text('code').notNull(), description: text('description'), ...tracked,
}, (t) => [uniqueIndex('uq_roles_org_code').on(t.organizationId, t.code)]);

export const userRoles = sqliteTable('user_roles', {
  userId: text('user_id').notNull().references(() => users.id), roleId: text('role_id').notNull().references(() => roles.id), assignedAt: text('assigned_at').notNull().default(sql`CURRENT_TIMESTAMP`), assignedBy: text('assigned_by').notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.roleId] })]);

export const departments = sqliteTable('departments', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), code: text('code').notNull(), name: text('name').notNull(), managerUserId: text('manager_user_id').references(() => users.id), active: integer('active', { mode: 'boolean' }).notNull().default(true), ...tracked,
}, (t) => [uniqueIndex('uq_departments_org_code').on(t.organizationId, t.code)]);

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), departmentId: text('department_id').references(() => departments.id), code: text('code').notNull(), name: text('name').notNull(), active: integer('active', { mode: 'boolean' }).notNull().default(true), ...tracked,
}, (t) => [uniqueIndex('uq_projects_org_code').on(t.organizationId, t.code), index('idx_projects_department').on(t.departmentId)]);

export const counterparties = sqliteTable('counterparties', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), type: text('type').notNull(), code: text('code').notNull(), name: text('name').notNull(), taxId: text('tax_id'), paymentTermsDays: integer('payment_terms_days').notNull().default(30), active: integer('active', { mode: 'boolean' }).notNull().default(true), ...tracked,
}, (t) => [uniqueIndex('uq_counterparties_org_code').on(t.organizationId, t.code), index('idx_counterparties_org_type').on(t.organizationId, t.type), check('ck_counterparty_type', sql`${t.type} in ('customer','vendor','both')`)]);

export const chartOfAccounts = sqliteTable('chart_of_accounts', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), code: text('code').notNull(), name: text('name').notNull(), type: text('type').notNull(), normalBalance: text('normal_balance').notNull(), parentId: text('parent_id'), active: integer('active', { mode: 'boolean' }).notNull().default(true), ...tracked,
}, (t) => [uniqueIndex('uq_accounts_org_code').on(t.organizationId, t.code), index('idx_accounts_org_type').on(t.organizationId, t.type), check('ck_account_normal_balance', sql`${t.normalBalance} in ('debit','credit')`)]);

export const fiscalPeriods = sqliteTable('fiscal_periods', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), year: integer('year').notNull(), periodNumber: integer('period_number').notNull(), startDate: text('start_date').notNull(), endDate: text('end_date').notNull(), status: text('status').notNull().default('open'), lockedAt: text('locked_at'), lockedBy: text('locked_by'), ...tracked,
}, (t) => [uniqueIndex('uq_fiscal_period').on(t.organizationId, t.year, t.periodNumber), index('idx_fiscal_period_status').on(t.organizationId, t.status), check('ck_fiscal_status', sql`${t.status} in ('future','open','closing','locked')`)]);

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), transactionNumber: text('transaction_number').notNull(), transactionDate: text('transaction_date').notNull(), type: text('type').notNull(), referenceNumber: text('reference_number'), description: text('description').notNull(), counterpartyId: text('counterparty_id').references(() => counterparties.id), departmentId: text('department_id').references(() => departments.id), projectId: text('project_id').references(() => projects.id), currency: text('currency').notNull(), subtotalMinor: integer('subtotal_minor').notNull(), taxMinor: integer('tax_minor').notNull().default(0), totalMinor: integer('total_minor').notNull(), dueDate: text('due_date'), paymentStatus: text('payment_status').notNull().default('unpaid'), approvalStatus: text('approval_status').notNull().default('draft'), postingStatus: text('posting_status').notNull().default('unposted'), responsibleUserId: text('responsible_user_id').references(() => users.id), reversedTransactionId: text('reversed_transaction_id'), postedAt: text('posted_at'), postedBy: text('posted_by'), ...tracked,
}, (t) => [uniqueIndex('uq_transactions_org_number').on(t.organizationId, t.transactionNumber), index('idx_transactions_org_date_status').on(t.organizationId, t.transactionDate, t.postingStatus), index('idx_transactions_counterparty').on(t.counterpartyId, t.transactionDate), index('idx_transactions_department_date').on(t.departmentId, t.transactionDate), check('ck_transaction_total', sql`${t.totalMinor} = ${t.subtotalMinor} + ${t.taxMinor}`), check('ck_transaction_amounts', sql`${t.subtotalMinor} >= 0 and ${t.taxMinor} >= 0 and ${t.totalMinor} >= 0`)]);

export const journalEntries = sqliteTable('journal_entries', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), transactionId: text('transaction_id').notNull().references(() => transactions.id), fiscalPeriodId: text('fiscal_period_id').notNull().references(() => fiscalPeriods.id), entryNumber: text('entry_number').notNull(), entryDate: text('entry_date').notNull(), description: text('description').notNull(), status: text('status').notNull().default('draft'), reversalOfId: text('reversal_of_id'), postedAt: text('posted_at'), postedBy: text('posted_by'), ...tracked,
}, (t) => [uniqueIndex('uq_journal_org_number').on(t.organizationId, t.entryNumber), index('idx_journal_period_status').on(t.fiscalPeriodId, t.status), index('idx_journal_transaction').on(t.transactionId), check('ck_journal_status', sql`${t.status} in ('draft','posted','reversed')`)]);

export const journalLines = sqliteTable('journal_lines', {
  id: text('id').primaryKey(), journalEntryId: text('journal_entry_id').notNull().references(() => journalEntries.id), accountId: text('account_id').notNull().references(() => chartOfAccounts.id), departmentId: text('department_id').references(() => departments.id), projectId: text('project_id').references(() => projects.id), description: text('description'), debitMinor: integer('debit_minor').notNull().default(0), creditMinor: integer('credit_minor').notNull().default(0), currency: text('currency').notNull(), ...tracked,
}, (t) => [index('idx_journal_lines_entry').on(t.journalEntryId), index('idx_journal_lines_account').on(t.accountId), check('ck_journal_line_sided', sql`(${t.debitMinor} > 0 and ${t.creditMinor} = 0) or (${t.creditMinor} > 0 and ${t.debitMinor} = 0)`)]);

export const invoices = sqliteTable('invoices', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), transactionId: text('transaction_id').references(() => transactions.id), counterpartyId: text('counterparty_id').notNull().references(() => counterparties.id), direction: text('direction').notNull(), normalizedInvoiceNumber: text('normalized_invoice_number').notNull(), invoiceNumber: text('invoice_number').notNull(), invoiceDate: text('invoice_date').notNull(), dueDate: text('due_date').notNull(), currency: text('currency').notNull(), originalMinor: integer('original_minor').notNull(), status: text('status').notNull(), responsibleUserId: text('responsible_user_id').references(() => users.id), ...tracked,
}, (t) => [uniqueIndex('uq_invoice_duplicate').on(t.organizationId, t.counterpartyId, t.direction, t.normalizedInvoiceNumber), index('idx_invoice_org_status_due').on(t.organizationId, t.status, t.dueDate), check('ck_invoice_direction', sql`${t.direction} in ('receivable','payable')`), check('ck_invoice_amount', sql`${t.originalMinor} > 0`)]);

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), paymentNumber: text('payment_number').notNull(), paymentDate: text('payment_date').notNull(), direction: text('direction').notNull(), counterpartyId: text('counterparty_id').notNull().references(() => counterparties.id), currency: text('currency').notNull(), amountMinor: integer('amount_minor').notNull(), method: text('method').notNull(), status: text('status').notNull().default('draft'), evidenceDocumentId: text('evidence_document_id'), ...tracked,
}, (t) => [uniqueIndex('uq_payment_org_number').on(t.organizationId, t.paymentNumber), index('idx_payment_counterparty_date').on(t.counterpartyId, t.paymentDate), check('ck_payment_amount', sql`${t.amountMinor} > 0`)]);

export const paymentAllocations = sqliteTable('payment_allocations', {
  id: text('id').primaryKey(), paymentId: text('payment_id').notNull().references(() => payments.id), invoiceId: text('invoice_id').notNull().references(() => invoices.id), amountMinor: integer('amount_minor').notNull(), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`), createdBy: text('created_by').notNull(),
}, (t) => [uniqueIndex('uq_payment_invoice_allocation').on(t.paymentId, t.invoiceId), index('idx_allocation_invoice').on(t.invoiceId), check('ck_allocation_amount', sql`${t.amountMinor} > 0`)]);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), taskNumber: text('task_number').notNull(), name: text('name').notNull(), category: text('category').notNull(), assigneeUserId: text('assignee_user_id').notNull().references(() => users.id), relatedType: text('related_type'), relatedId: text('related_id'), priority: text('priority').notNull().default('medium'), startDate: text('start_date'), dueDate: text('due_date'), reminderAt: text('reminder_at'), status: text('status').notNull().default('not_started'), completedAt: text('completed_at'), automationKey: text('automation_key'), notes: text('notes'), ...tracked,
}, (t) => [uniqueIndex('uq_task_org_number').on(t.organizationId, t.taskNumber), uniqueIndex('uq_task_automation_key').on(t.organizationId, t.automationKey), index('idx_tasks_assignee_status_due').on(t.assigneeUserId, t.status, t.dueDate)]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), objectKey: text('object_key').notNull(), fileName: text('file_name').notNull(), mimeType: text('mime_type').notNull(), sizeBytes: integer('size_bytes').notNull(), checksumSha256: text('checksum_sha256').notNull(), category: text('category').notNull(), scanStatus: text('scan_status').notNull().default('pending'), versionNumber: integer('version_number').notNull().default(1), ...tracked,
}, (t) => [uniqueIndex('uq_documents_object_key').on(t.objectKey), index('idx_documents_org_checksum').on(t.organizationId, t.checksumSha256), index('idx_documents_org_scan').on(t.organizationId, t.scanStatus)]);

export const documentLinks = sqliteTable('document_links', {
  documentId: text('document_id').notNull().references(() => documents.id), resourceType: text('resource_type').notNull(), resourceId: text('resource_id').notNull(), linkedAt: text('linked_at').notNull().default(sql`CURRENT_TIMESTAMP`), linkedBy: text('linked_by').notNull(),
}, (t) => [primaryKey({ columns: [t.documentId, t.resourceType, t.resourceId] }), index('idx_document_links_resource').on(t.resourceType, t.resourceId)]);

export const outboxEvents = sqliteTable('outbox_events', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), eventType: text('event_type').notNull(), aggregateType: text('aggregate_type').notNull(), aggregateId: text('aggregate_id').notNull(), payloadJson: text('payload_json').notNull(), idempotencyKey: text('idempotency_key').notNull(), status: text('status').notNull().default('pending'), availableAt: text('available_at').notNull().default(sql`CURRENT_TIMESTAMP`), attemptCount: integer('attempt_count').notNull().default(0), processedAt: text('processed_at'), lastError: text('last_error'), createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex('uq_outbox_idempotency').on(t.idempotencyKey), index('idx_outbox_status_available').on(t.status, t.availableAt)]);

export const importJobs = sqliteTable('import_jobs', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), type: text('type').notNull(), fileName: text('file_name').notNull(), fileChecksum: text('file_checksum').notNull(), mappingJson: text('mapping_json'), status: text('status').notNull().default('uploaded'), totalRows: integer('total_rows').notNull().default(0), validRows: integer('valid_rows').notNull().default(0), warningRows: integer('warning_rows').notNull().default(0), errorRows: integer('error_rows').notNull().default(0), committedAt: text('committed_at'), ...tracked,
}, (t) => [uniqueIndex('uq_import_org_checksum_type').on(t.organizationId, t.fileChecksum, t.type), index('idx_import_org_status').on(t.organizationId, t.status)]);

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(), organizationId: text('organization_id').notNull().references(() => organizations.id), actorUserId: text('actor_user_id').references(() => users.id), action: text('action').notNull(), resourceType: text('resource_type').notNull(), resourceId: text('resource_id').notNull(), previousJson: text('previous_json'), newJson: text('new_json'), reason: text('reason'), correlationId: text('correlation_id').notNull(), occurredAt: text('occurred_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index('idx_audit_resource_time').on(t.resourceType, t.resourceId, t.occurredAt), index('idx_audit_actor_time').on(t.actorUserId, t.occurredAt), index('idx_audit_correlation').on(t.correlationId)]);
