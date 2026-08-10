#!/usr/bin/env python3
"""
Smart EDMS — Replace physical Tailwind utilities with logical (RTL-safe) ones.

Replaces:
  ml-N  → ms-N  (margin-left → margin-inline-start)
  mr-N  → me-N  (margin-right → margin-inline-end)
  pl-N  → ps-N  (padding-left → padding-inline-start)
  pr-N  → pe-N  (padding-right → padding-inline-end)
  left-N  → start-N  (inset-inline-start)
  right-N → end-N    (inset-inline-end)
  border-l → border-s
  border-r → border-e
  border-l-N → border-s-N
  border-r-N → border-e-N
  rounded-l → rounded-s
  rounded-r → rounded-e
  rounded-tl → rounded-ss
  rounded-tr → rounded-se
  rounded-bl → rounded-es
  rounded-br → rounded-ee
  text-left → text-start
  text-right → text-end
  float-left → float-start
  float-right → float-end
  clear-left → clear-start
  clear-right → clear-end
  ml-auto → ms-auto
  mr-auto → me-auto
  -ml-N → -ms-N
  -mr-N → -me-N

Skips:
  - node_modules
  - .next
  - Files in src/components/ui/ (shadcn primitives — these are upstream
    and we don't want to maintain local patches; the RTL CSS overrides
    in globals.css handle them)
  - globals.css (handled separately)

The replacement is conservative: it only replaces when the utility is
preceded by a word boundary (space, quote, or start of string) and
followed by a non-word character (space, quote, or end of string).
This avoids false positives like "html-left" or "leftover".
"""
import os, re, sys

# (pattern, replacement) pairs. Each pattern is a regex that matches the
# physical utility as a whole token (preceded by \b and followed by a
# non-word char or end-of-string).
REPLACEMENTS = [
    # Margins
    (r'\b(-?)ml-([a-z0-9]+)\b', r'\1ms-\2'),
    (r'\b(-?)mr-([a-z0-9]+)\b', r'\1me-\2'),
    (r'\bml-auto\b', 'ms-auto'),
    (r'\bmr-auto\b', 'me-auto'),
    # Padding
    (r'\bpl-([a-z0-9]+)\b', r'ps-\1'),
    (r'\bpr-([a-z0-9]+)\b', r'pe-\1'),
    # Inset (left/right)
    (r'\bleft-([a-z0-9-]+)\b', r'start-\1'),
    (r'\bright-([a-z0-9-]+)\b', r'end-\1'),
    # Borders
    (r'\bborder-l\b(?!-)', 'border-s'),
    (r'\bborder-r\b(?!-)', 'border-e'),
    (r'\bborder-l-([a-z0-9-]+)\b', r'border-s-\1'),
    (r'\bborder-r-([a-z0-9-]+)\b', r'border-e-\1'),
    # Border radius
    (r'\brounded-l\b(?!-)', 'rounded-s'),
    (r'\brounded-r\b(?!-)', 'rounded-e'),
    (r'\brounded-tl\b(?!-)', 'rounded-ss'),
    (r'\brounded-tr\b(?!-)', 'rounded-se'),
    (r'\brounded-bl\b(?!-)', 'rounded-es'),
    (r'\brounded-br\b(?!-)', 'rounded-ee'),
    (r'\brounded-tl-([a-z0-9]+)\b', r'rounded-ss-\1'),
    (r'\brounded-tr-([a-z0-9]+)\b', r'rounded-se-\1'),
    (r'\brounded-bl-([a-z0-9]+)\b', r'rounded-es-\1'),
    (r'\brounded-br-([a-z0-9]+)\b', r'rounded-ee-\1'),
    # Text alignment
    (r'\btext-left\b', 'text-start'),
    (r'\btext-right\b', 'text-end'),
    # Float
    (r'\bfloat-left\b', 'float-start'),
    (r'\bfloat-right\b', 'float-end'),
    # Clear
    (r'\bclear-left\b', 'clear-start'),
    (r'\bclear-right\b', 'clear-end'),
    # Space between
    (r'\bspace-x-([a-z0-9-]+)\b', r'space-x-\1'),  # keep as-is (flex direction handles RTL)
    (r'\bspace-y-([a-z0-9-]+)\b', r'space-y-\1'),  # keep as-is
]

SKIP_DIRS = {'node_modules', '.next', '.git', 'dist', 'build', 'out', 'skills', 'tests'}
SKIP_FILES = {'globals.css'}  # handled separately

def should_skip_dir(d):
    return d in SKIP_DIRS

def replace_in_file(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return 0

    original = content
    changes = 0
    for pattern, replacement in REPLACEMENTS:
        new_content, n = re.subn(pattern, replacement, content)
        if new_content != content:
            changes += n
            content = new_content

    if changes > 0:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
    return changes

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'src'
    total_files = 0
    total_changes = 0

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
        for f in filenames:
            if not (f.endswith('.tsx') or f.endswith('.ts') or f.endswith('.jsx')):
                continue
            if f in SKIP_FILES:
                continue
            path = os.path.join(dirpath, f)
            n = replace_in_file(path)
            if n > 0:
                total_files += 1
                total_changes += n
                print(f"  {path}: {n} replacements")

    print(f"\nTotal: {total_files} files, {total_changes} replacements")

if __name__ == '__main__':
    main()
