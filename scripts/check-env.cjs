const { createRequire } = require('node:module');

function checkEnvironment(env) {
  const errors = [];
  const warnings = [];
  const value = (key) => (env[key] || '').trim();
  for (const key of [
    'DATABASE_URL',
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
    'CLERK_SECRET_KEY',
  ]) {
    if (!value(key)) errors.push(`${key} is required.`);
  }
  if (value('DATABASE_URL')) {
    try {
      const url = new URL(value('DATABASE_URL'));
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname)
        throw new Error();
    } catch {
      errors.push('DATABASE_URL must be a PostgreSQL connection URL.');
    }
  }
  const publicKey = value('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  const secretKey = value('CLERK_SECRET_KEY');
  if (publicKey && !/^pk_(test|live)_.+/.test(publicKey))
    errors.push(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk publishable key.',
    );
  if (secretKey && !/^sk_(test|live)_.+/.test(secretKey))
    errors.push('CLERK_SECRET_KEY must be a Clerk secret key.');
  if (
    /^pk_(test|live)_/.test(publicKey) &&
    /^sk_(test|live)_/.test(secretKey) &&
    publicKey.split('_')[1] !== secretKey.split('_')[1]
  ) {
    errors.push(
      'Clerk publishable and secret keys must use the same test/live mode.',
    );
  }
  if (value('SITE_URL')) {
    try {
      const url = new URL(value('SITE_URL'));
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      errors.push(
        'SITE_URL must be a full HTTP or HTTPS URL without credentials.',
      );
    }
  }
  if (!value('FINANCE_ADMIN_EMAILS'))
    warnings.push(
      'FINANCE_ADMIN_EMAILS is unset; configure member roles through Clerk public metadata.',
    );
  if (!value('OPENROUTER_API_KEY'))
    warnings.push(
      'OPENROUTER_API_KEY is unset; live AI answers are unavailable.',
    );
  return { errors, warnings };
}

if (require.main === module) {
  // Resolve Next's own env loader so precedence and $ expansion match the app.
  const nextRequire = createRequire(require.resolve('next/package.json'));
  nextRequire('@next/env').loadEnvConfig(process.cwd(), true, {
    info() {},
    error() {},
  });
  const { errors, warnings } = checkEnvironment(process.env);
  for (const message of errors) console.error(`ERROR: ${message}`);
  for (const message of warnings) console.warn(`WARNING: ${message}`);
  console.log(
    errors.length
      ? `Configuration check failed: ${errors.length} error(s).`
      : 'Required configuration is present and passes format checks.',
  );
  console.log(
    'Values are hidden. This check does not connect to Clerk or the database.',
  );
  process.exitCode = errors.length ? 1 : 0;
}

module.exports = { checkEnvironment };
