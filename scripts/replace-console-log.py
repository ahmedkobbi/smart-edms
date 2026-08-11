#!/usr/bin/env python3
"""
Replace `console.warn('...message...', args)` and `console.error(...)` and
`console.log(...)` calls with structured `logger.warn/error/info(...)` calls
in the listed files. Skip files that don't import the logger — those will be
patched manually.

Strategy: simple line-by-line regex replacement. The replacement preserves
the message string but wraps it in an object with a `message` field plus the
original args under `error` (for warn/error) or `data`.
"""
import re
import sys
from pathlib import Path

# (file, import_check_str) — only patch if the file already imports the logger
TARGETS = [
    "src/lib/security/malware-scanner.ts",
    "src/lib/ai/analyzer.ts",
    "src/lib/ai/classifier.ts",
    "src/lib/storage/file-storage.ts",
    "src/app/api/documents/[id]/redact-preview/route.ts",
    "src/app/api/documents/[id]/share/route.ts",
    "src/app/api/documents/[id]/redact/route.ts",
    "src/app/api/workflows/route.ts",
    "src/app/api/admin/dispositions/route.ts",
    "src/app/api/admin/break-glass/route.ts",
]

# Patterns to find single-line console calls
# Matches: console.warn('[tag] message:', err);
#          console.error('msg', foo, bar);
# Captures: 1=severity, 2=message string + args, 3=trailing semicolon
PAT = re.compile(
    r"console\.(warn|error|log)\(\s*('[^']*'|\"[^\"]*\")\s*(?:,\s*([^)]+))?\s*\)\s*;?\s*$",
    re.MULTILINE,
)

def repl(m):
    severity = m.group(1)
    msg = m.group(2)  # quoted string
    args = m.group(3) or ""
    # Map console severity to logger method
    method = {"warn": "warn", "error": "error", "log": "info"}[severity]
    # Build a structured-log message: logger.warn('ns.event', { message: ..., error: <args> })
    # The args might be `err` or `err.message` or `(err as Error).message` — wrap under error.
    msg_inner = msg[1:-1]  # strip quotes
    # Build a slug from the message: take the part before any colon, strip non-alphanumerics, lowercase
    slug_part = msg_inner.split(":")[0].strip()
    slug_part = re.sub(r"[\[\]\s]", "_", slug_part)
    slug_part = re.sub(r"[^a-zA-Z0-9_.]", "", slug_part)
    slug_part = re.sub(r"_+", "_", slug_part).strip("_").lower() or "fallback"
    if args:
        return f"logger.{method}('{slug_part}', {{ message: {msg}, error: {args} }});"
    return f"logger.{method}('{slug_part}', {{ message: {msg} }});"

changed = 0
for path in TARGETS:
    p = Path(path)
    if not p.exists():
        print(f"SKIP {path}: not found")
        continue
    text = p.read_text(encoding="utf-8")
    if "logger" not in text:
        # Need to add the import
        # Find the last `import` line and add ours after it
        lines = text.split("\n")
        last_import = -1
        for i, line in enumerate(lines):
            if line.startswith("import ") or (line.startswith("}") and "from" in line):
                last_import = i
        if last_import >= 0:
            lines.insert(last_import + 1, "import { logger } from '@/lib/config/logger';")
            text = "\n".join(lines)
            print(f"ADDED logger import to {path}")
    new_text = PAT.sub(repl, text)
    if new_text != text:
        p.write_text(new_text, encoding="utf-8")
        n = len(PAT.findall(text))
        print(f"PATCHED {path}: {n} console.* calls")
        changed += 1
    else:
        print(f"NO-CHANGE {path}")

print(f"\nTotal files patched: {changed}")
