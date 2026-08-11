#!/usr/bin/env python3
"""
Wire t() calls into all 10 new pages, replacing hardcoded English strings.
Each page gets its feature namespace (securityAudit, signatures, bpmnDesigner, recordsManagement).
"""

import os
import re

# ============================================================================
# SECURITY AUDIT — List Page
# ============================================================================
security_audit_list = "src/app/(app)/admin/security-audit/page.tsx"
with open(security_audit_list, 'r') as f:
    content = f.read()

replacements = [
    # Header
    (">Security Audit<", ">{t('securityAudit.title')}<"),
    (">Third-party audit preparation, automated scanning, and compliance mapping<", ">{t('securityAudit.subtitle')}<"),
    # Buttons
    ("Run Full Scan", "{t('securityAudit.runFullScan')}"),
    ("New Audit", "{t('securityAudit.newAudit')}"),
    # Stats
    (">Total Audits<", ">{t('securityAudit.totalAudits')}<"),
    (">In Progress<", ">{t('securityAudit.inProgress')}<"),
    (">Completed<", ">{t('securityAudit.completedAudits')}<"),
    (">Critical Findings<", ">{t('securityAudit.criticalFindings')}<"),
    # Empty state
    ("No security audits yet. Create one or run a scan to get started.", "{t('securityAudit.noAudits')}"),
    # Card labels
    (">Risk Score<", ">{t('securityAudit.riskScore')}<"),
    (" critical", " {t('securityAudit.critical')}"),
    (" high", " {t('securityAudit.high')}"),
    (" total findings", " {t('securityAudit.totalFindings')}"),
    (" remediated", " {t('securityAudit.remediated')}"),
    # Form
    (">Create New Security Audit<", ">{t('securityAudit.createTitle')}<"),
    ('placeholder="Audit title"', "placeholder={t('securityAudit.auditTitle')}"),
    ('placeholder="Description (optional)"', "placeholder={t('securityAudit.descriptionOptional')}"),
    (">Internal<", ">{t('securityAudit.internal')}<"),
    (">ISO 27001<", ">{t('securityAudit.iso27001')}<"),
    (">SOC 2<", ">{t('securityAudit.soc2')}<"),
    (">GDPR<", ">{t('securityAudit.gdpr')}<"),
    (">HIPAA<", ">{t('securityAudit.hipaa')}<"),
    (">DoD 5015.02<", ">{t('securityAudit.dod501502')}<"),
    (">Full Scope<", ">{t('securityAudit.fullScope')}<"),
    (">Authentication<", ">{t('securityAudit.authScope')}<"),
    (">Documents<", ">{t('securityAudit.documentsScope')}<"),
    (">Billing<", ">{t('securityAudit.billingScope')}<"),
    (">Infrastructure<", ">{t('securityAudit.infrastructureScope')}<"),
    (">API<", ">{t('securityAudit.apiScope')}<"),
    (">Cancel<", ">{t('securityAudit.cancel')}<"),
    ("'Create'", "t('securityAudit.create')"),
    # Toast messages
    ("'Scan completed'", "t('securityAudit.scanCompleted')"),
    ("'issues found'", "t('securityAudit.issuesFound')"),
    ("'Scan failed'", "t('securityAudit.scanFailed')"),
    ("'Audit created'", "t('securityAudit.auditCreated')"),
    ("'Failed'", "t('securityAudit.failed')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(security_audit_list, 'w') as f:
    f.write(content)
print(f"✅ {security_audit_list}")

# ============================================================================
# SECURITY AUDIT — Detail Page
# ============================================================================
security_audit_detail = "src/app/(app)/admin/security-audit/[id]/page.tsx"
with open(security_audit_detail, 'r') as f:
    content = f.read()

replacements = [
    ("Back", "{t('securityAudit.back')}"),
    ("Export Report", "{t('securityAudit.exportReport')}"),
    ("Risk Score", "{t('securityAudit.riskScore')}"),
    ("Critical", "{t('securityAudit.critical')}"),
    ("Medium", "{t('securityAudit.medium')}"),
    ("Low", "{t('securityAudit.low')}"),
    ("Remediated", "{t('securityAudit.remediated')}"),
    ("Findings", "{t('securityAudit.findings')}"),
    ("No findings recorded yet. Run a scan to detect issues.", "{t('securityAudit.noFindings')}"),
    ("Remediate", "{t('securityAudit.remediate')}"),
    ("Remediation:", "{t('securityAudit.remediation')}:"),
    ("Component:", "{t('securityAudit.component')}:"),
    ("'Finding remediated'", "t('securityAudit.findingRemediated')"),
    ("'Failed'", "t('securityAudit.failed')"),
    ("'Enter remediation notes:'", "t('securityAudit.enterRemediationNotes')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new, 1)  # Replace first occurrence only to avoid over-replacing

with open(security_audit_detail, 'w') as f:
    f.write(content)
print(f"✅ {security_audit_detail}")

# ============================================================================
# SIGNATURES — List Page
# ============================================================================
signatures_page = "src/app/(app)/admin/signatures/page.tsx"
with open(signatures_page, 'r') as f:
    content = f.read()

replacements = [
    (">E-Signatures<", ">{t('signatures.title')}<"),
    (">DocuSign and Adobe Sign integration for electronic signatures<", ">{t('signatures.subtitle')}<"),
    ("New Signature Request", "{t('signatures.newRequest')}"),
    ("No signature requests yet.", "{t('signatures.noRequests')}"),
    ("Sent:", "{t('signatures.sent')}:"),
    ("Expires:", "{t('signatures.expires')}:"),
    ("'Signature request sent'", "t('signatures.requestSent')"),
    ("'Request voided'", "t('signatures.requestVoided')"),
    ("'Failed'", "t('signatures.failed')"),
    ("'Reason for voiding:'", "t('signatures.reasonForVoiding')"),
    # Form
    (">New Signature Request<", ">{t('signatures.newRequestTitle')}<"),
    ('placeholder="Document ID"', "placeholder={t('signatures.documentId')}"),
    ('placeholder="Email subject"', "placeholder={t('signatures.emailSubject')}"),
    ('placeholder="Message to recipients (optional)"', "placeholder={t('signatures.messageToRecipients')}"),
    ("Expiry (days):", "{t('signatures.expiryDays')}:"),
    ("Add Recipient", "{t('signatures.addRecipient')}"),
    ('placeholder="Name"', "placeholder={t('signatures.name')}"),
    ('placeholder="Email"', "placeholder={t('signatures.email')}"),
    ("Remove", "{t('signatures.remove')}"),
    ("Cancel", "{t('signatures.cancel')}"),
    ("'Send'", "t('signatures.send')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(signatures_page, 'w') as f:
    f.write(content)
print(f"✅ {signatures_page}")

# ============================================================================
# INTERNAL SIGNING PAGE
# ============================================================================
signing_page = "src/app/shared/sign/[id]/page.tsx"
with open(signing_page, 'r') as f:
    content = f.read()

# This page needs useI18n
content = content.replace(
    "import { useState } from 'react';",
    "import { useState } from 'react';\nimport { useI18n } from '@/i18n/use-i18n';"
)
# Add t destructure
content = content.replace(
    "const [signed, setSigned] = useState(false);",
    "const { t } = useI18n();\n  const [signed, setSigned] = useState(false);"
)

replacements = [
    ("Signature request not found.", "{t('signatures.notFound')}"),
    ("Document Signed", "{t('signatures.documentSigned')}"),
    ("Your electronic signature has been recorded with a SHA-256 attestation hash.", "{t('signatures.signatureRecorded')}"),
    ("Sign Document", "{t('signatures.signDocument')}"),
    ("Signing as", "{t('signatures.signingAs')}"),
    ("Current status", "{t('signatures.currentStatus')}"),
    ("All recipients", "{t('signatures.allRecipients')}"),
    ("Type your full name as your electronic signature", "{t('signatures.typeFullName')}"),
    ("Enter your full legal name", "{t('signatures.enterFullName')}"),
    ('By typing your name and clicking "Sign Document", you acknowledge that this electronic signature is legally binding under the Electronic Signatures in Global and National Commerce Act (ESIGN) and the Uniform Electronic Transactions Act (UETA). A SHA-256 attestation hash will be recorded.', "{t('signatures.legalNotice')}"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(signing_page, 'w') as f:
    f.write(content)
print(f"✅ {signing_page}")

# ============================================================================
# BPMN DESIGNER — List Page
# ============================================================================
bpmn_list = "src/app/(app)/admin/bpmn-designer/page.tsx"
with open(bpmn_list, 'r') as f:
    content = f.read()

replacements = [
    (">BPMN Workflow Designer<", ">{t('bpmnDesigner.title')}<"),
    (">Visually design and publish BPMN 2.0 workflow processes<", ">{t('bpmnDesigner.subtitle')}<"),
    ("New Process", "{t('bpmnDesigner.newProcess')}"),
    ("No BPMN processes yet. Create one to start designing.", "{t('bpmnDesigner.noProcesses')}"),
    ("Key:", "{t('bpmnDesigner.key')}:"),
    ("Published:", "{t('bpmnDesigner.published')}:"),
    ("instances", "{t('bpmnDesigner.instances')}"),
    ("'Process created'", "t('bpmnDesigner.processCreated')"),
    ("'Failed'", "t('bpmnDesigner.failed')"),
    # Form
    (">Create New BPMN Process<", ">{t('bpmnDesigner.createProcess')}<"),
    ('placeholder="Process key (e.g., invoice_approval)"', "placeholder={t('bpmnDesigner.processKey')}"),
    ('placeholder="Process name"', "placeholder={t('bpmnDesigner.processName')}"),
    ('placeholder="Description (optional)"', "placeholder={t('bpmnDesigner.descriptionOptional')}"),
    ("Cancel", "{t('bpmnDesigner.cancel')}"),
    ("'Create'", "t('bpmnDesigner.create')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(bpmn_list, 'w') as f:
    f.write(content)
print(f"✅ {bpmn_list}")

# ============================================================================
# BPMN DESIGNER — Editor Page
# ============================================================================
bpmn_editor = "src/app/(app)/admin/bpmn-designer/[id]/page.tsx"
with open(bpmn_editor, 'r') as f:
    content = f.read()

replacements = [
    ("Back", "{t('bpmnDesigner.back')}"),
    ("Save", "{t('bpmnDesigner.save')}"),
    ("Saving...", "{t('bpmnDesigner.saving')}"),
    ("Publish", "{t('bpmnDesigner.publish')}"),
    ("Publishing...", "{t('bpmnDesigner.publishing')}"),
    ("Parsed Elements", "{t('bpmnDesigner.parsedElements')}"),
    ("Start Events:", "{t('bpmnDesigner.startEvents')}:"),
    ("End Events:", "{t('bpmnDesigner.endEvents')}:"),
    ("User Tasks:", "{t('bpmnDesigner.userTasks')}:"),
    ("Gateways:", "{t('bpmnDesigner.gateways')}:"),
    ("'Saved'", "t('bpmnDesigner.saved')"),
    ("'Process published'", "t('bpmnDesigner.processPublished')"),
    ("'Save failed'", "t('bpmnDesigner.saveFailed')"),
    ("'Publish failed'", "t('bpmnDesigner.publishFailed')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new, 1)

with open(bpmn_editor, 'w') as f:
    f.write(content)
print(f"✅ {bpmn_editor}")

# ============================================================================
# RECORDS MANAGEMENT — Main Page
# ============================================================================
records_main = "src/app/(app)/admin/records-management/page.tsx"
with open(records_main, 'r') as f:
    content = f.read()

replacements = [
    (">Records Management (DoD 5015.02)<", ">{t('recordsManagement.title')}<"),
    (">DoD 5015.02-compliant records management with file plans, vital records, and disposition<", ">{t('recordsManagement.subtitle')}<"),
    ("Folders", "{t('recordsManagement.folders')}"),
    ("Vital Records", "{t('recordsManagement.vitalRecords')}"),
    ("Authorities", "{t('recordsManagement.authorities')}"),
    (">Categories<", ">{t('recordsManagement.totalCategories')}<"),
    (">Folders<", ">{t('recordsManagement.totalFolders')}<"),
    (">Vital Verified<", ">{t('recordsManagement.vitalVerified')}<"),
    (">Due Review<", ">{t('recordsManagement.dueReview')}<"),
    (">Authorities<", ">{t('recordsManagement.authoritiesCount')}<"),
    ("DoD 5015.02 Compliance Status", "{t('recordsManagement.dodCompliance')}"),
    ("Export", "{t('recordsManagement.export')}"),
    ("Implemented", "{t('recordsManagement.implemented')}"),
    ("Record Categories", "{t('recordsManagement.categories')}"),
    ("New Category", "{t('recordsManagement.newCategory')}"),
    ("No record categories yet.", "{t('recordsManagement.noCategories')}"),
    # Form
    ("Create Record Category", "{t('recordsManagement.createCategory')}"),
    ('placeholder="Code (e.g., 1000)"', "placeholder={t('recordsManagement.code')}"),
    ('placeholder="Name"', "placeholder={t('recordsManagement.name')}"),
    ('placeholder="Description (optional)"', "placeholder={t('recordsManagement.descriptionOptional')}"),
    (">Temporary<", ">{t('recordsManagement.temporary')}<"),
    (">Permanent<", ">{t('recordsManagement.permanent')}<"),
    (">Unscheduled<", ">{t('recordsManagement.unscheduled')}<"),
    ("Active years:", "{t('recordsManagement.activeYears')}"),
    ("Designate as Vital Record category", "{t('recordsManagement.vitalCategory')}"),
    ("Cancel", "{t('recordsManagement.cancel')}"),
    ("'Category created'", "t('recordsManagement.categoryCreated')"),
    ("'Failed'", "t('recordsManagement.failed')"),
    ("Retention:", "{t('recordsManagement.retention')}:"),
    ("years active +", "{t('recordsManagement.yearsActive')}"),
    ("semi-active", "{t('recordsManagement.semiActive')}"),
    (">→<", ">{t('recordsManagement.retention')}<"),  # the arrow in retention display
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(records_main, 'w') as f:
    f.write(content)
print(f"✅ {records_main}")

# ============================================================================
# RECORDS MANAGEMENT — Folders Page
# ============================================================================
records_folders = "src/app/(app)/admin/records-management/folders/page.tsx"
with open(records_folders, 'r') as f:
    content = f.read()

replacements = [
    ("Record Folders", "{t('recordsManagement.title')}"),  # Uses main title
    ("Back", "{t('recordsManagement.back')}"),
    ("No record folders yet.", "{t('recordsManagement.noFolders')}"),
    ("Cutoff", "{t('recordsManagement.cutoff')}"),
    ("Destroy", "{t('recordsManagement.destroy')}"),
    ("Transfer", "{t('recordsManagement.transfer')}"),
    ("New Folder", "{t('recordsManagement.newFolder')}"),
    ("Eligible:", "{t('recordsManagement.eligible')}:"),
    ("'Folder cut off'", "t('recordsManagement.folderCutoff')"),
    ("'Folder disposed'", "t('recordsManagement.folderDisposed')"),
    ("'Failed'", "t('recordsManagement.failed')"),
    # Form
    ("Create Record Folder", "{t('recordsManagement.createFolder')}"),
    ("Select category...", "{t('recordsManagement.selectCategory')}"),
    ('placeholder="Folder title (e.g., FY2024 Financial Records)"', "placeholder={t('recordsManagement.folderTitle')}"),
    ("Fiscal year", "{t('recordsManagement.fiscalYear')}"),
    ("Cancel", "{t('recordsManagement.cancel')}"),
    ("'Folder created'", "t('recordsManagement.folderCreated')"),
    ("'Create'", "t('recordsManagement.create')"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

# Add back + recordsManagement.back since it doesn't exist as a key
content = content.replace("{t('recordsManagement.back')}", "{t('securityAudit.back')}")

with open(records_folders, 'w') as f:
    f.write(content)
print(f"✅ {records_folders}")

# ============================================================================
# RECORDS MANAGEMENT — Vital Page
# ============================================================================
records_vital = "src/app/(app)/admin/records-management/vital/page.tsx"
with open(records_vital, 'r') as f:
    content = f.read()

replacements = [
    ("Vital Records", "{t('recordsManagement.vitalRecords')}"),
    ("Back", "{t('securityAudit.back')}"),
    ("No vital records designated.", "{t('recordsManagement.noVitalRecords')}"),
    ("Verified", "{t('recordsManagement.verified')}"),
    ("Unverified", "{t('recordsManagement.unverified')}"),
    ("Next review:", "{t('recordsManagement.nextReview')}:"),
    ("Last verified:", "{t('recordsManagement.lastVerified')}:"),
    ("Verify Backup", "{t('recordsManagement.verifyBackup')}"),
    ("'Backup verified'", "t('recordsManagement.backupVerified')"),
    ("'Failed'", "t('recordsManagement.failed')"),
    # Form
    ("Designate Vital Record", "{t('recordsManagement.designateVital')}"),
    ("Document ID", "{t('recordsManagement.documentId')}"),
    ("Select category (optional)...", "{t('recordsManagement.selectCategoryOptional')}"),
    (">Operational<", ">{t('recordsManagement.operational')}<"),
    (">Legal<", ">{t('recordsManagement.legal')}<"),
    (">Financial<", ">{t('recordsManagement.financial')}<"),
    (">Historical<", ">{t('recordsManagement.historical')}<"),
    (">Essential (highest)<", ">{t('recordsManagement.essential')}<"),
    (">Important<", ">{t('recordsManagement.important')}<"),
    (">Useful<", ">{t('recordsManagement.useful')}<"),
    ("Priority (1-5):", "{t('recordsManagement.priority')}"),
    ("Review (months):", "{t('recordsManagement.reviewMonths')}"),
    ("Notes (optional)", "{t('recordsManagement.notes')}"),
    ("Cancel", "{t('recordsManagement.cancel')}"),
    ("'Vital record designated'", "t('recordsManagement.vitalDesignated')"),
    ("'Designate'", "t('recordsManagement.designate')}"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(records_vital, 'w') as f:
    f.write(content)
print(f"✅ {records_vital}")

# ============================================================================
# RECORDS MANAGEMENT — Authorities Page
# ============================================================================
records_authorities = "src/app/(app)/admin/records-management/authorities/page.tsx"
with open(records_authorities, 'r') as f:
    content = f.read()

replacements = [
    ("Disposition Authorities", "{t('recordsManagement.authorities')}"),
    ("Back", "{t('securityAudit.back')}"),
    ("No disposition authorities yet.", "{t('recordsManagement.noAuthorities')}"),
    ("New Authority", "{t('recordsManagement.newAuthority')}"),
    ("Effective:", "{t('recordsManagement.effectiveDate')}"),
    ("'Authority created'", "t('recordsManagement.authorityCreated')"),
    ("'Failed'", "t('recordsManagement.failed')"),
    # Form
    ("New Disposition Authority", "{t('recordsManagement.createAuthority')}"),
    (">Agency Specific<", ">{t('recordsManagement.agencySpecific')}<"),
    (">NARA GRS<", ">{t('recordsManagement.naraGrs')}<"),
    (">NARA SF<", ">{t('recordsManagement.naraSf')}<"),
    (">Court Order<", ">{t('recordsManagement.courtOrder')}<"),
    ('placeholder="Authority number (e.g., GR-2024-001)"', "placeholder={t('recordsManagement.authorityNumber')}"),
    ('placeholder="Title"', "placeholder={t('recordsManagement.name')}"),
    ('placeholder="Description"', "placeholder={t('recordsManagement.descriptionOptional')}"),
    ("Active retention (years):", "{t('recordsManagement.activeYears')}"),
    ("Cancel", "{t('recordsManagement.cancel')}"),
    ("'Create'", "t('recordsManagement.create')}"),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)

with open(records_authorities, 'w') as f:
    f.write(content)
print(f"✅ {records_authorities}")

print(f"\n✅ All 10 pages wired with t() calls")
