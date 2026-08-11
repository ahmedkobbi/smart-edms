#!/usr/bin/env python3
"""
Smart EDMS — I18N-PATCH-3

Adds all translation keys needed by the 21 admin page files to all 5
locale files (en, fr, ar, es, de).

The English values are filled in; other locales get the English value
as a placeholder (the app falls back to English when a key is missing).

Keys are organized under:
  - common.*            (shared strings reused across many pages)
  - admin.<resource>.*  (per-page subtitles, descriptions, toasts, etc.)
  - admin.<resource>Page.* (for pages where admin.<resource> is already a
                          plain string title — dualControl, locales,
                          notificationRouting)
"""

import json
import copy
from pathlib import Path

LOCALES = ['en', 'fr', 'ar', 'es', 'de']
MESSAGES_DIR = Path('/tmp/my-project/messages')

# All new keys to add. English values; other locales get English as placeholder.
NEW_KEYS = {
    "common": {
        # Strings used across multiple admin pages
        "copiedToast": "Copied",
        "systemBadge": "System",
        "enabledBadge": "Enabled",
        "disabledBadge": "Disabled",
        "signedBadge": "Signed",
        "more": "+{count} more",
        "expiresPrefix": "Expires",
        "lastUsedPrefix": "last used",
        "lastSeenPrefix": "Last seen",
        "lastSentPrefix": "last sent",
        "ipLabel": "IP:",
        "email": "Email",
        "addButton": "Add",
        "setPrefix": "Set",
        "requestedPrefix": "Requested",
        "executedPrefix": "executed",
        "duePrefix": "due",
        "copyButton": "Copy",
        "cancelButton": "Cancel",
        "createButton": "Create",
        "saveButton": "Save",
        "deleteButton": "Delete",
        "doneButton": "Done",
        "revokeButton": "Revoke",
        "enableButton": "Enable",
        "disableButton": "Disable",
        "editButton": "Edit",
        "rejectButton": "Reject",
        "approveButton": "Approve",
        "releaseButton": "Release",
        "reviewButton": "Review",
        "resetButton": "Reset",
    },

    "admin": {
        # ---- dual-control page (admin.dualControl already a string) ----
        "dualControlPage": {
            "subtitle": "Destructive admin actions require approval from a second administrator.",
            "requestsTitle": "Requests",
            "requestsDesc": "Pending, approved, and rejected dual-control requests",
            "empty": "No dual-control requests.",
            "approvedToast": "Request approved",
            "rejectedToast": "Request rejected",
            "approveButton": "Approve",
            "rejectButton": "Reject",
        },

        # ---- locales page (admin.locales already a string) ----
        "localesPage": {
            "subtitle": "Manage enabled languages, translation overrides, and terminology.",
            "newOverrideButton": "New override",
            "createTitle": "Create translation override",
            "createDesc": "Overrides supplement the static JSON files. Use for tenant-specific terminology or corrections.",
            "localeLabel": "Locale",
            "namespaceLabel": "Namespace",
            "namespacePlaceholder": "common, auth, documents…",
            "keyLabel": "Key",
            "keyPlaceholder": "appName, signIn,…",
            "valueLabel": "Value",
            "createOverrideButton": "Create override",
            "keysSuffix": "keys",
            "overridesCardTitle": "Translation Overrides",
            "overridesCardDesc": "Tenant-specific translation overrides. These take precedence over the static JSON files.",
            "allLocalesFilter": "All locales",
            "allStatusFilter": "All status",
            "draftFilter": "Draft",
            "reviewedFilter": "Reviewed",
            "approvedFilter": "Approved",
            "empty": "No translation overrides. Click \"New override\" to create one.",
            "saveButton": "Save",
            "editButton": "Edit",
            "approveButton": "Approve",
            "glossaryCardTitle": "Bilingual Glossary",
            "glossaryCardDesc": "Canonical terminology for English ↔ Arabic",
            "viewGlossaryButton": "View Glossary",
            "overrideCreatedToast": "Translation override created",
            "updatedToast": "Translation updated",
            "approvedToast": "Translation approved",
            "deletedToast": "Translation deleted",
            "localePlaceholder": "Locale",
            "statusPlaceholder": "Status",
        },

        # ---- notification-routing page (admin.notificationRouting already a string) ----
        "notificationRoutingPage": {
            "subtitle": "Configure how notifications are delivered based on severity and type. Rules are evaluated in priority order (highest first).",
            "newRuleButton": "New rule",
            "createTitle": "Create routing rule",
            "createDesc": "Rules determine which delivery channels are used for notifications matching the severity + type pattern.",
            "nameLabel": "Name *",
            "namePlaceholder": "e.g. Critical alerts → email admins",
            "minSeverityLabel": "Minimum severity",
            "infoPlus": "Info+",
            "successPlus": "Success+",
            "warningPlus": "Warning+",
            "criticalOnly": "Critical only",
            "priorityLabel": "Priority (higher = first)",
            "typePatternLabel": "Type pattern",
            "typePatternPlaceholder": "security.*, workflow.*, or *",
            "typePatternHint": "Use * for all types, or security.* for a category.",
            "channelsLabel": "Delivery channels",
            "inApp": "In-app",
            "emailChannel": "Email",
            "webhook": "Webhook",
            "targetRolesLabel": "Target roles (comma-separated, empty = original recipient)",
            "targetRolesPlaceholder": "tenant_admin, security_officer",
            "targetRolesHint": "When set, notifications are delivered to all users with these roles instead of the original recipient.",
            "createRuleButton": "Create rule",
            "cardTitle": "Routing Rules",
            "cardDesc": "Evaluated in priority order. First match wins.",
            "empty": "No routing rules defined.",
            "emptyHint": "Without routing rules, all notifications are delivered in-app only. Create a rule to route critical alerts via email or webhook.",
            "priorityBadge": "Priority {priority}",
            "createdToast": "Routing rule created",
            "deletedToast": "Routing rule deleted",
        },

        # ---- API keys ----
        "apiKeys": {
            "subtitle": "Programmatic access keys for integrations. Keys are shown once at creation.",
            "newButton": "New API key",
            "createdTitle": "API key created",
            "createTitle": "Create API key",
            "createdDesc": "Copy this key now. It will not be shown again.",
            "createDesc": "Issue a new API key for programmatic access.",
            "nameLabel": "Name *",
            "namePlaceholder": "CI/CD integration",
            "descriptionLabel": "Description",
            "scopesLabel": "Scopes (permissions)",
            "cardTitle": "Active keys",
            "cardDesc": "Revoked keys are excluded",
            "empty": "No active API keys.",
            "revokedToast": "Key revoked",
        },

        # ---- classifications ----
        "classifications": {
            "subtitle": "Sensitivity taxonomy used for access control and visual banners.",
            "newButton": "New classification",
            "createTitle": "Create classification",
            "createDesc": "Codes are uppercase, immutable after creation.",
            "codeLabel": "Code *",
            "codePlaceholder": "CONFIDENTIAL",
            "levelLabel": "Level",
            "nameLabel": "Name *",
            "descriptionLabel": "Description",
            "colorLabel": "Color (banner)",
            "cardTitle": "Taxonomy",
            "cardDesc": "Sorted by sensitivity level (lowest → highest)",
            "levelBadge": "Level {level}",
            "noDescription": "No description",
            "documentsCount": "{count} document(s)",
            "localizeButton": "Localize",
            "localizeTitleAttr": "Manage localized names",
            "createdToast": "Classification created",
            "deletedToast": "Classification deleted",
        },

        # ---- classification localization editor ----
        "classLocalization": {
            "editorDesc": "Provide translated names and descriptions for each locale. Locales without an override fall back to the default (English) values. The {code} code is always displayed as-is — only the display name and description are localized.",
            "localizeTitle": "Localize:",
            "overrideBadge": "Override",
            "defaultBadge": "Default",
            "editButton": "Edit",
            "addOverrideButton": "Add override",
            "removeOverrideButton": "Remove override",
            "nameLabel": "Name",
            "descriptionLabel": "Description",
            "saveButton": "Save",
            "noDescription": "No description",
            "savedToast": "Localization saved",
            "savedToastDesc": "{locale} name updated",
            "overrideRemovedToast": "Override removed",
            "overrideRemovedToastDesc": "{locale} reverted to default",
        },

        # ---- devices ----
        "devices": {
            "subtitle": "Manage trusted devices for the current user.",
            "cardTitle": "Your devices",
            "cardDesc": "Trusted devices skip additional friction; untrusted devices require verification",
            "empty": "No devices registered.",
            "trustedBadge": "Trusted",
            "untrustedBadge": "Untrusted",
            "untrustButton": "Untrust",
            "trustButton": "Trust",
            "updatedToast": "Device updated",
            "revokedToast": "Device revoked",
        },

        # ---- dispositions ----
        "dispositions": {
            "subtitle": "Review and approve end-of-lifecycle document dispositions. Executed deletes generate a certificate of destruction.",
            "cardTitle": "Disposition records",
            "cardDesc": "Includes pending, executed, and cancelled",
            "empty": "No disposition records.",
            "unknownDocument": "Unknown document",
            "reviewButton": "Review",
            "certificateButton": "Certificate",
            "reviewDialogTitle": "Review disposition",
            "reviewDialogDesc": "Approving will {action}.",
            "reviewDialogActionDelete": "soft-delete the document and issue a certificate of destruction",
            "reviewDialogActionArchive": "mark the document as archived",
            "reviewDialogActionReview": "flag the document for review",
            "actionLabel": "Action: {action}",
            "reasonLabel": "Reason: {reason}",
            "reasonDash": "—",
            "commentLabel": "Comment",
            "commentPlaceholder": "Justification for decision…",
            "approveAndExecuteButton": "Approve & execute",
            "certDialogTitle": "Certificate of destruction",
            "certDialogDesc": "Cryptographic proof of disposition",
            "certHashLabel": "Certificate hash (SHA-256)",
            "documentLabel": "Document",
            "actionLabelPlain": "Action",
            "issuedAtLabel": "Issued at",
            "rejectedToast": "Disposition rejected",
            "executedToast": "Disposition executed",
        },

        # ---- groups ----
        "groups": {
            "subtitle": "Group users for policy targeting and bulk role assignment.",
            "newButton": "New group",
            "createTitle": "Create group",
            "createDesc": "Members can be added after creation.",
            "nameLabel": "Name *",
            "descriptionLabel": "Description",
            "cardTitle": "Groups",
            "cardDesc": "Used by ABAC policies for group-based rules",
            "empty": "No groups created.",
            "membersCount": "{count} member(s)",
            "policiesCount": "{count} polic(ies)",
            "createdToast": "Group created",
            "deletedToast": "Group deleted",
        },

        # ---- legal holds ----
        "legalHolds": {
            "subtitle": "Active legal holds override retention disposition. Releases are audit-logged.",
            "newButton": "New hold",
            "createTitle": "Create legal hold",
            "createDesc": "You can attach documents after creation.",
            "nameLabel": "Name *",
            "reasonLabel": "Reason *",
            "caseRefLabel": "Case reference",
            "cardTitle": "Active holds",
            "cardDesc": "Released holds are excluded from this view.",
            "empty": "No active legal holds.",
            "docsCount": "{count} doc(s)",
            "createdToast": "Legal hold created",
            "releasedToast": "Legal hold released",
        },

        # ---- metadata schemas ----
        "metadataSchemas": {
            "subtitle": "Define typed metadata fields per document type for structured data capture.",
            "newButton": "New schema",
            "createTitle": "Create metadata schema",
            "createDesc": "Define fields that documents of this type should expose.",
            "nameLabel": "Name *",
            "appliesToLabel": "Applies to",
            "appliesToPlaceholder": "* or type list",
            "descriptionLabel": "Description",
            "fieldsLabel": "Fields",
            "fieldNamePlaceholder": "name",
            "fieldLabelPlaceholder": "Label",
            "requiredLabel": "required",
            "addFieldButton": "Add field",
            "cardTitle": "Schemas",
            "cardDesc": "Each schema defines a typed metadata structure",
            "empty": "No schemas defined.",
            "fieldsCount": "{count} field(s)",
            "appliesToBadge": "appliesTo: {value}",
            "createdToast": "Schema created",
            "deletedToast": "Schema deleted",
        },

        # ---- policies ----
        "policies": {
            "subtitle": "ABAC rules evaluated alongside RBAC permissions. Deny wins over allow at equal priority.",
            "newButton": "New policy",
            "createTitle": "Create policy",
            "createDesc": "Higher priority is evaluated first. Deny wins over allow at the same priority. Policies are cached for 60 seconds — changes take effect immediately via cache invalidation.",
            "nameLabel": "Name *",
            "namePlaceholder": "e.g. Deny HS download outside business hours",
            "descriptionLabel": "Description",
            "descriptionPlaceholder": "Optional — what this policy enforces",
            "effectLabel": "Effect",
            "effectAllow": "Allow",
            "effectDeny": "Deny",
            "priorityLabel": "Priority (0-1000, higher = first)",
            "actionLabel": "Action pattern *",
            "actionPlaceholder": "document:download",
            "actionHint": "Supports wildcards: document:* matches all document actions, * matches everything.",
            "resourceLabel": "Resource pattern *",
            "resourcePlaceholder": "document:*",
            "resourceHint": "document:* = all documents, document:abc123 = specific document, * = all resources.",
            "conditionsLabel": "Conditions (JSON)",
            "conditionsHint": "All conditions must match (AND)",
            "conditionsSupported": "Supported: classification, classificationMin, hasTag, hasAnyTag, state, isRecord, legalHold, ownerOnly, actorRole, timeOfDay, dayOfWeek, ipRange.",
            "createPolicyButton": "Create policy",
            "cardTitle": "Policies",
            "cardDesc": "Evaluated in priority order (highest first). Deny wins over allow at equal priority. All policies with matching action + resource + conditions are evaluated; the first match decides.",
            "empty": "No policies defined.",
            "emptyHint": "Without ABAC policies, access is controlled only by RBAC permissions. Create a policy to add attribute-based rules (e.g. \"deny download of HS documents outside business hours\").",
            "priorityBadge": "Priority {priority}",
            "actionPrefix": "action:",
            "resourcePrefix": "resource:",
            "presetRestrictClassification": "Restrict by classification",
            "presetRestrictClassificationDesc": "Only applies to documents with specific classification codes",
            "presetRestrictTag": "Restrict by tag",
            "presetRestrictTagDesc": "Only applies to documents with a specific tag",
            "presetBusinessHours": "Business hours only",
            "presetBusinessHoursDesc": "Only applies Monday-Friday 09:00-17:00",
            "presetInternalNetwork": "Internal network only",
            "presetInternalNetworkDesc": "Only applies when actor is on the internal network",
            "presetOwnerOnly": "Owner only",
            "presetOwnerOnlyDesc": "Only applies when the actor is the document owner",
            "presetRecordsOnly": "Records only",
            "presetRecordsOnlyDesc": "Only applies to documents declared as records",
            "presetLegalHold": "Under legal hold",
            "presetLegalHoldDesc": "Only applies to documents under legal hold",
            "createdToast": "Policy created",
            "deletedToast": "Policy deleted",
            "invalidJsonPrefix": "Invalid JSON:",
            "invalidConditionsJson": "Invalid conditions JSON",
        },

        # ---- recertification ----
        "recertification": {
            "subtitle": "Periodic review of user access rights. Required for SOC 2 / ISO 27001 compliance.",
            "newButton": "New campaign",
            "createTitle": "Create recertification campaign",
            "createDesc": "Generates one review item per active user.",
            "nameLabel": "Name *",
            "namePlaceholder": "Q4 2025 access review",
            "descriptionLabel": "Description",
            "reviewerLabel": "Reviewer user ID *",
            "reviewerPlaceholder": "cusr...",
            "cardTitle": "Campaigns",
            "cardDesc": "Each campaign generates per-user review items",
            "empty": "No recertification campaigns yet.",
            "itemsCount": "{count} item(s)",
            "createdToast": "Campaign created",
            "createdToastDesc": "{count} user(s) require review",
        },

        # ---- retention ----
        "retention": {
            "subtitle": "Define how long documents are kept and what happens when retention expires.",
            "newButton": "New schedule",
            "createTitle": "Create retention schedule",
            "createDesc": "Disposition requires approval by default.",
            "nameLabel": "Name *",
            "descriptionLabel": "Description",
            "retentionDaysLabel": "Retention (days)",
            "startTriggerLabel": "Start trigger",
            "triggerDocCreated": "Document created",
            "triggerDocClosed": "Document closed",
            "triggerLastModified": "Last modified",
            "dispositionLabel": "Disposition",
            "dispositionReview": "Review",
            "dispositionArchive": "Archive",
            "dispositionDelete": "Delete",
            "appliesToLabel": "Applies to",
            "appliesToPlaceholder": "* or type list",
            "cardTitle": "Schedules",
            "cardDesc": "Sorted by retention period",
            "daysBadge": "{count} days",
            "approvalRequiredBadge": "Approval required",
            "triggerPrefix": "Trigger:",
            "appliesToPrefix": "Applies to:",
            "documentsCount": "{count} document(s)",
            "createdToast": "Schedule created",
            "deletedToast": "Schedule deleted",
        },

        # ---- roles ----
        "roles": {
            "subtitle": "Manage RBAC roles and their permission grants.",
            "newButton": "New role",
            "createTitle": "Create role",
            "createDesc": "Custom roles can be assigned to users and groups.",
            "nameLabel": "Name *",
            "descriptionLabel": "Description",
            "permissionsLabel": "Permissions",
            "selectedCount": "{count} selected",
            "cardTitle": "Roles",
            "cardDesc": "System roles ship with predefined permissions and cannot be deleted.",
            "usersCount": "{count} user(s)",
            "createdToast": "Role created",
            "deletedToast": "Role deleted",
        },

        # ---- service accounts ----
        "serviceAccounts": {
            "subtitle": "Non-human identities for automation, integrations, and CI/CD pipelines.",
            "newButton": "New service account",
            "createdTitle": "Service account created",
            "createTitle": "Create service account",
            "createdDesc": "Copy this key now. It will not be shown again.",
            "createDesc": "Issue credentials for non-human access.",
            "nameLabel": "Name *",
            "namePlaceholder": "ci-runner",
            "descriptionLabel": "Description",
            "expiresAtLabel": "Expires at (optional)",
            "scopesLabel": "Scopes",
            "cardTitle": "Active service accounts",
            "cardDesc": "For automation — never use human credentials in scripts",
            "empty": "No service accounts.",
            "revokedToast": "Service account revoked",
        },

        # ---- SSO providers ----
        "ssoProviders": {
            "subtitle": "Configure OIDC / SAML identity providers for enterprise sign-in.",
            "newButton": "New provider",
            "createTitle": "Create SSO provider",
            "createDesc": "Configure an OIDC or SAML identity provider.",
            "nameLabel": "Name *",
            "namePlaceholder": "Corporate Okta",
            "typeLabel": "Type",
            "typeOidc": "OIDC",
            "typeSaml": "SAML",
            "issuerUrlLabel": "Issuer URL",
            "issuerUrlPlaceholder": "https://yourtenant.okta.com",
            "authEndpointLabel": "Authorization endpoint",
            "authEndpointPlaceholder": "https://…/authorize",
            "tokenEndpointLabel": "Token endpoint",
            "tokenEndpointPlaceholder": "https://…/token",
            "userinfoEndpointLabel": "Userinfo endpoint",
            "userinfoEndpointPlaceholder": "https://…/userinfo",
            "clientIdLabel": "Client ID *",
            "clientSecretLabel": "Client secret",
            "secretHint": "Client secret is AES-256-GCM encrypted at rest.",
            "cardTitle": "Configured providers",
            "cardDesc": "Client secrets are encrypted and never displayed again",
            "empty": "No SSO providers configured.",
            "secretSetBadge": "Secret set",
            "clientIdPrefix": "Client ID:",
            "createdToast": "SSO provider created",
            "deletedToast": "Provider deleted",
        },

        # ---- tenant settings ----
        "tenant": {
            "subtitle": "Configure tenant identity, branding, and feature flags.",
            "identityCardTitle": "Identity",
            "identityCardDesc": "Tenant name and slug",
            "tenantNameLabel": "Tenant name",
            "slugLabel": "Slug",
            "slugImmutable": "Slug is immutable after creation.",
            "statusLabel": "Status",
            "brandingCardTitle": "Branding",
            "brandingCardDesc": "Visual identity for the tenant (used in custom themes)",
            "primaryColorLabel": "Primary color",
            "accentColorLabel": "Accent color",
            "previewLabel": "Preview",
            "accentBadge": "Accent",
            "featureFlagsCardTitle": "Feature flags",
            "featureFlagsCardDesc": "Enable or disable tenant-wide features",
            "aiFeaturesTitle": "AI-assisted features",
            "aiFeaturesDesc": "Classification suggestions, PII detection, summarization, policy risk",
            "watermarkingTitle": "Watermarking",
            "watermarkingDesc": "Apply dynamic watermarks on document preview/download",
            "ocrTitle": "OCR (text extraction)",
            "ocrDesc": "Extract text from images and scanned PDFs for search. Uses Tesseract with configurable languages and DPI.",
            "ocrLanguagesLabel": "OCR Languages",
            "selectedPrefix": "Selected:",
            "renderDpiLabel": "Render DPI",
            "renderDpiHint": "Higher = better accuracy, slower",
            "maxPagesLabel": "Max pages",
            "maxPagesHint": "Cap OCR processing",
            "minConfidenceLabel": "Min confidence %",
            "minConfidenceHint": "Below this = low_confidence",
            "residencyLabel": "Data residency",
            "residencyPlaceholder": "eu-west-1, us-east-1, etc.",
            "residencyHint": "Advisory only — actual residency is enforced at the infrastructure layer.",
            "saveButton": "Save settings",
            "savedToast": "Tenant settings saved",
            "langEnglish": "English",
            "langArabic": "Arabic",
            "langFrench": "French",
            "langSpanish": "Spanish",
            "langGerman": "German",
        },

        # ---- tenants (platform) ----
        "tenants": {
            "subtitle": "Multi-tenant onboarding. Each tenant is fully isolated.",
            "newButton": "New tenant",
            "createTitle": "Create tenant",
            "createDesc": "Provisions a new tenant with default roles, classifications, and trial subscription.",
            "nameLabel": "Name *",
            "slugLabel": "Slug *",
            "slugPlaceholder": "acme-corp",
            "adminEmailLabel": "Admin email *",
            "adminNameLabel": "Admin name *",
            "adminPasswordLabel": "Admin password *",
            "adminPasswordPlaceholder": "Min 12 chars",
            "cardTitle": "Tenants",
            "cardDesc": "Multi-tenant listing requires platform-admin elevation",
            "createdToast": "Tenant created",
            "createdToastDesc": "{name} ({slug}) — admin: {email}",
        },

        # ---- vocabularies ----
        "vocabularies": {
            "subtitle": "Reusable term lists for metadata field validation.",
            "newButton": "New vocabulary",
            "createTitle": "Create vocabulary",
            "createDesc": "Define a list of allowed terms for metadata fields.",
            "nameLabel": "Name *",
            "namePlaceholder": "departments",
            "descriptionLabel": "Description",
            "termsLabel": "Terms (one per line)",
            "termPlaceholder": "Term {n}",
            "addTermButton": "Add term",
            "cardTitle": "Vocabularies",
            "cardDesc": "Used by metadata schemas for select/multiselect fields",
            "empty": "No vocabularies defined.",
            "termsCount": "{count} term(s)",
            "createdToast": "Vocabulary created",
            "deletedToast": "Vocabulary deleted",
        },

        # ---- webhooks ----
        "webhooks": {
            "subtitle": "Outgoing HTTP notifications for system events. HMAC-signed with a shared secret.",
            "newButton": "New webhook",
            "createdTitle": "Webhook created",
            "createTitle": "Create webhook",
            "createdDesc": "Save this signing secret. It will not be shown again.",
            "createDesc": "Configure a new outgoing webhook.",
            "secretHelp": "The X-Smart-EDMS-Signature header is computed as SHA256(payload + secret). Verify this signature on receipt.",
            "nameLabel": "Name *",
            "urlLabel": "URL *",
            "urlPlaceholder": "https://example.com/webhook",
            "eventsLabel": "Events",
            "eventsSelected": "{count} event(s) selected",
            "cardTitle": "Configured webhooks",
            "cardDesc": "Delivery status is recorded on each attempt",
            "empty": "No webhooks configured.",
            "createdToast": "Webhook created",
            "deletedToast": "Webhook deleted",
        },
    },
}


def deep_merge(base: dict, addition: dict) -> tuple:
    """Recursively merge addition into base. Existing keys are NOT overwritten.
    Returns (merged_dict, num_new_leaf_keys_added).
    """
    added = 0

    def _count_leaves(d):
        n = 0
        for v in d.values():
            if isinstance(v, dict):
                n += _count_leaves(v)
            else:
                n += 1
        return n

    def _merge(b, a):
        nonlocal added
        for key, value in a.items():
            if key in b:
                if isinstance(b[key], dict) and isinstance(value, dict):
                    _merge(b[key], value)
                # else: key already exists, skip (don't overwrite)
            else:
                b[key] = value
                if isinstance(value, dict):
                    added += _count_leaves(value)
                else:
                    added += 1

    _merge(base, addition)
    return base, added


def main():
    total_added = 0
    for locale in LOCALES:
        filepath = MESSAGES_DIR / f"{locale}.json"
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        before_keys = set()
        def collect_keys(d, prefix=""):
            for k, v in d.items():
                full = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    collect_keys(v, full)
                else:
                    before_keys.add(full)
        collect_keys(data)

        data, added = deep_merge(data, copy.deepcopy(NEW_KEYS))

        after_keys = set()
        collect_keys(data, after_keys)
        new_keys = after_keys - before_keys

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')

        print(f"  {locale}: +{len(new_keys)} keys ({len(before_keys)} -> {len(after_keys)} total)")
        total_added += len(new_keys)

    print(f"\nAll 5 locale files updated. Total new keys: {total_added}.")


if __name__ == '__main__':
    main()
