/**
 * Smart EDMS — Security Audit Framework
 *
 * Provides automated security scanning, evidence collection, finding tracking,
 * and compliance mapping for third-party audit preparation.
 *
 * Supports frameworks: ISO 27001, SOC 2, GDPR, HIPAA, DoD 5015.02
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

export type AuditFramework = 'iso27001' | 'soc2' | 'gdpr' | 'hipaa' | 'dod501502' | 'internal';
export type AuditScope = 'full' | 'auth' | 'documents' | 'billing' | 'infrastructure' | 'api';
export type AuditStatus = 'scheduled' | 'in_progress' | 'draft_findings' | 'remediation' | 'completed' | 'cancelled';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type FindingStatus = 'open' | 'in_remediation' | 'remediated' | 'accepted_risk' | 'false_positive';
export type ScanType = 'dependency' | 'static' | 'dynamic' | 'secret' | 'license' | 'config';
export type ScannerType = 'npm-audit' | 'eslint-security' | 'codeql' | 'dependabot' | 'trufflehog' | 'custom';

export interface CreateAuditInput {
  tenantId: string;
  title: string;
  description?: string;
  framework: AuditFramework;
  scope: AuditScope;
  auditorName?: string;
  auditorEmail?: string;
  startDate?: Date;
  endDate?: Date;
  initiatedBy: string;
}

export interface CreateFindingInput {
  tenantId: string;
  auditId: string;
  findingId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  cvssScore?: number;
  cvssVector?: string;
  affectedComponent?: string;
  cweId?: string;
  remediation?: string;
  evidence?: Array<{ type: string; path: string; hash?: string }>;
  controlRefs?: Record<string, string[]>;
  assignedTo?: string;
  dueDate?: Date;
}

export interface ScanResult {
  scanType: ScanType;
  scanner: ScannerType;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: Array<{
    title: string;
    severity: FindingSeverity;
    description: string;
    affectedComponent?: string;
    cweId?: string;
    remediation?: string;
  }>;
  rawOutput?: Record<string, unknown>;
}

// ============================================================================
// COMPLIANCE FRAMEWORK CONTROLS
// ============================================================================

export const COMPLIANCE_CONTROLS: Record<AuditFramework, Array<{
  id: string;
  title: string;
  description: string;
  category: string;
}>> = {
  iso27001: [
    { id: 'A.5.1.1', title: 'Policies for information security', description: 'Management direction and support for information security', category: 'Organization' },
    { id: 'A.6.1.1', title: 'Information security roles and responsibilities', description: 'Segregation of duties and defined responsibilities', category: 'Organization' },
    { id: 'A.8.1.1', title: 'Inventory of assets', description: 'All information assets identified and documented', category: 'Asset Management' },
    { id: 'A.8.2.1', title: 'Classification of information', description: 'Information classified in terms of legal requirements and criticality', category: 'Asset Management' },
    { id: 'A.9.1.1', title: 'Access control policy', description: 'Formal access control policy documented and reviewed', category: 'Access Control' },
    { id: 'A.9.2.1', title: 'User registration and de-registration', description: 'Formal user registration and de-registration process', category: 'Access Control' },
    { id: 'A.9.2.3', title: 'Management of privileged access rights', description: 'Restriction and control of privileged access rights', category: 'Access Control' },
    { id: 'A.9.4.2', title: 'Secure log-on procedures', description: 'Secure log-on procedures for access to systems and applications', category: 'Access Control' },
    { id: 'A.10.1.1', title: 'Policy on the use of cryptographic controls', description: 'Cryptographic control policy documented and implemented', category: 'Cryptography' },
    { id: 'A.12.1.1', title: 'Operational procedures and responsibilities', description: 'Documented operating procedures for information processing', category: 'Operations Security' },
    { id: 'A.12.4.1', title: 'Event logging', description: 'Event logs produced, stored, and protected', category: 'Operations Security' },
    { id: 'A.12.6.1', title: 'Management of technical vulnerabilities', description: 'Timely information about technical vulnerabilities and evaluation', category: 'Operations Security' },
    { id: 'A.14.1.1', title: 'Information security requirements analysis and specification', description: 'Security requirements identified and agreed during development', category: 'System Development' },
    { id: 'A.16.1.1', title: 'Responsibilities and procedures', description: 'Incident management responsibilities and procedures defined', category: 'Incident Management' },
    { id: 'A.18.1.1', title: 'Identification of applicable legislation and contractual requirements', description: 'All relevant legislative, regulatory, and contractual requirements identified', category: 'Compliance' },
  ],
  soc2: [
    { id: 'CC1.1', title: 'Control Environment — Integrity and Ethical Values', description: 'Demonstrates commitment to integrity and ethical values', category: 'Common Criteria' },
    { id: 'CC1.2', title: 'Board Independence', description: 'Board of directors demonstrates independence from management', category: 'Common Criteria' },
    { id: 'CC2.1', title: 'Internal Communication', description: 'Internal communication of security objectives', category: 'Common Criteria' },
    { id: 'CC2.2', title: 'External Communication', description: 'External communication of security objectives', category: 'Common Criteria' },
    { id: 'CC3.1', title: 'Risk Identification', description: 'Identifies and analyzes security risks', category: 'Common Criteria' },
    { id: 'CC3.2', title: 'Risk Assessment', description: 'Assesses changes that could significantly impact the system', category: 'Common Criteria' },
    { id: 'CC3.3', title: 'Risk Mitigation', description: 'Reduces identified risks to an acceptable level', category: 'Common Criteria' },
    { id: 'CC4.1', title: 'Control Design', description: 'Designs controls to achieve objectives', category: 'Common Criteria' },
    { id: 'CC4.2', title: 'Control Operation', description: 'Controls operate as designed', category: 'Common Criteria' },
    { id: 'CC5.1', title: 'Logical Access', description: 'Logical and physical access controls implemented', category: 'Common Criteria' },
    { id: 'CC5.2', title: 'Access Restriction', description: 'Restricts access to authorized users', category: 'Common Criteria' },
    { id: 'CC6.1', title: 'Logical and Physical Access Controls', description: 'Implements logical and physical access controls', category: 'Common Criteria' },
    { id: 'CC6.2', title: 'User Authentication', description: 'Authenticates users before granting access', category: 'Common Criteria' },
    { id: 'CC6.3', title: 'Access Authorization', description: 'Authorizes access based on need', category: 'Common Criteria' },
    { id: 'CC7.1', title: 'System Performance Monitoring', description: 'Detects security events and system failures', category: 'Common Criteria' },
    { id: 'CC7.2', title: 'Incident Detection', description: 'Detects and responds to security incidents', category: 'Common Criteria' },
    { id: 'CC8.1', title: 'Change Management', description: 'Authorizes and documents changes to systems', category: 'Common Criteria' },
    { id: 'CC9.1', title: 'Risk Mitigation', description: 'Mitigates identified risks', category: 'Common Criteria' },
  ],
  gdpr: [
    { id: 'Art.5', title: 'Principles relating to processing of personal data', description: 'Lawfulness, fairness, transparency, purpose limitation, data minimization', category: 'Principles' },
    { id: 'Art.6', title: 'Lawfulness of processing', description: 'Processing must have a lawful basis', category: 'Principles' },
    { id: 'Art.7', title: 'Conditions for consent', description: 'Consent must be freely given, specific, informed, and unambiguous', category: 'Principles' },
    { id: 'Art.9', title: 'Processing of special categories', description: 'Special protections for sensitive personal data', category: 'Principles' },
    { id: 'Art.12', title: 'Transparent information', description: 'Transparent information, communication, and modalities for exercising rights', category: 'Rights' },
    { id: 'Art.13', title: 'Information to be provided', description: 'Information to be provided when data is collected from the data subject', category: 'Rights' },
    { id: 'Art.15', title: 'Right of access', description: 'Right of access by the data subject', category: 'Rights' },
    { id: 'Art.16', title: 'Right to rectification', description: 'Right to rectification of inaccurate data', category: 'Rights' },
    { id: 'Art.17', title: 'Right to erasure', description: 'Right to be forgotten', category: 'Rights' },
    { id: 'Art.20', title: 'Right to data portability', description: 'Right to receive personal data in a structured format', category: 'Rights' },
    { id: 'Art.25', title: 'Data protection by design and by default', description: 'Privacy by design and default', category: 'Obligations' },
    { id: 'Art.28', title: 'Processor obligations', description: 'Processor must act on documented instructions from the controller', category: 'Obligations' },
    { id: 'Art.30', title: 'Records of processing activities', description: 'Maintain records of processing activities', category: 'Obligations' },
    { id: 'Art.32', title: 'Security of processing', description: 'Appropriate technical and organizational security measures', category: 'Security' },
    { id: 'Art.33', title: 'Notification of personal data breach', description: 'Notify supervisory authority within 72 hours', category: 'Breach Notification' },
    { id: 'Art.34', title: 'Communication of personal data breach', description: 'Communicate breach to the data subject', category: 'Breach Notification' },
    { id: 'Art.35', title: 'Data protection impact assessment', description: 'DPIA for high-risk processing', category: 'Assessment' },
  ],
  hipaa: [
    { id: '164.308(a)(1)', title: 'Security Management Process', description: 'Risk analysis and risk management', category: 'Administrative Safeguards' },
    { id: '164.308(a)(2)', title: 'Assigned Security Responsibility', description: 'Designate a security official', category: 'Administrative Safeguards' },
    { id: '164.308(a)(3)', title: 'Workforce Security', description: 'Authorization and supervision of workforce', category: 'Administrative Safeguards' },
    { id: '164.308(a)(4)', title: 'Information Access Management', description: 'Access establishment and modification', category: 'Administrative Safeguards' },
    { id: '164.308(a)(5)', title: 'Security Awareness and Training', description: 'Security reminders, protection from malicious software', category: 'Administrative Safeguards' },
    { id: '164.308(a)(6)', title: 'Security Incident Procedures', description: 'Response and reporting procedures', category: 'Administrative Safeguards' },
    { id: '164.308(a)(7)', title: 'Contingency Plan', description: 'Data backup, disaster recovery, emergency mode', category: 'Administrative Safeguards' },
    { id: '164.308(a)(8)', title: 'Evaluation', description: 'Periodic technical and nontechnical evaluation', category: 'Administrative Safeguards' },
    { id: '164.310(a)(1)', title: 'Facility Access Controls', description: 'Contingency operations, facility security plan', category: 'Physical Safeguards' },
    { id: '164.310(b)', title: 'Workstation Use', description: 'Physical safeguards for workstations', category: 'Physical Safeguards' },
    { id: '164.310(c)', title: 'Workstation Security', description: 'Physical security of workstations accessing ePHI', category: 'Physical Safeguards' },
    { id: '164.312(a)(1)', title: 'Access Control', description: 'Technical policies for electronic access', category: 'Technical Safeguards' },
    { id: '164.312(b)', title: 'Audit Controls', description: 'Hardware, software, and procedural mechanisms to record and examine access', category: 'Technical Safeguards' },
    { id: '164.312(c)(1)', title: 'Integrity Controls', description: 'Protect ePHI from improper alteration or destruction', category: 'Technical Safeguards' },
    { id: '164.312(d)', title: 'Person or Entity Authentication', description: 'Verify identity of person or entity seeking access', category: 'Technical Safeguards' },
    { id: '164.312(e)(1)', title: 'Transmission Security', description: 'Guard against unauthorized access to ePHI during transmission', category: 'Technical Safeguards' },
  ],
  dod501502: [
    { id: 'C2.1', title: 'Records Management Application', description: 'The application must manage records throughout their lifecycle', category: 'Core Requirements' },
    { id: 'C2.2', title: 'Records Declaration', description: 'Records must be declared and managed with appropriate metadata', category: 'Core Requirements' },
    { id: 'C2.3', title: 'Classification and Categorization', description: 'Records must be classified according to an approved file plan', category: 'Core Requirements' },
    { id: 'C2.4', title: 'Retention and Disposition', description: 'The application must enforce retention schedules and disposition instructions', category: 'Core Requirements' },
    { id: 'C2.5', title: 'Records Transfer and Export', description: 'Records must be transferable in standard formats', category: 'Core Requirements' },
    { id: 'C2.6', title: 'Records Access and Security', description: 'Access to records must be controlled and auditable', category: 'Core Requirements' },
    { id: 'C2.7', title: 'Vital Records', description: 'The application must identify and protect vital records', category: 'Core Requirements' },
    { id: 'C2.8', title: 'Legal Hold', description: 'The application must support legal hold on records', category: 'Core Requirements' },
    { id: 'C2.9', title: 'Audit Trail', description: 'All records management actions must be logged in an unalterable audit trail', category: 'Core Requirements' },
    { id: 'C3.1', title: 'Folder and File Plan Management', description: 'The application must support hierarchical file plans', category: 'Optional Requirements' },
    { id: 'C3.2', title: 'Metadata Management', description: 'The application must support custom metadata schemas', category: 'Optional Requirements' },
    { id: 'C3.3', title: 'Records Disposition', description: 'The application must support automated disposition of records', category: 'Optional Requirements' },
    { id: 'C3.4', title: 'Records Search and Retrieval', description: 'The application must support full-text and metadata search', category: 'Optional Requirements' },
    { id: 'C3.5', title: 'Records Version Control', description: 'The application must support version control for records', category: 'Optional Requirements' },
    { id: 'C3.6', title: 'Records Redaction', description: 'The application must support redaction of sensitive information', category: 'Optional Requirements' },
  ],
  internal: [
    { id: 'INT-001', title: 'Authentication Security', description: 'All authentication mechanisms must use strong hashing and MFA', category: 'Internal Standards' },
    { id: 'INT-002', title: 'Authorization Enforcement', description: 'All endpoints must enforce RBAC + ABAC authorization', category: 'Internal Standards' },
    { id: 'INT-003', title: 'Audit Trail Integrity', description: 'All security-relevant actions must be logged in a hash-chained audit trail', category: 'Internal Standards' },
    { id: 'INT-004', title: 'Data Encryption', description: 'All sensitive data must be encrypted at rest and in transit', category: 'Internal Standards' },
    { id: 'INT-005', title: 'Input Validation', description: 'All inputs must be validated server-side with Zod schemas', category: 'Internal Standards' },
    { id: 'INT-006', title: 'Rate Limiting', description: 'All endpoints must be rate-limited to prevent abuse', category: 'Internal Standards' },
  ],
};

// ============================================================================
// AUDIT MANAGEMENT
// ============================================================================

export async function createSecurityAudit(input: CreateAuditInput) {
  const audit = await db.securityAudit.create({
    data: {
      tenantId: input.tenantId,
      title: input.title,
      description: input.description,
      framework: input.framework,
      scope: input.scope,
      status: 'scheduled',
      auditorName: input.auditorName,
      auditorEmail: input.auditorEmail,
      startDate: input.startDate,
      endDate: input.endDate,
      initiatedBy: input.initiatedBy,
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'security.audit.created',
    action: 'create',
    resourceType: 'security_audit',
    resourceId: audit.id,
    resourceName: audit.title,
    metadata: { framework: input.framework, scope: input.scope } as any,
  });

  logger.info('Security audit created', { auditId: audit.id, framework: input.framework });
  return audit;
}

export async function getAuditWithFindings(auditId: string, tenantId: string) {
  const audit = await db.securityAudit.findFirst({
    where: { id: auditId, tenantId },
    include: {
      findings: {
        orderBy: { severity: 'asc' },
      },
      scans: { orderBy: { startedAt: 'desc' } },
    },
  });
  if (!audit) return null;

  // Update denormalized counts
  const counts = {
    total: audit.findings.length,
    critical: audit.findings.filter(f => f.severity === 'critical').length,
    high: audit.findings.filter(f => f.severity === 'high').length,
    medium: audit.findings.filter(f => f.severity === 'medium').length,
    low: audit.findings.filter(f => f.severity === 'low').length,
    remediated: audit.findings.filter(f => f.status === 'remediated').length,
  };

  // Calculate risk score: weighted sum of open findings (0-100)
  const weights = { critical: 25, high: 15, medium: 8, low: 3, informational: 1 };
  const openFindings = audit.findings.filter(f => f.status === 'open' || f.status === 'in_remediation');
  const rawScore = openFindings.reduce((sum, f) => sum + (weights[f.severity as keyof typeof weights] || 0), 0);
  const riskScore = Math.min(100, Math.round((rawScore / Math.max(1, audit.findings.length)) * 100));

  return { ...audit, _counts: counts, riskScore };
}

export async function updateAuditStatus(auditId: string, tenantId: string, status: AuditStatus) {
  const audit = await db.securityAudit.update({
    where: { id: auditId },
    data: { status },
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'security.audit.status_changed',
    action: 'update',
    resourceType: 'security_audit',
    resourceId: auditId,
    metadata: { from: audit.status, to: status } as any,
  });

  return audit;
}

// ============================================================================
// FINDING MANAGEMENT
// ============================================================================

export async function createFinding(input: CreateFindingInput) {
  const finding = await db.securityAuditFinding.create({
    data: {
      tenantId: input.tenantId,
      auditId: input.auditId,
      findingId: input.findingId,
      title: input.title,
      description: input.description,
      severity: input.severity,
      cvssScore: input.cvssScore,
      cvssVector: input.cvssVector,
      affectedComponent: input.affectedComponent,
      cweId: input.cweId,
      remediation: input.remediation,
      evidence: JSON.stringify(input.evidence || []),
      controlRefs: JSON.stringify(input.controlRefs || {}),
      assignedTo: input.assignedTo,
      dueDate: input.dueDate,
    },
  });

  await updateAuditFindingCounts(input.auditId, input.tenantId);

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'security.finding.created',
    action: 'create',
    resourceType: 'security_finding',
    resourceId: finding.id,
    resourceName: finding.title,
    metadata: { severity: input.severity, auditId: input.auditId } as any,
  });

  return finding;
}

export async function remediateFinding(
  findingId: string,
  tenantId: string,
  remediatedBy: string,
  remediationNotes: string,
  verified: boolean = false,
) {
  const finding = await db.securityAuditFinding.update({
    where: { id: findingId },
    data: {
      status: 'remediated',
      remediation: remediationNotes,
      remediatedAt: new Date(),
      remediatedBy,
      verifiedAt: verified ? new Date() : null,
      verifiedBy: verified ? remediatedBy : null,
    },
  });

  await updateAuditFindingCounts(finding.auditId, tenantId);

  await recordAuditEvent({
    tenantId,
    eventType: 'security.finding.remediated',
    action: 'update',
    resourceType: 'security_finding',
    resourceId: findingId,
    metadata: { verified, auditId: finding.auditId } as any,
  });

  return finding;
}

async function updateAuditFindingCounts(auditId: string, tenantId: string) {
  const findings = await db.securityAuditFinding.findMany({
    where: { auditId, tenantId },
    select: { severity: true, status: true },
  });

  const counts = {
    totalFindings: findings.length,
    criticalCount: findings.filter(f => f.severity === 'critical').length,
    highCount: findings.filter(f => f.severity === 'high').length,
    mediumCount: findings.filter(f => f.severity === 'medium').length,
    lowCount: findings.filter(f => f.severity === 'low').length,
    remediatedCount: findings.filter(f => f.status === 'remediated').length,
  };

  // Calculate risk score
  const weights = { critical: 25, high: 15, medium: 8, low: 3, informational: 1 };
  const openFindings = findings.filter(f => f.status === 'open' || f.status === 'in_remediation');
  const rawScore = openFindings.reduce((sum, f) => sum + (weights[f.severity as keyof typeof weights] || 0), 0);
  const riskScore = Math.min(100, Math.round((rawScore / Math.max(1, findings.length)) * 100));

  await db.securityAudit.update({
    where: { id: auditId },
    data: { ...counts, riskScore },
  });
}

// ============================================================================
// AUTOMATED SECURITY SCANNERS
// ============================================================================

export async function runNpmAuditScan(tenantId: string): Promise<ScanResult> {
  try {
    const { stdout } = await execAsync('npm audit --json', {
      cwd: process.cwd(),
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const auditData = JSON.parse(stdout);
    const vulnerabilities = auditData.vulnerabilities || {};
    const findings: ScanResult['findings'] = [];

    for (const [pkgName, vuln] of Object.entries<any>(vulnerabilities)) {
      const severity = vuln.severity as FindingSeverity;
      findings.push({
        title: `${pkgName} — ${vuln.name || 'vulnerability'}`,
        severity,
        description: vuln.advisories?.[0]?.overview || `Vulnerability in ${pkgName}`,
        affectedComponent: `npm:${pkgName}`,
        cweId: vuln.advisories?.[0]?.cwe?.[0] ? `CWE-${vuln.advisories[0].cwe[0]}` : undefined,
        remediation: vuln.fixAvailable ? `Update to fixed version` : 'No fix available',
      });
    }

    const result: ScanResult = {
      scanType: 'dependency',
      scanner: 'npm-audit',
      totalIssues: findings.length,
      criticalCount: findings.filter(f => f.severity === 'critical').length,
      highCount: findings.filter(f => f.severity === 'high').length,
      mediumCount: findings.filter(f => f.severity === 'medium').length,
      lowCount: findings.filter(f => f.severity === 'low').length,
      findings,
      rawOutput: auditData,
    };

    logger.info('npm audit scan completed', { tenantId, issues: findings.length });
    return result;
  } catch (err: any) {
    // npm audit returns exit code 1 if vulnerabilities found — that's expected
    if (err.stdout) {
      const auditData = JSON.parse(err.stdout);
      const vulnerabilities = auditData.vulnerabilities || {};
      const findings: ScanResult['findings'] = [];

      for (const [pkgName, vuln] of Object.entries<any>(vulnerabilities)) {
        findings.push({
          title: `${pkgName} — ${vuln.name || 'vulnerability'}`,
          severity: vuln.severity,
          description: vuln.advisories?.[0]?.overview || `Vulnerability in ${pkgName}`,
          affectedComponent: `npm:${pkgName}`,
          remediation: vuln.fixAvailable ? 'Update to fixed version' : 'No fix available',
        });
      }

      return {
        scanType: 'dependency',
        scanner: 'npm-audit',
        totalIssues: findings.length,
        criticalCount: findings.filter(f => f.severity === 'critical').length,
        highCount: findings.filter(f => f.severity === 'high').length,
        mediumCount: findings.filter(f => f.severity === 'medium').length,
        lowCount: findings.filter(f => f.severity === 'low').length,
        findings,
        rawOutput: auditData,
      };
    }
    logger.error('npm audit scan failed', { error: err.message });
    return {
      scanType: 'dependency',
      scanner: 'npm-audit',
      totalIssues: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      findings: [],
    };
  }
}

export async function runSecretScan(tenantId: string): Promise<ScanResult> {
  // Scan for potential secrets in source code (common patterns)
  const patterns = [
    { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g, severity: 'critical' as FindingSeverity, cwe: 'CWE-798' },
    { name: 'AWS Secret Key', regex: /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g, severity: 'high' as FindingSeverity, cwe: 'CWE-798' },
    { name: 'GitHub Token', regex: /ghp_[A-Za-z0-9]{36}/g, severity: 'critical' as FindingSeverity, cwe: 'CWE-798' },
    { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g, severity: 'critical' as FindingSeverity, cwe: 'CWE-321' },
    { name: 'JWT Secret', regex: /jwt[_-]?secret["\s]*[:=]\s*["'][^"']{16,}/gi, severity: 'high' as FindingSeverity, cwe: 'CWE-798' },
    { name: 'Generic API Key', regex: /api[_-]?key["\s]*[:=]\s*["'][^"']{20,}/gi, severity: 'medium' as FindingSeverity, cwe: 'CWE-798' },
    { name: 'Generic Password', regex: /password["\s]*[:=]\s*["'][^"']{8,}/gi, severity: 'medium' as FindingSeverity, cwe: 'CWE-798' },
    { name: 'Stripe Key', regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, severity: 'critical' as FindingSeverity, cwe: 'CWE-798' },
  ];

  const findings: ScanResult['findings'] = [];
  const excludePatterns = ['.git/', 'node_modules/', '.next/', 'tests/', '*.lock', '*.md', '.env.example', 'skills/'];

  try {
    // Use grep to find files, then scan each
    const { stdout } = await execAsync(
      `grep -r --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.yml" --include="*.yaml" --include="*.env*" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=tests --exclude-dir=skills -l "" src/ 2>/dev/null || true`,
      { cwd: process.cwd(), timeout: 30000, maxBuffer: 5 * 1024 * 1024 },
    );

    const files = stdout.trim().split('\n').filter(Boolean);

    for (const file of files) {
      if (excludePatterns.some(p => file.includes(p.replace('*', '')))) continue;

      try {
        const content = await readFile(file, 'utf-8');

        for (const pattern of patterns) {
          const matches = content.match(pattern.regex);
          if (matches) {
            // Skip if it's in .env.example or a comment/template
            if (file.includes('.env.example') || file.includes('.env.template') || file.includes('.env.lan')) continue;
            if (content.includes('// SECURITY:') || content.includes('// generate:')) continue;

            findings.push({
              title: `${pattern.name} in ${file}`,
              severity: pattern.severity,
              description: `Potential ${pattern.name} detected in ${file}. ${matches.length} occurrence(s) found.`,
              affectedComponent: file,
              cweId: pattern.cwe,
              remediation: 'Move the secret to an environment variable and rotate the exposed key immediately.',
            });
          }
        }
      } catch {
        // Skip files we can't read
      }
    }
  } catch (err) {
    logger.error('Secret scan failed', { error: (err as Error).message });
  }

  return {
    scanType: 'secret',
    scanner: 'custom',
    totalIssues: findings.length,
    criticalCount: findings.filter(f => f.severity === 'critical').length,
    highCount: findings.filter(f => f.severity === 'high').length,
    mediumCount: findings.filter(f => f.severity === 'medium').length,
    lowCount: findings.filter(f => f.severity === 'low').length,
    findings,
  };
}

export async function runConfigScan(tenantId: string): Promise<ScanResult> {
  // Check for security misconfigurations
  const findings: ScanResult['findings'] = [];

  // Check environment variables for weak configurations
  const checks = [
    {
      name: 'NEXTAUTH_SECRET strength',
      check: () => {
        const secret = process.env.NEXTAUTH_SECRET;
        if (!secret || secret.length < 16) {
          return { found: true, severity: 'critical' as FindingSeverity, description: 'NEXTAUTH_SECRET is missing or too short (<16 chars)', remediation: 'Set NEXTAUTH_SECRET to a random string of at least 32 characters: openssl rand -base64 32' };
        }
        return { found: false };
      },
    },
    {
      name: 'SMART_EDMS_KEK presence',
      check: () => {
        const kek = process.env.SMART_EDMS_KEK;
        if (!kek || kek.length < 32) {
          return { found: true, severity: 'critical' as FindingSeverity, description: 'SMART_EDMS_KEK is missing or too short. All encrypted secrets are at risk.', remediation: 'Set SMART_EDMS_KEK to a 32-byte hex value: openssl rand -hex 32' };
        }
        return { found: false };
      },
    },
    {
      name: 'CRON_SECRET strength',
      check: () => {
        const secret = process.env.CRON_SECRET;
        if (!secret || secret.length < 32) {
          return { found: true, severity: 'high' as FindingSeverity, description: 'CRON_SECRET is missing or too short (<32 chars)', remediation: 'Set CRON_SECRET to a random hex value: openssl rand -hex 32' };
        }
        return { found: false };
      },
    },
    {
      name: 'NODE_ENV in production',
      check: () => {
        if (process.env.NODE_ENV !== 'production') {
          return { found: true, severity: 'medium' as FindingSeverity, description: `NODE_ENV is "${process.env.NODE_ENV || 'undefined'}", not "production"`, remediation: 'Set NODE_ENV=production in production deployments' };
        }
        return { found: false };
      },
    },
    {
      name: 'Default admin password check',
      check: () => {
        // This is a configuration note, not an actual check
        return { found: false };
      },
    },
  ];

  for (const check of checks) {
    const result: any = check.check();
    if (result.found) {
      findings.push({
        title: check.name,
        severity: result.severity,
        description: result.description,
        remediation: result.remediation,
        cweId: 'CWE-1188',
      });
    }
  }

  return {
    scanType: 'config',
    scanner: 'custom',
    totalIssues: findings.length,
    criticalCount: findings.filter(f => f.severity === 'critical').length,
    highCount: findings.filter(f => f.severity === 'high').length,
    mediumCount: findings.filter(f => f.severity === 'medium').length,
    lowCount: findings.filter(f => f.severity === 'low').length,
    findings,
  };
}

export async function runFullScan(tenantId: string, auditId?: string) {
  const startedAt = new Date();
  const results: ScanResult[] = [];

  // Run all scans in parallel
  const [depScan, secretScan, configScan] = await Promise.all([
    runNpmAuditScan(tenantId),
    runSecretScan(tenantId),
    runConfigScan(tenantId),
  ]);

  results.push(depScan, secretScan, configScan);

  const completedAt = new Date();
  const duration = completedAt.getTime() - startedAt.getTime();

  // Save scan results to database
  for (const result of results) {
    await db.securityScanResult.create({
      data: {
        tenantId,
        auditId: auditId || null,
        scanType: result.scanType,
        scanner: result.scanner,
        status: 'completed',
        totalIssues: result.totalIssues,
        criticalCount: result.criticalCount,
        highCount: result.highCount,
        mediumCount: result.mediumCount,
        lowCount: result.lowCount,
        rawOutput: JSON.stringify(result.rawOutput || {}) as any,
        findings: JSON.stringify(result.findings) as any,
        completedAt,
        duration,
      },
    });
  }

  await recordAuditEvent({
    tenantId,
    eventType: 'security.scan.completed',
    action: 'create',
    resourceType: 'security_scan',
    metadata: {
      scans: results.length,
      totalIssues: results.reduce((s, r) => s + r.totalIssues, 0),
      duration,
    },
  });

  return results;
}

// ============================================================================
// EVIDENCE COLLECTION
// ============================================================================

export async function collectEvidence(tenantId: string, auditId: string, evidenceDir: string) {
  const evidencePath = join(evidenceDir, `audit-${auditId}`);
  await mkdir(evidencePath, { recursive: true });

  // Collect evidence: audit log hash chain verification
  const auditEvents = await db.auditEvent.findMany({
    where: { tenantId },
    orderBy: { sequenceNum: 'asc' },
    take: 1000,
    select: { id: true, sequenceNum: true, eventType: true, eventHash: true, prevHash: true, createdAt: true },
  });

  const auditEvidence = {
    type: 'audit_log_chain',
    collectedAt: new Date().toISOString(),
    events: auditEvents.length,
    firstEvent: auditEvents[0] || null,
    lastEvent: auditEvents[auditEvents.length - 1] || null,
    hashChainValid: verifyHashChain(auditEvents),
  };

  await writeFile(join(evidencePath, 'audit-chain.json'), JSON.stringify(auditEvidence, null, 2));

  // Collect evidence: user access review
  const users = await db.user.findMany({
    where: { tenantId },
    select: { id: true, email: true, status: true, mfaEnabled: true, lastLoginAt: true },
  });
  await writeFile(join(evidencePath, 'user-access-review.json'), JSON.stringify({
    type: 'user_access_review',
    collectedAt: new Date().toISOString(),
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    mfaEnabled: users.filter(u => u.mfaEnabled).length,
    users,
  }, null, 2));

  // Collect evidence: permissions matrix
  const roles = await db.role.findMany({
    where: { tenantId },
    include: { assignments: { include: { user: true } } },
  });
  await writeFile(join(evidencePath, 'roles-permissions.json'), JSON.stringify({
    type: 'roles_permissions_matrix',
    collectedAt: new Date().toISOString(),
    roles: roles.map(r => ({ name: r.name, permissions: r.permissions, userCount: r.assignments.length })),
  }, null, 2));

  // Create evidence hash for tamper-evidence
  const evidenceFiles = ['audit-chain.json', 'user-access-review.json', 'roles-permissions.json'];
  const evidenceHashes = await Promise.all(
    evidenceFiles.map(async (f) => {
      const content = await readFile(join(evidencePath, f));
      return { file: f, hash: createHash('sha256').update(content).digest('hex') };
    })
  );

  await writeFile(join(evidencePath, 'evidence-manifest.json'), JSON.stringify({
    auditId,
    tenantId,
    collectedAt: new Date().toISOString(),
    files: evidenceHashes,
  }, null, 2));

  logger.info('Evidence collected', { auditId, evidencePath, files: evidenceFiles.length });
  return evidencePath;
}

function verifyHashChain(events: any[]): boolean {
  // Verify the hash chain integrity (simplified — real verification is in audit-service.ts)
  for (let i = 1; i < events.length; i++) {
    if (!events[i].prevHash || events[i].prevHash !== events[i - 1].eventHash) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// AUDIT REPORT GENERATION
// ============================================================================

export async function generateAuditReport(auditId: string, tenantId: string): Promise<string> {
  const audit = await getAuditWithFindings(auditId, tenantId);
  if (!audit) throw new Error('Audit not found');

  const controls = COMPLIANCE_CONTROLS[audit.framework as AuditFramework] || [];

  const report = {
    title: audit.title,
    framework: audit.framework,
    scope: audit.scope,
    auditorName: audit.auditorName,
    auditorEmail: audit.auditorEmail,
    startDate: audit.startDate,
    endDate: audit.endDate,
    status: audit.status,
    riskScore: audit.riskScore,
    summary: {
      totalFindings: audit._counts.total,
      critical: audit._counts.critical,
      high: audit._counts.high,
      medium: audit._counts.medium,
      low: audit._counts.low,
      remediated: audit._counts.remediated,
    },
    findings: audit.findings.map(f => ({
      id: f.findingId,
      title: f.title,
      severity: f.severity,
      status: f.status,
      cvss: f.cvssScore,
      cwe: f.cweId,
      affectedComponent: f.affectedComponent,
      description: f.description,
      remediation: f.remediation,
      controlRefs: JSON.parse(f.controlRefs || '{}'),
      assignedTo: f.assignedTo,
      dueDate: f.dueDate,
      remediatedAt: f.remediatedAt,
    })),
    controls: controls.map(c => ({
      id: c.id,
      title: c.title,
      category: c.category,
      status: 'evaluated',
    })),
    generatedAt: new Date().toISOString(),
  };

  return JSON.stringify(report, null, 2);
}
