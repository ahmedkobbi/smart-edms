#!/usr/bin/env python3
"""
Add `requireStepUp: true` to all admin POST/PATCH/DELETE createApiHandler configs.

Walks src/app/api/admin/**/route.ts, finds `export const (POST|PATCH|DELETE) = createApiHandler({ ... })`
blocks where the config contains `requiredPermission: PERMISSIONS.ADMIN_*` but no `requireStepUp`,
and inserts `requireStepUp: true,` after the `requiredPermission` line.

This is idempotent: routes that already have `requireStepUp` are skipped.
"""
import os, re

ADMIN_API_DIR = 'src/app/api/admin'
modified = []
skipped = []

for root, dirs, files in os.walk(ADMIN_API_DIR):
    for f in files:
        if not f.endswith('.ts'):
            continue
        path = os.path.join(root, f)
        with open(path, 'r', encoding='utf-8') as fh:
            content = fh.read()

        original = content

        # Match: export const (POST|PATCH|DELETE) = createApiHandler(
        #   { requiredPermission: PERMISSIONS.ADMIN_*, [other stuff] }
        # The config block is the first {...} after createApiHandler(
        # We only modify if it contains requiredPermission: PERMISSIONS.ADMIN
        # and does NOT already contain requireStepUp.

        # Strategy: find each `export const METHOD = createApiHandler(` and parse
        # the config object by brace-matching.
        pattern = re.compile(
            r'(export const (?:POST|PATCH|DELETE)\s*=\s*createApiHandler\(\s*\{)(.*?)(\}\s*,)',
            re.DOTALL
        )

        def add_stepup(m):
            header = m.group(1)
            body = m.group(2)
            tail = m.group(3)
            if 'requireStepUp' in body:
                return m.group(0)  # already has it
            if 'PERMISSIONS.ADMIN' not in body:
                return m.group(0)  # not an admin route
            # Insert `requireStepUp: true,` right after `requiredPermission` line
            # Find the requiredPermission line
            rp_match = re.search(r'(requiredPermission:\s*PERMISSIONS\.\w+\s*,)', body)
            if rp_match:
                body = body[:rp_match.end()] + '\n    requireStepUp: true,' + body[rp_match.end():]
            else:
                # No requiredPermission line? prepend
                body = '\n    requireStepUp: true,' + body
            return header + body + tail

        content = pattern.sub(add_stepup, content)

        if content != original:
            with open(path, 'w', encoding='utf-8') as fh:
                fh.write(content)
            modified.append(path)
        else:
            # Check if it was skipped because already had stepup or no admin perm
            for m in pattern.finditer(original):
                body = m.group(2)
                if 'PERMISSIONS.ADMIN' in body:
                    if 'requireStepUp' in body:
                        skipped.append((path, 'already has step-up'))
                    break

print(f"Modified {len(modified)} files:")
for p in modified:
    print(f"  + {p}")
print(f"\nSkipped {len(skipped)} files (already had step-up):")
for p, reason in skipped:
    print(f"  - {p}: {reason}")
