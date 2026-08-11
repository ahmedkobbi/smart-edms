import { NextRequest, NextResponse } from 'next/server';
import { verifyDocusignWebhookSignature, processSignatureWebhook } from '@/lib/signatures/signature-service';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

// Webhook endpoints are NOT behind createApiHandler — they use HMAC verification instead.
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-docusign-signature') || '';

    const verified = verifyDocusignWebhookSignature(rawBody, signature);
    if (!verified) {
      logger.warn('DocuSign webhook signature verification failed', { ip: req.headers.get('x-forwarded-for') });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = {
      eventType: payload.event || 'unknown',
      envelopeId: payload.data?.envelopeId || payload.envelopeId,
      tenantId: payload.data?.tenantId || payload.tenantId,
      payload,
      signature,
      verified: true,
    };

    await processSignatureWebhook(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error('DocuSign webhook processing failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
