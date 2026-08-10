/**
 * Smart EDMS — Metadata validation service
 *
 * Validates document metadata against the tenant's MetadataSchema definitions.
 * Enforces required fields, type checking, and controlled vocabulary values.
 */

import { db } from '@/lib/db';

export interface MetadataValidationResult {
  ok: boolean;
  errors: { field: string; message: string }[];
}

/**
 * Validate metadata against all applicable schemas for a document type.
 * A schema applies if its `appliesTo` is '*' or includes the document type.
 */
export async function validateMetadata(
  tenantId: string,
  documentType: string,
  metadata: Record<string, unknown>,
): Promise<MetadataValidationResult> {
  const errors: { field: string; message: string }[] = [];

  // Find applicable schemas
  const schemas = await db.metadataSchema.findMany({
    where: { tenantId },
  });

  const applicable = schemas.filter((s) => {
    if (s.appliesTo === '*') return true;
    const types = s.appliesTo.split(',').map((t) => t.trim());
    return types.includes(documentType);
  });

  if (applicable.length === 0) {
    return { ok: true, errors: [] };
  }

  // Load controlled vocabularies for select/multiselect validation
  const vocabularies = await db.controlledVocabulary.findMany({
    where: { tenantId },
  });
  const vocabMap = new Map<string, string[]>();
  for (const v of vocabularies) {
    try {
      vocabMap.set(v.name, JSON.parse(v.terms || '[]'));
    } catch {}
  }

  // Validate against each applicable schema
  for (const schema of applicable) {
    let fields: any[] = [];
    try {
      fields = JSON.parse(schema.fields || '[]');
    } catch {
      continue;
    }

    for (const field of fields) {
      const value = metadata[field.name];
      const isMissing = value === undefined || value === null || value === '';

      if (field.required && isMissing) {
        errors.push({ field: field.name, message: `${field.label || field.name} is required` });
        continue;
      }

      if (isMissing) continue;

      // Type validation
      if (field.type === 'number') {
        if (isNaN(Number(value))) {
          errors.push({ field: field.name, message: `${field.label} must be a number` });
        }
      } else if (field.type === 'date') {
        if (isNaN(Date.parse(String(value)))) {
          errors.push({ field: field.name, message: `${field.label} must be a valid date` });
        }
      } else if (field.type === 'boolean') {
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push({ field: field.name, message: `${field.label} must be a boolean` });
        }
      } else if (field.type === 'select') {
        const options = field.options || [];
        if (options.length > 0 && !options.includes(String(value))) {
          errors.push({ field: field.name, message: `${field.label} must be one of: ${options.join(', ')}` });
        }
        // Check against controlled vocabulary if referenced
        if (field.validation?.vocabulary) {
          const terms = vocabMap.get(field.validation.vocabulary);
          if (terms && !terms.includes(String(value))) {
            errors.push({ field: field.name, message: `${field.label} must be a valid term from vocabulary '${field.validation.vocabulary}'` });
          }
        }
      } else if (field.type === 'multiselect') {
        const values = Array.isArray(value) ? value : [value];
        const options = field.options || [];
        for (const v of values) {
          if (options.length > 0 && !options.includes(String(v))) {
            errors.push({ field: field.name, message: `${field.label} contains invalid value: ${v}` });
          }
        }
      }

      // Custom validation rules
      if (field.validation) {
        const v = field.validation;
        if (v.minLength && String(value).length < v.minLength) {
          errors.push({ field: field.name, message: `${field.label} must be at least ${v.minLength} characters` });
        }
        if (v.maxLength && String(value).length > v.maxLength) {
          errors.push({ field: field.name, message: `${field.label} must be at most ${v.maxLength} characters` });
        }
        if (v.pattern) {
          try {
            const regex = new RegExp(v.pattern);
            if (!regex.test(String(value))) {
              errors.push({ field: field.name, message: `${field.label} does not match required pattern` });
            }
          } catch {}
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
