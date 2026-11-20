const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
function load(file) {
  file = path.resolve(file);
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const req = (id) =>
    id.startsWith('.')
      ? load(path.resolve(path.dirname(file), id) + '.ts')
      : require(id);
  vm.runInThisContext('(function(require,module,exports){' + js + '\n})', {
    filename: file,
  })(req, mod, mod.exports);
  return mod.exports;
}
const { parseGdtRates, createGdtRateProvider, cambodiaToday } = load(
  'lib/gdt-exchange-rates.ts',
);
const page = (rows) =>
  '<table><th>Official Rate Riel / USD</th>' +
  rows
    .map(
      ([date, rate]) =>
        `<tr><script type="application/ld+json">{"date":"${date}"}</script><td>${date}</td><td>USD/KHR</td><td>${rate}</td><td>National Bank of Cambodia</td></tr>`,
    )
    .join('') +
  '</table>';
const now = () => new Date('2026-11-20T03:00:00Z');
test('GDT parser reads only official USD/KHR rows and validates dates, month, and conflicts', () => {
  const html =
    page([
      ['November 20, 2026', '4,063'],
      ['November 19, 2026', 4066],
      ['October 30, 2026', 4100],
    ]) +
    '<tr><td>November 20, 2026</td><td>EUR/KHR</td><td>9999</td><td>National Bank of Cambodia</td></tr>';
  assert.deepEqual(parseGdtRates(html, '2026-11'), [
    { date: '2026-11-20', rate: '4063' },
    { date: '2026-11-19', rate: '4066' },
  ]);
  assert.throws(() => parseGdtRates('<h1>4063</h1>', '2026-11'), /verified/);
  assert.throws(
    () =>
      parseGdtRates(
        page([
          ['November 20, 2026', 4063],
          ['November 20, 2026', 9999],
        ]),
        '2026-11',
      ),
    /Conflicting/,
  );
});
test('GDT provider uses transaction date, latest prior publication, and shares month fetches', async () => {
  let calls = 0;
  const provider = createGdtRateProvider(async () => {
    calls++;
    return new Response(
      page([
        ['November 20, 2026', 4063],
        ['November 6, 2026', 4088],
      ]),
    );
  }, now);
  const [today, weekend] = await Promise.all([
    provider('2026-11-20'),
    provider('2026-11-07'),
  ]);
  assert.equal(calls, 1);
  assert.equal(today.rate, '4063');
  assert.equal(today.selection, 'same-day');
  assert.equal(weekend.date, '2026-11-06');
  assert.equal(weekend.rate, '4088');
  assert.equal(weekend.selection, 'previous-published');
  assert.match(
    weekend.sourceUrl,
    /tax\.gov\.kh\/en\/exchange-rate\?for_year=2026&for_month=11/,
  );
  assert.equal(weekend.requestedDate, '2026-11-07');
});
test('GDT provider crosses month boundaries and refuses future or excessively stale rates', async () => {
  const provider = createGdtRateProvider(
    async (url) =>
      new Response(
        url.includes('for_month=10')
          ? page([['October 30, 2026', 4100]])
          : page([['November 20, 2026', 4063]]),
      ),
    now,
  );
  assert.equal((await provider('2026-11-01')).date, '2026-10-30');
  await assert.rejects(() => provider('2026-12-01'), /future/);
  await assert.rejects(() => provider('2026-02-30'), /valid ISO/);
  const stale = createGdtRateProvider(
    async () => new Response(page([['November 1, 2026', 4000]])),
    now,
  );
  await assert.rejects(() => stale('2026-11-20'), /recent published/);
  assert.equal(cambodiaToday(new Date('2026-11-20T18:00:00Z')), '2026-11-21');
});
test('GDT outages never produce a guessed rate and failures are briefly cached', async () => {
  let calls = 0;
  const provider = createGdtRateProvider(async () => {
    calls++;
    return new Response('unavailable', { status: 503 });
  }, now);
  await assert.rejects(() => provider('2026-11-20'), /unavailable/);
  await assert.rejects(() => provider('2026-11-19'), /unavailable/);
  assert.equal(calls, 1);
});
