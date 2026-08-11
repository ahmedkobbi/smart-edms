#!/usr/bin/env python3
"""
Generate comprehensive audit event labels for all 5 locales.

Creates a TypeScript file with ~100 event types × 5 locales (en, fr, ar, es, de).
Each label is a human-readable description of the audit event.

The labels are organized by category (auth, document, admin, etc.) and
use professional enterprise terminology appropriate for audit logs.
"""
from pathlib import Path

OUTPUT = Path(__file__).parent.parent / "src" / "components" / "audit" / "audit-event-labels.ts"

# Event type → { locale → label }
LABELS = {
    # === Authentication ===
    "auth.login": {"en": "Sign in", "fr": "Connexion", "ar": "تسجيل الدخول", "es": "Inicio de sesión", "de": "Anmeldung"},
    "auth.login.deny": {"en": "Sign in denied", "fr": "Connexion refusée", "ar": "رفض تسجيل الدخول", "es": "Inicio de sesión denegado", "de": "Anmeldung verweigert"},
    "auth.logout": {"en": "Sign out", "fr": "Déconnexion", "ar": "تسجيل الخروج", "es": "Cierre de sesión", "de": "Abmeldung"},
    "auth.password_reset": {"en": "Password reset", "fr": "Réinitialisation du mot de passe", "ar": "إعادة تعيين كلمة المرور", "es": "Restablecimiento de contraseña", "de": "Passwortzurücksetzung"},
    "auth.stepup": {"en": "Step-up authentication", "fr": "Authentification renforcée", "ar": "مصادقة معززة", "es": "Autenticación reforzada", "de": "Step-up-Authentifizierung"},
    "auth.stepup.success": {"en": "Step-up authentication succeeded", "fr": "Authentification renforcée réussie", "ar": "نجحت المصادقة المعززة", "es": "Autenticación reforzada exitosa", "de": "Step-up-Authentifizierung erfolgreich"},
    "auth.concurrent_session_warning": {"en": "Concurrent session warning", "fr": "Avertissement de session simultanée", "ar": "تحذير جلسة متزامنة", "es": "Advertencia de sesión concurrente", "de": "Warnung zu gleichzeitigen Sitzungen"},

    # === Authorization ===
    "authz.deny": {"en": "Access denied", "fr": "Accès refusé", "ar": "رفض الوصول", "es": "Acceso denegado", "de": "Zugriff verweigert"},
    "policy.deny": {"en": "Policy denied access", "fr": "Politique a refusé l'accès", "ar": "رفضت السياسة الوصول", "es": "Política denegó el acceso", "de": "Richtlinie verweigert Zugriff"},
    "policy.violation": {"en": "Policy violation", "fr": "Violation de politique", "ar": "انتهاك سياسة", "es": "Violación de política", "de": "Richtlinienverletzung"},

    # === Document lifecycle ===
    "document.read": {"en": "Document viewed", "fr": "Document consulté", "ar": "عرض المستند", "es": "Documento visto", "de": "Dokument angesehen"},
    "document.create": {"en": "Document created", "fr": "Document créé", "ar": "إنشاء مستند", "es": "Documento creado", "de": "Dokument erstellt"},
    "document.upload": {"en": "Document uploaded", "fr": "Document téléversé", "ar": "رفع مستند", "es": "Documento subido", "de": "Dokument hochgeladen"},
    "document.update": {"en": "Document updated", "fr": "Document mis à jour", "ar": "تحديث المستند", "es": "Documento actualizado", "de": "Dokument aktualisiert"},
    "document.delete": {"en": "Document deleted", "fr": "Document supprimé", "ar": "حذف المستند", "es": "Documento eliminado", "de": "Dokument gelöscht"},
    "document.download": {"en": "Document downloaded", "fr": "Document téléchargé", "ar": "تنزيل المستند", "es": "Documento descargado", "de": "Dokument heruntergeladen"},
    "document.preview": {"en": "Document previewed", "fr": "Document prévisualisé", "ar": "معاينة المستند", "es": "Documento previsualizado", "de": "Dokument vorgeschaut"},
    "document.previewed": {"en": "Document previewed", "fr": "Document prévisualisé", "ar": "معاينة المستند", "es": "Documento previsualizado", "de": "Dokument vorgeschaut"},
    "document.redact": {"en": "Document redacted", "fr": "Document rédigé", "ar": "تنقيح المستند", "es": "Documento redactado", "de": "Dokument geschwärzt"},
    "document.redacted": {"en": "Document redacted", "fr": "Document rédigé", "ar": "تنقيح المستند", "es": "Documento redactado", "de": "Dokument geschwärzt"},
    "document.lock": {"en": "Document locked", "fr": "Document verrouillé", "ar": "قفل المستند", "es": "Documento bloqueado", "de": "Dokument gesperrt"},
    "document.unlock": {"en": "Document unlocked", "fr": "Document déverrouillé", "ar": "فتح المستند", "es": "Documento desbloqueado", "de": "Dokument entsperrt"},
    "document.classify": {"en": "Classification changed", "fr": "Classification modifiée", "ar": "تغيير التصنيف", "es": "Clasificación cambiada", "de": "Klassifizierung geändert"},
    "document.crypto_shred": {"en": "Document crypto-shredded", "fr": "Document détruit cryptographiquement", "ar": "تم إتلاف المستند تشفيرياً", "es": "Documento destruido criptográficamente", "de": "Dokument krypto-gelöscht"},
    "document.close": {"en": "Document closed", "fr": "Document clôturé", "ar": "إغلاق المستند", "es": "Documento cerrado", "de": "Dokument geschlossen"},
    "document.copy": {"en": "Document copied", "fr": "Document copié", "ar": "نسخ المستند", "es": "Documento copiado", "de": "Dokument kopiert"},
    "document.copied": {"en": "Document copied", "fr": "Document copié", "ar": "نسخ المستند", "es": "Documento copiado", "de": "Dokument kopiert"},
    "document.version.create": {"en": "New version created", "fr": "Nouvelle version créée", "ar": "إنشاء إصدار جديد", "es": "Nueva versión creada", "de": "Neue Version erstellt"},
    "document.version.restore": {"en": "Version restored", "fr": "Version restaurée", "ar": "استعادة الإصدار", "es": "Versión restaurada", "de": "Version wiederhergestellt"},
    "document.version.restored": {"en": "Version restored", "fr": "Version restaurée", "ar": "استعادة الإصدار", "es": "Versión restaurada", "de": "Version wiederhergestellt"},
    "document.record.declare": {"en": "Record declared", "fr": "Enregistrement déclaré", "ar": "إعلان السجل", "es": "Registro declarado", "de": "Akte deklariert"},
    "document.record.declared": {"en": "Record declared", "fr": "Enregistrement déclaré", "ar": "إعلان السجل", "es": "Registro declarado", "de": "Akte deklariert"},

    # === Sharing ===
    "share.create": {"en": "Share link created", "fr": "Lien de partage créé", "ar": "إنشاء رابط مشاركة", "es": "Enlace de compartir creado", "de": "Freigabelink erstellt"},
    "share.view": {"en": "Share viewed", "fr": "Partage consulté", "ar": "عرض المشاركة", "es": "Compartido visto", "de": "Freigabe angesehen"},
    "share.revoke": {"en": "Share revoked", "fr": "Partage révoqué", "ar": "إلغاء المشاركة", "es": "Compartido revocado", "de": "Freigabe widerrufen"},
    "share.revoked": {"en": "Share revoked", "fr": "Partage révoqué", "ar": "إلغاء المشاركة", "es": "Compartido revocado", "de": "Freigabe widerrufen"},

    # === Workflow ===
    "workflow.create": {"en": "Workflow created", "fr": "Flux de travail créé", "ar": "إنشاء سير عمل", "es": "Flujo de trabajo creado", "de": "Workflow erstellt"},
    "workflow.approve": {"en": "Workflow decision", "fr": "Décision de flux", "ar": "قرار سير العمل", "es": "Decisión de flujo", "de": "Workflow-Entscheidung"},
    "workflow.delegate": {"en": "Workflow delegated", "fr": "Flux délégué", "ar": "تفويض سير العمل", "es": "Flujo delegado", "de": "Workflow delegiert"},
    "workflow.escalation.run": {"en": "Workflow escalation processed", "fr": "Escalade de flux traitée", "ar": "معالجة تصعيد سير العمل", "es": "Escalada de flujo procesada", "de": "Workflow-Eskalation verarbeitet"},

    # === Admin — Users ===
    "admin.user.create": {"en": "User created", "fr": "Utilisateur créé", "ar": "إنشاء مستخدم", "es": "Usuario creado", "de": "Benutzer erstellt"},
    "admin.user.update": {"en": "User updated", "fr": "Utilisateur mis à jour", "ar": "تحديث المستخدم", "es": "Usuario actualizado", "de": "Benutzer aktualisiert"},
    "admin.user.suspend": {"en": "User suspended", "fr": "Utilisateur suspendu", "ar": "تعليق المستخدم", "es": "Usuario suspendido", "de": "Benutzer gesperrt"},

    # === Admin — Roles & Groups ===
    "admin.role.create": {"en": "Role created", "fr": "Rôle créé", "ar": "إنشاء دور", "es": "Rol creado", "de": "Rolle erstellt"},
    "admin.role.update": {"en": "Role updated", "fr": "Rôle mis à jour", "ar": "تحديث الدور", "es": "Rol actualizado", "de": "Rolle aktualisiert"},
    "admin.role.delete": {"en": "Role deleted", "fr": "Rôle supprimé", "ar": "حذف الدور", "es": "Rol eliminado", "de": "Rolle gelöscht"},
    "admin.group.create": {"en": "Group created", "fr": "Groupe créé", "ar": "إنشاء مجموعة", "es": "Grupo creado", "de": "Gruppe erstellt"},

    # === Admin — Policies & Classifications ===
    "admin.policy.create": {"en": "Policy created", "fr": "Politique créée", "ar": "إنشاء سياسة", "es": "Política creada", "de": "Richtlinie erstellt"},
    "admin.policy.update": {"en": "Policy updated", "fr": "Politique mise à jour", "ar": "تحديث السياسة", "es": "Política actualizada", "de": "Richtlinie aktualisiert"},
    "admin.policy.delete": {"en": "Policy deleted", "fr": "Politique supprimée", "ar": "حذف السياسة", "es": "Política eliminada", "de": "Richtlinie gelöscht"},
    "admin.classification.create": {"en": "Classification created", "fr": "Classification créée", "ar": "إنشاء تصنيف", "es": "Clasificación creada", "de": "Klassifizierung erstellt"},
    "admin.classification.update": {"en": "Classification updated", "fr": "Classification mise à jour", "ar": "تحديث التصنيف", "es": "Clasificación actualizada", "de": "Klassifizierung aktualisiert"},
    "admin.classification.delete": {"en": "Classification deleted", "fr": "Classification supprimée", "ar": "حذف التصنيف", "es": "Clasificación eliminada", "de": "Klassifizierung gelöscht"},
    "admin.classification.localization.upsert": {"en": "Classification localized", "fr": "Classification localisée", "ar": "توطين التصنيف", "es": "Clasificación localizada", "de": "Klassifizierung lokalisiert"},
    "admin.classification.localization.delete": {"en": "Classification localization removed", "fr": "Localisation de classification supprimée", "ar": "إزالة توطين التصنيف", "es": "Localización de clasificación eliminada", "de": "Klassifizierung-Lokalisierung entfernt"},

    # === Admin — Retention & Legal Hold ===
    "admin.retention.create": {"en": "Retention schedule created", "fr": "Calendrier de conservation créé", "ar": "إنشاء جدول الاحتفاظ", "es": "Programa de retención creado", "de": "Aufbewahrungsplan erstellt"},
    "admin.retention.update": {"en": "Retention schedule updated", "fr": "Calendrier mis à jour", "ar": "تحديث جدول الاحتفاظ", "es": "Programa actualizado", "de": "Aufbewahrungsplan aktualisiert"},
    "admin.retention.delete": {"en": "Retention schedule deleted", "fr": "Calendrier supprimé", "ar": "حذف جدول الاحتفاظ", "es": "Programa eliminado", "de": "Aufbewahrungsplan gelöscht"},
    "admin.legalhold.create": {"en": "Legal hold applied", "fr": "Conservation légale appliquée", "ar": "تطبيق التعليق القانوني", "es": "Retención legal aplicada", "de": "Rechtliche Aufbewahrung angewendet"},
    "admin.legalhold.update": {"en": "Legal hold updated", "fr": "Conservation mise à jour", "ar": "تحديث التعليق القانوني", "es": "Retención actualizada", "de": "Aufbewahrung aktualisiert"},
    "admin.legalhold.release": {"en": "Legal hold released", "fr": "Conservation levée", "ar": "رفع التعليق القانوني", "es": "Retención liberada", "de": "Aufbewahrung aufgehoben"},

    # === Admin — Dispositions ===
    "disposition.create": {"en": "Disposition requested", "fr": "Disposition demandée", "ar": "طلب التصرف", "es": "Disposición solicitada", "de": "Disposition angefordert"},
    "disposition.requested": {"en": "Disposition requested", "fr": "Disposition demandée", "ar": "طلب التصرف", "es": "Disposición solicitada", "de": "Disposition angefordert"},
    "disposition.approve": {"en": "Disposition approved", "fr": "Disposition approuvée", "ar": "موافقة على التصرف", "es": "Disposición aprobada", "de": "Disposition genehmigt"},

    # === Admin — Integrations ===
    "admin.apikey.create": {"en": "API key created", "fr": "Clé API créée", "ar": "إنشاء مفتاح API", "es": "Clave API creada", "de": "API-Schlüssel erstellt"},
    "admin.apikey.revoke": {"en": "API key revoked", "fr": "Clé API révoquée", "ar": "إلغاء مفتاح API", "es": "Clave API revocada", "de": "API-Schlüssel widerrufen"},
    "admin.service-account.create": {"en": "Service account created", "fr": "Compte de service créé", "ar": "إنشاء حساب خدمة", "es": "Cuenta de servicio creada", "de": "Servicekonto erstellt"},
    "admin.service-account.revoke": {"en": "Service account revoked", "fr": "Compte de service révoqué", "ar": "إلغاء حساب خدمة", "es": "Cuenta de servicio revocada", "de": "Servicekonto widerrufen"},
    "admin.webhook.create": {"en": "Webhook created", "fr": "Webhook créé", "ar": "إنشاء webhook", "es": "Webhook creado", "de": "Webhook erstellt"},
    "admin.sso.create": {"en": "SSO provider configured", "fr": "Fournisseur SSO configuré", "ar": "تكوين مزود SSO", "es": "Proveedor SSO configurado", "de": "SSO-Anbieter konfiguriert"},

    # === Admin — Tenant ===
    "admin.tenant.create": {"en": "Tenant created", "fr": "Organisation créée", "ar": "إنشاء مؤسسة", "es": "Organización creada", "de": "Organisation erstellt"},
    "admin.tenant.created": {"en": "Tenant created", "fr": "Organisation créée", "ar": "إنشاء مؤسسة", "es": "Organización creada", "de": "Organisation erstellt"},
    "admin.tenant.update": {"en": "Tenant settings updated", "fr": "Paramètres mis à jour", "ar": "تحديث إعدادات المؤسسة", "es": "Configuración actualizada", "de": "Einstellungen aktualisiert"},
    "admin.tenant.updated": {"en": "Tenant settings updated", "fr": "Paramètres mis à jour", "ar": "تحديث إعدادات المؤسسة", "es": "Configuración actualizada", "de": "Einstellungen aktualisiert"},

    # === Admin — Other ===
    "admin.key_rotation": {"en": "Key rotation initiated", "fr": "Rotation de clés initiée", "ar": "بدء تدوير المفاتيح", "es": "Rotación de claves iniciada", "de": "Schlüsselrotation eingeleitet"},
    "admin.key_rotation.completed": {"en": "Key rotation completed", "fr": "Rotation de clés terminée", "ar": "اكتمال تدوير المفاتيح", "es": "Rotación de claves completada", "de": "Schlüsselrotation abgeschlossen"},
    "admin.search.reindex": {"en": "Search index rebuilt", "fr": "Index de recherche reconstruit", "ar": "إعادة بناء فهرس البحث", "es": "Índice de búsqueda reconstruido", "de": "Suchindex neu aufgebaut"},
    "admin.metadata-schema.create": {"en": "Metadata schema created", "fr": "Schéma de métadonnées créé", "ar": "إنشاء مخطط بيانات وصفية", "es": "Esquema de metadatos creado", "de": "Metadatenschema erstellt"},
    "admin.vocab.create": {"en": "Vocabulary created", "fr": "Vocabulaire créé", "ar": "إنشاء مفردات", "es": "Vocabulario creado", "de": "Vokabular erstellt"},
    "admin.notification_routing.create": {"en": "Notification routing rule created", "fr": "Règle de routage créée", "ar": "إنشاء قاعدة توجيه الإشعارات", "es": "Regla de enrutamiento creada", "de": "Routing-Regel erstellt"},
    "admin.notification_routing.update": {"en": "Notification routing rule updated", "fr": "Règle de routage mise à jour", "ar": "تحديث قاعدة توجيه الإشعارات", "es": "Regla de enrutamiento actualizada", "de": "Routing-Regel aktualisiert"},
    "admin.notification_routing.delete": {"en": "Notification routing rule deleted", "fr": "Règle de routage supprimée", "ar": "حذف قاعدة توجيه الإشعارات", "es": "Regla de enrutamiento eliminada", "de": "Routing-Regel gelöscht"},

    # === Billing ===
    "admin.billing.update": {"en": "Billing updated", "fr": "Facturation mise à jour", "ar": "تحديث الفوترة", "es": "Facturación actualizada", "de": "Abrechnung aktualisiert"},
    "admin.billing.updated": {"en": "Billing updated", "fr": "Facturation mise à jour", "ar": "تحديث الفوترة", "es": "Facturación actualizada", "de": "Abrechnung aktualisiert"},

    # === Break-glass ===
    "breakglass.request": {"en": "Break-glass requested", "fr": "Accès d'urgence demandé", "ar": "طلب وصول طارئ", "es": "Acceso de emergencia solicitado", "de": "Notfallzugriff angefordert"},
    "breakglass.granted": {"en": "Break-glass granted", "fr": "Accès d'urgence accordé", "ar": "منح وصول طارئ", "es": "Acceso de emergencia concedido", "de": "Notfallzugriff gewährt"},

    # === Dual control ===
    "dual_control.request": {"en": "Dual-control requested", "fr": "Double contrôle demandé", "ar": "طلب رقابة مزدوجة", "es": "Doble control solicitado", "de": "Dual-Control angefordert"},
    "dual_control.decide": {"en": "Dual-control decision", "fr": "Décision de double contrôle", "ar": "قرار الرقابة المزدوجة", "es": "Decisión de doble control", "de": "Dual-Control-Entscheidung"},

    # === Recertification ===
    "recertification.create": {"en": "Recertification campaign created", "fr": "Campagne de recertification créée", "ar": "إنشاء حملة إعادة شهادة", "es": "Campaña de recertificación creada", "de": "Rezertifizierungskampagne erstellt"},

    # === Invitations ===
    "invitation.create": {"en": "Invitation sent", "fr": "Invitation envoyée", "ar": "إرسال دعوة", "es": "Invitación enviada", "de": "Einladung gesendet"},
    "invitation.sent": {"en": "Invitation sent", "fr": "Invitation envoyée", "ar": "إرسال دعوة", "es": "Invitación enviada", "de": "Einladung gesendet"},
    "invitation.accepted": {"en": "Invitation accepted", "fr": "Invitation acceptée", "ar": "قبول الدعوة", "es": "Invitación aceptada", "de": "Einladung angenommen"},

    # === AI ===
    "ai.suggestion.request": {"en": "AI suggestion requested", "fr": "Suggestion IA demandée", "ar": "طلب اقتراح الذكاء الاصطناعي", "es": "Sugerencia de IA solicitada", "de": "KI-Vorschlag angefordert"},
    "ai.suggestion.created": {"en": "AI suggestion generated", "fr": "Suggestion IA générée", "ar": "تم إنشاء اقتراح الذكاء الاصطناعي", "es": "Sugerencia de IA generada", "de": "KI-Vorschlag erstellt"},
    "ai.pii.detect": {"en": "PII detection requested", "fr": "Détection PII demandée", "ar": "طلب كشف PII", "es": "Detección de PII solicitada", "de": "PII-Erkennung angefordert"},
    "ai.pii.detected": {"en": "PII detected", "fr": "PII détecté", "ar": "تم كشف PII", "es": "PII detectado", "de": "PII erkannt"},
    "ai.summarize": {"en": "Summarization requested", "fr": "Résumé demandé", "ar": "طلب التلخيص", "es": "Resumen solicitado", "de": "Zusammenfassung angefordert"},
    "ai.summary.created": {"en": "Summary generated", "fr": "Résumé généré", "ar": "تم إنشاء الملخص", "es": "Resumen generado", "de": "Zusammenfassung erstellt"},
    "ai.metadata.suggested": {"en": "Metadata suggested", "fr": "Métadonnées suggérées", "ar": "اقتراح بيانات وصفية", "es": "Metadatos sugeridos", "de": "Metadaten vorgeschlagen"},
    "ai.policy_risk.request": {"en": "Policy risk analysis requested", "fr": "Analyse de risque demandée", "ar": "طلب تحليل مخاطر السياسة", "es": "Análisis de riesgo solicitado", "de": "Risikoanalyse angefordert"},
    "ai.policy_risk.result": {"en": "Policy risk analysis result", "fr": "Résultat d'analyse de risque", "ar": "نتيجة تحليل مخاطر السياسة", "es": "Resultado de análisis de riesgo", "de": "Risikoanalyse-Ergebnis"},

    # === Audit ===
    "audit.export": {"en": "Audit log exported", "fr": "Journal d'audit exporté", "ar": "تصدير سجل التدقيق", "es": "Registro de auditoría exportado", "de": "Audit-Protokoll exportiert"},
    "audit.export.completed": {"en": "Audit export completed", "fr": "Export d'audit terminé", "ar": "اكتمال تصدير التدقيق", "es": "Exportación de auditoría completada", "de": "Audit-Export abgeschlossen"},
    "audit.verify": {"en": "Audit chain verified", "fr": "Chaîne d'audit vérifiée", "ar": "التحقق من سلسلة التدقيق", "es": "Cadena de auditoría verificada", "de": "Audit-Kette verifiziert"},
    "audit.verify.result": {"en": "Audit verification result", "fr": "Résultat de vérification d'audit", "ar": "نتيجة التحقق من التدقيق", "es": "Resultado de verificación de auditoría", "de": "Audit-Verifikationsergebnis"},
    "audit.receipt.generate": {"en": "Audit receipt generated", "fr": "Reçu d'audit généré", "ar": "إنشاء إيصال تدقيق", "es": "Recibo de auditoría generado", "de": "Audit-Quittung erstellt"},
    "audit.receipt.generated": {"en": "Audit receipt generated", "fr": "Reçu d'audit généré", "ar": "إنشاء إيصال تدقيق", "es": "Recibo de auditoría generado", "de": "Audit-Quittung erstellt"},

    # === Evidence ===
    "evidence.generate": {"en": "Evidence package generated", "fr": "Paquet de preuves généré", "ar": "إنشاء حزمة أدلة", "es": "Paquete de evidencia generado", "de": "Beweispaket erstellt"},
    "evidence.package_generated": {"en": "Evidence package generated", "fr": "Paquet de preuves généré", "ar": "إنشاء حزمة أدلة", "es": "Paquete de evidencia generado", "de": "Beweispaket erstellt"},

    # === Folders ===
    "folder.create": {"en": "Folder created", "fr": "Dossier créé", "ar": "إنشاء مجلد", "es": "Carpeta creada", "de": "Ordner erstellt"},
    "folder.apply_classification": {"en": "Classification applied to folder", "fr": "Classification appliquée au dossier", "ar": "تطبيق التصنيف على المجلد", "es": "Clasificación aplicada a carpeta", "de": "Klassifizierung auf Ordner angewendet"},
    "folder.classification_applied": {"en": "Classification applied to folder", "fr": "Classification appliquée au dossier", "ar": "تطبيق التصنيف على المجلد", "es": "Clasificación aplicada a carpeta", "de": "Klassifizierung auf Ordner angewendet"},

    # === Device ===
    "device.revoked": {"en": "Device revoked", "fr": "Appareil révoqué", "ar": "إلغاء جهاز", "es": "Dispositivo revocado", "de": "Gerät widerrufen"},
    "device.update": {"en": "Device updated", "fr": "Appareil mis à jour", "ar": "تحديث جهاز", "es": "Dispositivo actualizado", "de": "Gerät aktualisiert"},

    # === Session ===
    "session.revoke_all": {"en": "All sessions revoked", "fr": "Toutes les sessions révoquées", "ar": "إلغاء جميع الجلسات", "es": "Todas las sesiones revocadas", "de": "Alle Sitzungen widerrufen"},
    "session.revoke_requested": {"en": "Session revocation requested", "fr": "Révocation de session demandée", "ar": "طلب إلغاء الجلسة", "es": "Revocación de sesión solicitada", "de": "Sitzungswiderruf angefordert"},

    # === User self-service ===
    "me.password.change": {"en": "Password changed", "fr": "Mot de passe modifié", "ar": "تغيير كلمة المرور", "es": "Contraseña cambiada", "de": "Passwort geändert"},
    "me.mfa.enable": {"en": "MFA enabled", "fr": "MFA activé", "ar": "تفعيل MFA", "es": "MFA activado", "de": "MFA aktiviert"},
    "me.mfa.disable": {"en": "MFA disabled", "fr": "MFA désactivé", "ar": "إلغاء تفعيل MFA", "es": "MFA desactivado", "de": "MFA deaktiviert"},
    "me.mfa.setup": {"en": "MFA setup", "fr": "Configuration MFA", "ar": "إعداد MFA", "es": "Configuración MFA", "de": "MFA-Einrichtung"},
    "me.locale.changed": {"en": "Locale preference changed", "fr": "Préférence de langue modifiée", "ar": "تغيير تفضيل اللغة", "es": "Preferencia de idioma cambiada", "de": "Spracheinstellung geändert"},
    "me.locale.update": {"en": "Locale preference updated", "fr": "Préférence de langue mise à jour", "ar": "تحديث تفضيل اللغة", "es": "Preferencia de idioma actualizada", "de": "Spracheinstellung aktualisiert"},
    "me.profile.update": {"en": "Profile updated", "fr": "Profil mis à jour", "ar": "تحديث الملف الشخصي", "es": "Perfil actualizado", "de": "Profil aktualisiert"},

    # === Passkey ===
    "passkey.register": {"en": "Passkey registered", "fr": "Clé d'accès enregistrée", "ar": "تسجيل مفتاح الوصول", "es": "Llave de acceso registrada", "de": "Passkey registriert"},

    # === Anomaly ===
    "anomaly.resolved": {"en": "Anomaly resolved", "fr": "Anomalie résolue", "ar": "حل الشذوذ", "es": "Anomalía resuelta", "de": "Anomalie behoben"},

    # === Collaboration ===
    "collaboration.join": {"en": "Collaboration session joined", "fr": "Session de collaboration rejointe", "ar": "الانضمام لجلسة تعاون", "es": "Sesión de colaboración unida", "de": "Kollaborationssitzung beigetreten"},
    "collaboration.session.joined": {"en": "Collaboration session joined", "fr": "Session de collaboration rejointe", "ar": "الانضمام لجلسة تعاون", "es": "Sesión de colaboración unida", "de": "Kollaborationssitzung beigetreten"},

    # === Errors ===
    "api.error": {"en": "API error", "fr": "Erreur API", "ar": "خطأ في API", "es": "Error de API", "de": "API-Fehler"},
}

# Generate TypeScript
lines = [
    "/**",
    " * Smart EDMS — Audit event labels (all 5 locales)",
    " *",
    " * Auto-generated by scripts/generate-audit-labels.py",
    " * DO NOT EDIT MANUALLY — edit the script and re-run.",
    " *",
    f" * Covers {len(LABELS)} event types across en, fr, ar, es, de.",
    " * When a new audit event type is added to the codebase, add it",
    " * to the script and re-run to generate updated labels.",
    " */",
    "",
    "export const AUDIT_EVENT_LABELS: Record<string, Record<string, string>> = {",
]

for event_type in sorted(LABELS.keys()):
    labels = LABELS[event_type]
    lines.append(f"  '{event_type}': {{")
    for locale in ["en", "fr", "ar", "es", "de"]:
        val = labels.get(locale, labels["en"])
        # Escape single quotes
        val = val.replace("'", "\\'")
        lines.append(f"    {locale}: '{val}',")
    lines.append("  },")

lines.append("};")
lines.append("")
lines.append("/**")
lines.append(" * Get a localized label for an audit event type.")
lines.append(" * Falls back to English, then to the raw event code.")
lines.append(" */")
lines.append("export function getAuditEventLabel(eventType: string, locale: string = 'en'): string {")
lines.append("  const labels = AUDIT_EVENT_LABELS[eventType];")
lines.append("  if (!labels) return eventType;")
lines.append("  return labels[locale] || labels.en || eventType;")
lines.append("}")
lines.append("")

OUTPUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Generated {OUTPUT} with {len(LABELS)} event types × 5 locales")
