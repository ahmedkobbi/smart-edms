#!/usr/bin/env python3
"""
Smart EDMS — AI-Assisted Translation Script

Translates English placeholder values in messages/{fr,ar,es,de}.json to
their proper locale equivalents. Uses a comprehensive translation dictionary
built from common UI/UX patterns.

Strategy:
1. For each key-value pair where the non-English locale has the same value
   as English, look up the translation in a dictionary.
2. The dictionary covers common UI words (Save, Cancel, Delete, Create, etc.)
   and common Smart EDMS domain terms (Document, Classification, Audit, etc.)
3. For values not in the dictionary, keep the English value (the app falls
   back gracefully — better to show English than a wrong translation).
4. For interpolation patterns like "Page {page} of {totalPages}", translate
   the surrounding text but preserve the {param} placeholders.

Run: python3 scripts/translate-locales.py
"""

import json
import re
from pathlib import Path
from typing import Any

MESSAGES_DIR = Path('/home/z/my-project/messages')

# ============================================================================
#  TRANSLATION DICTIONARIES
# ============================================================================

# Common UI words — translated to all 4 locales
# Format: { english_word: { fr: "...", ar: "...", es: "...", de: "..." } }
COMMON_TRANSLATIONS = {
    # Actions
    "Save": {"fr": "Enregistrer", "ar": "حفظ", "es": "Guardar", "de": "Speichern"},
    "Cancel": {"fr": "Annuler", "ar": "إلغاء", "es": "Cancelar", "de": "Abbrechen"},
    "Delete": {"fr": "Supprimer", "ar": "حذف", "es": "Eliminar", "de": "Löschen"},
    "Create": {"fr": "Créer", "ar": "إنشاء", "es": "Crear", "de": "Erstellen"},
    "Edit": {"fr": "Modifier", "ar": "تعديل", "es": "Editar", "de": "Bearbeiten"},
    "Update": {"fr": "Mettre à jour", "ar": "تحديث", "es": "Actualizar", "de": "Aktualisieren"},
    "Close": {"fr": "Fermer", "ar": "إغلاق", "es": "Cerrar", "de": "Schließen"},
    "Confirm": {"fr": "Confirmer", "ar": "تأكيد", "es": "Confirmar", "de": "Bestätigen"},
    "Approve": {"fr": "Approuver", "ar": "موافقة", "es": "Aprobar", "de": "Genehmigen"},
    "Reject": {"fr": "Rejeter", "ar": "رفض", "es": "Rechazar", "de": "Ablehnen"},
    "Enable": {"fr": "Activer", "ar": "تفعيل", "es": "Activar", "de": "Aktivieren"},
    "Disable": {"fr": "Désactiver", "ar": "تعطيل", "es": "Desactivar", "de": "Deaktivieren"},
    "Revoke": {"fr": "Révoquer", "ar": "إلغاء", "es": "Revocar", "de": "Widerrufen"},
    "Review": {"fr": "Examiner", "ar": "مراجعة", "es": "Revisar", "de": "Überprüfen"},
    "Reset": {"fr": "Réinitialiser", "ar": "إعادة تعيين", "es": "Restablecer", "de": "Zurücksetzen"},
    "Add": {"fr": "Ajouter", "ar": "إضافة", "es": "Añadir", "de": "Hinzufügen"},
    "Remove": {"fr": "Retirer", "ar": "إزالة", "es": "Eliminar", "de": "Entfernen"},
    "Copy": {"fr": "Copier", "ar": "نسخ", "es": "Copiar", "de": "Kopieren"},
    "Done": {"fr": "Terminé", "ar": "تم", "es": "Hecho", "de": "Fertig"},
    "Dismiss": {"fr": "Ignorer", "ar": "تجاهل", "es": "Descartar", "de": "Verwerfen"},
    "Try again": {"fr": "Réessayer", "ar": "حاول مرة أخرى", "es": "Intentar de nuevo", "de": "Erneut versuchen"},
    "Go to Dashboard": {"fr": "Aller au tableau de bord", "ar": "الذهاب إلى لوحة التحكم", "es": "Ir al panel", "de": "Zum Dashboard"},
    "Search documents": {"fr": "Rechercher des documents", "ar": "البحث في المستندات", "es": "Buscar documentos", "de": "Dokumente suchen"},
    "Load more": {"fr": "Charger plus", "ar": "تحميل المزيد", "es": "Cargar más", "de": "Mehr laden"},
    "Previous": {"fr": "Précédent", "ar": "السابق", "es": "Anterior", "de": "Zurück"},
    "Next": {"fr": "Suivant", "ar": "التالي", "es": "Siguiente", "de": "Weiter"},
    "Loading…": {"fr": "Chargement…", "ar": "جار التحميل…", "es": "Cargando…", "de": "Laden…"},
    "Loading Smart EDMS…": {"fr": "Chargement de Smart EDMS…", "ar": "جار تحميل سمارت EDMS…", "es": "Cargando Smart EDMS…", "de": "Smart EDMS wird geladen…"},
    "Skip to main content": {"fr": "Aller au contenu principal", "ar": "تخطي إلى المحتوى الرئيسي", "es": "Saltar al contenido principal", "de": "Zum Hauptinhalt springen"},
    "Search": {"fr": "Rechercher", "ar": "بحث", "es": "Buscar", "de": "Suchen"},

    # Status / Results
    "Failed": {"fr": "Échec", "ar": "فشل", "es": "Falló", "de": "Fehlgeschlagen"},
    "Unknown": {"fr": "Inconnu", "ar": "غير معروف", "es": "Desconocido", "de": "Unbekannt"},
    "Unknown error": {"fr": "Erreur inconnue", "ar": "خطأ غير معروف", "es": "Error desconocido", "de": "Unbekannter Fehler"},
    "No data": {"fr": "Pas de données", "ar": "لا توجد بيانات", "es": "Sin datos", "de": "Keine Daten"},
    "No results": {"fr": "Aucun résultat", "ar": "لا توجد نتائج", "es": "Sin resultados", "de": "Keine Ergebnisse"},
    "Operation failed": {"fr": "L'opération a échoué", "ar": "فشلت العملية", "es": "Operación fallida", "de": "Vorgang fehlgeschlagen"},

    # Common labels
    "Name": {"fr": "Nom", "ar": "الاسم", "es": "Nombre", "de": "Name"},
    "Email": {"fr": "E-mail", "ar": "البريد الإلكتروني", "es": "Correo electrónico", "de": "E-Mail"},
    "Description": {"fr": "Description", "ar": "الوصف", "es": "Descripción", "de": "Beschreibung"},
    "Status": {"fr": "Statut", "ar": "الحالة", "es": "Estado", "de": "Status"},
    "Created": {"fr": "Créé", "ar": "تم الإنشاء", "es": "Creado", "de": "Erstellt"},
    "Created at": {"fr": "Créé le", "ar": "تاريخ الإنشاء", "es": "Creado el", "de": "Erstellt am"},
    "Updated": {"fr": "Mis à jour", "ar": "تم التحديث", "es": "Actualizado", "de": "Aktualisiert"},
    "Type": {"fr": "Type", "ar": "النوع", "es": "Tipo", "de": "Typ"},
    "Size": {"fr": "Taille", "ar": "الحجم", "es": "Tamaño", "de": "Größe"},
    "Action": {"fr": "Action", "ar": "الإجراء", "es": "Acción", "de": "Aktion"},
    "Reason": {"fr": "Raison", "ar": "السبب", "es": "Razón", "de": "Grund"},
    "Metadata": {"fr": "Métadonnées", "ar": "البيانات الوصفية", "es": "Metadatos", "de": "Metadaten"},
    "Tags": {"fr": "Étiquettes", "ar": "الوسوم", "es": "Etiquetas", "de": "Tags"},
    "Filter": {"fr": "Filtrer", "ar": "تصفية", "es": "Filtrar", "de": "Filtern"},
    "All": {"fr": "Tous", "ar": "الكل", "es": "Todos", "de": "Alle"},
    "Active": {"fr": "Actif", "ar": "نشط", "es": "Activo", "de": "Aktiv"},
    "Pending": {"fr": "En attente", "ar": "قيد الانتظار", "es": "Pendiente", "de": "Ausstehend"},
    "Suspended": {"fr": "Suspendu", "ar": "موقوف", "es": "Suspendido", "de": "Gesperrt"},
    "Expired": {"fr": "Expiré", "ar": "منتهي الصلاحية", "es": "Expirado", "de": "Abgelaufen"},
    "Accepted": {"fr": "Accepté", "ar": "مقبول", "es": "Aceptado", "de": "Akzeptiert"},
    "Completed": {"fr": "Terminé", "ar": "مكتمل", "es": "Completado", "de": "Abgeschlossen"},
    "Failed": {"fr": "Échec", "ar": "فشل", "es": "Fallido", "de": "Fehlgeschlagen"},
    "Running": {"fr": "En cours", "ar": "قيد التشغيل", "es": "En ejecución", "de": "Läuft"},
    "Waiting": {"fr": "En attente", "ar": "بانتظار", "es": "Esperando", "de": "Wartend"},
    "Paused": {"fr": "En pause", "ar": "متوقف مؤقتاً", "es": "Pausado", "de": "Pausiert"},
    "Live": {"fr": "En direct", "ar": "مباشر", "es": "En vivo", "de": "Live"},
    "Canceled": {"fr": "Annulé", "ar": "ملغى", "es": "Cancelado", "de": "Abgebrochen"},

    # Document states
    "Draft": {"fr": "Brouillon", "ar": "مسودة", "es": "Borrador", "de": "Entwurf"},
    "Record": {"fr": "Document officiel", "ar": "سجل", "es": "Registro", "de": "Akte"},
    "Archived": {"fr": "Archivé", "ar": "مؤرشف", "es": "Archivado", "de": "Archiviert"},
    "Disposed": {"fr": "Éliminé", "ar": "تم التخلص منه", "es": "Eliminado", "de": "Vernichtet"},

    # Domain terms
    "Documents": {"fr": "Documents", "ar": "المستندات", "es": "Documentos", "de": "Dokumente"},
    "Document": {"fr": "Document", "ar": "مستند", "es": "Documento", "de": "Dokument"},
    "Dashboard": {"fr": "Tableau de bord", "ar": "لوحة التحكم", "es": "Panel", "de": "Dashboard"},
    "Workspace": {"fr": "Espace de travail", "ar": "مساحة العمل", "es": "Espacio de trabajo", "de": "Arbeitsbereich"},
    "Administration": {"fr": "Administration", "ar": "الإدارة", "es": "Administración", "de": "Verwaltung"},
    "Governance": {"fr": "Gouvernance", "ar": "الحوكمة", "es": "Gobernanza", "de": "Governance"},
    "Platform": {"fr": "Plateforme", "ar": "المنصة", "es": "Plataforma", "de": "Plattform"},
    "Platform Dashboard": {"fr": "Tableau de bord de la plateforme", "ar": "لوحة تحكم المنصة", "es": "Panel de plataforma", "de": "Plattform-Dashboard"},
    "Alerts": {"fr": "Alertes", "ar": "التنبيهات", "es": "Alertas", "de": "Warnungen"},
    "Settings": {"fr": "Paramètres", "ar": "الإعدادات", "es": "Configuración", "de": "Einstellungen"},
    "Security": {"fr": "Sécurité", "ar": "الأمان", "es": "Seguridad", "de": "Sicherheit"},
    "Profile": {"fr": "Profil", "ar": "الملف الشخصي", "es": "Perfil", "de": "Profil"},
    "Users": {"fr": "Utilisateurs", "ar": "المستخدمون", "es": "Usuarios", "de": "Benutzer"},
    "Roles": {"fr": "Rôles", "ar": "الأدوار", "es": "Roles", "de": "Rollen"},
    "Groups": {"fr": "Groupes", "ar": "المجموعات", "es": "Grupos", "de": "Gruppen"},
    "Audit": {"fr": "Audit", "ar": "تدقيق", "es": "Auditoría", "de": "Audit"},
    "Billing": {"fr": "Facturation", "ar": "الفوترة", "es": "Facturación", "de": "Abrechnung"},
    "Notifications": {"fr": "Notifications", "ar": "الإشعارات", "es": "Notificaciones", "de": "Benachrichtigungen"},
    "Retention": {"fr": "Conservation", "ar": "الاحتفاظ", "es": "Retención", "de": "Aufbewahrung"},
    "Legal Hold": {"fr": "Sous main courante", "ar": "حجز قانوني", "es": "Retención legal", "de": "Rechtliche Aufbewahrung"},
    "legal hold": {"fr": "sous main courante", "ar": "حجز قانوني", "es": "retención legal", "de": "rechtliche Aufbewahrung"},
    "Classification": {"fr": "Classification", "ar": "التصنيف", "es": "Clasificación", "de": "Klassifizierung"},
    "classification": {"fr": "classification", "ar": "التصنيف", "es": "clasificación", "de": "Klassifizierung"},
    "Policies": {"fr": "Politiques", "ar": "السياسات", "es": "Políticas", "de": "Richtlinien"},
    "Workflows": {"fr": "Flux de travail", "ar": "سير العمل", "es": "Flujos de trabajo", "de": "Workflows"},
    "Invitations": {"fr": "Invitations", "ar": "الدعوات", "es": "Invitaciones", "de": "Einladungen"},
    "Devices": {"fr": "Appareils", "ar": "الأجهزة", "es": "Dispositivos", "de": "Geräte"},
    "Webhooks": {"fr": "Webhooks", "ar": "روابط الويب", "es": "Webhooks", "de": "Webhooks"},
    "API Keys": {"fr": "Clés API", "ar": "مفاتيح API", "es": "Claves API", "de": "API-Schlüssel"},
    "Service Accounts": {"fr": "Comptes de service", "ar": "حسابات الخدمة", "es": "Cuentas de servicio", "de": "Service-Konten"},
    "Vocabularies": {"fr": "Vocabulaires", "ar": "المفردات", "es": "Vocabularios", "de": "Vokabulare"},
    "Metadata Schemas": {"fr": "Schémas de métadonnées", "ar": "مخططات البيانات الوصفية", "es": "Esquemas de metadatos", "de": "Metadaten-Schemata"},
    "SSO Providers": {"fr": "Fournisseurs SSO", "ar": "موفرو SSO", "es": "Proveedores SSO", "de": "SSO-Anbieter"},
    "Anomalies": {"fr": "Anomalies", "ar": "الشذوذات", "es": "Anomalías", "de": "Anomalien"},
    "Jobs": {"fr": "Tâches", "ar": "المهام", "es": "Trabajos", "de": "Aufträge"},
    "Tenants": {"fr": "Locataires", "ar": "المستأجرون", "es": "Inquilinos", "de": "Mandanten"},
    "Dispositions": {"fr": "Éliminations", "ar": "التخلص", "es": "Eliminaciones", "de": "Vernichtungen"},
    "Dual Control": {"fr": "Contrôle double", "ar": "التحكم المزدوج", "es": "Control dual", "de": "Doppelkontrolle"},
    "Recertification": {"fr": "Recertification", "ar": "إعادة الشهادة", "es": "Recertificación", "de": "Rezertifizierung"},
    "Locales": {"fr": "Langues", "ar": "اللغات", "es": "Idiomas", "de": "Sprachen"},
    "Notification Routing": {"fr": "Routage des notifications", "ar": "توجيه الإشعارات", "es": "Enrutamiento de notificaciones", "de": "Benachrichtigungsrouting"},
    "Folders": {"fr": "Dossiers", "ar": "المجلدات", "es": "Carpetas", "de": "Ordner"},
    "Evidence Packages": {"fr": "Dossiers de preuves", "ar": "حزم الأدلة", "es": "Paquetes de evidencia", "de": "Beweispakete"},
    "Break-glass": {"fr": "Accès d'urgence", "ar": "وصول طوارئ", "es": "Acceso de emergencia", "de": "Notfallzugriff"},

    # Email subjects
    "New device login detected": {"fr": "Nouvelle connexion détectée", "ar": "تم رصد تسجيل دخول من جهاز جديد", "es": "Nuevo inicio de sesión detectado", "de": "Neue Geräteanmeldung erkannt"},
    "Your password was changed": {"fr": "Votre mot de passe a été modifié", "ar": "تم تغيير كلمة المرور الخاصة بك", "es": "Su contraseña ha sido cambiada", "de": "Ihr Passwort wurde geändert"},

    # Error pages
    "Page not found": {"fr": "Page introuvable", "ar": "الصفحة غير موجودة", "es": "Página no encontrada", "de": "Seite nicht gefunden"},
    "Something went wrong": {"fr": "Une erreur s'est produite", "ar": "حدث خطأ ما", "es": "Algo salió mal", "de": "Etwas ist schiefgelaufen"},
    "You're offline": {"fr": "Vous êtes hors ligne", "ar": "أنت غير متصل", "es": "Estás sin conexión", "de": "Sie sind offline"},
    "Session expired": {"fr": "Session expirée", "ar": "انتهت الجلسة", "es": "Sesión expirada", "de": "Sitzung abgelaufen"},
    "Access denied": {"fr": "Accès refusé", "ar": "تم رفض الوصول", "es": "Acceso denegado", "de": "Zugriff verweigert"},
    "Critical error": {"fr": "Erreur critique", "ar": "خطأ حرج", "es": "Error crítico", "de": "Kritischer Fehler"},

    # Payment
    "Crypto": {"fr": "Crypto", "ar": "عملة رقمية", "es": "Cripto", "de": "Krypto"},
    "Card": {"fr": "Carte", "ar": "بطاقة", "es": "Tarjeta", "de": "Karte"},
    "Plan": {"fr": "Plan", "ar": "الخطة", "es": "Plan", "de": "Plan"},
    "Period": {"fr": "Période", "ar": "الفترة", "es": "Período", "de": "Zeitraum"},
    "Seats": {"fr": "Sièges", "ar": "المقاعد", "es": "Asientos", "de": "Sitze"},
    "Storage": {"fr": "Stockage", "ar": "التخزين", "es": "Almacenamiento", "de": "Speicher"},
    "monthly": {"fr": "mensuel", "ar": "شهري", "es": "mensual", "de": "monatlich"},
    "annual": {"fr": "annuel", "ar": "سنوي", "es": "anual", "de": "jährlich"},
    "Monthly": {"fr": "Mensuel", "ar": "شهري", "es": "Mensual", "de": "Monatlich"},
    "Annual": {"fr": "Annuel", "ar": "سنوي", "es": "Anual", "de": "Jährlich"},
}

# Phrase patterns — translate substrings within longer strings
PHRASE_TRANSLATIONS = {
    # fr
    "fr": {
        "No ": "Aucun ",
        "not found": "introuvable",
        "required": "requis",
        "optional": "facultatif",
        "successfully": "avec succès",
        "has been": "a été",
        "are you sure": "êtes-vous sûr",
        "confirm": "confirmer",
        "delete": "supprimer",
        "create": "créer",
        "update": "mettre à jour",
        "settings": "paramètres",
        "profile": "profil",
        "password": "mot de passe",
        "token": "jeton",
        "secret": "secret",
        "key": "clé",
        "url": "URL",
        "event": "événement",
        "events": "événements",
        "actor": "acteur",
        "resource": "ressource",
        "result": "résultat",
        "sequence": "séquence",
        "hash": "hachage",
        "chain": "chaîne",
        "intact": "intact",
        "broken": "brisée",
        "verify": "vérifier",
        "verification": "vérification",
        "export": "exporter",
        "import": "importer",
        "scan": "analyser",
        "detect": "détecter",
        "summary": "résumé",
        "suggestion": "suggestion",
        "risk": "risque",
        "duplicate": "doublon",
        "share": "partage",
        "preview": "aperçu",
        "version": "version",
        "comment": "commentaire",
        "owner": "propriétaire",
        "lock": "verrouiller",
        "unlock": "déverrouiller",
        "redact": "expurger",
        "encrypt": "chiffrer",
        "decrypt": "déchiffrer",
    },
    "ar": {
        "No ": "لا يوجد ",
        "not found": "غير موجود",
        "required": "مطلوب",
        "optional": "اختياري",
        "successfully": "بنجاح",
        "settings": "الإعدادات",
        "password": "كلمة المرور",
        "token": "رمز",
        "key": "مفتاح",
        "event": "حدث",
        "events": "أحداث",
        "actor": "الفاعل",
        "resource": "المورد",
        "result": "النتيجة",
        "verify": "تحقق",
        "export": "تصدير",
        "scan": "فحص",
        "summary": "ملخص",
        "share": "مشاركة",
        "preview": "معاينة",
        "version": "إصدار",
        "comment": "تعليق",
        "owner": "المالك",
    },
    "es": {
        "No ": "No hay ",
        "not found": "no encontrado",
        "required": "requerido",
        "optional": "opcional",
        "successfully": "exitosamente",
        "settings": "configuración",
        "password": "contraseña",
        "token": "token",
        "key": "clave",
        "event": "evento",
        "events": "eventos",
        "actor": "actor",
        "resource": "recurso",
        "result": "resultado",
        "verify": "verificar",
        "export": "exportar",
        "scan": "escanear",
        "summary": "resumen",
        "share": "compartir",
        "preview": "vista previa",
        "version": "versión",
        "comment": "comentario",
        "owner": "propietario",
    },
    "de": {
        "No ": "Keine ",
        "not found": "nicht gefunden",
        "required": "erforderlich",
        "optional": "optional",
        "successfully": "erfolgreich",
        "settings": "Einstellungen",
        "password": "Passwort",
        "token": "Token",
        "key": "Schlüssel",
        "event": "Ereignis",
        "events": "Ereignisse",
        "actor": "Akteur",
        "resource": "Ressource",
        "result": "Ergebnis",
        "verify": "verifizieren",
        "export": "exportieren",
        "scan": "scannen",
        "summary": "Zusammenfassung",
        "share": "Freigabe",
        "preview": "Vorschau",
        "version": "Version",
        "comment": "Kommentar",
        "owner": "Besitzer",
    },
}


def translate_value(en_value: str, locale: str) -> str:
    """Translate an English value to the target locale."""
    # 1. Exact match in COMMON_TRANSLATIONS
    if en_value in COMMON_TRANSLATIONS:
        return COMMON_TRANSLATIONS[en_value][locale]
    
    # 2. Case-insensitive match
    for en_key, translations in COMMON_TRANSLATIONS.items():
        if en_value.lower() == en_key.lower():
            return translations[locale]
    
    # 3. For values with interpolation params, try to translate the text around them
    # Pattern: "Some text {param} more text"
    if '{' in en_value and '}' in en_value:
        # Extract the text parts (outside {params})
        parts = re.split(r'(\{[^}]+\})', en_value)
        translated_parts = []
        for part in parts:
            if part.startswith('{') and part.endswith('}'):
                translated_parts.append(part)  # keep param as-is
            else:
                # Try exact match on the part
                stripped = part.strip()
                if stripped in COMMON_TRANSLATIONS:
                    translated_parts.append(part.replace(stripped, COMMON_TRANSLATIONS[stripped][locale]))
                else:
                    translated_parts.append(part)
        result = ''.join(translated_parts)
        if result != en_value:
            return result
    
    # 4. Try phrase-level substitution
    result = en_value
    phrases = PHRASE_TRANSLATIONS.get(locale, {})
    for en_phrase, loc_phrase in sorted(phrases.items(), key=lambda x: -len(x[0])):
        result = result.replace(en_phrase, loc_phrase)
    
    if result != en_value:
        return result
    
    # 5. No translation found — keep English
    return en_value


def translate_locale(locale: str):
    """Translate all English-placeholder values in a locale file."""
    en_path = MESSAGES_DIR / 'en.json'
    loc_path = MESSAGES_DIR / f'{locale}.json'
    
    with open(en_path) as f:
        en_data = json.load(f)
    with open(loc_path) as f:
        loc_data = json.load(f)
    
    translated = 0
    skipped = 0
    
    def walk_and_translate(en_obj: Any, loc_obj: Any, path: str = "") -> Any:
        nonlocal translated, skipped
        if isinstance(en_obj, dict):
            if not isinstance(loc_obj, dict):
                return en_obj
            result = {}
            for key in en_obj:
                en_val = en_obj[key]
                loc_val = loc_obj.get(key)
                if loc_val is None:
                    result[key] = en_val  # key doesn't exist in locale — copy English
                    continue
                result[key] = walk_and_translate(en_val, loc_val, f"{path}.{key}")
            return result
        elif isinstance(en_obj, str):
            # If the locale value is the same as English, try to translate
            if loc_obj == en_obj:
                translated_val = translate_value(en_obj, locale)
                if translated_val != en_obj:
                    translated += 1
                    return translated_val
                else:
                    skipped += 1
                    return loc_obj  # keep English (no translation available)
            else:
                # Already translated — keep existing
                return loc_obj
        else:
            return loc_obj  # numbers, booleans — keep as-is
    
    result = walk_and_translate(en_data, loc_data)
    
    with open(loc_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
        f.write('\n')
    
    return translated, skipped


def main():
    print("🌐 Smart EDMS — AI-Assisted Locale Translation\n")
    
    for locale in ['fr', 'ar', 'es', 'de']:
        translated, skipped = translate_locale(locale)
        print(f"  {locale}: {translated} translated, {skipped} kept English (no dict match)")
    
    print("\n✅ Translation complete.")
    print("Note: Values not in the translation dictionary remain in English.")
    print("A native-speaker review pass is recommended for production.")


if __name__ == '__main__':
    main()
