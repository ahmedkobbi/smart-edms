/**
 * Smart EDMS — Structured logger
 *
 * Replaces console.log/error with structured JSON logging suitable for
 * SIEM ingestion (Datadog, Splunk, ELK).
 *
 * Log format: { ts, level, msg, tenantId?, userId?, correlationId?, ...fields }
 *
 * Usage:
 *   import { logger } from '@/lib/config/logger';
 *   logger.info('document.uploaded', { documentId, sizeBytes });
 *   logger.warn('auth.failed_login', { email, ip });
 *   logger.error('api.error', { error: err.message, stack: err.stack });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

class StructuredLogger {
  private context: LogContext = {};
  private minLevel: LogLevel;

  constructor() {
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  }

  setContext(ctx: LogContext) {
    this.context = { ...this.context, ...ctx };
  }

  clearContext() {
    this.context = {};
  }

  debug(msg: string, fields?: Record<string, unknown>) {
    this.log('debug', msg, fields);
  }

  info(msg: string, fields?: Record<string, unknown>) {
    this.log('info', msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>) {
    this.log('warn', msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>) {
    this.log('error', msg, fields);
  }

  private log(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (!this.shouldLog(level)) return;

    const entry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...this.context,
      ...fields,
    };

    // Filter out sensitive fields
    const sanitized = this.sanitize(entry);

    if (level === 'error') {
      console.error(JSON.stringify(sanitized));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(sanitized));
    } else {
      console.log(JSON.stringify(sanitized));
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return order.indexOf(level) >= order.indexOf(this.minLevel);
  }

  private sanitize(entry: Record<string, unknown>): Record<string, unknown> {
    const sensitive = ['password', 'passwordHash', 'token', 'secret', 'kek', 'dek', 'mfaSecret', 'clientSecret', 'apiKey'];
    const out: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(entry)) {
      if (sensitive.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        out[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 1000) {
        out[key] = value.slice(0, 1000) + '...[truncated]';
      } else {
        out[key] = value;
      }
    }

    return out;
  }
}

export const logger = new StructuredLogger();

/**
 * Express-style request logging middleware helper.
 * Use in createApiHandler to set correlation context.
 */
export function setRequestContext(ctx: LogContext) {
  logger.setContext(ctx);
}

export function clearRequestContext() {
  logger.clearContext();
}
