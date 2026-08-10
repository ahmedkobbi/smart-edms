/**
 * Smart EDMS — AI tenant flag checker
 *
 * Shared utility to verify AI features are enabled for a tenant.
 */

import { db } from '@/lib/db';

export async function isAiEnabledForTenant(tenantId: string): Promise<boolean> {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  try {
    const settings = JSON.parse(tenant?.settings || '{}');
    return settings?.features?.ai !== false;
  } catch {
    return true; // Default: enabled if settings can't be parsed
  }
}

/**
 * Mask PII in text before sending to external AI services.
 * Replaces detected PII with [REDACTED] placeholders.
 */
export function maskPiiForAi(text: string): string {
  let masked = text;

  // Mask emails
  masked = masked.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi, '[REDACTED_EMAIL]');

  // Mask phone numbers (international format)
  masked = masked.replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[REDACTED_PHONE]');

  // Mask SSN
  masked = masked.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');

  // Mask credit card numbers
  masked = masked.replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_CARD]');

  // Mask IBAN
  masked = masked.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, '[REDACTED_IBAN]');

  return masked;
}
