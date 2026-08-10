#!/usr/bin/env python3
"""Add admin.users.suspendConfirm + suspended keys to all 5 locale files."""
import json
from pathlib import Path

MESSAGES_DIR = Path(__file__).parent.parent / "messages"

STRINGS = {
    "en": {
        "suspendConfirm": "This will immediately revoke all sessions for {email}. The user will not be able to sign in until reactivated. Step-up authentication is required.",
        "suspended": "User suspended",
    },
    "fr": {
        "suspendConfirm": "Cela révoquera immédiatement toutes les sessions de {email}. L'utilisateur ne pourra pas se connecter jusqu'à sa réactivation. Une authentification renforcée est requise.",
        "suspended": "Utilisateur suspendu",
    },
    "ar": {
        "suspendConfirm": "سيؤدي هذا إلى إلغاء جميع جلسات {email} فوراً. لن يتمكن المستخدم من تسجيل الدخول حتى إعادة التفعيل. مطلوب مصادقة معززة.",
        "suspended": "تم تعليق المستخدم",
    },
    "es": {
        "suspendConfirm": "Esto revocará inmediatamente todas las sesiones de {email}. El usuario no podrá iniciar sesión hasta que se reactive. Se requiere autenticación reforzada.",
        "suspended": "Usuario suspendido",
    },
    "de": {
        "suspendConfirm": "Dies widerruft sofort alle Sitzungen von {email}. Der Benutzer kann sich erst nach der Reaktivierung wieder anmelden. Step-up-Authentifizierung erforderlich.",
        "suspended": "Benutzer gesperrt",
    },
}

for loc, strings in STRINGS.items():
    path = MESSAGES_DIR / f"{loc}.json"
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if 'admin' in data and 'users' in data['admin']:
        for k, v in strings.items():
            data['admin']['users'][k] = v
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"[{loc}] added admin.users keys")
