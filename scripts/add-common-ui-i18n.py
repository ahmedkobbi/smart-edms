#!/usr/bin/env python3
"""
Smart EDMS — Add common UI strings to all 5 locale files.

Adds keys for:
  common.notifications (the bell-icon label)
  common.markAllRead
  common.noNotifications
  common.profile
  common.security
  common.signOut
  common.administration
  common.account
  common.command (command palette)
  common.commandPlaceholder
  common.skipToContent
  common.loadingApp
"""
import json
from pathlib import Path

MESSAGES_DIR = Path(__file__).parent.parent / "messages"

STRINGS = {
    "en": {
        "notifications": "Notifications",
        "markAllRead": "Mark all read",
        "noNotifications": "No notifications",
        "profile": "Profile",
        "security": "Security",
        "signOut": "Sign out",
        "administration": "Administration",
        "account": "Account",
        "command": "Command",
        "commandPlaceholder": "Type a command or search…",
        "skipToContent": "Skip to main content",
        "loadingApp": "Loading Smart EDMS…",
        "navigation": "Navigation",
        "quickActions": "Quick actions",
        "confirm": "Confirm",
        "working": "Working…",
        "suspend": "Suspend",
        "suspendUser": "Suspend user",
        "cancel": "Cancel",
        "close": "Close",
    },
    "fr": {
        "notifications": "Notifications",
        "markAllRead": "Tout marquer comme lu",
        "noNotifications": "Aucune notification",
        "profile": "Profil",
        "security": "Sécurité",
        "signOut": "Déconnexion",
        "administration": "Administration",
        "account": "Compte",
        "command": "Commande",
        "commandPlaceholder": "Tapez une commande ou recherchez…",
        "skipToContent": "Aller au contenu principal",
        "loadingApp": "Chargement de Smart EDMS…",
        "navigation": "Navigation",
        "quickActions": "Actions rapides",
        "confirm": "Confirmer",
        "working": "En cours…",
        "suspend": "Suspendre",
        "suspendUser": "Suspendre l'utilisateur",
        "cancel": "Annuler",
        "close": "Fermer",
    },
    "ar": {
        "notifications": "الإشعارات",
        "markAllRead": "تعليم الكل كمقروء",
        "noNotifications": "لا توجد إشعارات",
        "profile": "الملف الشخصي",
        "security": "الأمان",
        "signOut": "تسجيل الخروج",
        "administration": "الإدارة",
        "account": "الحساب",
        "command": "الأوامر",
        "commandPlaceholder": "اكتب أمراً أو ابحث…",
        "skipToContent": "تخطَّ إلى المحتوى الرئيسي",
        "loadingApp": "جارٍ تحميل Smart EDMS…",
        "navigation": "التنقل",
        "quickActions": "إجراءات سريعة",
        "confirm": "تأكيد",
        "working": "جارٍ المعالجة…",
        "suspend": "تعليق",
        "suspendUser": "تعليق المستخدم",
        "cancel": "إلغاء",
        "close": "إغلاق",
    },
    "es": {
        "notifications": "Notificaciones",
        "markAllRead": "Marcar todo como leído",
        "noNotifications": "Sin notificaciones",
        "profile": "Perfil",
        "security": "Seguridad",
        "signOut": "Cerrar sesión",
        "administration": "Administración",
        "account": "Cuenta",
        "command": "Comando",
        "commandPlaceholder": "Escriba un comando o busque…",
        "skipToContent": "Saltar al contenido principal",
        "loadingApp": "Cargando Smart EDMS…",
        "navigation": "Navegación",
        "quickActions": "Acciones rápidas",
        "confirm": "Confirmar",
        "working": "Procesando…",
        "suspend": "Suspender",
        "suspendUser": "Suspender usuario",
        "cancel": "Cancelar",
        "close": "Cerrar",
    },
    "de": {
        "notifications": "Benachrichtigungen",
        "markAllRead": "Alle als gelesen markieren",
        "noNotifications": "Keine Benachrichtigungen",
        "profile": "Profil",
        "security": "Sicherheit",
        "signOut": "Abmelden",
        "administration": "Verwaltung",
        "account": "Konto",
        "command": "Befehl",
        "commandPlaceholder": "Befehl eingeben oder suchen…",
        "skipToContent": "Zum Hauptinhalt springen",
        "loadingApp": "Smart EDMS wird geladen…",
        "navigation": "Navigation",
        "quickActions": "Schnellaktionen",
        "confirm": "Bestätigen",
        "working": "Wird verarbeitet…",
        "suspend": "Sperren",
        "suspendUser": "Benutzer sperren",
        "cancel": "Abbrechen",
        "close": "Schließen",
    },
}

# Add these as new keys in the "common" namespace, preserving existing keys.
def merge_into_common(data, additions):
    if 'common' not in data:
        data['common'] = {}
    for k, v in additions.items():
        if k not in data['common']:
            data['common'][k] = v
    return data

def main():
    for loc, strings in STRINGS.items():
        path = MESSAGES_DIR / f"{loc}.json"
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        before = len(data.get('common', {}))
        data = merge_into_common(data, strings)
        after = len(data.get('common', {}))
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')
        added = after - before
        print(f"[{loc}] common: {before} → {after} keys (+{added})")

if __name__ == '__main__':
    main()
