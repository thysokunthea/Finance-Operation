const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkEnvironment } = require('../scripts/check-env.cjs');

const valid = {
  DATABASE_URL: 'postgresql://user:private-password@localhost/finance',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example',
  CLERK_SECRET_KEY: 'sk_test_private-secret',
};

test('configuration separates required settings from optional integrations', () => {
  assert.equal(checkEnvironment({}).errors.length, 3);
  const result = checkEnvironment(valid);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 2);
});

test('configuration rejects invalid URLs and mismatched Clerk modes without disclosing secrets', () => {
  const result = checkEnvironment({
    ...valid,
    DATABASE_URL: 'https://private-password@example.test',
    CLERK_SECRET_KEY: 'sk_live_private-secret',
    SITE_URL: 'https://user:password@example.test',
  });
  assert.equal(result.errors.length, 3);
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-password|private-secret|user:password/,
  );
  assert.deepEqual(
    checkEnvironment({ ...valid, SITE_URL: 'https://finance.example.test' })
      .errors,
    [],
  );
});
