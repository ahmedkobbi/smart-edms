# Smart EDMS — Bilingual Glossary (EN/AR)

This glossary defines the canonical terminology for Smart EDMS in English and Modern Standard Arabic (MSA). All UI labels, documentation, emails, and evidence exports must use these terms consistently.

## Purpose

- Ensure professional, enterprise-grade Arabic terminology
- Prevent machine-translation artifacts in security/legal/audit copy
- Provide translators with approved term mappings
- Maintain technical precision in both languages

## Core Terms

| English | Arabic (MSA) | Notes |
|---------|-------------|-------|
| Document | مستند | Not "وثيقة" (more common in legal context; مستند is preferred for EDMS) |
| Document Management | إدارة المستندات | |
| Electronic Document Management System (EDMS) | نظام إدارة المستندات الإلكتروني | |
| Version | إصدار | |
| Version History | سجل الإصدارات | |
| Metadata | البيانات الوصفية | |
| Classification | تصنيف | |
| Sensitivity Label | وصف الحساسية | |
| Public | عام | |
| Internal | داخلي | |
| Confidential | سري | |
| Restricted | مقيد | |
| Highly Sensitive | حساس للغاية | |
| Classification Banner | شريط التصنيف | |
| Audit Log | سجل التدقيق | |
| Audit Event | حدث تدقيق | |
| Audit Trail | مسار التدقيق | |
| Tamper-evident | مقاوم للتلاعب | |
| Hash Chain | سلسلة التجزئة | |
| Integrity Verification | التحقق من السلامة | |
| Signed Receipt | إيصال موقع | |
| Retention | الاستبقاء | |
| Retention Schedule | جدول الاستبقاء | |
| Disposition | التصرف | |
| Disposition Approval | موافقة التصرف | |
| Certificate of Destruction | شهادة الإتلاف | |
| Crypto-shredding | التدمير التشفيري | |
| Legal Hold | احتجاز قانوني | |
| Record | سجل | (when declared as a record) |
| Declare as Record | إعلان كسجل | |
| Workflow | سير العمل | |
| Approval | موافقة | |
| Rejection | رفض | |
| Delegation | تفويض | |
| Escalation | تصعيد | |
| Share | مشاركة | |
| Share Link | رابط المشاركة | |
| Revocation | إلغاء | |
| Watermark | علامة مائية | |
| Redaction | تنقيح | |
| Redacted | منقّح | |
| Preview | معاينة | |
| Download | تنزيل | |
| Upload | رفع | |
| Checksum | بصمة | (literally "fingerprint") |
| Hash | تجزئة | |
| Encryption | تشفير | |
| Decryption | فك التشفير | |
| Key Encryption Key (KEK) | مفتاح تشفير المفاتيح | |
| Data Encryption Key (DEK) | مفتاح تشفير البيانات | |
| Envelope Encryption | التشفير المغلف | |
| Multi-Factor Authentication (MFA) | المصادقة متعددة العوامل | |
| TOTP | كلمة مرور لمرة واحدة زمنية | |
| Passkey | مفتاح المرور | |
| WebAuthn | مصادقة الويب | |
| Single Sign-On (SSO) | تسجيل الدخول الموحد | |
| Role-Based Access Control (RBAC) | التحكم في الوصول القائم على الأدوار | |
| Attribute-Based Access Control (ABAC) | التحكم في الوصول القائم على السمات | |
| Policy | سياسة | |
| Permission | إذن | |
| Tenant | مستأجر | |
| Multi-tenant | متعدد المستأجرين | |
| Tenant Isolation | عزل المستأجرين | |
| User | مستخدم | |
| Group | مجموعة | |
| Role | دور | |
| Service Account | حساب الخدمة | |
| API Key | مفتاح API | |
| Webhook | خطاف الويب | |
| Notification | إشعار | |
| Alert | تنبيه | |
| Anomaly | شذوذ | |
| Security Posture | الوضع الأمني | |
| Break-glass Access | الوصول الطارئ | |
| Dual Control | الرقابة المزدوجة | |
| Step-up Authentication | المصادقة المعززة | |
| Device Trust | ثقة الجهاز | |
| Access Recertification | إعادة شهادة الوصول | |
| Session | جلسة | |
| Session Timeout | انتهاء الجلسة | |
| Rate Limiting | تحديد المعدل | |
| Malware Scan | فحص البرمجيات الخبيثة | |
| Quarantine | الحجر الصحي | |
| Evidence Package | حزمة الأدلة | |
| Compliance | الامتثال | |
| Privacy by Design | الخصوصية بالتصميم | |
| Data Minimization | تقليل البيانات | |
| Soft Delete | الحذف الناعم | |
| Hard Delete | الحذف النهائي | |
| Folder | مجلد | |
| Tag | وسم | |
| Favorite | مفضلة | |
| Comment | تعليق | |
| Search | بحث | |
| Faceted Search | بحث متعدد الأوجه | |
| Saved Search | بحث محفوظ | |
| Full-text Search | بحث نصي كامل | |
| OCR | التعرف الضوئي على الحروف | |
| Arabic Text Normalization | تطبيع النص العربي | |
| Tashkeel | التشكيل | |
| RTL (Right-to-Left) | من اليمين إلى اليسار | |
| Locale | الإعداد المحلي | |
| Internationalization (i18n) | التدويل | |
| Localization (l10n) | التوطين | |

## Translation Rules

1. **Never use machine translation** for security, legal, audit, retention, or classification terms
2. **Always use MSA** (Modern Standard Arabic) — not dialects
3. **Preserve technical precision** — do not simplify security terminology
4. **Use consistent terms** — the same English term must always map to the same Arabic term
5. **Do not transliterate** when an Arabic equivalent exists (e.g., use "مستند" not "دوكومنت")
6. **Transliterate only when** no Arabic equivalent exists (e.g., "API", "Webhook", "TOTP")
7. **Maintain formal tone** — enterprise-grade, not casual
8. **Test with native speakers** — all Arabic copy must be reviewed by a native MSA speaker
