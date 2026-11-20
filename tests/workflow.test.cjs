const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');

// Real PostgreSQL in memory: no credentials, network, production data, or auth bypass in the app.
const pg = new PGlite();
const cache = new Map();
let current = {
  userId: 'test-admin',
  email: 'admin@example.test',
  role: 'admin',
  organizationId: 'test-org',
};
process.env.DATABASE_URL = 'postgresql://test-only';
process.env.CLERK_SECRET_KEY = 'test-only';
const job = (text, params = []) => ({
  text,
  params,
  then(resolve, reject) {
    return pg
      .query(text, params)
      .then((r) => r.rows)
      .then(resolve, reject);
  },
});
const client = {
  query: job,
  transaction: async (jobs) =>
    pg.transaction(async (tx) => {
      const results = [];
      for (const j of jobs)
        results.push((await tx.query(j.text, j.params)).rows);
      return results;
    }),
};
function load(filename) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const req = (id) => {
    if (id === '@neondatabase/serverless') return { neon: () => client };
    if (id === 'next/navigation')
      return {
        redirect: () => {
          throw new Error('Redirect');
        },
      };
    if (id === '@clerk/nextjs/server')
      return {
        currentUser: async () => ({
          id: current.userId,
          firstName: 'Test',
          lastName: 'User',
          primaryEmailAddress: {
            emailAddress: current.email,
            verification: { status: 'verified' },
          },
          publicMetadata: {
            financeRole: current.role,
            financeOrganizationId: current.organizationId,
          },
        }),
      };
    if (id.startsWith('@/') || id.startsWith('.'))
      return load(
        (id.startsWith('@/')
          ? path.join(__dirname, '..', id.slice(2))
          : path.resolve(path.dirname(filename), id)) +
          (path.extname(id) ? '' : '.ts'),
      );
    return require(id);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', {
    filename,
  })(req, module, module.exports);
  return module.exports;
}
const auth = load('app/chatgpt-auth.ts');
const db = load('db/neon.ts');
const tx = load('db/transaction-register.ts');
const approvals = load('db/approval-workflow.ts');
const payments = load('db/payments.ts');
const closing = load('db/closing.ts');
const periods = load('db/periods.ts');
const docs = load('db/documents.ts');
const requests = load('db/payment-requests.ts');
const budgets = load('db/budgets.ts');
const tasks = load('db/tasks.ts');
const reports = load('lib/reports.ts');
async function user(role = 'admin', organizationId = 'test-org') {
  current = {
    userId: 'test-' + role,
    email: role + '@example.test',
    role,
    organizationId,
  };
  return auth.getChatGPTUser();
}
const record = (id, extra = {}) => ({
  id,
  date: '2026-11-03',
  type: 'Income',
  reference: id,
  party: 'Test customer',
  department: 'Sales',
  category: 'Training',
  amount: '$110.00',
  currency: 'USD',
  subtotal: '100',
  tax: '10',
  exchangeRate: '4000',
  description: 'Test training',
  approval: 'Finance review',
  status: 'Pending',
  owner: 'Test',
  dueDate: '2026-11-10',
  paymentMethod: 'Bank',
  accountCode: '4000',
  ...extra,
});
const payment = (id, amount, reference, extra = {}) => ({
  transactionId: id,
  amount,
  reference,
  date: '2026-11-05',
  exchangeRate: 4050,
  method: 'Bank',
  idempotencyKey: crypto.randomUUID(),
  ...extra,
});

test('finance workflow against PostgreSQL', async (t) => {
  // PGlite serializes transactions; the advisory-lock call is a no-op in this single-process engine.
  await pg.exec(
    `CREATE FUNCTION pg_advisory_xact_lock(integer) RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql`,
  );
  await t.test('schema initializes and retries are safe', async () => {
    await db.ensureCoreSchema();
    await db.ensureCoreSchema();
  });
  await t.test('money, metadata and approval permissions', async () => {
    let u = await user('finance');
    const saved = await tx.saveTransactionRecord(record('INV-1'), u);
    assert.equal(saved.reportingAmount, 440000);
    assert.equal(saved.balance, 110);
    assert.equal(saved.version, 1);
    await assert.rejects(
      () => payments.recordPayment(payment('INV-1', 20, 'early'), u),
      /Approve/,
    );
    await assert.rejects(
      () => approvals.approveTransaction('INV-1', u),
      /Forbidden/,
    );
    u = await user('approver');
    await approvals.approveTransaction('INV-1', u);
    const read = (await tx.listTransactionRecords())[0];
    assert.equal(read.category, 'Training');
    assert.equal(read.exchangeRate, '4000');
    assert.equal(read.paymentMethod, 'Bank');
    assert.equal(read.accountCode, '4000');
    assert.equal(read.approval, 'Approved');
    await assert.rejects(
      () => approvals.approveTransaction('INV-1', u),
      /submitted/,
    );
  });
  await t.test(
    'partial payments, retries, duplicate references, overpayment and rollback',
    async () => {
      const u = await user('finance');
      const first = payment('INV-1', 30, 'receipt-1');
      let saved = await payments.recordPayment(first, u);
      assert.equal(saved.balance, 80);
      assert.equal(saved.status, 'Partially Paid');
      assert.equal(saved.cashReportingAmount, 121500);
      saved = await payments.recordPayment(first, u);
      assert.equal(saved.balance, 80);
      await assert.rejects(
        () => payments.recordPayment(payment('INV-1', 10, 'receipt-1'), u),
        /unique|duplicate/i,
      );
      await assert.rejects(
        () => payments.recordPayment(payment('INV-1', 81, 'too-much'), u),
        /exceeds/,
      );
      assert.equal((await tx.listTransactionRecords())[0].balance, 80);
      const outcomes = await Promise.allSettled([
        payments.recordPayment(payment('INV-1', 60, 'race-a'), u),
        payments.recordPayment(payment('INV-1', 60, 'race-b'), u),
      ]);
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
      saved = (await tx.listTransactionRecords())[0];
      assert.equal(saved.balance, 20);
      await assert.rejects(
        () => tx.saveTransactionRecord({ ...saved, description: 'changed' }, u),
        /payments/,
      );
      await assert.rejects(
        () => tx.deleteTransactionRecord('INV-1', u),
        /payments/,
      );
      await payments.recordPayment(payment('INV-1', 20, 'last'), u);
      assert.equal((await tx.listTransactionRecords())[0].status, 'Paid');
    },
  );
  await t.test(
    'duplicate prevention, optimistic edits and reject/resubmit',
    async () => {
      let u = await user('finance');
      let saved = await tx.saveTransactionRecord(
        record('INV-2', { reference: 'UNIQUE-2' }),
        u,
      );
      await assert.rejects(
        () =>
          tx.saveTransactionRecord(
            record('INV-duplicate', { reference: 'UNIQUE-2' }),
            u,
          ),
        /duplicate/i,
      );
      saved = await tx.saveTransactionRecord(
        { ...saved, description: 'Corrected' },
        u,
      );
      assert.equal(saved.version, 2);
      await assert.rejects(
        () => tx.saveTransactionRecord({ ...saved, version: 1 }, u),
        /changed/,
      );
      u = await user('approver');
      await approvals.approveTransaction(
        'INV-2',
        u,
        'reject',
        'Missing detail',
      );
      assert.equal((await approvals.listPendingApprovals()).length, 0);
      u = await user('finance');
      saved = (await tx.listTransactionRecords()).find((r) => r.id === 'INV-2');
      await tx.saveTransactionRecord({ ...saved, description: 'Fixed' }, u);
      assert.equal((await approvals.listPendingApprovals()).length, 1);
    },
  );
  await t.test('workspace isolation and viewer protection', async () => {
    const u = await user('admin', 'other-org');
    assert.deepEqual(await tx.listTransactionRecords(), []);
    await assert.rejects(
      () => tx.deleteTransactionRecord('INV-1', u),
      /not found/,
    );
    await tx.saveTransactionRecord(record('OTHER-1'), u);
    assert.equal((await tx.listTransactionRecords()).length, 1);
    await user('viewer');
    const route = load('app/api/transactions/route.ts');
    const response = await route.POST(
      new Request('http://test/api/transactions', {
        method: 'POST',
        body: JSON.stringify(record('NOPE')),
      }),
    );
    assert.equal(response.status, 403);
    await user('unassigned');
    await assert.rejects(() => tx.listTransactionRecords(), /Forbidden/);
  });
  await t.test(
    'payment request draft → submitted → approved → paid',
    async () => {
      let u = await user('finance');
      let list = await requests.createPaymentRequest(
        {
          title: 'Supplies',
          category: 'Supplies',
          amount: 50000,
          currency: 'KHR',
          exchangeRate: '1',
          party: 'Vendor',
          department: 'Operations',
          date: '2026-11-03',
          reference: 'BILL-REQ',
        },
        u,
      );
      const id = list[0].id;
      assert.equal(list[0].status, 'Draft');
      list = await requests.submitPaymentRequest(id, u);
      assert.equal(list[0].status, 'Finance review');
      await assert.rejects(
        () => requests.submitPaymentRequest(id, u),
        /already/,
      );
      u = await user('approver');
      await approvals.approveTransaction(id, u);
      u = await user('finance');
      await payments.recordPayment(
        payment(id, 50000, 'vendor-paid', { exchangeRate: 1 }),
        u,
      );
      assert.equal((await requests.listPaymentRequests())[0].status, 'Paid');
    },
  );
  await t.test(
    'documents require review and a valid linked reference',
    async () => {
      const u = await user('finance');
      const doc = await docs.uploadDocument(
        {
          fileName: 'evidence.txt',
          mimeType: 'text/plain',
          contentBase64: Buffer.from('test').toString('base64'),
        },
        u,
      );
      assert.equal(doc.status, 'Pending review');
      await assert.rejects(
        () =>
          docs.reviewDocument(
            { id: doc.id, linkedReference: 'MISSING', verify: true },
            u,
          ),
        /unique transaction/,
      );
      await docs.reviewDocument(
        { id: doc.id, linkedReference: 'INV-1', verify: true },
        u,
      );
      assert.equal((await docs.listDocuments())[0].status, 'Verified');
    },
  );
  await t.test(
    'budget compares currency correctly and tasks can be edited',
    async () => {
      const u = await user('finance');
      const result = await budgets.saveBudget('Operations', 100000, u, 'KHR');
      assert.equal(result[0].actual, 50000);
      assert.equal(result[0].utilization, 50);
      let list = await tasks.createTask(
        {
          name: 'Review receipts',
          category: 'Review',
          due: '2026-11-10',
          priority: 'High',
          related: 'INV-1',
        },
        u,
      );
      list = await tasks.updateTask({
        id: list[0].id,
        name: 'Review bank receipts',
        status: 'In Progress',
      });
      assert.equal(list[0].name, 'Review bank receipts');
      assert.equal(list[0].related, 'INV-1');
    },
  );
  await t.test(
    'reports use payment dates, correct aging and monthly tax',
    async () => {
      const rows = await tx.listTransactionRecords();
      const cash = reports.computeReport('cash-flow-summary', '2026-11', rows);
      assert.equal(cash.lines.find((l) => l[0] === 'Cash receipts')[1], 445500);
      assert.equal(
        reports.computeReport('income-statement', '2026-10', rows).lines[0][1],
        0,
      );
      assert.equal(
        reports.computeReport('tax-summary', '2026-11', rows).lines[0][1],
        40000,
      );
      assert.match(reports.reportCsv(cash), /445500/);
      const aging = reports.computeReport('ar-aging', '2026-11', [
        record('AGING', {
          approval: 'Approved',
          amount: '100',
          currency: 'KHR',
          tax: '0',
          exchangeRate: '1',
          dueDate: '2026-10-01',
          payments: [{ date: '2026-12-01', amount: 100, reportingAmount: 100 }],
        }),
      ]);
      assert.equal(aging.lines.find((l) => l[0] === '31–60 days')[1], 100);
      const api = load('app/api/reports/route.ts');
      const generated = await api.POST(
        new Request('http://test/api/reports', {
          method: 'POST',
          body: JSON.stringify({ id: 'income-statement', period: '2026-11' }),
        }),
      );
      assert.equal(generated.status, 200);
      const history = await (await api.GET()).json();
      assert.equal(history.reports.length, 1);
      assert.equal(history.reports[0].report.period, '2026-11');
    },
  );
  await t.test(
    'period lock requires checks, approval and evidence; lock blocks all financial changes',
    async () => {
      const u = await user('admin');
      await assert.rejects(
        () => periods.changePeriod('2026-11', true, u, 'Month end'),
        /checks/,
      );
      for (const name of closing.closingChecklist)
        await closing.toggleClosingTask('2026-11', name, true, u);
      await assert.rejects(
        () => periods.changePeriod('2026-11', true, u, 'Month end'),
        /unapproved/,
      );
      await approvals.approveTransaction('INV-2', u);
      for (const row of await tx.listTransactionRecords()) {
        const doc = await docs.uploadDocument(
          {
            fileName: 'evidence-' + row.id,
            mimeType: 'text/plain',
            contentBase64: 'dGVzdA==',
          },
          u,
        );
        await docs.reviewDocument(
          { id: doc.id, linkedReference: row.reference, verify: true },
          u,
        );
      }
      await periods.changePeriod('2026-11', true, u, 'Month end');
      assert.equal(await periods.isPeriodClosed('2026-11', u), true);
      await assert.rejects(
        () => tx.saveTransactionRecord(record('LOCKED'), u),
        /closed/,
      );
      await assert.rejects(
        () => tx.deleteTransactionRecord('INV-2', u),
        /closed/,
      );
      await assert.rejects(
        () =>
          closing.toggleClosingTask(
            '2026-11',
            closing.closingChecklist[0],
            false,
            u,
          ),
        /closed/,
      );
      // Settling an older approved invoice in a new open month remains possible.
      await payments.recordPayment(
        payment('INV-2', 10, 'next-month', { date: '2026-12-01' }),
        u,
      );
      await periods.changePeriod('2026-11', false, u, 'Correction needed');
      assert.equal(await periods.isPeriodClosed('2026-11', u), false);
    },
  );
  await t.test(
    'legacy request drafts can be completed without creating a second request',
    async () => {
      const u = await user('finance');
      await pg.query(
        `INSERT INTO payment_requests(id,organization_id,request_number,title,category,amount_minor,currency,status) VALUES('legacy','test-org','LEGACY-1','Old draft','Other',1,'USD','Draft')`,
      );
      let list = await requests.createPaymentRequest(
        {
          requestId: 'LEGACY-1',
          title: 'Completed draft',
          category: 'Supplies',
          amount: 10,
          currency: 'USD',
          exchangeRate: '4000',
          party: 'Vendor',
          department: 'Operations',
          date: '2026-12-01',
          reference: 'LEGACY-BILL',
        },
        u,
      );
      assert.equal(list.filter((r) => r.id === 'LEGACY-1').length, 1);
      assert.equal(list.find((r) => r.id === 'LEGACY-1').amount, 10);
      list = await requests.submitPaymentRequest('LEGACY-1', u);
      assert.equal(
        list.find((r) => r.id === 'LEGACY-1').status,
        'Finance review',
      );
    },
  );
  await t.test(
    'CSV parsing and dates reject invalid data and preserve quoted content',
    () => {
      const csv = load('lib/csv.ts');
      const finance = load('lib/finance.ts');
      assert.deepEqual(
        csv.parseCsv('\uFEFFreference,description\r\nA,"Line 1\nLine ""2"""'),
        [
          ['reference', 'description'],
          ['A', 'Line 1\nLine "2"'],
        ],
      );
      assert.throws(() => csv.parseCsv('a,a\n1,2'), /unique/);
      assert.throws(() => finance.isoDate('2026-02-30'), /valid date/);
      assert.equal(
        finance.reportingValue({
          amount: '$100',
          currency: 'USD',
          exchangeRate: '',
        }),
        null,
      );
      assert.equal(reports.csvCell('=SUM(A1)'), '"\'=SUM(A1)"');
    },
  );
});
test('uploaded files are linked atomically when their financial record is saved', async () => {
  const u = await user('finance', 'upload-record-test');
  const doc = await docs.uploadDocument(
    {
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.from('invoice fixture').toString('base64'),
    },
    u,
  );
  assert.equal((await tx.listTransactionRecords()).length, 0);
  const saved = await tx.saveTransactionRecord(
    record('UPLOAD-RECORD', { documentIds: [doc.id] }),
    u,
  );
  assert.equal(saved.approval, 'Finance review');
  const linked = (
    await pg.query(
      'SELECT linked_transaction_id,status FROM documents WHERE id=$1',
      [doc.id],
    )
  ).rows[0];
  assert.equal(linked.linked_transaction_id, saved.id);
  assert.equal(linked.status, 'Pending review');
  await assert.rejects(
    () =>
      tx.saveTransactionRecord(
        record('INVALID-UPLOAD', { documentIds: ['missing-document'] }),
        u,
      ),
    /attachments/,
  );
  assert.equal(
    (await tx.listTransactionRecords()).some((r) => r.id === 'INVALID-UPLOAD'),
    false,
  );
  await assert.rejects(
    () =>
      tx.saveTransactionRecord(
        record('REUSE-UPLOAD', { documentIds: [doc.id] }),
        u,
      ),
    /attachments/,
  );
  assert.equal((await tx.listTransactionRecords()).length, 1);
  await user('finance', 'another-upload-workspace');
  const other = await auth.getChatGPTUser();
  await assert.rejects(
    () =>
      tx.saveTransactionRecord(
        record('FOREIGN-UPLOAD', { documentIds: [doc.id] }),
        other,
      ),
    /attachments/,
  );
  assert.deepEqual(await tx.listTransactionRecords(), []);
});
test('USD dashboard preserves native dollars and converts KHR balances and settlements', () => {
  const { dashboardUsdRow, usdValue } = load('lib/dashboard-currency.ts');
  const native = dashboardUsdRow(
    {
      amount: '$110.00',
      currency: 'USD',
      balance: 80,
      payments: [{ date: '2026-11-04', amount: 30, reportingAmount: 121500 }],
    },
    4000,
  );
  assert.equal(native.amount, '110');
  assert.equal(native.outstandingReporting, 80);
  assert.equal(native.payments[0].reportingAmount, 30);
  assert.equal(
    dashboardUsdRow({ amount: '$110', currency: 'USD' }, 0).amount,
    '110',
  );
  const converted = dashboardUsdRow(
    {
      amount: 'KHR 440,000',
      currency: 'KHR',
      balance: 320000,
      payments: [
        { date: '2026-11-04', amount: 120000, reportingAmount: 120000 },
      ],
    },
    4000,
  );
  assert.equal(converted.amount, '110');
  assert.equal(converted.outstandingReporting, 80);
  assert.equal(converted.payments[0].reportingAmount, 30);
  assert.equal(usdValue(400000, 'KHR', 4000), 100);
  assert.equal(usdValue(400000, 'KHR', 0), null);
  assert.equal(
    dashboardUsdRow({ amount: 'KHR 440000', currency: 'KHR' }, 0)
      .missingExchangeRate,
    true,
  );
});
test('automatic document creation validates evidence, is idempotent and requires review for uncertainty', async (t) => {
  const auto = load('db/automatic-transactions.ts');
  const planner = load('lib/automatic-transaction.ts');
  const invoice = (reference = 'AUTO-INV-001') =>
    `Invoice No: ${reference}\nVendor: Reliable Supplies\nInvoice Date: 2026-11-16\nDescription: Office supplies\nCurrency: USD\nSubtotal: 100.00\nTax: 10.00\nGrand Total: USD 110.00`;
  const options = {
    type: 'Expense',
    exchangeRate: '4100',
    department: 'Operations',
  };
  let u = await user('finance', 'automatic-test-org');
  const upload = async (name, text) =>
    docs.uploadDocument(
      {
        fileName: name,
        mimeType: 'text/plain',
        contentBase64: Buffer.from(text).toString('base64'),
      },
      await auth.getChatGPTUser(),
    );
  const doc = await upload('invoice.txt', invoice());
  await t.test(
    'creates and links a Pending transaction without approval or payment',
    async () => {
      const result = await auto.createAutomaticTransaction(
        doc.id,
        { ...options, text: invoice() },
        u,
      );
      assert.equal(result.status, 'created');
      assert.equal(result.transaction.type, 'Expense');
      assert.equal(result.transaction.amount, '$110.00');
      assert.equal(result.transaction.approval, 'Finance review');
      assert.equal(result.transaction.status, 'Pending');
      assert.equal(result.transaction.paidAmount, 0);
      const stored = (
        await pg.query(
          'SELECT linked_transaction_id,processing_status FROM documents WHERE id=$1',
          [doc.id],
        )
      ).rows[0];
      assert.equal(stored.linked_transaction_id, result.transaction.id);
      assert.equal(stored.processing_status, 'Created');
    },
  );
  await t.test(
    'same document and same-file uploads never create another transaction',
    async () => {
      assert.equal(
        (
          await auto.createAutomaticTransaction(
            doc.id,
            { ...options, text: invoice() },
            u,
          )
        ).status,
        'existing',
      );
      const again = await upload('copy.txt', invoice());
      assert.equal(
        (
          await auto.createAutomaticTransaction(
            again.id,
            { ...options, text: invoice() },
            u,
          )
        ).status,
        'duplicate',
      );
      assert.equal((await tx.listTransactionRecords()).length, 1);
    },
  );
  await t.test(
    'missing fields, tax mismatches, unknown dates, and unlabeled totals require review',
    async () => {
      for (const text of [
        '',
        invoice('BAD-TAX').replace('Tax: 10.00', 'Tax: 25.00'),
        invoice('NO-DATE').replace('2026-11-16', '01/02/2026'),
        invoice('NO-TOTAL').replace(
          'Grand Total: USD 110.00',
          'Line amount: USD 110.00',
        ),
      ]) {
        const source = await upload(
          'review.txt',
          text || 'empty receipt image',
        );
        const result = await auto.createAutomaticTransaction(
          source.id,
          { ...options, text },
          u,
        );
        assert.equal(result.status, 'needs_review');
        assert.ok(result.issues.length);
        const document = (await docs.listDocuments()).find(
          (d) => d.id === source.id,
        );
        assert.equal(document.processingStatus, 'Needs review');
        assert.ok(document.suggestedTransaction);
      }
      assert.equal((await tx.listTransactionRecords()).length, 1);
    },
  );
  await t.test(
    'concurrent attempts create only one financial record',
    async () => {
      const source = await upload('concurrent.txt', invoice('RACE-AUTO'));
      const results = await Promise.all([
        auto.createAutomaticTransaction(
          source.id,
          { ...options, text: invoice('RACE-AUTO') },
          u,
        ),
        auto.createAutomaticTransaction(
          source.id,
          { ...options, text: invoice('RACE-AUTO') },
          u,
        ),
      ]);
      assert.equal(results.filter((r) => r.status === 'created').length, 1);
      assert.equal(
        (await tx.listTransactionRecords()).filter(
          (r) => r.reference === 'RACE-AUTO',
        ).length,
        1,
      );
    },
  );
  await t.test(
    'currency, permissions, type context and worksheet formats are checked',
    async () => {
      const khr = invoice('KHR-INV')
        .replace('Currency: USD', 'Currency: KHR')
        .replace('Grand Total: USD 110.00', 'Grand Total: KHR 110.00');
      assert.deepEqual(
        planner.planAutomaticTransaction(khr, 'khr', { type: 'Expense' })
          .issues,
        [],
      );
      const khmer = planner.planAutomaticTransaction(
        'លេខវិក្កយបត្រ៖ INV-KM-01\nអ្នកផ្គត់ផ្គង់៖ ហាងសម្ភារៈ\nកាលបរិច្ឆេទ៖ ២០២៦-១១-១៦\nបរិយាយ៖ សម្ភារៈការិយាល័យ\nរូបិយប័ណ្ណ៖ រៀល\nសរុប៖ ៤៤០,០០០ រៀល',
        'km',
        { type: 'Expense' },
      );
      assert.deepEqual(khmer.issues, []);
      assert.equal(khmer.draft.amount, '440000');
      assert.equal(khmer.draft.currency, 'KHR');
      assert.equal(khmer.draft.date, '2026-11-16');
      const csv = planner.planAutomaticTransaction(
        'reference,vendor,date,description,currency,amount,type\nCSV-1,Reliable Supplies,2026-11-16,Office supplies,USD,100,Expense',
        'csv',
        options,
      );
      assert.deepEqual(csv.issues, []);
      assert.equal(csv.draft.amount, '100');
      assert.ok(
        planner
          .planAutomaticTransaction(
            'reference,vendor,date,description,currency,amount\nCSV-1,Vendor,2026-11-16,Supplies,USD,100\nCSV-2,Vendor,2026-11-16,Supplies,USD,50',
            'multi-csv',
            options,
          )
          .issues.some((issue) => issue.includes('multiple transactions')),
      );
      assert.ok(
        planner
          .planAutomaticTransaction(invoice(), 'no-rate', { type: 'Expense' })
          .issues.some((i) => i.includes('exchange rate')),
      );
      assert.ok(
        planner
          .planAutomaticTransaction(
            invoice().replace('Currency: USD', 'Currency: KHR'),
            'conflict',
            options,
          )
          .issues.some((i) => i.includes('conflicts')),
      );
      const worksheet = await upload('invoice.xlsx', invoice('XLS'));
      assert.equal(
        (
          await auto.createAutomaticTransaction(
            worksheet.id,
            { ...options, text: invoice('XLS') },
            u,
          )
        ).status,
        'created',
      );
      const viewer = await user('viewer', 'automatic-test-org');
      await assert.rejects(
        () =>
          auto.createAutomaticTransaction(
            doc.id,
            { ...options, text: invoice() },
            viewer,
          ),
        /Forbidden/,
      );
      const other = await user('finance', 'other-auto-org');
      await assert.rejects(
        () =>
          auto.createAutomaticTransaction(
            doc.id,
            { ...options, text: invoice() },
            other,
          ),
        /not found/,
      );
      u = await user('finance', 'automatic-test-org');
      const route = load('app/api/documents/[id]/transaction/route.ts');
      const response = await route.POST(
        new Request('http://test/api/documents/' + doc.id + '/transaction', {
          method: 'POST',
          body: JSON.stringify({ ...options, text: invoice() }),
        }),
        { params: Promise.resolve({ id: doc.id }) },
      );
      assert.equal(response.status, 200);
    },
  );
  await t.test(
    'actual XLSX and XLS uploads read cell dates and totals, then create linked records',
    async () => {
      const XLSX = require('xlsx');
      const { readDocumentText } = load('lib/document-reader.ts');
      for (const bookType of ['xlsx', 'xls']) {
        const sheet = XLSX.utils.aoa_to_sheet(
          [
            ['Invoice'],
            ['Invoice No:', null, 'EXCEL-' + bookType],
            ['Vendor', null, 'Tools, Inc.'],
            ['Invoice Date', null, new Date('2026-11-20T00:00:00Z')],
            ['Description', null, 'Office supplies'],
            ['Currency', null, 'USD'],
            ['Subtotal', null, 100],
            ['Tax', null, 10],
            ['Grand Total', null, 110],
          ],
          { UTC: true },
        );
        sheet.C9.z = '"USD "0.00';
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(book, sheet, 'Invoice');
        const bytes = XLSX.write(book, { type: 'buffer', bookType });
        const file = new File([bytes], 'invoice.' + bookType);
        const text = await readDocumentText(file);
        assert.match(text, /Invoice Date: 2026-11-20/);
        assert.match(text, /Grand Total: USD 110.00/);
        const source = await docs.uploadDocument(
          {
            fileName: file.name,
            mimeType:
              bookType === 'xls'
                ? 'application/vnd.ms-excel'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            sizeBytes: bytes.length,
            contentBase64: bytes.toString('base64'),
          },
          u,
        );
        const result = await auto.createAutomaticTransaction(
          source.id,
          { ...options, text },
          u,
        );
        assert.equal(result.status, 'created');
        assert.equal(result.transaction.amount, '$110.00');
        assert.equal(result.transaction.party, 'Tools, Inc.');
        assert.equal(result.transaction.date, '20 Nov 2026');
        assert.equal(result.transaction.status, 'Pending');
        const stored = (
          await pg.query(
            'SELECT linked_transaction_id FROM documents WHERE id=$1',
            [source.id],
          )
        ).rows[0];
        assert.equal(stored.linked_transaction_id, result.transaction.id);
      }
    },
  );
  await t.test(
    'Excel tables preserve columns and multiple records require one clear review message',
    async () => {
      const XLSX = require('xlsx');
      const { readDocumentText } = load('lib/document-reader.ts');
      const rows = [
        ['reference', 'vendor', 'date', 'description', 'currency', 'amount'],
        ['XLS-TABLE', 'Tools, Inc.', '2026-11-20', 'Supplies', 'USD', 100],
      ];
      const workbook = () => {
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.aoa_to_sheet(rows),
          'Invoices',
        );
        return book;
      };
      const readBook = (book) =>
        readDocumentText(
          new File(
            [XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })],
            'table.xlsx',
          ),
        );
      const one = planner.planAutomaticTransaction(
        await readBook(workbook()),
        'table-one',
        options,
      );
      assert.deepEqual(one.issues, []);
      assert.equal(one.draft.party, 'Tools, Inc.');
      rows.push([
        'XLS-TABLE-2',
        'Other vendor',
        '2026-11-20',
        'Other',
        'USD',
        10,
      ]);
      const many = planner.planAutomaticTransaction(
        await readBook(workbook()),
        'table-many',
        options,
      );
      assert.equal(many.issues.length, 1);
      assert.match(many.issues[0], /multiple transactions/);
      const book = workbook();
      XLSX.utils.book_append_sheet(
        book,
        XLSX.utils.aoa_to_sheet([['Invoice No', 'ANOTHER']]),
        'Second',
      );
      await assert.rejects(
        () => readBook(book),
        /multiple populated worksheets/,
      );
      const formulaBook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        formulaBook,
        {
          A1: { t: 's', v: 'Total' },
          B1: { t: 'n', f: 'SUM(1,2)' },
          '!ref': 'A1:B1',
        },
        'Invoice',
      );
      await assert.rejects(
        () => readBook(formulaBook),
        /formula without a saved result/,
      );
    },
  );
  await t.test(
    'reader failures persist only their cause without irrelevant missing-field errors',
    async () => {
      const source = await upload('unreadable.xlsx', 'unreadable workbook');
      const result = await auto.createAutomaticTransaction(
        source.id,
        {
          ...options,
          text: '',
          extractionError:
            'This Excel file could not be read. Save an unprotected copy and retry.',
        },
        u,
      );
      assert.equal(result.status, 'needs_review');
      assert.deepEqual(result.issues, [
        'This Excel file could not be read. Save an unprotected copy and retry.',
      ]);
      const saved = (await docs.listDocuments()).find(
        (d) => d.id === source.id,
      );
      assert.deepEqual(saved.suggestedTransaction.issues, result.issues);
      assert.equal(saved.linkedReference, null);
      const empty = await auto.createAutomaticTransaction(
        source.id,
        { ...options, text: '' },
        u,
      );
      assert.equal(empty.issues.length, 1);
      assert.match(empty.issues[0], /No readable text/);
    },
  );
});
test('cash book uploads create row transactions and route receipts and payments without importing balances', async (t) => {
  const XLSX = require('xlsx');
  const importer = load('db/spreadsheet-import.ts');
  const planner = load('lib/cashbook-import.ts');
  let u = await user('finance', 'cashbook-test-org');
  const rows = [
    ['DG Cash Book Oct 26'],
    ['Date', 'Description', 'Receipt', 'Payment', 'Balance'],
    ['', 'Opening balance', '', '', 1000],
    ...Array.from({ length: 25 }, (_, index) => [
      new Date('2026-10-15T00:00:00Z'),
      index % 2 ? 'Office rent ' + index : 'Sales receipt ' + index,
      index % 2 ? '' : 100 + index,
      index % 2 ? 10 + index : '',
      1000,
    ]),
    ['', 'Total', 5000, 5000, 1000],
  ];
  const makeBook = (sourceRows) => {
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(sourceRows, { UTC: true });
    // A missing cached Balance formula must not block valid Receipt / Payment cells.
    if (sourceRows.length > 3) sheet.E4 = { t: 'n', f: 'SUM(C4)-SUM(D4)' };
    XLSX.utils.book_append_sheet(book, sheet, 'October');
    return XLSX.write(book, { bookType: 'xlsx', type: 'buffer' });
  };
  const uploadBook = (bytes, name = 'DG_Cash Book Oct 26.xlsx') =>
    docs.uploadDocument(
      {
        fileName: name,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: bytes.length,
        contentBase64: bytes.toString('base64'),
      },
      u,
    );
  const bytes = makeBook(rows);
  const source = await uploadBook(bytes);
  const options = {
    type: 'Expense',
    exchangeRate: '4100',
    defaultCurrency: 'USD',
    department: 'Operations',
  };
  let imported;
  await t.test(
    'imports all 25 movement rows in chunks, preserving amount, direction, category and source',
    async () => {
      const first = await importer.createSpreadsheetTransactions(
        source.id,
        options,
        u,
      );
      assert.equal(first.createdCount, 20);
      assert.equal(first.nextOffset, 20);
      const second = await importer.createSpreadsheetTransactions(
        source.id,
        { ...options, offset: first.nextOffset },
        u,
      );
      assert.equal(second.createdCount, 5);
      assert.equal(second.nextOffset, null);
      imported = await tx.listTransactionRecords();
      assert.equal(imported.length, 25);
      assert.equal(imported.filter((r) => r.type === 'Income').length, 13);
      assert.equal(imported.filter((r) => r.type === 'Expense').length, 12);
      assert.ok(
        imported.every(
          (r) =>
            r.status === 'Pending' &&
            r.approval === 'Finance review' &&
            r.sourceDocument.id === source.id,
        ),
      );
      assert.ok(
        imported
          .filter((r) => r.type === 'Income')
          .every((r) => r.journalType === 'cash_receipts'),
      );
      assert.ok(
        imported
          .filter((r) => r.type === 'Expense')
          .every(
            (r) =>
              r.journalType === 'cash_disbursements' &&
              r.accountCode === '6010',
          ),
      );
      assert.equal(
        (
          await pg.query(
            'SELECT COUNT(*)::int AS count FROM transaction_payments WHERE organization_id=$1',
            [u.organizationId],
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (await docs.listDocuments()).find((d) => d.id === source.id)
          .linkedTransactionCount,
        25,
      );
    },
  );
  await t.test(
    'retries and duplicate file uploads never create the same rows twice',
    async () => {
      const retry = await importer.createSpreadsheetTransactions(
        source.id,
        options,
        u,
      );
      assert.equal(retry.createdCount, 0);
      assert.equal(retry.duplicateCount, 20);
      const copy = await uploadBook(bytes, 'cashbook-copy.xlsx');
      const copied = await importer.createSpreadsheetTransactions(
        copy.id,
        options,
        u,
      );
      assert.equal(copied.createdCount, 0);
      assert.equal(copied.duplicateCount, 20);
      assert.equal((await tx.listTransactionRecords()).length, 25);
      assert.equal(
        (await docs.listDocuments()).find((d) => d.id === copy.id)
          .linkedTransactionCount,
        20,
      );
    },
  );
  await t.test(
    'missing rate creates drafts and one workbook retry supplies it for every imported row',
    async () => {
      const draftFile = await uploadBook(
        makeBook([
          rows[1],
          [
            new Date('2026-10-20T00:00:00Z'),
            'Cash sale without rate',
            55,
            '',
            100,
          ],
        ]),
      );
      const result = await importer.createSpreadsheetTransactions(
        draftFile.id,
        { ...options, exchangeRate: '' },
        u,
      );
      assert.equal(result.createdCount, 1);
      assert.equal(result.reviewCount, 1);
      const record = result.transactions[0];
      assert.equal(record.approval, 'draft');
      assert.equal(record.reportingAmount, null);
      const api = load('app/api/transactions/route.ts');
      const submit = await api.PATCH(
        new Request('http://test/api/transactions', {
          method: 'PATCH',
          body: JSON.stringify({ id: record.id }),
        }),
      );
      assert.equal(submit.status, 400);
      const retry = await importer.createSpreadsheetTransactions(
        draftFile.id,
        options,
        u,
      );
      assert.equal(retry.createdCount, 0);
      assert.equal(retry.transactions[0].approval, 'Finance review');
      assert.equal(retry.transactions[0].exchangeRate, '4100');
    },
  );
  await t.test(
    'invalid rows are reported, empty movements and balance totals are excluded',
    async () => {
      const bytes = makeBook([
        rows[1],
        ['01/02/2026', 'Ambiguous date', 100, '', 100],
        ['2026-10-22', 'Two movements', 50, 25, 100],
        ['', 'Closing balance', '', '', 100],
      ]);
      const file = await uploadBook(bytes);
      const result = await importer.createSpreadsheetTransactions(
        file.id,
        options,
        u,
      );
      assert.equal(result.createdCount, 0);
      assert.equal(result.rows.length, 2);
      assert.equal(result.reviewCount, 2);
      assert.match(result.rows[0].issues.join(' '), /Date/);
      assert.match(result.rows[1].issues.join(' '), /not both/);
      assert.equal(
        planner.planCashbookImport(
          bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
          file.id,
          options,
        ).entries.length,
        2,
      );
    },
  );
  await t.test(
    'source verification applies to all linked rows; permissions and API dispatch remain scoped',
    async () => {
      await docs.reviewDocument(
        { id: source.id, linkedReference: '', verify: true },
        u,
      );
      assert.equal(
        (await docs.listDocuments()).find((d) => d.id === source.id).status,
        'Verified',
      );
      const viewer = await user('viewer', 'cashbook-test-org');
      await assert.rejects(
        () =>
          importer.createSpreadsheetTransactions(source.id, options, viewer),
        /Forbidden/,
      );
      const other = await user('finance', 'cashbook-other-org');
      await assert.rejects(
        () => importer.createSpreadsheetTransactions(source.id, options, other),
        /not found/,
      );
      u = await user('finance', 'cashbook-test-org');
      const route = load('app/api/documents/[id]/transaction/route.ts');
      const response = await route.POST(
        new Request('http://test/api/documents/' + source.id + '/transaction', {
          method: 'POST',
          body: JSON.stringify({ ...options, spreadsheetImport: true }),
        }),
        { params: Promise.resolve({ id: source.id }) },
      );
      assert.equal(response.status, 200);
      assert.equal((await response.json()).duplicateCount, 20);
    },
  );
  await t.test(
    'concurrent copies link both source documents to one transaction',
    async () => {
      const bytes = makeBook([
        rows[1],
        ['2026-10-25', 'Concurrent receipt', 73, '', 73],
      ]);
      const one = await uploadBook(bytes, 'concurrent-one.xlsx');
      const two = await uploadBook(bytes, 'concurrent-two.xlsx');
      const results = await Promise.all([
        importer.createSpreadsheetTransactions(one.id, options, u),
        importer.createSpreadsheetTransactions(two.id, options, u),
      ]);
      assert.equal(
        results.reduce((sum, r) => sum + r.createdCount, 0),
        1,
      );
      const sources = await docs.listDocuments();
      assert.equal(
        sources.find((d) => d.id === one.id).linkedTransactionCount,
        1,
      );
      assert.equal(
        sources.find((d) => d.id === two.id).linkedTransactionCount,
        1,
      );
    },
  );
  await t.test(
    'review rows from earlier chunks remain persisted after later rows succeed',
    async () => {
      const data = [
        rows[1],
        ['ambiguous', 'Needs date review', 10, '', 10],
        ...Array.from({ length: 20 }, (_, i) => [
          '2026-10-27',
          'Chunk persistence ' + i,
          22 + i,
          '',
          22 + i,
        ]),
      ];
      const source = await uploadBook(makeBook(data), 'chunk-review.xlsx');
      const first = await importer.createSpreadsheetTransactions(
        source.id,
        options,
        u,
      );
      assert.equal(first.reviewCount, 1);
      await importer.createSpreadsheetTransactions(
        source.id,
        { ...options, offset: first.nextOffset },
        u,
      );
      const saved = (await docs.listDocuments()).find(
        (d) => d.id === source.id,
      );
      assert.equal(saved.processingStatus, 'Needs review');
      assert.equal(saved.suggestedTransaction.reviewRows.length, 1);
      assert.match(
        saved.suggestedTransaction.reviewRows[0].issues.join(' '),
        /Date/,
      );
    },
  );
  await t.test(
    'Khmer and English split currency headers, Khmer dates and formatted zero cells import correctly',
    async () => {
      const book = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        [],
        [],
        [],
        ['សៀវភៅកត់ត្រាចំណូល&ចំណាយ / Cash Book'],
        ['របាយការណ៍ខែ 11 ឆ្នាំ 2026'],
        [
          'ថ្ងៃខែ / Date ',
          'លេខវិក្កយបត្រ',
          'ឈ្មោះអ្នកផ្គត់ផ្គង់',
          'បរិយាយ\u200b / Description',
          ' ចំណាយ\u200b / Payment ',
          '',
          ' សមតុល្យ ',
          '',
        ],
        ['', '', '', '', ' KHR ', ' USD ', ' KHR ', ' USD '],
        ['', 'សាច់ប្រាក់ដើមគ្រា', '', '', '', '', ' - ', '$1000.00'],
        [
          '០៣-វិច្ឆិកា-២៦',
          'KM-REF-1',
          'Example supplier',
          'English description / បរិយាយ',
          ' - ៛ ',
          ' $12.50 ',
          ' - ',
          '$987.50',
        ],
        [
          '04-Nov-2026',
          'គ្មាន',
          'ហាងគំរូ',
          'ការទិញសម្ភារៈ',
          '123,400៛',
          '$-   ',
          '(123,400)',
          '$987.50',
        ],
        ['សរុប\u200b', '', '', '', '123,400៛', '$12.50', '(123,400)', '$987.50'],
        ['', 'ពិនិត្យដោយ\u200b', '', '', 'រៀបចំដោយ', 'Example preparer'],
      ]);
      sheet['!merges'] = [
        { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },
        { s: { r: 5, c: 3 }, e: { r: 6, c: 3 } },
      ];
      XLSX.utils.book_append_sheet(book, sheet, 'វិច្ឆិកា');
      const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'buffer' });
      const file = await uploadBook(bytes, 'DG_Cash Book\u200b Nov 26.xlsx');
      const result = await importer.createSpreadsheetTransactions(
        file.id,
        { ...options, defaultCurrency: 'KHR' },
        u,
      );
      assert.equal(result.createdCount, 2);
      assert.equal(result.reviewCount, 0);
      const dollars = result.transactions.find((r) => r.currency === 'USD');
      const riels = result.transactions.find((r) => r.currency === 'KHR');
      assert.equal(dollars.amount, '$12.50');
      assert.equal(dollars.date, '3 Nov 2026');
      assert.equal(riels.amount.replace(/[^0-9.]/g, ''), '123400.00');
      assert.match(riels.reference, /^CB-/);
      assert.equal(riels.party, 'ហាងគំរូ');
      assert.ok(
        result.transactions.every(
          (r) => r.journalType === 'cash_disbursements',
        ),
      );
    },
  );
  await t.test(
    'unrecognized cash books return a batch review rather than a blank invoice form',
    async () => {
      const source = await uploadBook(
        makeBook([
          ['Unknown heading', 'Value'],
          ['Unrecognized', 20],
        ]),
        'DG_Cash Book custom.xlsx',
      );
      const result = await importer.createSpreadsheetTransactions(
        source.id,
        options,
        u,
      );
      assert.equal(result.batch, true);
      assert.equal(result.status, 'needs_review');
      assert.equal(result.createdCount, 0);
      assert.doesNotMatch(
        result.issues.join(' '),
        /Invoice or receipt reference|customer or vendor is required/,
      );
    },
  );
  await t.test(
    'CSV transaction tables preserve original subtotal and tax',
    async () => {
      const text =
        'Date,Description,Receipt,Payment,Balance,Tax,Subtotal\n2026-11-22,CSV cash receipt,110,,110,10,100\n2026-11-23,CSV cash payment,,55,55,5,50';
      const bytes = Buffer.from(text);
      const source = await docs.uploadDocument(
        {
          fileName: 'Cash Book.csv',
          mimeType: 'text/csv',
          sizeBytes: bytes.length,
          contentBase64: bytes.toString('base64'),
        },
        u,
      );
      const result = await importer.createSpreadsheetTransactions(
        source.id,
        options,
        u,
      );
      assert.equal(result.createdCount, 2);
      assert.equal(
        result.transactions.find((r) => r.type === 'Income').tax,
        '10.00',
      );
      assert.equal(
        result.transactions.find((r) => r.type === 'Expense').subtotal,
        '50.00',
      );
    },
  );
});

test('Word DOCX extraction preserves mixed Khmer/English text and Khmer calendar dates', async () => {
  const JSZip = require(
    require.resolve('jszip', {
      paths: [path.dirname(require.resolve('mammoth'))],
    }),
  );
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  const lines = [
    'Invoice No: DOCX-MIXED-1',
    'ឈ្មោះអ្នកផ្គត់ផ្គង់៖ Example supplier',
    'កាលបរិច្ឆេទ / Date៖ ២០-វិច្ឆិកា-២៦',
    'បរិយាយ៖ Office supplies / សម្ភារៈ',
    'Currency: USD',
    'Grand Total: USD 25.00',
  ];
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      lines
        .map((line) => '<w:p><w:r><w:t>' + line + '</w:t></w:r></w:p>')
        .join('') +
      '</w:body></w:document>',
  );
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const { readDocumentText } = load('lib/document-reader.ts');
  const text = await readDocumentText(new File([bytes], 'mixed.docx'));
  assert.match(text, /សម្ភារៈ/);
  const u = await user('finance', 'word-test-org');
  const source = await docs.uploadDocument(
    {
      fileName: 'mixed.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: bytes.length,
      contentBase64: bytes.toString('base64'),
    },
    u,
  );
  const result = await load(
    'db/automatic-transactions.ts',
  ).createAutomaticTransaction(
    source.id,
    { type: 'Expense', exchangeRate: '4100', text },
    u,
  );
  assert.equal(result.status, 'created');
  assert.equal(result.transaction.date, '20 Nov 2026');
  assert.equal(result.transaction.party, 'Example supplier');
  await assert.rejects(
    () => readDocumentText(new File(['not-a-docx'], 'broken.docx')),
    /Word file could not be read/,
  );
});

after(async () => pg.close());
