import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { timingSafeEqual } from 'crypto';

export async function GET(req: NextRequest) {
  // Verify cron secret
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });

  const provided = req.headers.get('x-cron-secret') || new URL(req.url).searchParams.get('key') || '';
  const valid = (() => {
    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch { return false; }
  })();

  if (!valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = {
    expiredSignatures: 0,
    vitalRecordsDueReview: 0,
    foldersEligibleForDisposition: 0,
    processed: false,
  };

  try {
    // 1. Expire signature requests past their expiresAt date
    const expiredSignatures = await db.signatureRequest.updateMany({
      where: {
        status: { in: ['sent', 'delivered'] },
        expiresAt: { lt: new Date() },
      },
      data: { status: 'expired' },
    });
    results.expiredSignatures = expiredSignatures.count;

    // 2. Check vital records due for review (just count — notifications sent separately)
    const vitalDue = await db.vitalRecord.count({
      where: { nextReviewAt: { lte: new Date() } },
    });
    results.vitalRecordsDueReview = vitalDue;

    // 3. Check record folders eligible for disposition
    const foldersEligible = await db.recordFolder.count({
      where: {
        status: 'cutoff',
        eligibleForDispositionAt: { lte: new Date() },
      },
    });
    results.foldersEligibleForDisposition = foldersEligible;

    results.processed = true;

    logger.info('Feature maintenance cron completed', results);
  } catch (err) {
    logger.error('Feature maintenance cron failed', { error: (err as Error).message });
    return NextResponse.json({ error: 'Cron failed', details: (err as Error).message }, { status: 500 });
  }

  return NextResponse.json(results);
}
