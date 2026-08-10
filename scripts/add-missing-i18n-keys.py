#!/usr/bin/env python3
"""
Smart EDMS — I18N key generator

Adds ~205 missing translation keys to all 5 locale files (en, fr, ar, es, de).
The English values are filled in; other locales get the English value as a
placeholder (to be translated later by a native speaker — the app falls back
to English when a key is missing, so this is safe).

The keys are organized by category:
  - emails.newDevice.* (6 keys)
  - emails.passwordChanged.* (5 keys)
  - common.* (~15 shared keys: failed, unknown, tryAgain, goToDashboard, etc.)
  - errors.* (~20 keys for error pages: notFound, appError, offline, unauthorized)
  - dashboard.* (~10 new keys)
  - documents.* (~60 new keys for tabs, labels, toasts, empty states)
  - search.* (~8 new keys)
  - audit.* (~12 new keys)
  - admin.* (~80 new keys across billing, anomalies, breakGlass, jobs, invitations, users)
  - shared.* (~12 new keys)
  - state.* (verify existing keys)
"""

import json
import copy
from pathlib import Path

LOCALES = ['en', 'fr', 'ar', 'es', 'de']
MESSAGES_DIR = Path('/home/z/my-project/messages')

# All new keys to add, organized as nested dicts.
# English values are real; other locales get English as placeholder.
NEW_KEYS = {
    # Email templates — MISSING (referenced by email.ts)
    "emails": {
        "newDevice": {
            "subject": "New device login detected",
            "title": "New device login",
            "body": "Your account was accessed from a new device: {device} (IP: {ip}). If this was not you, please change your password immediately and revoke all sessions.",
            "text": "New device login: {device} from {ip}",
            "deviceLabel": "Device",
            "ipLabel": "IP address",
        },
        "passwordChanged": {
            "subject": "Your password was changed",
            "title": "Password changed",
            "body": "Your Smart EDMS password was changed from IP: {ip}. If this was not you, please contact your administrator immediately.",
            "text": "Password changed from {ip}",
            "ipLabel": "IP address",
        },
    },

    # Common shared keys
    "common": {
        "failed": "Failed",
        "unknown": "Unknown",
        "unknownError": "Unknown error",
        "tryAgain": "Try again",
        "goToDashboard": "Go to Dashboard",
        "searchDocuments": "Search documents",
        "done": "Done",
        "dismiss": "Dismiss",
        "selectPlaceholder": "Select…",
        "paginationSummary": "Page {page} of {totalPages} · {total} total",
        "loadMore": "Load more",
        "mobileNavAria": "Mobile navigation",
        "confirmationPhraseAria": "Confirmation phrase",
        "typePhraseToConfirm": "Type {phrase} to confirm.",
        "operationFailed": "Operation failed",
        "loading": "Loading…",
    },

    # Error pages
    "errors": {
        "notFound": {
            "title": "Page not found",
            "message": "The page you're looking for doesn't exist or has been moved. If you believe this is an error, please contact your administrator.",
        },
        "appError": {
            "title": "Something went wrong",
            "message": "An unexpected error occurred. Our team has been notified. You can try again, or return to the dashboard.",
            "errorIdLabel": "Error ID:",
        },
        "offline": {
            "title": "You're offline",
            "message": "Smart EDMS can't reach the server. Check your internet connection and try again. Your data is safe — once you're back online, all changes will sync automatically.",
        },
        "unauthorized": {
            "defaultMessage": "You do not have permission to access this page.",
            "sessionExpired": "Session expired",
            "accessDenied": "Access denied",
            "signInAgainSuffix": " Please sign in again to continue.",
        },
    },

    # Dashboard
    "dashboard": {
        "recentDocumentsDesc": "Documents recently updated in your tenant",
        "noDocumentsEmpty": "No documents yet.",
        "uploadFirst": "Upload your first document",
        "myFavoritesDesc": "Documents you've starred",
        "noFavoritesEmpty": "No favorites yet. Click the star icon on a document to add it.",
        "recentlyViewedDesc": "Your last 5 accessed documents",
        "noRecentViewsEmpty": "No recent views.",
        "recentActivityDesc": "Latest tamper-evident audit events",
        "noActivityEmpty": "No activity recorded yet.",
    },

    # Documents
    "documents": {
        "allClassifications": "All classifications",
        "state": "State",
        "allStates": "All states",
        "recordBadge": "Record",
        "legalHoldBadge": "Legal hold",
        "lockedBadge": "Locked",
        "versionCount": "{count, plural, one {# version} other {# versions}}",
        "shareCount": "{count, plural, one {# share} other {# shares}}",
        "unclassified": "Unclassified",
        "updatedPrefix": "Updated",
        "viewDetails": "View details",
        "unknownType": "unknown type",
        "documentTitlePlaceholder": "Document title",
        "tagsCommaSeparated": "Tags (comma-separated)",
        "tagsPlaceholder": "contract, q4, finance",
        "noFileSelected": "No file selected",
        "uploadedToast": "Document uploaded",
        "uploadedDesc": "Version 1 stored successfully.",
        "uploadFailedToast": "Upload failed",
        "downloadFailedToast": "Download failed",
        "previewFailedToast": "Preview failed",
        "previewLoadFailedToast": "Failed to load preview",
        "scanFailedToast": "Scan failed",
        "lockChangedToast": "Lock state changed",
        "lockChangedDesc": "Updated",
        "classificationUpdatedToast": "Classification updated",
        "versionUploadedToast": "Version uploaded",
        "versionRestoredToast": "Version restored",
        "versionRestoredDesc": "A new version was created with the restored content.",
        "restoreFailedToast": "Restore failed",
        "recordDeclaredToast": "Record declared",
        "shareCreatedToast": "Share link created",
        "shareCreatedDesc": "The link has been generated and audit-logged.",
        "movedToast": "Document moved",
        "copiedToast": "Document copied",
        "noFileError": "No file",
        "manualLockReason": "Manual lock",
        "manualClassificationReason": "Manual classification",
        "newVersionUploadReason": "New version upload",
        "manualDeclarationReason": "Manual declaration",
        "declareRecordConfirm": "Declare this document as a record? Records are immutable and can only be disposed via retention disposition.",
        "restoreVersionPrompt": "Restore version {version}? This creates a NEW version with the old content (the current version is preserved). Enter a reason:",
        "backToDocuments": "Back to documents",
        "sensitiveDefault": "Sensitive document",
        "owner": "Owner",
        "type": "Type",
        "currentVersionLabel": "Current version (v{version})",
        "retention": "Retention",
        "classificationCardDesc": "Change with audit; downgrades require elevated permission and are blocked under legal hold.",
        "selectClassification": "Select classification",
        "auditTimelineTitle": "Audit timeline",
        "auditTimelineDesc": "Tamper-evident, hash-chained events for this document.",
        "noAuditEvents": "No audit events yet.",
        "lockedNoEdit": "Document is locked",
        "noPermissionNoEdit": "No permission to edit",
        "aiClassificationTitle": "AI-assisted classification",
        "aiClassificationDesc": "AI suggestions are advisory only and never auto-applied. Review and approve to apply.",
        "suggestedLabel": "Suggested:",
        "statusLabel": "Status:",
        "aiNoSuggestion": "No AI suggestion yet. Click below to request one.",
        "aiRequestSuggestion": "Request suggestion",
        "aiSuggestionReadyToast": "AI suggestion ready",
        "aiSuggestionReadyDesc": "Review and approve to apply.",
        "aiFailedToast": "AI failed",
        "piiTitle": "PII detection",
        "piiDesc": "Heuristic regex-based scan for personal data (SSN, credit cards, IBAN, emails, phones).",
        "scanForPiiButton": "Scan for PII",
        "noPiiDetected": "No PII detected.",
        "piiMatchesFound": "{count, plural, one {# PII match} other {# PII matches}} found ({source}).",
        "viewMaskedFindings": "View masked findings",
        "summaryTitle": "Document summary",
        "summaryDesc": "LLM-powered summary of the document content and key points.",
        "generateSummaryButton": "Generate summary",
        "keyPointsLabel": "Key points",
        "sourceBadge": "Source: {source}",
        "policyRiskTitle": "Policy risk analysis",
        "policyRiskDesc": "Identifies policy violations, classification mismatches, and compliance risks.",
        "analyzeRisksButton": "Analyze risks",
        "overallRiskLabel": "Overall risk",
        "noRisksDetected": "No risks detected. Document is compliant.",
        "humanReviewRequired": "This document requires human review due to high/critical risk findings.",
        "duplicateTitle": "Duplicate detection",
        "duplicateDesc": "Finds exact (SHA-256) and near-duplicate documents in your tenant.",
        "noDuplicates": "No duplicates found. This document is unique in your tenant.",
        "exactDuplicatesTitle": "Exact duplicates ({count})",
        "nearDuplicatesTitle": "Near duplicates ({count})",
        "sizeDiffLabel": "size diff:",
        "sharingDisabledTitle": "Sharing is disabled for this document",
        "sharingDisabledDesc": "This is enforced by classification policy or document settings.",
        "sharingTitle": "Sharing",
        "sharingDesc": "Create time-limited, optionally password-protected share links.",
        "recipientEmailLabel": "Recipient email (optional)",
        "recipientEmailPlaceholder": "recipient@example.com",
        "shareModeLabel": "Mode",
        "shareModeView": "View only",
        "shareModeDownload": "View + download",
        "shareModeReview": "Review workflow",
        "expiresInLabel": "Expires in",
        "expiresInOne": "1 day",
        "expiresInSeven": "7 days",
        "expiresInThirty": "30 days",
        "expiresInNinety": "90 days",
        "passwordOptionalLabel": "Password (optional)",
        "createShareLink": "Create share link",
        "activeSharesTitle": "Active shares ({count})",
        "anonymous": "Anonymous",
        "never": "never",
        "viewCount": "{count, plural, one {# view} other {# views}}",
        "openShare": "Open",
        "previewDisabledTitle": "Preview disabled",
        "previewDisabledDesc": "Preview is disabled for this document by policy.",
        "inBrowserPreviewTitle": "In-browser preview",
        "watermarkEnabledDesc": "Dynamic watermark enabled — viewer info is overlaid on the document.",
        "noWatermarkDesc": "No watermark.",
        "loadPreview": "Load preview",
        "watermarkLabel": "Watermark:",
        "previewNotAvailable": "Preview not available for {mimeType}",
        "downloadInstead": "Download instead",
        "previewUrlExpiresHint": "URL expires in 60 seconds. Click \"Load preview\" again to refresh.",
        "comments": "Comments",
        "commentsDesc": "Threaded discussion on this document",
        "addCommentPlaceholder": "Add a comment…",
        "noComments": "No comments yet.",
        "commentResolvedBadge": "Resolved",
        "resolveComment": "Resolve",
        "moveCopyDialogTitle": "Move or copy document",
        "moveCopyDialogDesc": "Select a destination folder (or root if none selected).",
        "moveButton": "Move",
        "copyButton": "Copy",
        "destinationFolderLabel": "Destination folder",
        "rootNoFolder": "Root (no folder)",
        "redactSensitiveTitle": "Redact sensitive content",
        "redactSensitiveDesc": "Select regions to black out. Creates a new derivative version.",
        "startRedactionButton": "Start redaction",
        "restore": "Restore",
    },

    # Search
    "search": {
        "subtitle": "Permission-aware search across all documents in your tenant.",
        "placeholder": "Search title, description, tags…",
        "emptyHint": "Try different keywords or filters.",
        "resultCount": "{count, plural, one {# result} other {# results}}",
        "facets": {
            "classifications": "Classifications",
        },
    },

    # Audit
    "audit": {
        "systemActor": "system",
        "chainBrokenAt": "Chain broken at #{sequence}",
        "expectedLabel": "Expected:",
        "actualLabel": "Actual:",
        "verifyFailedToast": "Verify failed",
        "exportFailedToast": "Export failed",
        "noEvents": "No events match your filters.",
        "eventsPageSummary": "{total} total · showing page {page}",
        "actorIp": "Actor IP",
        "action": "Action",
        "resourceType": "Resource type",
        "resourceId": "Resource ID",
        "metadata": "Metadata",
        "verificationDialogTitle": "Audit chain verification",
        "verificationDialogDesc": "Recomputes SHA-256 hashes across the entire tenant chain.",
        "resultFilterAll": "All results",
        "resultFilterAllow": "Allow",
        "resultFilterDeny": "Deny",
        "resultFilterError": "Error",
    },

    # Admin — billing
    "admin": {
        "billing": {
            "subtitle": "Plan, seats, storage usage, and subscription status.",
            "currentPlan": "Current plan",
            "period": "Period",
            "seats": "Seats",
            "noDocumentLimit": "No document limit",
            "storage": "Storage",
            "storageUsed": "{pct}% used",
            "planDetails": "Plan details",
            "planDetailsDesc": "Configure your subscription. Crypto payments via NowPayments.",
            "plan": "Plan",
            "status": "Status",
            "seatsIncluded": "Seats included",
            "storageLimit": "Storage limit",
            "subscriptionId": "Subscription ID",
            "upgradePlan": "Upgrade plan",
            "upgradeDesc": "Choose a plan and payment method. Prices are calculated server-side — you cannot be overcharged.",
            "selectPlan": "Select a plan",
            "billingCycle": "Billing cycle",
            "monthly": "Monthly",
            "annual": "Annual",
            "payWith": "Pay with",
            "continueToPayment": "Continue to payment",
            "invoiceHistory": "Invoice history",
            "invoiceHistoryDesc": "All payment invoices and their status.",
            "noInvoices": "No invoices yet.",
            "invoiceId": "Invoice ID",
            "amount": "Amount",
            "cryptoAmount": "Crypto amount",
            "provider": "Provider",
            "invoiceStatus": "Status",
            "date": "Date",
        },
        "anomalies": {
            "subtitle": "Auto-detected suspicious patterns. Resolve after investigation.",
            "activeTitle": "Active anomalies",
            "activeDesc": "New anomalies are detected hourly by the cron job.",
            "empty": "No active anomalies",
            "emptySub": "All clear.",
            "detectedPrefix": "Detected",
            "actorLabel": "actor:",
            "ipLabel": "IP:",
            "resolve": "Resolve",
            "resolvedToast": "Anomaly resolved",
        },
        "breakGlass": {
            "subtitle": "Emergency elevated access for critical situations. All actions are audit-logged and all other admins are notified.",
            "warningTitle": "Use with extreme caution",
            "warningBody": "Break-glass grants full tenant admin permissions for 30 minutes. All actions are audit-logged and all other admins are notified immediately.",
            "requestTitle": "Request break-glass access",
            "requestDesc": "Provide a detailed reason and justification for the emergency.",
            "reasonLabel": "Reason (min 10 chars) *",
            "reasonPlaceholder": "Production incident requiring admin access",
            "justificationLabel": "Justification (min 20 chars) *",
            "justificationPlaceholder": "Detailed explanation of why break-glass is needed and what actions will be taken...",
            "requestButton": "Request break-glass access",
            "activeTitle": "Break-glass active",
            "expiresLabel": "Expires:",
            "tokenLabel": "Token:",
            "tokenWarning": "⚠️ Store this token securely. It grants full admin access until expiry.",
            "historyTitle": "History",
            "historyDesc": "All break-glass events (pending review + reviewed)",
            "historyEmpty": "No break-glass events recorded.",
            "reviewed": "Reviewed",
            "pendingReview": "Pending review",
            "grantedToastTitle": "Break-glass access granted",
            "grantedToastDesc": "Expires in 30 minutes. All actions are audit-logged.",
        },
        "jobs": {
            "subtitle": "Monitor background job queues, retry failed jobs, and manage queue lifecycle.",
            "autoRefreshOn": "Auto-refresh on (10s)",
            "autoRefreshOff": "Auto-refresh off",
            "live": "Live",
            "paused": "Paused",
            "redisUnavailableTitle": "Redis is not configured — background job queues are unavailable",
            "redisUnavailableBody": "Jobs run in-process (fire-and-forget) without retries or DLQ. Configure REDIS_URL for production-grade job processing.",
            "waiting": "Waiting",
            "active": "Active",
            "failed": "Failed",
            "completed": "Completed:",
            "delayed": "Delayed:",
            "failedJobsTitle": "Failed Jobs",
            "failedJobsDesc": "Retry or cancel failed jobs. Jobs are auto-retried per queue policy before appearing here.",
            "attempt": "Attempt",
            "na": "N/A",
            "retry": "Retry",
            "historyTitle": "Job History",
            "historyDesc": "Recent background jobs (OCR, webhooks, evidence, reindex)",
            "empty": "No jobs found.",
            "statusAll": "All status",
            "statusCompleted": "Completed",
            "statusFailed": "Failed",
            "statusRunning": "Running",
            "statusPending": "Pending",
            "queueAll": "All queues",
            "queueOcr": "OCR",
            "queueWebhook": "Webhook",
            "queueEvidence": "Evidence",
            "queueReindex": "Reindex",
            "retriedToast": "Job retried",
            "cancelledToast": "Job cancelled",
        },
        "invitations": {
            "subtitle": "Invite new users. Each invitation generates a secure one-time URL.",
            "newButton": "New invitation",
            "createdTitle": "Invitation created",
            "inviteTitle": "Invite user",
            "createdDesc": "Copy this URL and deliver it to the recipient securely. Expires in 7 days.",
            "inviteDesc": "Send an invitation to a new user.",
            "copiedToast": "Copied",
            "copyUrl": "Copy URL",
            "emailLabel": "Email *",
            "rolesLabel": "Roles",
            "cardTitle": "Invitations",
            "cardDesc": "Pending, accepted, and expired",
            "statusAll": "All",
            "statusPending": "Pending",
            "statusAccepted": "Accepted",
            "statusExpired": "Expired",
            "empty": "No invitations found.",
            "invitedPrefix": "Invited",
            "expiresPrefix": "expires",
        },
        "users": {
            "searchPlaceholder": "Search by email or name…",
            "empty": "No users found",
            "createUserDesc": "If no password is set, a temporary one will be generated.",
            "passwordOptional": "Password (optional)",
            "role": "Role",
        },
    },

    # Shared document viewer
    "shared": {
        "accessDeniedTitle": "Access denied",
        "secureShareHeader": "Smart EDMS — Secure Share",
        "modeLabel": "Mode:",
        "viewsLabel": "Views:",
        "sharedByPrefix": "Shared by",
        "expiresLabel": "Expires:",
        "watermarkNotice": "A dynamic watermark identifying the viewer will be overlaid on the document.",
        "downloadDocumentButton": "Download document",
        "viewDocumentButton": "View document",
        "footer": "Smart EDMS — access is logged and tamper-evident. Unauthorized use is prohibited.",
        "downloadStartHint": "Your download should start automatically. If not, click below:",
    },

    # Auth
    "auth": {
        "passwordMinHint": "Min 8 chars",
    },
}

def deep_merge(base: dict, addition: dict) -> dict:
    """Recursively merge addition into base. Existing keys are NOT overwritten."""
    for key, value in addition.items():
        if key in base:
            if isinstance(base[key], dict) and isinstance(value, dict):
                deep_merge(base[key], value)
            # else: key already exists, skip
        else:
            base[key] = value
    return base

def main():
    for locale in LOCALES:
        filepath = MESSAGES_DIR / f"{locale}.json"
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Deep-merge new keys (English values for all locales as placeholder)
        before_keys = set()
        def collect_keys(d, prefix=""):
            for k, v in d.items():
                full = f"{prefix}.{k}" if prefix else k
                if isinstance(v, dict):
                    collect_keys(v, full)
                else:
                    before_keys.add(full)
        collect_keys(data)

        deep_merge(data, copy.deepcopy(NEW_KEYS))

        after_keys = set()
        collect_keys(data, after_keys)
        added = after_keys - before_keys

        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write('\n')

        print(f"  {locale}: +{len(added)} keys ({len(before_keys)} → {len(after_keys)} total)")

    print(f"\n✅ All 5 locale files updated.")

if __name__ == '__main__':
    main()
