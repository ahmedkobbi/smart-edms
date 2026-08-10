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
    validator: (v) => v.length >= 16,
    errorMessage: 'Must be at least 16 characters',
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
