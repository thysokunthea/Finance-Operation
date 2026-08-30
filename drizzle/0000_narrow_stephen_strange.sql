CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`previous_json` text,
	`new_json` text,
	`reason` text,
	`correlation_id` text NOT NULL,
	`occurred_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_resource_time` ON `audit_logs` (`resource_type`,`resource_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_actor_time` ON `audit_logs` (`actor_user_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_correlation` ON `audit_logs` (`correlation_id`);--> statement-breakpoint
CREATE TABLE `chart_of_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`normal_balance` text NOT NULL,
	`parent_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_account_normal_balance" CHECK("chart_of_accounts"."normal_balance" in ('debit','credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_accounts_org_code` ON `chart_of_accounts` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_accounts_org_type` ON `chart_of_accounts` (`organization_id`,`type`);--> statement-breakpoint
CREATE TABLE `counterparties` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`tax_id` text,
	`payment_terms_days` integer DEFAULT 30 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_counterparty_type" CHECK("counterparties"."type" in ('customer','vendor','both'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_counterparties_org_code` ON `counterparties` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_counterparties_org_type` ON `counterparties` (`organization_id`,`type`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`manager_user_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`manager_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_departments_org_code` ON `departments` (`organization_id`,`code`);--> statement-breakpoint
CREATE TABLE `document_links` (
	`document_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`linked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`linked_by` text NOT NULL,
	PRIMARY KEY(`document_id`, `resource_type`, `resource_id`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_document_links_resource` ON `document_links` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`checksum_sha256` text NOT NULL,
	`category` text NOT NULL,
	`scan_status` text DEFAULT 'pending' NOT NULL,
	`version_number` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_documents_object_key` ON `documents` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_documents_org_checksum` ON `documents` (`organization_id`,`checksum_sha256`);--> statement-breakpoint
CREATE INDEX `idx_documents_org_scan` ON `documents` (`organization_id`,`scan_status`);--> statement-breakpoint
CREATE TABLE `fiscal_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`year` integer NOT NULL,
	`period_number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`locked_at` text,
	`locked_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_fiscal_status" CHECK("fiscal_periods"."status" in ('future','open','closing','locked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fiscal_period` ON `fiscal_periods` (`organization_id`,`year`,`period_number`);--> statement-breakpoint
CREATE INDEX `idx_fiscal_period_status` ON `fiscal_periods` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`type` text NOT NULL,
	`file_name` text NOT NULL,
	`file_checksum` text NOT NULL,
	`mapping_json` text,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`valid_rows` integer DEFAULT 0 NOT NULL,
	`warning_rows` integer DEFAULT 0 NOT NULL,
	`error_rows` integer DEFAULT 0 NOT NULL,
	`committed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_import_org_checksum_type` ON `import_jobs` (`organization_id`,`file_checksum`,`type`);--> statement-breakpoint
CREATE INDEX `idx_import_org_status` ON `import_jobs` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_id` text,
	`counterparty_id` text NOT NULL,
	`direction` text NOT NULL,
	`normalized_invoice_number` text NOT NULL,
	`invoice_number` text NOT NULL,
	`invoice_date` text NOT NULL,
	`due_date` text NOT NULL,
	`currency` text NOT NULL,
	`original_minor` integer NOT NULL,
	`status` text NOT NULL,
	`responsible_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_invoice_direction" CHECK("invoices"."direction" in ('receivable','payable')),
	CONSTRAINT "ck_invoice_amount" CHECK("invoices"."original_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invoice_duplicate` ON `invoices` (`organization_id`,`counterparty_id`,`direction`,`normalized_invoice_number`);--> statement-breakpoint
CREATE INDEX `idx_invoice_org_status_due` ON `invoices` (`organization_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_id` text NOT NULL,
	`fiscal_period_id` text NOT NULL,
	`entry_number` text NOT NULL,
	`entry_date` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`reversal_of_id` text,
	`posted_at` text,
	`posted_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`fiscal_period_id`) REFERENCES `fiscal_periods`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_journal_status" CHECK("journal_entries"."status" in ('draft','posted','reversed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_journal_org_number` ON `journal_entries` (`organization_id`,`entry_number`);--> statement-breakpoint
CREATE INDEX `idx_journal_period_status` ON `journal_entries` (`fiscal_period_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_journal_transaction` ON `journal_entries` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`journal_entry_id` text NOT NULL,
	`account_id` text NOT NULL,
	`department_id` text,
	`project_id` text,
	`description` text,
	`debit_minor` integer DEFAULT 0 NOT NULL,
	`credit_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_journal_line_sided" CHECK(("journal_lines"."debit_minor" > 0 and "journal_lines"."credit_minor" = 0) or ("journal_lines"."credit_minor" > 0 and "journal_lines"."debit_minor" = 0))
);
--> statement-breakpoint
CREATE INDEX `idx_journal_lines_entry` ON `journal_lines` (`journal_entry_id`);--> statement-breakpoint
CREATE INDEX `idx_journal_lines_account` ON `journal_lines` (`account_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`functional_currency` text DEFAULT 'USD' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`fiscal_year_start_month` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ck_org_fiscal_month" CHECK("organizations"."fiscal_year_start_month" between 1 and 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_organizations_code` ON `organizations` (`code`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`event_type` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`available_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`processed_at` text,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_outbox_idempotency` ON `outbox_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_outbox_status_available` ON `outbox_events` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_allocation_amount" CHECK("payment_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payment_invoice_allocation` ON `payment_allocations` (`payment_id`,`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_allocation_invoice` ON `payment_allocations` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`payment_number` text NOT NULL,
	`payment_date` text NOT NULL,
	`direction` text NOT NULL,
	`counterparty_id` text NOT NULL,
	`currency` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`evidence_document_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_payment_amount" CHECK("payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_payment_org_number` ON `payments` (`organization_id`,`payment_number`);--> statement-breakpoint
CREATE INDEX `idx_payment_counterparty_date` ON `payments` (`counterparty_id`,`payment_date`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` text,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_projects_org_code` ON `projects` (`organization_id`,`code`);--> statement-breakpoint
CREATE INDEX `idx_projects_department` ON `projects` (`department_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_roles_org_code` ON `roles` (`organization_id`,`code`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`task_number` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`assignee_user_id` text NOT NULL,
	`related_type` text,
	`related_id` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`start_date` text,
	`due_date` text,
	`reminder_at` text,
	`status` text DEFAULT 'not_started' NOT NULL,
	`completed_at` text,
	`automation_key` text,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_org_number` ON `tasks` (`organization_id`,`task_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_automation_key` ON `tasks` (`organization_id`,`automation_key`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assignee_status_due` ON `tasks` (`assignee_user_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`transaction_number` text NOT NULL,
	`transaction_date` text NOT NULL,
	`type` text NOT NULL,
	`reference_number` text,
	`description` text NOT NULL,
	`counterparty_id` text,
	`department_id` text,
	`project_id` text,
	`currency` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`due_date` text,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`approval_status` text DEFAULT 'draft' NOT NULL,
	`posting_status` text DEFAULT 'unposted' NOT NULL,
	`responsible_user_id` text,
	`reversed_transaction_id` text,
	`posted_at` text,
	`posted_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`counterparty_id`) REFERENCES `counterparties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`responsible_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "ck_transaction_total" CHECK("transactions"."total_minor" = "transactions"."subtotal_minor" + "transactions"."tax_minor"),
	CONSTRAINT "ck_transaction_amounts" CHECK("transactions"."subtotal_minor" >= 0 and "transactions"."tax_minor" >= 0 and "transactions"."total_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_transactions_org_number` ON `transactions` (`organization_id`,`transaction_number`);--> statement-breakpoint
CREATE INDEX `idx_transactions_org_date_status` ON `transactions` (`organization_id`,`transaction_date`,`posting_status`);--> statement-breakpoint
CREATE INDEX `idx_transactions_counterparty` ON `transactions` (`counterparty_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_department_date` ON `transactions` (`department_id`,`transaction_date`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`assigned_by` text NOT NULL,
	PRIMARY KEY(`user_id`, `role_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`external_user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_org_external` ON `users` (`organization_id`,`external_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_org_email` ON `users` (`organization_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_users_org_status` ON `users` (`organization_id`,`status`);