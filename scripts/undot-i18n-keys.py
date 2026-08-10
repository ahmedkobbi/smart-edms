#!/usr/bin/env python3
"""
Smart EDMS — Fix notification bundle structure.

The previous script created flat keys with dots (e.g. "workflow.assigned")
instead of nested objects (notifications.workflow.assigned.title). This script
walks all 5 locale files and converts flat dotted keys into nested objects.
"""
import json
from pathlib import Path

MESSAGES_DIR = Path(__file__).parent.parent / "messages"


def undot_keys(obj):
    """Recursively convert flat dotted keys into nested objects."""
    if isinstance(obj, dict):
        new = {}
        for k, v in obj.items():
            v = undot_keys(v)
            if "." in k:
                # Split and nest
                parts = k.split(".")
                target = new
                for p in parts[:-1]:
                    if p not in target or not isinstance(target[p], dict):
                        target[p] = {}
                    target = target[p]
                # Merge leaf
                leaf = parts[-1]
                if leaf in target and isinstance(target[leaf], dict) and isinstance(v, dict):
                    merge(target[leaf], v)
                else:
                    target[leaf] = v
            else:
                if k in new and isinstance(new[k], dict) and isinstance(v, dict):
                    merge(new[k], v)
                else:
                    new[k] = v
        return new
    return obj


def merge(a, b):
    for k, v in b.items():
        if k in a and isinstance(a[k], dict) and isinstance(v, dict):
            merge(a[k], v)
        else:
            a[k] = v


def main():
    for locale in ("en", "fr", "ar", "es", "de"):
        path = MESSAGES_DIR / f"{locale}.json"
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        before = count_keys(data)
        data = undot_keys(data)
        after = count_keys(data)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"[ok] {locale}: {before} → {after} keys")


def count_keys(obj):
    if isinstance(obj, dict):
        return sum(count_keys(v) for v in obj.values()) + len(obj)
    return 0


if __name__ == "__main__":
    main()
