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
        'needs_review',
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
});
after(async () => pg.close());
