/**
 * Smart EDMS — Environment validation
 *
 * Validates required environment variables at startup.
 * Throws a clear error if any required variable is missing or malformed.
 */

type EnvVar = {
  name: string;
  required: boolean;
  description: string;
  validator?: (value: string) => boolean;
  errorMessage?: string;
};

const ENV_VARS: EnvVar[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'PostgreSQL connection string (postgresql://...)',
    validator: (v) => v.startsWith('postgresql://') || v.startsWith('postgres://') || v.startsWith('file:'),
    errorMessage: 'Must start with postgresql://, postgres://, or file: (SQLite dev)',
  },
  {
    name: 'NEXTAUTH_SECRET',
    required: true,
    description: 'NextAuth JWT secret (generate with: openssl rand -base64 32)',
    // SECURITY FIX (H11): Require 32+ chars (256-bit minimum) to prevent
    // offline brute-force attacks on JWT encryption key derivation.
    validator: (v) => v.length >= 32,
    errorMessage: 'Must be at least 32 characters (use: openssl rand -base64 32)',
  },
  {
    name: 'NEXTAUTH_URL',
    required: true,
    description: 'Public URL of the deployment',
    validator: (v) => v.startsWith('http://') || v.startsWith('https://'),
    errorMessage: 'Must start with http:// or https://',
  },
  {
    name: 'SMART_EDMS_KEK',
    required: true,
    description: '32-byte Key Encryption Key in hex (openssl rand -hex 32)',
    validator: (v) => {
      if (/^[0-9a-fA-F]{64}$/.test(v)) return true;
      try {
        return Buffer.from(v, 'base64').length === 32;
      } catch {
        return false;
      }
    },
    errorMessage: 'Must be 32 bytes as hex (64 chars) or base64',
  },
  {
    name: 'STORAGE_DRIVER',
    required: false,
    description: 'Storage adapter: local or s3',
    validator: (v) => ['local', 's3'].includes(v),
  },
  {
    name: 'S3_BUCKET',
    required: false,
    description: 'S3 bucket name (required if STORAGE_DRIVER=s3)',
  },
  // SECURITY FIX (M-ADM-23): Validate security-relevant env vars that were
  // previously read with no checks. A typo or DNS-poisoning of REDIS_URL
  // could exfiltrate BullMQ jobs (webhook payloads, OCR text, audit data) to
  // an attacker-controlled Redis. A misconfigured WS_SERVICE_URL could leak
  // the shared secret over plaintext HTTP. A missing VAPID key in production
  // means push notifications silently use dev keys.
  {
    name: 'REDIS_URL',
    required: false,
    description: 'Redis connection URL for BullMQ job queue',
    validator: (v) => v.startsWith('redis://') || v.startsWith('rediss://'),
    errorMessage: 'Must start with redis:// or rediss://',
  },
  {
    name: 'WS_SERVICE_URL',
    required: false,
    description: 'Internal WebSocket notifications service URL',
    validator: (v) => {
      try {
        const u = new URL(v);
        const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
        return u.protocol === 'https:' || (u.protocol === 'http:' && isLoopback);
      } catch { return false; }
    },
    errorMessage: 'Must be https:// OR http://localhost (loopback only)',
  },
  {
    name: 'SMTP_HOST',
    required: false,
    description: 'SMTP server hostname',
  },
  {
    name: 'SMTP_SECURE',
    required: false,
    description: 'Use TLS for SMTP (true in production)',
    validator: (v) => v === 'true' || v === 'false',
    errorMessage: 'Must be "true" or "false"',
  },
  {
    name: 'CRON_SECRET',
    required: false,
    description: 'Shared secret for the /api/cron/escalate endpoint',
    validator: (v) => v.length >= 32,
    errorMessage: 'Must be at least 32 characters',
  },
  {
    name: 'METRICS_TOKEN',
    required: false,
    description: 'Bearer token for the /api/metrics endpoint',
    validator: (v) => v.length >= 32,
    errorMessage: 'Must be at least 32 characters',
  },
  {
    name: 'WS_INTERNAL_SECRET',
    required: false,
    description: 'Shared secret between the Next.js app and the WS service',
    validator: (v) => v.length >= 32,
    errorMessage: 'Must be at least 32 characters',
  },
  // SECURITY FIX (L-ADM-6): Validate Stripe env vars when set.
  {
    name: 'STRIPE_SECRET_KEY',
    required: false,
    description: 'Stripe secret key (enables Stripe-backed billing)',
    validator: (v) => v.startsWith('sk_live_') || v.startsWith('sk_test_'),
    errorMessage: 'Must start with sk_live_ or sk_test_',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: false,
    description: 'Stripe webhook signing secret',
    validator: (v) => v.startsWith('whsec_'),
    errorMessage: 'Must start with whsec_',
  },
];

export interface EnvValidationResult {
  ok: boolean;
  errors: { name: string; message: string }[];
  warnings: { name: string; message: string }[];
  config: Record<string, string | undefined>;
}

export function validateEnv(): EnvValidationResult {
  const errors: { name: string; message: string }[] = [];
  const warnings: { name: string; message: string }[] = [];
  const config: Record<string, string | undefined> = {};

  for (const v of ENV_VARS) {
    const value = process.env[v.name];
    config[v.name] = value;

    if (v.required && !value) {
      errors.push({ name: v.name, message: `${v.name} is required. ${v.description}` });
      continue;
    }

    if (value && v.validator && !v.validator(value)) {
      errors.push({ name: v.name, message: `${v.name}: ${v.errorMessage || 'Invalid value'}` });
      continue;
    }

    if (process.env.NODE_ENV === 'production') {
      if (v.name === 'STORAGE_DRIVER' && value === 'local') {
        warnings.push({ name: v.name, message: 'Using local storage in production — use S3' });
      }
      if (v.name === 'NEXTAUTH_URL' && value?.startsWith('http://')) {
        warnings.push({ name: v.name, message: 'NEXTAUTH_URL uses http:// in production — should be https://' });
      }
      if (v.name === 'DATABASE_URL' && value?.startsWith('file:')) {
        warnings.push({ name: v.name, message: 'Using SQLite in production — use PostgreSQL' });
      }
      // SECURITY FIX (M-ADM-23): Production-mode warnings for security-critical
      // config that operators may forget to set.
      if (v.name === 'SMTP_HOST' && value && process.env.SMTP_SECURE !== 'true') {
        warnings.push({ name: 'SMTP_SECURE', message: 'SMTP_SECURE should be "true" in production to enforce TLS for outbound email' });
      }
      if (v.name === 'CRON_SECRET' && !value) {
        warnings.push({ name: v.name, message: 'CRON_SECRET not set — the cron endpoint will refuse all requests' });
      }
      if (v.name === 'METRICS_TOKEN' && !value) {
        warnings.push({ name: v.name, message: 'METRICS_TOKEN not set — /api/metrics will only be reachable from loopback' });
      }
      if (v.name === 'WS_INTERNAL_SECRET' && !value) {
        warnings.push({ name: v.name, message: 'WS_INTERNAL_SECRET not set — websocket notifications will be skipped in production' });
      }
    }
  }

  if (config.STORAGE_DRIVER === 's3') {
    if (!config.S3_BUCKET) errors.push({ name: 'S3_BUCKET', message: 'Required when STORAGE_DRIVER=s3' });
    if (!config.S3_ACCESS_KEY_ID) errors.push({ name: 'S3_ACCESS_KEY_ID', message: 'Required when STORAGE_DRIVER=s3' });
    if (!config.S3_SECRET_ACCESS_KEY) errors.push({ name: 'S3_SECRET_ACCESS_KEY', message: 'Required when STORAGE_DRIVER=s3' });
  }

  return { ok: errors.length === 0, errors, warnings, config };
}

export function assertEnv(): void {
  const result = validateEnv();
  if (!result.ok) {
    console.error('\n❌ Environment validation failed:\n');
    for (const e of result.errors) console.error(`  ${e.name}: ${e.message}`);
    console.error('\nSee .env.example for required variables.\n');
    throw new Error(`Environment validation failed with ${result.errors.length} error(s)`);
  }
  if (result.warnings.length > 0) {
    console.warn('\n⚠️  Environment warnings:\n');
    for (const w of result.warnings) console.warn(`  ${w.name}: ${w.message}`);
    console.warn('');
  }
}
