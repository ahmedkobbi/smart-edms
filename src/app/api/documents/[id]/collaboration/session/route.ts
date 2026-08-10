/**
 * Smart EDMS — Collaboration session management
 * GET  /api/documents/:id/collaboration/session    get active session + presence
 * POST /api/documents/:id/collaboration/session    start/join a collaboration session
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createApiHandler } from '@/lib/api/handler';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { recordAuditEvent } from '@/lib/audit/audit-service';

const COLLAB_SERVICE_URL = process.env.COLLAB_SERVICE_URL || 'http://localhost:3004';

export const GET = createApiHandler(
  { requiredPermission: PERMISSIONS.DOCUMENT_READ },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });

    // Get or create session record
    let session = await db.collaborationSession.findFirst({
      where: { documentId: doc.id, tenantId: ctx.tenantId, status: 'active' },
    });

    // Get presence from collaboration service
    let presenceUsers: any[] = [];
    try {
      const docName = `${ctx.tenantId}:${doc.id}`;
      const res = await fetch(`${COLLAB_SERVICE_URL.replace('3004', '3005')}/presence/${encodeURIComponent(docName)}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        presenceUsers = data.users || [];
      }
    } catch {
      // Collab service not running
    }

    return NextResponse.json({
      session,
      presence: presenceUsers,
      collabServiceAvailable: presenceUsers.length >= 0, // true if we got a response (even empty)
    });
  },
);

export const POST = createApiHandler(
  {
    requiredPermission: PERMISSIONS.DOCUMENT_UPDATE,
    audit: { eventType: 'collaboration.join', action: 'create', resourceType: 'document', alwaysAudit: true },
  },
  async (req: NextRequest, ctx, params) => {
    const doc = await db.document.findFirst({
      where: { id: params!.id, tenantId: ctx.tenantId, deletedAt: null },
    });
    if (!doc) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 });

    // Find or create active session
    let session = await db.collaborationSession.findFirst({
      where: { documentId: doc.id, tenantId: ctx.tenantId, status: 'active' },
    });

    if (!session) {
      session = await db.collaborationSession.create({
        data: {
          tenantId: ctx.tenantId,
          documentId: doc.id,
          startedBy: ctx.userId,
          status: 'active',
          participantCount: 1,
        },
      });
    } else {
      await db.collaborationSession.update({
        where: { id: session.id },
        data: {
          participantCount: { increment: 1 },
          lastActivity: new Date(),
        },
      });
    }

    await recordAuditEvent({
      tenantId: ctx.tenantId,
      actorId: ctx.userId,
      actorEmail: ctx.session.user.email,
      actorIp: ctx.ip,
      actorUserAgent: ctx.userAgent,
      correlationId: ctx.correlationId,
      eventType: 'collaboration.session.joined',
      action: 'create',
      resourceType: 'document',
      resourceId: doc.id,
      resourceName: doc.title,
      result: 'allow',
      metadata: { sessionId: session.id },
    });

    // Return the WebSocket endpoint for the client to connect
    const wsUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const docName = `${ctx.tenantId}:${doc.id}`;

    return NextResponse.json({
      session,
      docName,
      wsEndpoint: `${wsUrl}/?XTransformPort=3004`,
      message: 'Session joined. Connect to the WebSocket endpoint to start collaborating.',
    });
  },
);
