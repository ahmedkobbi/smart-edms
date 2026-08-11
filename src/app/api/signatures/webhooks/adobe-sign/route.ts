import { NextRequest, NextResponse } from 'next/server';
import { processSignatureWebhook } from '@/lib/signatures/signature-service';
import { logger } from '@/lib/config/logger';
import { createHmac, timingSafeEqual } from 'crypto';

function verifyAdobeSignWebhookSignature(payload: string, signatureHeader: string): boolean {
  const secret = process.env.ADOBE_SIGN_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('ADOBE_SIGN_WEBHOOK_SECRET not configured — webhook verification skipped');
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

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-adobe-sign-signature') || '';

    const verified = verifyAdobeSignWebhookSignature(rawBody, signature);
    if (!verified) {
      logger.warn('Adobe Sign webhook signature verification failed', { ip: req.headers.get('x-forwarded-for') });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = {
      eventType: payload.event || 'unknown',
      envelopeId: payload.agreement?.id || payload.id,
      tenantId: payload.tenantId || payload.customData?.tenantId,
      payload,
      signature,
      verified: true,
    };

    await processSignatureWebhook(event);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error('Adobe Sign webhook processing failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
