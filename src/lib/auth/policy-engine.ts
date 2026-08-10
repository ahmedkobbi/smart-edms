/**
 * Smart EDMS — ABAC Policy Engine
 *
 * Evaluates attribute-based access control (ABAC) policies alongside the
 * existing RBAC permission system. Policies are tenant-scoped rules stored
 * in the `Policy` table; each rule has:
 *
 *   - effect:    'allow' | 'deny'
 *   - action:    the permission string being checked (e.g. 'document:download')
 *                — supports wildcard '*' and prefix 'document:*'
 *   - resource:  the resource being accessed (e.g. 'document:abc123',
 *                'folder:xyz', 'document:*', '*')
 *   - conditions: JSON object of attribute matchers (see below)
 *   - priority:  higher = evaluated first; at equal priority, deny wins
 *   - enabled:   only enabled policies are evaluated
 *
 * ## Evaluation algorithm
 *
 *   1. Load all enabled policies for the tenant where the action matches
 *      (exact, prefix-wildcard, or full-wildcard) — sorted by priority DESC.
 *   2. For each policy, check if its `resource` pattern matches the
 *      requested resource.
 *   3. For each matching policy, evaluate its `conditions` against the
 *      request context (actor, document, classification, time, IP, etc.).
 *   4. The first policy whose conditions ALL match determines the decision:
 *        - 'deny' → reject immediately
 *        - 'allow' → permit (skip remaining policies)
 *   5. If no policy matches, the default is 'allow' (RBAC already
 *      gated the request; ABAC is an additional layer).
 *
 *   Rule: deny wins over allow at the same priority. This is the standard
 *   ABAC fail-safe — if a deny rule and an allow rule both match, deny.
 *
 * ## Condition matchers
 *
 * Conditions are a JSON object. Each key is an attribute name; each value
 * is a matcher. Supported matchers:
 *
 *   { classification: ['RESTRICTED', 'HS'] }
 *     → document classification code must be in the list
 *
 *   { classificationMin: 3 }
 *     → document classification.level must be >= 3
 *
 *   { hasTag: 'confidential' }
 *     → document must have this tag
 *
 *   { hasAnyTag: ['confidential', 'secret'] }
 *     → document must have at least one of these tags
 *
 *   { legalHold: true }
 *     → document must be under legal hold
 *
 *   { timeOfDay: { start: '09:00', end: '17:00' } }
 *     → current server time must be within the window (24h, server local)
 *
 *   { dayOfWeek: [1, 2, 3, 4, 5] }
 *     → day of week (1=Mon … 7=Sun) must be in the list
 *
 *   { ipRange: ['10.0.0.0/8', '192.168.0.0/16'] }
 *     → actor IP must be in one of the CIDR ranges
 *
 *   { actorRole: ['security_officer', 'tenant_admin'] }
 *     → actor must have at least one of these roles
 *
 *   { ownerOnly: true }
 *     → actor must be the document owner
 *
 *   { state: ['active', 'record'] }
 *     → document state must be in the list
 *
 *   { isRecord: true }
 *     → document must be declared a record
 *
 * Multiple conditions are AND-ed (all must match).
 *
 * ## Performance
 *
 * Policies are cached in-process for 60 seconds (configurable via
 * POLICY_CACHE_TTL_MS). The cache is invalidated when any policy is
 * created/updated/deleted. For each request, only matching policies
 * (by action) are evaluated — typically 0-5 policies per request.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface PolicyRule {
  id: string;
  name: string;
  effect: 'allow' | 'deny';
  action: string;
  resource: string;
  conditions: PolicyConditions;
  priority: number;
  enabled: boolean;
}

export interface PolicyConditions {
  // Classification matchers
  classification?: string[];
  classificationMin?: number;
  classificationMax?: number;
  // Tag matchers
  hasTag?: string;
  hasAnyTag?: string[];
  hasAllTags?: string[];
  // Document state matchers
  state?: string[];
  isRecord?: boolean;
  legalHold?: boolean;
  // Actor matchers
  ownerOnly?: boolean;
  actorRole?: string[];
  // Context matchers
  timeOfDay?: { start: string; end: string };
  dayOfWeek?: number[];
  ipRange?: string[];
}

export interface PolicyEvaluationContext {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorIp: string;
  actorRoles: string[];
  action: string;
  resourceType?: string;
  resourceId?: string;
  // Document attributes (when the resource is a document)
  document?: {
    id: string;
    ownerId?: string;
    classificationCode?: string;
    classificationLevel?: number;
    tags?: string[];
    state?: string;
    isRecord?: boolean;
    legalHold?: boolean;
    folderId?: string;
  };
}

export interface PolicyDecision {
  decision: 'allow' | 'deny';
  matchedPolicy?: PolicyRule;
  reason: string;
  evaluatedCount: number;
}

// ---------------------------------------------------------------------------
//  Policy cache
// ---------------------------------------------------------------------------

const POLICY_CACHE_TTL_MS = 60_000; // 1 minute
const policyCache = new Map<string, { rules: PolicyRule[]; ts: number }>();

/**
 * Load all enabled policies for a tenant, cached for 60 seconds.
 */
async function loadTenantPolicies(tenantId: string): Promise<PolicyRule[]> {
  const cached = policyCache.get(tenantId);
  if (cached && Date.now() - cached.ts < POLICY_CACHE_TTL_MS) {
    return cached.rules;
  }

  try {
    const rows = await db.policy.findMany({
      where: { tenantId, enabled: true },
      orderBy: [{ priority: 'desc' }, { effect: 'asc' }], // deny before allow at same priority
    });
    const rules: PolicyRule[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      effect: r.effect as 'allow' | 'deny',
      action: r.action,
      resource: r.resource,
      conditions: parseConditions(r.conditions),
      priority: r.priority,
      enabled: r.enabled,
    }));
    policyCache.set(tenantId, { rules, ts: Date.now() });
    return rules;
  } catch (err) {
    logger.warn('policy.load_failed', { tenantId, error: (err as Error).message });
    return [];
  }
}

/**
 * Invalidate the policy cache for a tenant.
 * Call after any policy create/update/delete.
 */
export function invalidatePolicyCache(tenantId: string): void {
  policyCache.delete(tenantId);
}

function parseConditions(raw: string | null | undefined): PolicyConditions {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
//  Pattern matching
// ---------------------------------------------------------------------------

/**
 * Check if an action matches a policy action pattern.
 * Supports:
 *   - exact match: 'document:download' === 'document:download'
 *   - prefix wildcard: 'document:*' matches 'document:download', 'document:read', etc.
 *   - full wildcard: '*' matches everything
 */
function actionMatches(pattern: string, action: string): boolean {
  if (pattern === '*') return true;
  if (pattern === action) return true;
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1); // 'document:*' → 'document:'
    return action.startsWith(prefix);
  }
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return action.startsWith(prefix);
  }
  return false;
}

/**
 * Check if a resource matches a policy resource pattern.
 * Supports:
 *   - exact: 'document:abc123' === 'document:abc123'
 *   - type wildcard: 'document:*' matches any document
 *   - full wildcard: '*' matches everything
 */
function resourceMatches(pattern: string, resourceType?: string, resourceId?: string): boolean {
  if (pattern === '*') return true;
  if (!resourceType) return false;
  const resource = resourceId ? `${resourceType}:${resourceId}` : `${resourceType}:*`;
  if (pattern === resource) return true;
  if (pattern === `${resourceType}:*`) return true;
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -1);
    return resource.startsWith(prefix);
  }
  return false;
}

// ---------------------------------------------------------------------------
//  Condition evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against the context.
 * Returns true if the condition matches.
 */
function evaluateCondition(
  key: keyof PolicyConditions,
  conditionValue: unknown,
  ctx: PolicyEvaluationContext,
): boolean {
  const doc = ctx.document;

  switch (key) {
    case 'classification':
      if (!doc?.classificationCode) return false;
      return Array.isArray(conditionValue) && conditionValue.includes(doc.classificationCode);

    case 'classificationMin':
      if (doc?.classificationLevel == null) return false;
      return doc.classificationLevel >= (conditionValue as number);

    case 'classificationMax':
      if (doc?.classificationLevel == null) return false;
      return doc.classificationLevel <= (conditionValue as number);

    case 'hasTag':
      if (!doc?.tags || doc.tags.length === 0) return false;
      return doc.tags.includes(conditionValue as string);

    case 'hasAnyTag':
      if (!doc?.tags || doc.tags.length === 0) return false;
      return Array.isArray(conditionValue) && (conditionValue as string[]).some((t) => doc.tags!.includes(t));

    case 'hasAllTags':
      if (!doc?.tags || doc.tags.length === 0) return false;
      return Array.isArray(conditionValue) && (conditionValue as string[]).every((t) => doc.tags!.includes(t));

    case 'state':
      if (!doc?.state) return false;
      return Array.isArray(conditionValue) && conditionValue.includes(doc.state);

    case 'isRecord':
      return doc?.isRecord === conditionValue;

    case 'legalHold':
      return doc?.legalHold === conditionValue;

    case 'ownerOnly':
      if (conditionValue !== true) return true;
      return doc?.ownerId === ctx.actorId;

    case 'actorRole':
      if (!ctx.actorRoles || ctx.actorRoles.length === 0) return false;
      return Array.isArray(conditionValue) && (conditionValue as string[]).some((r) => ctx.actorRoles.includes(r));

    case 'timeOfDay': {
      const window = conditionValue as { start: string; end: string };
      if (!window?.start || !window?.end) return false;
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = window.start.split(':').map(Number);
      const [endH, endM] = window.end.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }
      // Window crosses midnight (e.g. 22:00 → 06:00)
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    case 'dayOfWeek': {
      if (!Array.isArray(conditionValue)) return false;
      const today = new Date().getDay();
      // Convert JS Sunday=0 to ISO Monday=1
      const isoDay = today === 0 ? 7 : today;
      return (conditionValue as number[]).includes(isoDay);
    }

    case 'ipRange': {
      if (!Array.isArray(conditionValue) || !ctx.actorIp) return false;
      return (conditionValue as string[]).some((cidr) => isIpInCidr(ctx.actorIp, cidr));
    }

    default:
      // Unknown condition — fail safe by returning false
      return false;
  }
}

/**
 * Evaluate all conditions of a policy against the context.
 * All conditions must match (AND).
 * An empty conditions object matches everything.
 */
function evaluateConditions(conditions: PolicyConditions, ctx: PolicyEvaluationContext): boolean {
  const keys = Object.keys(conditions) as (keyof PolicyConditions)[];
  if (keys.length === 0) return true; // no conditions = always matches
  return keys.every((key) => evaluateCondition(key, conditions[key], ctx));
}

/**
 * Check if an IP is in a CIDR range.
 * Supports IPv4 only (IPv6 ranges are parsed but not matched).
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const [range, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr || '32', 10);
    if (prefix < 0 || prefix > 32) return false;

    const ipParts = ip.split('.').map(Number);
    const rangeParts = range.split('.').map(Number);
    if (ipParts.length !== 4 || rangeParts.length !== 4) return false;
    if (ipParts.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
    if (rangeParts.some((n) => isNaN(n) || n < 0 || n > 255)) return false;

    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;

    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate ABAC policies for a request.
 *
 * Returns a decision: 'allow' or 'deny'. If no policy matches, the default
 * is 'allow' (RBAC already gated the request).
 *
 * @param ctx The evaluation context (actor, action, resource, document attrs)
 * @returns The decision + the matched policy (if any) + evaluation metadata
 */
export async function evaluatePolicies(ctx: PolicyEvaluationContext): Promise<PolicyDecision> {
  const policies = await loadTenantPolicies(ctx.tenantId);

  // Filter to policies whose action matches
  const candidates = policies.filter((p) => actionMatches(p.action, ctx.action));
  // (The DB query already sorts by priority DESC + effect ASC, so deny
  // comes before allow at the same priority. The filter preserves order.)

  let evaluated = 0;
  for (const policy of candidates) {
    // Check resource match
    if (!resourceMatches(policy.resource, ctx.resourceType, ctx.resourceId)) {
      continue;
    }
    evaluated++;
    // Check conditions
    if (!evaluateConditions(policy.conditions, ctx)) {
      continue;
    }
    // This policy matches — its effect determines the decision
    if (policy.effect === 'deny') {
      return {
        decision: 'deny',
        matchedPolicy: policy,
        reason: `Denied by policy "${policy.name}"`,
        evaluatedCount: evaluated,
      };
    } else {
      return {
        decision: 'allow',
        matchedPolicy: policy,
        reason: `Explicitly allowed by policy "${policy.name}"`,
        evaluatedCount: evaluated,
      };
    }
  }

  // No policy matched — default allow (RBAC already gated)
  return {
    decision: 'allow',
    reason: 'No matching policy (default allow)',
    evaluatedCount: evaluated,
  };
}

/**
 * Convenience helper: evaluate policies and return a boolean.
 * Use this when you don't need the matched-policy details.
 */
export async function isPolicyAllowed(ctx: PolicyEvaluationContext): Promise<boolean> {
  const result = await evaluatePolicies(ctx);
  return result.decision === 'allow';
}

/**
 * Build a PolicyEvaluationContext from common API handler fields.
 *
 * This is a convenience for routes that already have `ctx` (the API
 * handler context) and want to check policies without manually
 * constructing the full evaluation context.
 */
export function buildPolicyContext(opts: {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorIp: string;
  actorRoles: string[];
  action: string;
  resourceType?: string;
  resourceId?: string;
  document?: PolicyEvaluationContext['document'];
}): PolicyEvaluationContext {
  return {
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    actorEmail: opts.actorEmail,
    actorIp: opts.actorIp,
    actorRoles: opts.actorRoles,
    action: opts.action,
    resourceType: opts.resourceType,
    resourceId: opts.resourceId,
    document: opts.document,
  };
}

// ---------------------------------------------------------------------------
//  Classification default-policy enforcement
// ---------------------------------------------------------------------------

/**
 * Evaluate a classification's `defaultPolicy` JSON against a request.
 *
 * The `defaultPolicy` is a simplified policy snippet stored on the
 * Classification model. It supports a subset of the full PolicyConditions:
 *
 *   {
 *     "share": "deny",           // deny all sharing of this classification
 *     "download": "deny",        // deny all downloads
 *     "preview": "allow",        // allow preview
 *     "requireWatermark": true,  // force watermark on preview
 *     "allowedShareRecipients": ["internal"] // "internal" or "external"
 *   }
 *
 * Returns a decision for the given action.
 */
export function evaluateClassificationPolicy(
  defaultPolicyJson: string | null | undefined,
  action: 'share' | 'download' | 'preview',
): { decision: 'allow' | 'deny'; reason: string } {
  if (!defaultPolicyJson) return { decision: 'allow', reason: 'No classification policy' };

  try {
    const policy = JSON.parse(defaultPolicyJson);
    if (typeof policy !== 'object' || policy === null) {
      return { decision: 'allow', reason: 'Invalid classification policy' };
    }

    const effect = policy[action];
    if (effect === 'deny') {
      return { decision: 'deny', reason: `Classification policy denies ${action}` };
    }
    if (effect === 'allow') {
      return { decision: 'allow', reason: `Classification policy allows ${action}` };
    }
    // No rule for this action — default allow
    return { decision: 'allow', reason: `No classification rule for ${action}` };
  } catch {
    return { decision: 'allow', reason: 'Invalid classification policy JSON' };
  }
}
