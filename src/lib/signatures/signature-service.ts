/**
 * Smart EDMS — E-Signature Integration (DocuSign / Adobe Sign)
 *
 * Provides a unified interface for electronic signature workflows through
 * DocuSign (primary) and Adobe Sign (fallback). Both providers use:
 *   - HMAC-signed webhooks for status updates
 *   - Server-side envelope creation (no client-side API keys)
 *   - Audit trail with hash-chained events
 *
 * Security model:
 *   - API keys never exposed to the client
 *   - Webhooks verified via HMAC-SHA256
 *   - All signature events recorded in the tamper-evident audit log
 *   - Signed documents stored in tenant-scoped object storage
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { createHmac, timingSafeEqual } from 'crypto';
import { ssrfSafeFetch } from '@/lib/security/ssrf-safe-fetch';

// ============================================================================
// TYPES
// ============================================================================

export type SignatureProvider = 'docusign' | 'adobe_sign' | 'internal';
export type SignatureStatus = 'draft' | 'sent' | 'delivered' | 'completed' | 'declined' | 'expired' | 'voided';
export type RecipientStatus = 'sent' | 'delivered' | 'signed' | 'declined' | 'auto_responded';

export interface Recipient {
  email: string;
  name: string;
  role: 'signer' | 'cc' | 'certified_deliver' | 'agent' | 'editor' | 'intermediary';
  routingOrder: number;
  status?: RecipientStatus;
  signedAt?: Date;
}

export interface EmailConfig {
  subject: string;
  message: string;
  expiryDays: number;
  reminderDays?: number;
}

export interface CreateSignatureRequestInput {
  tenantId: string;
  documentId: string;
  provider: SignatureProvider;
  recipients: Recipient[];
  emailConfig: EmailConfig;
  initiatedBy: string;
}

export interface WebhookEvent {
  eventType: string;
  envelopeId: string;
  tenantId: string;
  payload: Record<string, unknown>;
  signature: string;
  verified: boolean;
}

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

export function isDocuSignConfigured(): boolean {
  return !!(
    process.env.DOCUSIGN_INTEGRATION_KEY &&
    process.env.DOCUSIGN_USER_ID &&
    process.env.DOCUSIGN_ACCOUNT_BASE_URL &&
    process.env.DOCUSIGN_PRIVATE_KEY
  );
}

export function isAdobeSignConfigured(): boolean {
  return !!(
    process.env.ADOBE_SIGN_CLIENT_ID &&
    process.env.ADOBE_SIGN_CLIENT_SECRET &&
    process.env.ADOBE_SIGN_API_BASE
  );
}

export function getDefaultProvider(): SignatureProvider {
  if (isDocuSignConfigured()) return 'docusign';
  if (isAdobeSignConfigured()) return 'adobe_sign';
  return 'internal';
}

// ============================================================================
// DOCUSIGN INTEGRATION
// ============================================================================

let cachedDocusignToken: { token: string; expiresAt: number } | null = null;

async function getDocusignAccessToken(): Promise<string> {
  if (cachedDocusignToken && cachedDocusignToken.expiresAt > Date.now() + 300_000) {
    return cachedDocusignToken.token;
  }

  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const userId = process.env.DOCUSIGN_USER_ID!;
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const authServer = process.env.DOCUSIGN_AUTH_SERVER || 'account-d.docusign.com';

  const jwt = await buildJwtAssertion({
    iss: integrationKey,
    sub: userId,
    aud: `https://${authServer}`,
    scope: 'signature',
    privateKey,
  });

  const response = await ssrfSafeFetch(`https://${authServer}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('DocuSign token request failed', { status: response.status, error });
    throw new Error(`DocuSign authentication failed: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedDocusignToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  logger.info('DocuSign access token obtained', { expiresIn: data.expires_in });
  return data.access_token;
}

async function buildJwtAssertion(payload: {
  iss: string;
  sub: string;
  aud: string;
  scope: string;
  privateKey: string;
}): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedBody = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedBody}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(payload.privateKey).toString('base64url');

  return `${signingInput}.${signature}`;
}

async function createDocusignEnvelope(
  documentId: string,
  recipients: Recipient[],
  emailConfig: EmailConfig,
  tenantId: string,
): Promise<{ envelopeId: string }> {
  const token = await getDocusignAccessToken();
  const baseUrl = process.env.DOCUSIGN_ACCOUNT_BASE_URL!;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;

  const document = await db.document.findFirst({
    where: { id: documentId, tenantId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!document) throw new Error('Document not found');

  const latestVersion = document.versions[0];
  if (!latestVersion) throw new Error('Document has no versions');

  // Read the actual file content from storage
  const { getFileStorage } = await import('@/lib/storage/file-storage');
  const storage = getFileStorage();
  let documentBase64: string;
  try {
    const fileBuffer = await storage.get(latestVersion.storageKey);
    documentBase64 = fileBuffer.toString('base64');
  } catch (err) {
    logger.error('Failed to read document from storage for DocuSign upload', {
      documentId,
      storageKey: latestVersion.storageKey,
      error: (err as Error).message,
    });
    throw new Error('Failed to read document file for upload to DocuSign');
  }

  const fileExtension = latestVersion.mimeType.split('/').pop() || 'pdf';

  const envelopeDefinition = {
    emailSubject: emailConfig.subject,
    emailBlurb: emailConfig.message,
    status: 'sent',
    expiry: emailConfig.expiryDays ? { expireAfter: String(emailConfig.expiryDays) } : undefined,
    notification: emailConfig.reminderDays ? {
      reminders: {
        reminderEnabled: 'true',
        reminderDelay: String(emailConfig.reminderDays),
        reminderFrequency: '3',
      },
      expirations: {
        expireEnabled: 'true',
        expireAfter: String(emailConfig.expiryDays),
      },
    } : undefined,
    documents: [{
      documentId: '1',
      name: document.title,
      fileExtension,
      documentBase64,
    }],
    recipients: {
      signers: recipients
        .filter(r => r.role === 'signer')
        .map((r, i) => ({
          recipientId: String(i + 1),
          email: r.email,
          name: r.name,
          routingOrder: String(r.routingOrder),
          tabs: {
            signHereTabs: [{
              anchorString: '/sn1/',
              anchorUnits: 'pixels',
              anchorYOffset: '10',
              anchorXOffset: '20',
            }],
          },
        })),
    },
  };

  const response = await ssrfSafeFetch(`${baseUrl}/accounts/${accountId}/envelopes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelopeDefinition),
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('DocuSign envelope creation failed', { status: response.status, error });
    throw new Error(`DocuSign envelope creation failed: ${response.status}`);
  }

  const result = await response.json() as { envelopeId: string; uri: string };
  logger.info('DocuSign envelope created', { envelopeId: result.envelopeId, documentId });
  return { envelopeId: result.envelopeId };
}

export function verifyDocusignWebhookSignature(payload: string, signatureHeader: string): boolean {
  const secret = process.env.DOCUSIGN_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('DOCUSIGN_WEBHOOK_SECRET not configured — webhook verification skipped');
    return false;
  }

  const expected = createHmac('sha256', secret).update(payload).digest('base64');
  try {
    const sigBuffer = Buffer.from(signatureHeader);
    const expBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expBuffer);
  } catch {
    return false;
  }
}

// ============================================================================
// ADOBE SIGN INTEGRATION (Fallback)
// ============================================================================

let cachedAdobeToken: { token: string; expiresAt: number } | null = null;

async function getAdobeSignAccessToken(): Promise<string> {
  if (cachedAdobeToken && cachedAdobeToken.expiresAt > Date.now() + 300_000) {
    return cachedAdobeToken.token;
  }

  const clientId = process.env.ADOBE_SIGN_CLIENT_ID!;
  const clientSecret = process.env.ADOBE_SIGN_CLIENT_SECRET!;
  const apiBase = process.env.ADOBE_SIGN_API_BASE!;

  const response = await ssrfSafeFetch(`${apiBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}&scope=agreement_send:write`,
  });

  if (!response.ok) throw new Error(`Adobe Sign authentication failed: ${response.status}`);

  const data = await response.json() as { access_token: string; expires_in: number };
  cachedAdobeToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function createAdobeSignAgreement(
  documentId: string,
  recipients: Recipient[],
  emailConfig: EmailConfig,
  tenantId: string,
): Promise<{ envelopeId: string }> {
  const token = await getAdobeSignAccessToken();
  const apiBase = process.env.ADOBE_SIGN_API_BASE!;

  const agreementData = {
    fileInfos: [{ transientDocumentId: documentId }],
    name: emailConfig.subject,
    message: emailConfig.message,
    participantSetsInfo: recipients
      .filter(r => r.role === 'signer')
      .map(r => ({ order: r.routingOrder, memberInfos: [{ email: r.email }], role: 'SIGNER' })),
    signatureType: 'ESIGN',
    state: 'IN_PROCESS',
  };

  const response = await ssrfSafeFetch(`${apiBase}/api/rest/v6/agreements`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(agreementData),
  });

  if (!response.ok) throw new Error(`Adobe Sign agreement creation failed: ${response.status}`);

  const result = await response.json() as { id: string };
  return { envelopeId: result.id };
}

// ============================================================================
// UNIFIED SIGNATURE SERVICE
// ============================================================================

export async function createSignatureRequest(input: CreateSignatureRequestInput) {
  const provider = input.provider;
  let envelopeId: string | undefined;

  if (provider === 'docusign') {
    if (!isDocuSignConfigured()) {
      throw new Error('DocuSign is not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_BASE_URL, and DOCUSIGN_PRIVATE_KEY.');
    }
    const result = await createDocusignEnvelope(input.documentId, input.recipients, input.emailConfig, input.tenantId);
    envelopeId = result.envelopeId;
  } else if (provider === 'adobe_sign') {
    if (!isAdobeSignConfigured()) {
      throw new Error('Adobe Sign is not configured. Set ADOBE_SIGN_CLIENT_ID, ADOBE_SIGN_CLIENT_SECRET, and ADOBE_SIGN_API_BASE.');
    }
    const result = await createAdobeSignAgreement(input.documentId, input.recipients, input.emailConfig, input.tenantId);
    envelopeId = result.envelopeId;
  } else {
    envelopeId = `internal_${Date.now()}`;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + input.emailConfig.expiryDays);

  const request = await db.signatureRequest.create({
    data: {
      tenantId: input.tenantId,
      documentId: input.documentId,
      provider,
      status: 'sent',
      envelopeId,
      recipients: JSON.stringify(input.recipients) as any,
      emailConfig: JSON.stringify(input.emailConfig) as any,
      initiatedBy: input.initiatedBy,
      sentAt: new Date(),
      expiresAt,
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'signature.request.created',
    action: 'create',
    resourceType: 'signature_request',
    resourceId: request.id,
    metadata: { provider, envelopeId, recipientCount: input.recipients.length, documentId: input.documentId },
  });

  logger.info('Signature request created', { requestId: request.id, provider, envelopeId });
  return request;
}

export async function getSignatureRequest(requestId: string, tenantId: string) {
  const request = await db.signatureRequest.findFirst({
    where: { id: requestId, tenantId },
    include: {
      document: { select: { id: true, title: true, state: true } },
      envelopes: { orderBy: { receivedAt: 'desc' } },
    },
  });
  if (!request) return null;

  return {
    ...request,
    recipients: JSON.parse(request.recipients),
    emailConfig: JSON.parse(request.emailConfig),
    auditTrail: JSON.parse(request.auditTrail),
  };
}

export async function voidSignatureRequest(requestId: string, tenantId: string, voidedBy: string, reason: string) {
  const request = await db.signatureRequest.findFirst({ where: { id: requestId, tenantId } });
  if (!request) throw new Error('Signature request not found');

  if (request.provider === 'docusign' && request.envelopeId) {
    try {
      const token = await getDocusignAccessToken();
      const baseUrl = process.env.DOCUSIGN_ACCOUNT_BASE_URL!;
      const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;

      await ssrfSafeFetch(`${baseUrl}/accounts/${accountId}/envelopes/${request.envelopeId}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'voided', voidedReason: reason }),
      });
    } catch (err) {
      logger.error('Failed to void DocuSign envelope', { error: (err as Error).message });
    }
  }

  const updated = await db.signatureRequest.update({
    where: { id: requestId },
    data: { status: 'voided', voidedAt: new Date(), voidedBy, voidedReason: reason },
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'signature.request.voided',
    action: 'update',
    resourceType: 'signature_request',
    resourceId: requestId,
    metadata: { reason, voidedBy },
  });

  return updated;
}

// ============================================================================
// WEBHOOK PROCESSING
// ============================================================================

export async function processSignatureWebhook(event: WebhookEvent) {
  // Find the signature request by envelope ID
  const request = await db.signatureRequest.findFirst({
    where: { tenantId: event.tenantId, envelopeId: event.envelopeId },
  });
  if (!request) {
    logger.warn('Webhook for unknown envelope', { envelopeId: event.envelopeId });
    return;
  }

  // Record the webhook event
  await db.signatureEnvelope.create({
    data: {
      tenantId: event.tenantId,
      requestId: request.id,
      eventType: event.eventType,
      payload: JSON.stringify(event.payload) as any,
      signature: event.signature,
      verified: event.verified,
    },
  });

  const statusMap: Record<string, SignatureStatus> = {
    'envelope-sent': 'sent',
    'envelope-delivered': 'delivered',
    'envelope-completed': 'completed',
    'envelope-declined': 'declined',
    'envelope-voided': 'voided',
    'recipient-signed': 'completed',
  };

  const newStatus = statusMap[event.eventType];
  if (!newStatus) {
    logger.warn('Unknown webhook event type', { eventType: event.eventType });
    return;
  }

  const updateData: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'delivered') updateData.deliveredAt = new Date();
  if (newStatus === 'completed') updateData.completedAt = new Date();

  const auditTrail = JSON.parse(request.auditTrail || '[]');
  auditTrail.push({ event: event.eventType, timestamp: new Date().toISOString(), verified: event.verified });
  updateData.auditTrail = JSON.stringify(auditTrail) as any;

  await db.signatureRequest.update({ where: { id: request.id }, data: updateData });

  await recordAuditEvent({
    tenantId: event.tenantId,
    eventType: `signature.webhook.${event.eventType}`,
    action: 'update',
    resourceType: 'signature_request',
    resourceId: request.id,
    metadata: { envelopeId: event.envelopeId, verified: event.verified, newStatus },
  });

  if (newStatus === 'completed' && request.initiatedBy) {
    try {
      const { notify } = await import('@/lib/notifications/notify');
      await notify({
        tenantId: event.tenantId,
        userId: request.initiatedBy,
        type: 'signature_completed',
        title: 'Signature Request Completed',
        body: 'Your signature request has been completed by all recipients.',
        link: '/admin/signatures',
        metadata: { requestId: request.id, documentId: request.documentId },
      });
    } catch {
      // notification failure is non-critical
    }
  }

  logger.info('Signature webhook processed', { requestId: request.id, eventType: event.eventType, newStatus, verified: event.verified });
}

// ============================================================================
// SIGNING URL GENERATION
// ============================================================================

export async function getSigningUrl(requestId: string, tenantId: string, recipientEmail: string): Promise<string> {
  const request = await db.signatureRequest.findFirst({ where: { id: requestId, tenantId } });
  if (!request) throw new Error('Signature request not found');

  if (request.provider === 'docusign' && request.envelopeId) {
    const token = await getDocusignAccessToken();
    const baseUrl = process.env.DOCUSIGN_ACCOUNT_BASE_URL!;
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID!;

    const response = await ssrfSafeFetch(`${baseUrl}/accounts/${accountId}/envelopes/${request.envelopeId}/views/recipient`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticationMethod: 'email', email: recipientEmail, userName: recipientEmail.split('@')[0] }),
    });

    if (!response.ok) throw new Error(`Failed to get signing URL: ${response.status}`);
    const result = await response.json() as { url: string };
    return result.url;
  }

  return `/shared/sign/${request.id}?email=${encodeURIComponent(recipientEmail)}`;
}
