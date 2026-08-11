/**
 * Smart EDMS — DoD 5015.02 Records Management
 *
 * Implements the functional requirements of DoD 5015.02-STD (Electronic
 * Records Management Software Applications Design Criteria Standard).
 *
 * Key requirements covered:
 *   C2.1 — Records Management Application (records lifecycle)
 *   C2.2 — Records Declaration (formal record declaration with metadata)
 *   C2.3 — Classification and Categorization (hierarchical file plan)
 *   C2.4 — Retention and Disposition (enforcement of retention schedules)
 *   C2.5 — Records Transfer and Export (standard formats)
 *   C2.6 — Records Access and Security (access controls + audit)
 *   C2.7 — Vital Records (identification and protection)
 *   C2.8 — Legal Hold (hold on records pending litigation)
 *   C2.9 — Audit Trail (unalterable audit trail)
 *   C3.1 — Folder and File Plan Management (hierarchical file plans)
 *   C3.3 — Records Disposition (automated disposition)
 *   C3.4 — Records Search and Retrieval (full-text + metadata search)
 *   C3.5 — Records Version Control (version control for records)
 *   C3.6 — Records Redaction (redaction of sensitive information)
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';
import { recordAuditEvent } from '@/lib/audit/audit-service';

// ============================================================================
// TYPES
// ============================================================================

export type RecordDisposition = 'permanent' | 'temporary' | 'unscheduled';
export type DispositionAction = 'destroy' | 'transfer_to_nara' | 'transfer_to_agency';
export type FolderStatus = 'open' | 'closed' | 'cutoff' | 'disposed';
export type VitalRecordType = 'essential' | 'important' | 'useful';
export type VitalReason = 'operational' | 'legal' | 'financial' | 'historical';
export type AuthorityType = 'nara_grs' | 'nara_sf' | 'agency_specific' | 'court_order';

export interface CreateCategoryInput {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  disposition: RecordDisposition;
  retentionActiveYears?: number;
  retentionSemiActiveYears?: number;
  dispositionAction?: DispositionAction;
  isVital: boolean;
  approvedBy?: string;
}

export interface CreateFolderInput {
  tenantId: string;
  categoryId: string;
  title: string;
  description?: string;
  fiscalYear?: string;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
}

export interface DesignateVitalRecordInput {
  tenantId: string;
  documentId: string;
  categoryId?: string;
  vitalReason: VitalReason;
  recordType: VitalRecordType;
  recoveryPriority: number;
  reviewCycleMonths: number;
  notes?: string;
  designatedBy: string;
}

// ============================================================================
// DoD 5015.02 REQUIREMENTS MAPPING
// ============================================================================

export const DOD_REQUIREMENTS = {
  'C2.1': {
    title: 'Records Management Application',
    description: 'The application must manage records throughout their lifecycle',
    implemented: true,
    evidence: 'Document model with state field (draft → active → record → archived → disposed)',
  },
  'C2.2': {
    title: 'Records Declaration',
    description: 'Records must be declared and managed with appropriate metadata',
    implemented: true,
    evidence: 'document:record.declare permission, isRecord flag, record declaration audit event',
  },
  'C2.3': {
    title: 'Classification and Categorization',
    description: 'Records must be classified according to an approved file plan',
    implemented: true,
    evidence: 'RecordCategory model with hierarchical structure, Classification model, classification-driven access control',
  },
  'C2.4': {
    title: 'Retention and Disposition',
    description: 'The application must enforce retention schedules and disposition instructions',
    implemented: true,
    evidence: 'RetentionSchedule model, retentionDisposeAfter field, cron-based disposition, DispositionRecord model',
  },
  'C2.5': {
    title: 'Records Transfer and Export',
    description: 'Records must be transferable in standard formats',
    implemented: true,
    evidence: 'Export to CSV, PDF, and original format; signed download URLs',
  },
  'C2.6': {
    title: 'Records Access and Security',
    description: 'Access to records must be controlled and auditable',
    implemented: true,
    evidence: 'RBAC + ABAC, tenant scoping, hash-chained audit log, download audit events',
  },
  'C2.7': {
    title: 'Vital Records',
    description: 'The application must identify and protect vital records',
    implemented: true,
    evidence: 'VitalRecord model, vital record designation, review cycles, backup verification',
  },
  'C2.8': {
    title: 'Legal Hold',
    description: 'The application must support legal hold on records',
    implemented: true,
    evidence: 'LegalHold model, legalHold flag on Document, blocks deletion and disposition',
  },
  'C2.9': {
    title: 'Audit Trail',
    description: 'All records management actions must be logged in an unalterable audit trail',
    implemented: true,
    evidence: 'AuditEvent model with SHA-256 hash chain, one-click integrity verification',
  },
  'C3.1': {
    title: 'Folder and File Plan Management',
    description: 'The application must support hierarchical file plans',
    implemented: true,
    evidence: 'RecordFolder model, RecordCategory with parent/child hierarchy, Folder model',
  },
  'C3.2': {
    title: 'Metadata Management',
    description: 'The application must support custom metadata schemas',
    implemented: true,
    evidence: 'MetadataSchema model, Document.metadata JSON field, per-tenant custom schemas',
  },
  'C3.3': {
    title: 'Records Disposition',
    description: 'The application must support automated disposition of records',
    implemented: true,
    evidence: 'DispositionRecord model, cron-based eligibility check, cutoff and dispose workflow',
  },
  'C3.4': {
    title: 'Records Search and Retrieval',
    description: 'The application must support full-text and metadata search',
    implemented: true,
    evidence: 'OpenSearch integration, DocumentTextIndex model, permission-aware search',
  },
  'C3.5': {
    title: 'Records Version Control',
    description: 'The application must support version control for records',
    implemented: true,
    evidence: 'DocumentVersion model with immutable history, SHA-256 checksums per version',
  },
  'C3.6': {
    title: 'Records Redaction',
    description: 'The application must support redaction of sensitive information',
    implemented: true,
    evidence: 'Redaction model, visual redaction editor, redaction count on Document',
  },
} as const;

// ============================================================================
// RECORD CATEGORY MANAGEMENT
// ============================================================================

export async function createRecordCategory(input: CreateCategoryInput) {
  const requirements: string[] = ['C2.3', 'C3.1'];
  if (input.isVital) requirements.push('C2.7');
  if (input.disposition !== 'unscheduled') requirements.push('C2.4', 'C3.3');

  const category = await db.recordCategory.create({
    data: {
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      description: input.description,
      parentId: input.parentId || null,
      disposition: input.disposition,
      retentionActiveYears: input.retentionActiveYears,
      retentionSemiActiveYears: input.retentionSemiActiveYears,
      dispositionAction: input.dispositionAction,
      isVital: input.isVital,
      dodRequirements: JSON.stringify(requirements) as any,
      approvedBy: input.approvedBy,
      approvedAt: input.approvedBy ? new Date() : null,
      status: 'active',
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'record.category.created',
    action: 'create',
    resourceType: 'record_category',
    resourceId: category.id,
    resourceName: category.name,
    metadata: { code: input.code, disposition: input.disposition, isVital: input.isVital },
  });

  logger.info('Record category created', { categoryId: category.id, code: input.code });
  return category;
}

export async function getRecordCategoryTree(tenantId: string) {
  const categories = await db.recordCategory.findMany({
    where: { tenantId },
    include: {
      folders: { select: { id: true, title: true, status: true, fiscalYear: true } },
      children: { select: { id: true, code: true, name: true } },
    },
    orderBy: { code: 'asc' },
  });

  // Build tree structure
  const map = new Map(categories.map(c => [c.id, { ...c, children: [] as any[] }]));
  const roots: any[] = [];
  for (const cat of map.values()) {
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(cat);
    } else {
      roots.push(cat);
    }
  }
  return roots;
}

// ============================================================================
// RECORD FOLDER MANAGEMENT
// ============================================================================

export async function createRecordFolder(input: CreateFolderInput) {
  const category = await db.recordCategory.findFirst({
    where: { id: input.categoryId, tenantId: input.tenantId },
  });
  if (!category) throw new Error('Record category not found');

  // Calculate eligibility for disposition
  let eligibleForDisposition: Date | null = null;
  if (category.retentionActiveYears && input.dateRangeEnd) {
    eligibleForDisposition = new Date(input.dateRangeEnd);
    eligibleForDisposition.setFullYear(eligibleForDisposition.getFullYear() + category.retentionActiveYears);
  }

  const folder = await db.recordFolder.create({
    data: {
      tenantId: input.tenantId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      fiscalYear: input.fiscalYear,
      dateRangeStart: input.dateRangeStart || null,
      dateRangeEnd: input.dateRangeEnd || null,
      status: 'open',
      eligibleForDispositionAt: eligibleForDisposition,
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'record.folder.created',
    action: 'create',
    resourceType: 'record_folder',
    resourceId: folder.id,
    resourceName: folder.title,
    metadata: { categoryId: input.categoryId, fiscalYear: input.fiscalYear },
  });

  logger.info('Record folder created', { folderId: folder.id, title: input.title });
  return folder;
}

export async function cutoffFolder(folderId: string, tenantId: string, cutoffBy: string) {
  const folder = await db.recordFolder.findFirst({ where: { id: folderId, tenantId } });
  if (!folder) throw new Error('Folder not found');
  if (folder.status !== 'open') throw new Error(`Folder is in ${folder.status} state, cannot cut off`);

  const updated = await db.recordFolder.update({
    where: { id: folderId },
    data: {
      status: 'cutoff',
      cutoffAt: new Date(),
      cutoffBy,
    },
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'record.folder.cutoff',
    action: 'update',
    resourceType: 'record_folder',
    resourceId: folderId,
    metadata: { cutoffBy, previousStatus: 'open' },
  });

  return updated;
}

export async function disposeFolder(
  folderId: string,
  tenantId: string,
  disposedBy: string,
  method: 'destroyed' | 'transferred',
  notes?: string,
) {
  const folder = await db.recordFolder.findFirst({
    where: { id: folderId, tenantId },
    include: { category: true },
  });
  if (!folder) throw new Error('Folder not found');
  if (folder.status !== 'cutoff') throw new Error('Folder must be cut off before disposition');
  if (folder.category?.isOnHold) throw new Error('Folder is on legal hold — disposition blocked');

  const updated = await db.recordFolder.update({
    where: { id: folderId },
    data: {
      status: 'disposed',
      disposedAt: new Date(),
      disposedBy,
      dispositionMethod: method,
      dispositionNotes: notes,
    },
  });

  // Create a disposition record for audit
  await db.dispositionRecord.create({
    data: {
      tenantId,
      documentId: folder.id, // Use folder ID as the document reference for folder-level disposition
      scheduleId: folder.categoryId,
      action: method === 'destroyed' ? 'delete' : 'archive',
      requestedById: disposedBy,
      approvedById: disposedBy,
      status: 'executed',
      reason: `Folder: ${folder.title}. ${notes || ''}`,
      executedAt: new Date(),
    } as any,
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'record.folder.disposed',
    action: 'delete',
    resourceType: 'record_folder',
    resourceId: folderId,
    metadata: { method, disposedBy, notes },
  });

  logger.info('Record folder disposed', { folderId, method });
  return updated;
}

// ============================================================================
// VITAL RECORDS MANAGEMENT
// ============================================================================

export async function designateVitalRecord(input: DesignateVitalRecordInput) {
  const document = await db.document.findFirst({
    where: { id: input.documentId, tenantId: input.tenantId },
  });
  if (!document) throw new Error('Document not found');

  const nextReviewAt = new Date();
  nextReviewAt.setMonth(nextReviewAt.getMonth() + input.reviewCycleMonths);

  const vital = await db.vitalRecord.create({
    data: {
      tenantId: input.tenantId,
      documentId: input.documentId,
      categoryId: input.categoryId || null,
      vitalReason: input.vitalReason,
      recordType: input.recordType,
      recoveryPriority: input.recoveryPriority,
      backupVerified: false,
      reviewCycleMonths: input.reviewCycleMonths,
      nextReviewAt,
      notes: input.notes,
      designatedBy: input.designatedBy,
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'record.vital.designated',
    action: 'create',
    resourceType: 'vital_record',
    resourceId: vital.id,
    metadata: {
      documentId: input.documentId,
      recordType: input.recordType,
      recoveryPriority: input.recoveryPriority,
    },
  });

  logger.info('Vital record designated', { vitalId: vital.id, documentId: input.documentId });
  return vital;
}

export async function verifyVitalRecordBackup(vitalId: string, tenantId: string, verifiedBy: string) {
  const vital = await db.vitalRecord.findFirst({ where: { id: vitalId, tenantId } });
  if (!vital) throw new Error('Vital record not found');

  const nextReviewAt = new Date();
  nextReviewAt.setMonth(nextReviewAt.getMonth() + vital.reviewCycleMonths);

  const updated = await db.vitalRecord.update({
    where: { id: vitalId },
    data: {
      backupVerified: true,
      lastVerifiedAt: new Date(),
      verifiedBy,
      nextReviewAt,
    },
  });

  await recordAuditEvent({
    tenantId,
    eventType: 'record.vital.verified',
    action: 'update',
    resourceType: 'vital_record',
    resourceId: vitalId,
    metadata: { verifiedBy, nextReviewAt },
  });

  return updated;
}

export async function getVitalRecordsDueForReview(tenantId: string) {
  const now = new Date();
  return db.vitalRecord.findMany({
    where: {
      tenantId,
      nextReviewAt: { lte: now },
    },
    include: {
      document: { select: { id: true, title: true, state: true } },
    },
    orderBy: { nextReviewAt: 'asc' },
  });
}

// ============================================================================
// DISPOSITION AUTHORITY MANAGEMENT
// ============================================================================

export async function createDispositionAuthority(input: {
  tenantId: string;
  authorityType: AuthorityType;
  authorityNumber: string;
  title: string;
  description?: string;
  authorityDocumentUrl?: string;
  retentionInstructions: {
    active?: number;
    semiActive?: number;
    disposition?: DispositionAction;
  };
  effectiveDate?: Date;
  approvedBy?: string;
}) {
  const authority = await db.dispositionAuthority.create({
    data: {
      tenantId: input.tenantId,
      authorityType: input.authorityType,
      authorityNumber: input.authorityNumber,
      title: input.title,
      description: input.description,
      authorityDocumentUrl: input.authorityDocumentUrl,
      retentionInstructions: JSON.stringify(input.retentionInstructions) as any,
      effectiveDate: input.effectiveDate || null,
      approvedBy: input.approvedBy,
      approvedAt: input.approvedBy ? new Date() : null,
      status: 'active',
    },
  });

  await recordAuditEvent({
    tenantId: input.tenantId,
    eventType: 'record.authority.created',
    action: 'create',
    resourceType: 'disposition_authority',
    resourceId: authority.id,
    resourceName: authority.title,
    metadata: { authorityType: input.authorityType, authorityNumber: input.authorityNumber },
  });

  logger.info('Disposition authority created', { authorityId: authority.id, number: input.authorityNumber });
  return authority;
}

// ============================================================================
// COMPLIANCE REPORTING
// ============================================================================

export async function generateComplianceReport(tenantId: string) {
  const categories = await db.recordCategory.findMany({
    where: { tenantId },
    include: {
      folders: { select: { id: true, status: true } },
      vitalRecords: { select: { id: true, backupVerified: true, nextReviewAt: true } },
    },
  });

  const folders = await db.recordFolder.findMany({
    where: { tenantId },
    select: { id: true, status: true, disposedAt: true },
  });

  const vitalRecords = await db.vitalRecord.findMany({
    where: { tenantId },
    select: { id: true, backupVerified: true, nextReviewAt: true, recordType: true },
  });

  const authorities = await db.dispositionAuthority.findMany({
    where: { tenantId },
    select: { id: true, authorityType: true, status: true },
  });

  return {
    requirements: Object.entries(DOD_REQUIREMENTS).map(([id, req]) => ({
      id,
      title: req.title,
      description: req.description,
      implemented: req.implemented,
      evidence: req.evidence,
    })),
    summary: {
      totalCategories: categories.length,
      totalFolders: folders.length,
      openFolders: folders.filter(f => f.status === 'open').length,
      cutoffFolders: folders.filter(f => f.status === 'cutoff').length,
      disposedFolders: folders.filter(f => f.status === 'disposed').length,
      vitalRecords: vitalRecords.length,
      vitalRecordsVerified: vitalRecords.filter(v => v.backupVerified).length,
      vitalRecordsDueReview: vitalRecords.filter(v => v.nextReviewAt && v.nextReviewAt <= new Date()).length,
      dispositionAuthorities: authorities.length,
      permanentCategories: categories.filter(c => c.disposition === 'permanent').length,
      temporaryCategories: categories.filter(c => c.disposition === 'temporary').length,
    },
    generatedAt: new Date().toISOString(),
  };
}
