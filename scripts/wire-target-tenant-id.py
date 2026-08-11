#!/usr/bin/env python3
"""
Smart EDMS — Wire ctx.targetTenantId into admin route queries

For platform admin cross-tenant visibility, the data `where` clause in
listing/viewing routes should use `ctx.targetTenantId` instead of
`ctx.tenantId`. The targetTenantId is set by createApiHandler when a
platform admin passes ?tenantId= or x-target-tenant header.

Rules:
- Only patch READ operations (GET handlers, listing queries, findFirst for detail views)
- Do NOT patch WRITE operations (POST/PATCH/DELETE) — those stay on ctx.tenantId
- Do NOT patch audit events, fireWebhook, alertPolicyViolation, notify — those use ctx.tenantId (actor's tenant)
- Only replace `ctx.tenantId` in `where:` clauses within db.* queries
- Do NOT replace `ctx.tenantId` in `data:` (create/update) or function calls like canReadDocument()

Files to patch (GET handlers only):
- admin/users/route.ts (GET — list users)
- admin/users/[id]/route.ts (GET — user detail)
- admin/roles/route.ts (GET — list roles)
- admin/webhooks/route.ts (GET — list webhooks)
- admin/service-accounts/route.ts (GET — list service accounts)
- admin/vocabularies/route.ts (GET — list vocabularies)
- admin/retention/route.ts (GET — list retention schedules)
- admin/notification-routing/route.ts (GET — list routing rules)
- admin/anomalies/route.ts (GET — list anomalies)
- admin/anomalies/[id]/resolve/route.ts (POST but reads anomaly — patch the findFirst)
- admin/invitations/route.ts (GET — list invitations)
- admin/evidence-packages/route.ts (GET — list evidence packages)
- dashboard/route.ts (GET — dashboard stats)
- audit/route.ts (GET — audit events list)
- documents/route.ts (GET — document list)
- search/route.ts (GET — search)
- saved-searches/route.ts (GET — list saved searches)
- folders/route.ts (GET — list folders)
- billing/invoices/route.ts (GET — list invoices)
- billing/status/[invoiceId]/route.ts (GET — invoice status)

Approach: for each file, find the GET handler and replace `ctx.tenantId`
with `ctx.targetTenantId` in `where:` clauses of db queries. Leave
everything else (POST/PATCH/DELETE, audit events, fireWebhook) untouched.
"""

import re
from pathlib import Path

# Files where we replace ctx.tenantId → ctx.targetTenantId in GET handlers
# (and in findFirst calls that are READ operations even if in POST handlers)
TARGETS = [
    # Admin listing routes — GET handlers
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/users/[id]/route.ts",
    "src/app/api/admin/roles/route.ts",
    "src/app/api/admin/webhooks/route.ts",
    "src/app/api/admin/service-accounts/route.ts",
    "src/app/api/admin/vocabularies/route.ts",
    "src/app/api/admin/retention/route.ts",
    "src/app/api/admin/notification-routing/route.ts",
    "src/app/api/admin/anomalies/route.ts",
    "src/app/api/admin/invitations/route.ts",
    "src/app/api/admin/evidence-packages/route.ts",
    "src/app/api/admin/jobs/route.ts",
    "src/app/api/admin/legal-holds/route.ts",
    "src/app/api/admin/dispositions/route.ts",
    # Data listing routes
    "src/app/api/dashboard/route.ts",
    "src/app/api/audit/route.ts",
    "src/app/api/documents/route.ts",
    "src/app/api/search/route.ts",
    "src/app/api/saved-searches/route.ts",
    "src/app/api/folders/route.ts",
    # Billing
    "src/app/api/billing/invoices/route.ts",
    "src/app/api/billing/status/[invoiceId]/route.ts",
    "src/app/api/admin/billing/route.ts",
]

changed = 0
for filepath in TARGETS:
    p = Path(filepath)
    if not p.exists():
        print(f"SKIP {filepath}: not found")
        continue
    
    text = p.read_text(encoding='utf-8')
    original = text
    
    # Pattern: in `where:` clauses, replace `ctx.tenantId` with `ctx.targetTenantId`
    # We need to be careful to only replace in data query `where:` clauses,
    # not in audit events, fireWebhook, etc.
    #
    # Strategy: replace `tenantId: ctx.tenantId` that appear inside `where:` objects
    # but NOT inside `data:` objects or function calls.
    #
    # Simple heuristic: replace `ctx.tenantId` → `ctx.targetTenantId` ONLY when
    # it appears on a line containing `where:` or when it's inside a `where:` block
    # (identified by being on a line with `tenantId: ctx.tenantId` preceded by
    # a `where:` somewhere above).
    #
    # Actually, the safest approach: replace all `ctx.tenantId` → `ctx.targetTenantId`
    # EXCEPT on lines containing: recordAuditEvent, fireWebhook, alertPolicy,
    # notify, actorEmail, actorIp, actorUserAgent, correlationId, data:, create:,
    # update:, tenantId: ctx.tenantId, (in data blocks), canReadDocument, canModifyDocument
    
    lines = text.split('\n')
    new_lines = []
    in_where_block = False
    in_data_block = False
    
    for i, line in enumerate(lines):
        # Track if we're in a where: or data: block
        if 'where:' in line and 'data:' not in line:
            in_where_block = True
            in_data_block = False
        elif 'data:' in line and 'where:' not in line:
            in_data_block = True
            in_where_block = False
        elif line.strip().startswith('})') or line.strip().startswith('}):'):
            in_where_block = False
            in_data_block = False
        
        # Skip lines that are clearly not data queries
        skip_patterns = [
            'recordAuditEvent', 'fireWebhook', 'alertPolicy', 'notify(',
            'actorEmail', 'actorIp', 'actorUserAgent', 'correlationId',
            'canReadDocument', 'canModifyDocument', 'revokeAllUserSessions',
            'tenantId: ctx.tenantId,'  # in data/create blocks
        ]
        
        should_skip = any(p in line for p in skip_patterns)
        
        # Only replace in where: blocks, and skip audit/webhook lines
        if in_where_block and 'ctx.tenantId' in line and not should_skip:
            line = line.replace('ctx.tenantId', 'ctx.targetTenantId')
        
        new_lines.append(line)
    
    text = '\n'.join(new_lines)
    
    if text != original:
        p.write_text(text, encoding='utf-8')
        # Count changes
        changes = original.count('ctx.tenantId') - text.count('ctx.tenantId')
        print(f"PATCHED {filepath}: {changes} ctx.tenantId → ctx.targetTenantId")
        changed += 1
    else:
        print(f"NO-CHANGE {filepath}")

print(f"\nTotal files patched: {changed}")
