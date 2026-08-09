/**
 * Smart EDMS — API helper layer
 *
 * Wraps every API route handler to:
 *   - Require authentication
 *   - Bind request to the user's tenant
 *   - Enforce required permissions (RBAC)
 *   - Apply per-route rate limiting
 *   - Capture IP, user-agent, correlation ID
 *   - Emit audit events automatically (allow + deny)
 *   - Return standardized JSON errors
 *
 * This is the ONLY way API routes should be authored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, SmartEdmsSession } from '@/lib/auth/auth-options';
import { hasPermission } from '@/lib/auth/permissions';
import { apiRateLimiter, getClientIp } from '@/lib/security/rate-limit';
import { recordAuditEvent, AuditEventInput } from '@/lib/audit/audit-service';
import { logger, setRequestContext, clearRequestContext } from '@/lib/config/logger';
import { randomUUID } from 'crypto';

const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024; // 10MB for JSON bodies (uploads use multipart, separate limit)

export interface ApiContext {
  session: SmartEdmsSession;
  tenantId: string;
  userId: string;
  correlationId: string;
  ip: string;
  userAgent: string;
  audit(input: Omit<AuditEventInput, 'tenantId' | 'actorId' | 'actorEmail' | 'actorIp' | 'actorUserAgent' | 'correlationId' | 'sessionId'>): Promise<void>;
}

export type ApiHandler<T = unknown> = (
  req: NextRequest,
  ctx: ApiContext,
  params?: Record<string, string>,
) => Promise<NextResponse<T>> | Promise<NextResponse>;

interface CreateHandlerOptions {
  requiredPermission?: string;
  rateLimit?: { max: number; windowMs: number };
  audit?: {
    eventType: string;
    action: string;
    resourceType?: string;
    resourceIdFromParams?: string;
    resourceNameFromParams?: string;
    resourceFromBody?: (body: any) => { id?: string; name?: string };
    alwaysAudit?: boolean;
  };
}

function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function createApiHandler(opts: CreateHandlerOptions = {}, handler: ApiHandler) {
  return async (
    req: NextRequest,
    routeContext?: { params: Record<string, string> | Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    const params = routeContext?.params
      ? routeContext.params instanceof Promise
        ? await routeContext.params
        : routeContext.params
      : {};
    const correlationId = req.headers.get('x-correlation-id') || randomUUID();
    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Set structured logging context
    setRequestContext({ correlationId, ip, userAgent });

    // Check request body size for non-multipart requests
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('text/')) {
      const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_REQUEST_BODY_SIZE) {
        logger.warn('api.request_too_large', { contentLength, limit: MAX_REQUEST_BODY_SIZE, path: req.nextUrl.pathname });
        return jsonError(413, 'request_too_large', `Request body exceeds ${MAX_REQUEST_BODY_SIZE} bytes`);
      }
    }

    const session = await getServerSession();
    if (!session?.user) {
      return jsonError(401, 'unauthenticated', 'Authentication required');
    }

    // Update logging context with user info
    setRequestContext({ tenantId: session.user.tenantId, userId: session.user.id });

    if (opts.rateLimit) {
      const rlKey = `${session.user.tenantId}:${session.user.id}:${req.method}:${req.nextUrl.pathname}`;
      const rl = apiRateLimiter.check(rlKey, opts.rateLimit.max, opts.rateLimit.windowMs);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: { code: 'rate_limited', message: 'Too many requests', retryAfterMs: rl.retryAfterMs } },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
      }
    }

    const ctx: ApiContext = {
      session,
      tenantId: session.user.tenantId,
      userId: session.user.id,
      correlationId,
      ip,
      userAgent,
      audit: async (input) => {
        await recordAuditEvent({
          ...input,
          tenantId: session.user.tenantId,
          actorId: session.user.id,
          actorEmail: session.user.email,
          actorIp: ip,
          actorUserAgent: userAgent,
          correlationId,
        });
      },
    };

    if (opts.requiredPermission && !hasPermission(session.user.permissions, opts.requiredPermission)) {
      await ctx.audit({
        eventType: 'authz.deny',
        action: req.method.toLowerCase(),
        resourceType: opts.audit?.resourceType,
        resourceId: opts.audit?.resourceIdFromParams ? params[opts.audit.resourceIdFromParams] : undefined,
        resourceName: opts.audit?.resourceNameFromParams ? params[opts.audit.resourceNameFromParams] : undefined,
        result: 'deny',
        reason: `missing:${opts.requiredPermission}`,
        metadata: { path: req.nextUrl.pathname, method: req.method },
      });
      return jsonError(403, 'forbidden', `Missing permission: ${opts.requiredPermission}`);
    }

    try {
      const result = await handler(req, ctx, params);

      if (opts.audit && opts.audit.alwaysAudit) {
        await ctx.audit({
          eventType: opts.audit.eventType,
          action: opts.audit.action,
          resourceType: opts.audit.resourceType,
          resourceId: opts.audit.resourceIdFromParams ? params[opts.audit.resourceIdFromParams] : undefined,
          resourceName: opts.audit?.resourceNameFromParams ? params[opts.audit.resourceNameFromParams] : undefined,
          result: 'allow',
          metadata: { path: req.nextUrl.pathname, method: req.method },
        });
      }
      return result as NextResponse;
    } catch (err: any) {
      const status = err?.status || 500;
      const code = err?.code || 'internal_error';
      const message = err?.message || 'Internal server error';

      logger.error('api.error', {
        path: req.nextUrl.pathname,
        method: req.method,
        code,
        status,
        error: message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
      });

      await ctx.audit({
        eventType: 'api.error',
        action: req.method.toLowerCase(),
        resourceType: opts.audit?.resourceType,
        resourceId: opts.audit?.resourceIdFromParams ? params[opts.audit.resourceIdFromParams] : undefined,
        result: 'error',
        reason: message,
        metadata: { path: req.nextUrl.pathname, method: req.method, code, status },
      });

      if (status >= 500) {
        return jsonError(500, 'internal_error', 'An unexpected error occurred');
      }
      return jsonError(status, code, message);
    } finally {
      clearRequestContext();
    }
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
  static badRequest(code: string, message: string, extra?: Record<string, unknown>): ApiError {
    const e = new ApiError(400, code, message);
    Object.assign(e, extra);
    return e;
  }
  static notFound(code: string, message: string): ApiError {
    return new ApiError(404, code, message);
  }
  static forbidden(code: string, message: string): ApiError {
    return new ApiError(403, code, message);
  }
  static conflict(code: string, message: string): ApiError {
    return new ApiError(409, code, message);
  }
  static unprocessable(code: string, message: string): ApiError {
    return new ApiError(422, code, message);
  }
}

export async function parseJsonBody<T = any>(req: NextRequest): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw ApiError.badRequest('invalid_json', 'Request body is not valid JSON');
  }
}
