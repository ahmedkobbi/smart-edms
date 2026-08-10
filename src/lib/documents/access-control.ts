/**
 * Smart EDMS — Document access control helpers
 *
 * Shared functions for checking document read/write access based on
 * the caller's permissions and ownership/share relationships.
 *
 * SECURITY: These functions prevent IDOR attacks where end_users
 * (who only have document:read.own) could access other users' documents
 * by guessing IDs.
 */

import { db } from '@/lib/db';
import { PERMISSIONS, hasPermission } from '@/lib/auth/permissions';

/**
 * Check if the caller can READ a document.
 * - Users with DOCUMENT_READ can read any document in their tenant.
 * - Users without DOCUMENT_READ can only read documents they own or
 *   that have been explicitly shared with them (non-expired, non-revoked).
 */
export async function canReadDocument(
  userId: string,
  tenantId: string,
  documentId: string,
  userPermissions: string[],
): Promise<boolean> {
  if (hasPermission(userPermissions, PERMISSIONS.DOCUMENT_READ)) return true;

  const doc = await db.document.findFirst({
    where: {
      id: documentId,
      tenantId,
      deletedAt: null,
      OR: [
        { ownerId: userId },
        { shares: { some: { recipientUserId: userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } },
      ],
    },
    select: { id: true },
  });
  return !!doc;
}

/**
 * Check if the caller can MODIFY a document (update, version upload, restore, close, move).
 * - Users with DOCUMENT_READ can modify any document in their tenant.
 * - Users without DOCUMENT_READ can only modify documents they own.
 *   (Shared documents are read-only for recipients unless they also have DOCUMENT_UPDATE.)
 */
export async function canModifyDocument(
  userId: string,
  tenantId: string,
  documentId: string,
  userPermissions: string[],
): Promise<boolean> {
  if (hasPermission(userPermissions, PERMISSIONS.DOCUMENT_READ)) return true;

  const doc = await db.document.findFirst({
    where: {
      id: documentId,
      tenantId,
      deletedAt: null,
      ownerId: userId, // Only owners can modify (not share recipients)
    },
    select: { id: true },
  });
  return !!doc;
}

/**
 * Build a Prisma WHERE clause that restricts document access based on
 * the caller's permissions. Used in list/query endpoints.
 */
export function buildDocumentAccessFilter(
  userId: string,
  userPermissions: string[],
): Record<string, unknown> {
  if (hasPermission(userPermissions, PERMISSIONS.DOCUMENT_READ)) {
    return {}; // Can see all
  }
  return {
    OR: [
      { ownerId: userId },
      { shares: { some: { recipientUserId: userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } } },
    ],
  };
}
