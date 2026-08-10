#!/usr/bin/env python3
"""
Add `await` to all `<limiter>.check(...)` calls that are not already awaited.
Skips comments and lines that already have `await`.
"""
import re
from pathlib import Path

FILES = [
    "src/lib/api/handler.ts",
    "src/lib/auth/auth-options.ts",
    "src/app/api/shares/[token]/route.ts",
    "src/app/api/csp-report/route.ts",
    "src/app/api/auth/passkey/login/init/route.ts",
    "src/app/api/auth/passkey/login/verify/route.ts",
    "src/app/api/auth/sso/[providerId]/callback/route.ts",
    "src/app/api/auth/sso/[providerId]/init/route.ts",
    "src/app/api/auth/forgot-password/route.ts",
    "src/app/api/auth/reset-password/route.ts",
    "src/app/api/admin/invitations/[token]/accept/route.ts",
]

# Pattern: line that contains <limiter>.check( but not preceded by `await` on the same expression
# We look for `(authRateLimiter|apiRateLimiter|uploadRateLimiter)\.check\(` and ensure
# the token immediately before is `= ` (assignment) — if so, prefix with `await`.
PAT = re.compile(
    r"(\=\s*)(authRateLimiter|apiRateLimiter|uploadRateLimiter)(\.check\()",
)

changed = 0
for f in FILES:
    p = Path(f)
    if not p.exists():
        print(f"SKIP {f}: not found")
        continue
    text = p.read_text(encoding="utf-8")
    new_text, n = PAT.subn(r"\1await \2\3", text)
    if n > 0:
        p.write_text(new_text, encoding="utf-8")
        print(f"PATCHED {f}: {n} callsites")
        changed += 1
    else:
        print(f"NO-CHANGE {f}")

print(f"\nTotal files patched: {changed}")
