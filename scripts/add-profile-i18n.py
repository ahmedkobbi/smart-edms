#!/usr/bin/env python3
"""
Add settings profile + common.edit keys to all 5 locale files.
"""
import json
from pathlib import Path

MESSAGES_DIR = Path(__file__).parent.parent / "messages"

STRINGS = {
    "en": {
        "common": {"edit": "Edit"},
        "settings": {
            "name": "Name",
            "namePlaceholder": "Your full name",
            "email": "Email",
            "jobTitle": "Job title",
            "jobTitlePlaceholder": "e.g. Senior Compliance Officer",
            "department": "Department",
            "departmentPlaceholder": "e.g. Legal Affairs",
            "avatarUrl": "Avatar URL",
            "avatarUrlHelp": "A publicly accessible image URL. Leave empty for default avatar.",
            "status": "Status",
            "created": "Account created",
            "lastLogin": "Last login",
            "tenant": "Tenant",
            "tenantDesc": "The organization this account belongs to.",
            "profileDesc": "Your account information. Click Edit to update your details.",
            "profileUpdated": "Profile updated",
            "profileUpdatedDesc": "Your changes have been saved.",
            "profileUpdateFailed": "Failed to update profile",
        },
    },
    "fr": {
        "common": {"edit": "Modifier"},
        "settings": {
            "name": "Nom",
            "namePlaceholder": "Votre nom complet",
            "email": "E-mail",
            "jobTitle": "Titre du poste",
            "jobTitlePlaceholder": "ex. Responsable Conformité",
            "department": "Département",
            "departmentPlaceholder": "ex. Affaires Juridiques",
            "avatarUrl": "URL de l'avatar",
            "avatarUrlHelp": "Une URL d'image accessible publiquement. Laisser vide pour l'avatar par défaut.",
            "status": "Statut",
            "created": "Compte créé",
            "lastLogin": "Dernière connexion",
            "tenant": "Organisation",
            "tenantDesc": "L'organisation à laquelle appartient ce compte.",
            "profileDesc": "Vos informations de compte. Cliquez sur Modifier pour mettre à jour vos détails.",
            "profileUpdated": "Profil mis à jour",
            "profileUpdatedDesc": "Vos modifications ont été enregistrées.",
            "profileUpdateFailed": "Échec de la mise à jour du profil",
        },
    },
    "ar": {
        "common": {"edit": "تعديل"},
        "settings": {
            "name": "الاسم",
            "namePlaceholder": "اسمك الكامل",
            "email": "البريد الإلكتروني",
            "jobTitle": "المسمى الوظيفي",
            "jobTitlePlaceholder": "مثال: مسؤول الامتثال الأول",
            "department": "القسم",
            "departmentPlaceholder": "مثال: الشؤون القانونية",
            "avatarUrl": "رابط الصورة الرمزية",
            "avatarUrlHelp": "رابط صورة قابل للوصول públicamente. اتركه فارغاً للصورة الافتراضية.",
            "status": "الحالة",
            "created": "تاريخ إنشاء الحساب",
            "lastLogin": "آخر تسجيل دخول",
            "tenant": "المؤسسة",
            "tenantDesc": "المؤسسة التي ينتمي إليها هذا الحساب.",
            "profileDesc": "معلومات حسابك. انقر على تعديل لتحديث بياناتك.",
            "profileUpdated": "تم تحديث الملف الشخصي",
            "profileUpdatedDesc": "تم حفظ تغييراتك.",
            "profileUpdateFailed": "فشل تحديث الملف الشخصي",
        },
    },
    "es": {
        "common": {"edit": "Editar"},
        "settings": {
            "name": "Nombre",
            "namePlaceholder": "Su nombre completo",
            "email": "Correo electrónico",
            "jobTitle": "Cargo",
            "jobTitlePlaceholder": "ej. Oficial de Cumplimiento Senior",
            "department": "Departamento",
            "departmentPlaceholder": "ej. Asuntos Jurídicos",
            "avatarUrl": "URL del avatar",
            "avatarUrlHelp": "Una URL de imagen accesible públicamente. Dejar vacío para el avatar predeterminado.",
            "status": "Estado",
            "created": "Cuenta creada",
            "lastLogin": "Último inicio de sesión",
            "tenant": "Organización",
            "tenantDesc": "La organización a la que pertenece esta cuenta.",
            "profileDesc": "Información de su cuenta. Haga clic en Editar para actualizar sus datos.",
            "profileUpdated": "Perfil actualizado",
            "profileUpdatedDesc": "Sus cambios han sido guardados.",
            "profileUpdateFailed": "Error al actualizar el perfil",
        },
    },
    "de": {
        "common": {"edit": "Bearbeiten"},
        "settings": {
            "name": "Name",
            "namePlaceholder": "Ihr vollständiger Name",
            "email": "E-Mail",
            "jobTitle": "Position",
            "jobTitlePlaceholder": "z.B. Senior Compliance Officer",
            "department": "Abteilung",
            "departmentPlaceholder": "z.B. Rechtsabteilung",
            "avatarUrl": "Avatar-URL",
            "avatarUrlHelp": "Eine öffentlich zugängliche Bild-URL. Leer lassen für Standard-Avatar.",
            "status": "Status",
            "created": "Konto erstellt",
            "lastLogin": "Letzte Anmeldung",
            "tenant": "Organisation",
            "tenantDesc": "Die Organisation, zu der dieses Konto gehört.",
            "profileDesc": "Ihre Kontoinformationen. Klicken Sie auf Bearbeiten, um Ihre Daten zu aktualisieren.",
            "profileUpdated": "Profil aktualisiert",
            "profileUpdatedDesc": "Ihre Änderungen wurden gespeichert.",
            "profileUpdateFailed": "Profilaktualisierung fehlgeschlagen",
        },
    },
}

def merge(target, source):
    for k, v in source.items():
        if isinstance(v, dict):
            if k not in target or not isinstance(target[k], dict):
                target[k] = {}
            merge(target[k], v)
        else:
            if k not in target:
                target[k] = v

for loc, strings in STRINGS.items():
    path = MESSAGES_DIR / f"{loc}.json"
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    merge(data, strings)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f"[{loc}] added profile i18n keys")
