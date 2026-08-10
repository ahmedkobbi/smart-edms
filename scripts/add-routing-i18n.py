#!/usr/bin/env python3
"""Add admin.notificationRouting i18n key to all 5 locale files."""
import json
from pathlib import Path

MESSAGES_DIR = Path(__file__).parent.parent / "messages"

STRINGS = {
    "en": "Notification Routing",
    "fr": "Routage des notifications",
    "ar": "توجيه الإشعارات",
    "es": "Enrutamiento de notificaciones",
    "de": "Benachrichtigungsrouting",
}

for loc, value in STRINGS.items():
    path = MESSAGES_DIR / f"{loc}.json"
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if 'admin' in data:
        data['admin']['notificationRouting'] = value
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"[{loc}] added admin.notificationRouting")
