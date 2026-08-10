/**
 * Smart EDMS — API helper layer
 *
 * Wraps every API route handler to:
 *   - Require authentication (session OR API key/service account)
 *   - Bind request to the user's tenant
 *   - Enforce required permissions (RBAC)
 *   - Apply per-route rate limiting
 *   - Capture IP, user-agent, correlation ID
 *   - Emit audit events automatically (allow + deny)
 *   - Return standardized JSON errors
 *   - Enforce step-up auth for sensitive routes
 *   - Apply break-glass permissions when active
 *
 * This is the ONLY way API routes should be authored.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, SmartEdmsSession } from '@/lib/auth/auth-options';
import { hasPermission } from '@/lib/auth/permissions';
import { apiRateLimiter, getClientIp } from '@/lib/security/rate-limit';
import { recordAuditEvent, AuditEventInput } from '@/lib/audit/audit-service';
import { logger, setRequestContext, clearRequestContext } from '@/lib/config/logger';
import { isSessionRevoked, getUserSessionRevokeTimestamp } from '@/lib/auth/session-revocation';
import { evaluatePolicies, buildPolicyContext, type PolicyEvaluationContext } from '@/lib/auth/policy-engine';
import { sha256, timingSafeEqualStr } from '@/lib/auth/crypto';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';

const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;

export interface ApiContext {
  session: SmartEdmsSession;
  tenantId: string;
  userId: string;
  correlationId: string;
  ip: string;
  userAgent: string;
  isBreakGlass: boolean;
  breakGlassId?: string;
  isApiKey: boolean;
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
  requireStepUp?: boolean;
  /** Whether to evaluate ABAC policies after RBAC passes (default: true). */
  evaluatePolicies?: boolean;
  /** Document attributes for document-specific policy evaluation. */
  policyContext?: {
    document?: PolicyEvaluationContext['document'];
  };
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

/**
 * Parse Accept-Language header and return the best matching locale.
 * Falls back to 'en'.
 */
function negotiateLocale(req: NextRequest): string {
  const acceptLang = req.headers.get('accept-language');
  if (!acceptLang) return 'en';

  const supported = ['ar', 'en', 'fr', 'es', 'de'];
  const requested = acceptLang
    .split(',')
    .map((l) => {
      const [lang, q] = l.trim().split(';q=');
      return { lang: lang.split('-')[0].toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const r of requested) {
    if (supported.includes(r.lang)) return r.lang;
  }
  return 'en';
}

/**
 * Localized error messages for common API errors.
 */
const LOCALIZED_ERRORS: Record<string, Record<string, string>> = {
  unauthenticated: {
    en: 'Authentication required',
    ar: 'مطلوب مصادقة',
    fr: 'Authentification requise',
    es: 'Se requiere autenticación',
    de: 'Authentifizierung erforderlich',
  },
  forbidden: {
    en: 'Access denied',
    ar: 'تم رفض الوصول',
    fr: 'Accès refusé',
    es: 'Acceso denegado',
    de: 'Zugriff verweigert',
  },
  rate_limited: {
    en: 'Too many requests',
    ar: 'طلبات كثيرة جداً',
    fr: 'Trop de requêtes',
    es: 'Demasiadas solicitudes',
    de: 'Zu viele Anfragen',
  },
  not_found: {
    en: 'Resource not found',
    ar: 'المورد غير موجود',
    fr: 'Ressource introuvable',
    es: 'Recurso no encontrado',
    de: 'Ressource nicht gefunden',
  },
  step_up_required: {
    en: 'This action requires step-up authentication',
    ar: 'يتطلب هذا الإجراء مصادقة معززة',
    fr: 'Cette action nécessite une authentification renforcée',
    es: 'Esta acción requiere autenticación de paso',
    de: 'Diese Aktion erfordert Step-up-Authentifizierung',
  },
  csrf_missing: {
    en: 'Missing required header for state-changing request',
    ar: 'رأس مطلوب مفقود لطلب تغيير الحالة',
    fr: 'En-tête requis manquant pour une demande de changement d\'état',
    es: 'Falta el encabezado requerido para una solicitud de cambio de estado',
    de: 'Erforderlicher Header für zustandsändernde Anfrage fehlt',
  },
};

/**
 * Authenticate via API key or service account.
 * Returns a synthetic session if the key is valid.
 */
async function authenticateWithApiKey(req: NextRequest): Promise<SmartEdmsSession | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const rawKey = authHeader.slice(7);
  if (!rawKey.startsWith('se_') && !rawKey.startsWith('sa_')) return null;

  const keyHash = sha256(rawKey);
  const keyPrefix = rawKey.slice(0, 10);

  // Check API keys
  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
    include: { tenant: true },
  });

  if (apiKey && !apiKey.revokedAt && apiKey.tenant.status === 'active') {
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

    // Update last used
    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    const scopes: string[] = JSON.parse(apiKey.scopes || '[]');
    return {
      user: {
        id: `apikey:${apiKey.id}`,
        tenantId: apiKey.tenantId,
        email: `api-key:${apiKey.name}`,
        name: apiKey.name,
        roles: [],
        permissions: scopes,
        mfaVerified: false,
        isStepUp: false,
      },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as SmartEdmsSession;
  }

  // Check service accounts
  const svcAccount = await db.serviceAccount.findUnique({
    where: { keyHash },
    include: { tenant: true },
  });

  if (svcAccount && !svcAccount.revokedAt && svcAccount.tenant.status === 'active') {
    if (svcAccount.expiresAt && svcAccount.expiresAt < new Date()) return null;

    await db.serviceAccount.update({
      where: { id: svcAccount.id },
      data: { lastUsedAt: new Date() },
    });

    const scopes: string[] = JSON.parse(svcAccount.scopes || '[]');
    return {
      user: {
        id: `svc:${svcAccount.id}`,
        tenantId: svcAccount.tenantId,
        email: `service:${svcAccount.name}`,
        name: svcAccount.name,
        roles: [],
        permissions: scopes,
        mfaVerified: false,
        isStepUp: false,
      },
      expires: new Date(Date.now() + 3600_000).toISOString(),
    } as SmartEdmsSession;
  }

  return null;
}

/**
 * Verify step-up authentication token.
 */
async function verifyStepUpToken(tenantId: string, userId: string, token: string): Promise<boolean> {
  // SECURITY FIX (C5 + M-AUTH-5 + M-AUTH-8): Atomic conditional update prevents
  // the TOCTOU race where two concurrent requests both pass the "usedAt is null"
  // check before either marks the token used. The `updateMany` with
  // WHERE usedAt=null + expiresAt > now ensures only ONE concurrent request
  // can "win" the token — the others get count=0.
  //
  // SECURITY FIX (M-AUTH-5): The token is stored as `sha256(rawToken)` to
  // prevent a read-only DB compromise from yielding live step-up tokens.
  // The raw token is sent by the client in the X-Step-Up-Token header and
  // hashed here before lookup.
  const tokenHash = sha256(token);
  const result = await db.stepUpSession.updateMany({
    where: {
      token: tokenHash,
      tenantId,
      userId,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}

/**
 * Check for active break-glass session.
 */
async function getBreakGlassContext(tenantId: string, userId: string, token: string | null): Promise<{
  active: boolean;
  breakGlassId?: string;
  permissions?: string[];
} | null> {
  if (!token) return null;

  // Find active, APPROVED break-glass for this user
  const bg = await db.breakGlassAccess.findFirst({
    where: {
      tenantId,
      userId,
      expiresAt: { gt: new Date() },
      approved: true,
    },
    orderBy: { grantedAt: 'desc' },
  });

  if (!bg) return null;

  // SECURITY FIX (C1): Verify the token hash using constant-time comparison.
  // The raw token is never stored — only its SHA-256 hash.
  if (!bg.tokenHash) return null;
  const providedHash = sha256(token);
  if (!timingSafeEqualStr(providedHash, bg.tokenHash)) {
    // Token mismatch — log and reject
    logger.warn('breakglass.token_mismatch', { tenantId, userId, breakGlassId: bg.id });
    return null;
  }

  const permissions: string[] = JSON.parse(bg.grantedPermissions || '[]');
  return {
    active: true,
    breakGlassId: bg.id,
    permissions,
  };
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
    const locale = negotiateLocale(req);

    setRequestContext({ correlationId, ip, userAgent });

    // Helper for localized errors
    const localizedError = (status: number, code: string, fallbackMsg: string, extra: Record<string, unknown> = {}) => {
      const messages = LOCALIZED_ERRORS[code];
      const message = messages?.[locale] || messages?.['en'] || fallbackMsg;
      return jsonError(status, code, message, extra);
    };

    // Request body size check
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json') || contentType.includes('text/')) {
      const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_REQUEST_BODY_SIZE) {
        logger.warn('api.request_too_large', { contentLength, limit: MAX_REQUEST_BODY_SIZE, path: req.nextUrl.pathname });
        return localizedError(413, 'request_too_large', `Request body exceeds ${MAX_REQUEST_BODY_SIZE} bytes`);
      }
    }

    // CSRF protection: require custom header for state-changing requests
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      const isApiRequest = req.headers.get('content-type')?.includes('application/json') ||
                          req.headers.get('x-requested-with') === 'XMLHttpRequest';
      if (!isApiRequest && !req.headers.get('authorization')) {
        // Form submissions without proper headers are rejected
        // (NextAuth form login is handled separately and doesn't use createApiHandler)
        return jsonError(403, 'csrf_missing', 'Missing required header for state-changing request');
      }
    }

    // Authenticate: try session first, then API key
    let session = await getServerSession();
    let isApiKey = false;

    if (!session?.user) {
      const apiKeySession = await authenticateWithApiKey(req);
      if (apiKeySession) {
        session = apiKeySession;
        isApiKey = true;
      }
    }

    if (!session?.user) {
      return localizedError(401, 'unauthenticated', 'Authentication required');
    }

    // --- Session revocation check (JWT denylist) ---
    // Skip for API-key auth (no JWT, revocation is via API key deletion).
    if (!isApiKey && session.user.jti) {
      // 1. Check if this specific JWT has been revoked (single-session logout)
      if (await isSessionRevoked(session.user.jti)) {
        return jsonError(401, 'session_revoked', 'Your session has been revoked. Please sign in again.');
      }
      // 2. Check mass-revoke timestamp (e.g. after password change)
      //    If the user's `sessionsRevokedAt` is newer than the JWT's `iat`,
      //    the JWT is invalid.
      if (session.user.iat) {
        const revokeTs = await getUserSessionRevokeTimestamp(session.user.id);
        if (revokeTs) {
          const jwtIatMs = session.user.iat * 1000;
          if (jwtIatMs < revokeTs.getTime()) {
            return jsonError(401, 'session_expired', 'Your session is no longer valid. Please sign in again.');
          }
        }
      }
    }

    setRequestContext({ tenantId: session.user.tenantId, userId: session.user.id });

    // Rate limit
    if (opts.rateLimit) {
      const rlKey = `${session.user.tenantId}:${session.user.id}:${req.method}:${req.nextUrl.pathname}`;
      const rl = await apiRateLimiter.check(rlKey, opts.rateLimit.max, opts.rateLimit.windowMs);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: { code: 'rate_limited', message: 'Too many requests', retryAfterMs: rl.retryAfterMs } },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
      }
    }

    // Step-up authentication check
    if (opts.requireStepUp && !isApiKey) {
      const stepUpToken = req.headers.get('x-step-up-token');
      if (!stepUpToken) {
        return jsonError(403, 'step_up_required', 'This action requires step-up authentication');
      }
      const valid = await verifyStepUpToken(session.user.tenantId, session.user.id, stepUpToken);
      if (!valid) {
        return jsonError(403, 'step_up_invalid', 'Step-up token is invalid or expired');
      }
    }

    // Break-glass: check for active break-glass session
    const breakGlassToken = req.headers.get('x-break-glass-token');
    let isBreakGlass = false;
    let breakGlassId: string | undefined;

    if (breakGlassToken) {
      const bgContext = await getBreakGlassContext(session.user.tenantId, session.user.id, breakGlassToken);
      if (bgContext?.active && bgContext.permissions) {
        isBreakGlass = true;
        breakGlassId = bgContext.breakGlassId;
        // Merge break-glass permissions into session
        session.user.permissions = [...new Set([...session.user.permissions, ...bgContext.permissions])];
        logger.warn('break_glass.active', {
          userId: session.user.id,
          breakGlassId: bgContext.breakGlassId,
          path: req.nextUrl.pathname,
        });
      }
    }

    const ctx: ApiContext = {
      session,
      tenantId: session.user.tenantId,
      userId: session.user.id,
      correlationId,
      ip,
      userAgent,
      isBreakGlass,
      breakGlassId,
      isApiKey,
      audit: async (input) => {
        await recordAuditEvent({
          ...input,
          tenantId: session.user.tenantId,
          actorId: session.user.id,
          actorEmail: session.user.email,
          actorIp: ip,
          actorUserAgent: userAgent,
          correlationId,
          metadata: {
            ...input.metadata,
            ...(isBreakGlass ? { breakGlassId } : {}),
            ...(isApiKey ? { authMethod: 'api_key' } : {}),
          },
        } as AuditEventInput);
      },
    };

    // Authorization
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
      return localizedError(403, 'forbidden', `Missing permission: ${opts.requiredPermission}`, { permission: opts.requiredPermission });
    }

    // ABAC policy evaluation (runs AFTER RBAC passes)
    // Policies are tenant-scoped rules that can deny or allow based on
    // document attributes (classification, tags, state), actor context
    // (role, IP, time of day), and resource type. Deny wins over allow.
    //
    // We only evaluate policies when:
    //   1. The route declares a requiredPermission (so we have an action
    //      string to match against), AND
    //   2. The route opts in to policy evaluation via `opts.evaluatePolicies`
    //      (default: true for routes with requiredPermission).
    //
    // Routes that need document-specific policy evaluation (e.g. download,
    // preview, share) should pass `opts.policyContext` with the document
    // attributes, OR call `evaluatePolicies()` manually inside the handler
    // (when the document isn't known until the handler runs).
    if (opts.requiredPermission && opts.evaluatePolicies !== false) {
      const policyCtx = buildPolicyContext({
        tenantId: session.user.tenantId,
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorIp: ctx.ip,
        actorRoles: session.user.roles,
        action: opts.requiredPermission,
        resourceType: opts.audit?.resourceType,
        resourceId: opts.audit?.resourceIdFromParams ? params[opts.audit.resourceIdFromParams] : undefined,
        document: opts.policyContext?.document,
      });
      const policyDecision = await evaluatePolicies(policyCtx);
      if (policyDecision.decision === 'deny') {
        // Alert security officers about the policy violation
        const { alertPolicyViolation } = await import('@/lib/security/policy-alerts');
        await alertPolicyViolation(session.user.tenantId, {
          policyName: policyDecision.matchedPolicy?.name,
          action: opts.requiredPermission,
          resourceType: opts.audit?.resourceType || 'unknown',
          resourceId: (opts.audit?.resourceIdFromParams ? params[opts.audit.resourceIdFromParams] : undefined) || '',
          actorId: session.user.id,
          actorEmail: session.user.email,
          actorIp: ctx.ip,
          reason: policyDecision.reason,
        }).catch(() => {});

        await ctx.audit({
          eventType: 'policy.deny',
          action: req.method.toLowerCase(),
          resourceType: opts.audit?.resourceType,
          resourceId: opts.audit?.resourceIdFromParams ? params[opts.audit.resourceIdFromParams] : undefined,
          resourceName: opts.audit?.resourceNameFromParams ? params[opts.audit.resourceNameFromParams] : undefined,
          result: 'deny',
          reason: policyDecision.reason,
          metadata: {
            path: req.nextUrl.pathname,
            method: req.method,
            policyName: policyDecision.matchedPolicy?.name,
            policyId: policyDecision.matchedPolicy?.id,
            evaluatedCount: policyDecision.evaluatedCount,
          },
        });
        return localizedError(403, 'policy_denied', policyDecision.reason, {
          policy: policyDecision.matchedPolicy?.name,
        });
      }
    }

    // --- Hardware-key enforcement (§9.1) ---
    // When a tenant enables `settings.security.requireHardwareKeyForHighPrivilegeRoles`,
    // users with high-privilege roles (tenant_admin, security_officer) must
    // have a passkey registered to perform any authenticated action.
    // This is a defense-in-depth measure against credential theft.
    //
    // We skip this check for API-key auth (service accounts are not
    // interactive users and don't have passkeys).
    if (!isApiKey) {
      const { enforceHardwareKey } = await import('@/lib/auth/hardware-key-enforcement');
      const hwKeyResult = await enforceHardwareKey({
        tenantId: session.user.tenantId,
        userId: session.user.id,
        userRoles: session.user.roles,
      });
      if (!hwKeyResult.ok) {
        return jsonError(403, 'hardware_key_required', hwKeyResult.reason || 'A passkey is required for high-privilege roles.');
      }
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
        // Report to Sentry (if configured)
        if (process.env.SENTRY_DSN) {
          const { Sentry } = await import('@/lib/config/sentry');
          Sentry.captureException(err, {
            tags: { path: req.nextUrl.pathname, method: req.method },
            extra: { code, status },
          });
        }
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
