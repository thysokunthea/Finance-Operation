# DG Finance Intelligence — MVP

A Next.js starter app for DG Academy's intelligent finance and accounting workflow.

## Included modules

- Finance command-center dashboard
- Invoice and Accounts Receivable tracking
- Expense and Accounts Payable tracking
- Approval-state visibility
- Budget utilization
- Rule-based intelligent finance alerts
- API endpoint: `/api/insights`
- Workflow map from training sale to management reporting

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Phase 2 recommended architecture

1. PostgreSQL / Supabase database
2. Authentication + roles: Admin, Finance, Approver, Sales, Management
3. CRUD forms for clients, courses, invoices, receipts, expenses, vendors and budgets
4. Approval workflow with audit log
5. LocalizeBook integration by API/export if supported by your account
6. ABA/KHQR reconciliation integration where permitted
7. AI assistant connected to live finance data via tools, with read-only defaults and approval gates for financial actions
8. Monthly close checklist and management reporting

## Core data entities

Client, TrainingProgram, Project, Invoice, InvoiceLine, Receipt, Vendor, Expense, ExpenseApproval, Budget, Department, Account, JournalEntry, AuditLog.

## Important

This MVP uses demonstration data and deterministic rules. It is not yet a production accounting ledger and must not be treated as the official books until database controls, double-entry posting, permissions, audit logs, tax rules and reconciliation have been implemented and reviewed by DG Academy's finance/accounting owner.
