/**
 * Smart EDMS — AI classifier (heuristic + LLM fallback)
 *
 * Decision policy:
 *   1. If AI_API_KEY is set, prefer LLM-based classification.
 *   2. Otherwise use a deterministic keyword + metadata heuristic.
 *
 * In BOTH cases the suggestion is advisory only — never applied silently.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/config/logger';

export interface ClassifyInput {
  tenantId: string;
  documentId: string;
  title: string;
  description?: string | null;
  documentType: string;
  tags: string[];
  metadata: Record<string, unknown>;
  fileName: string;
  mimeType: string;
  classifications: { id: string; code: string; name: string; level: number }[];
}

export interface ClassifyOutput {
  code: string;
  name: string;
  reason: string;
  confidence: number; // 0..1
  source: 'heuristic' | 'llm';
}

const KEYWORDS_HS = [
  'password', 'secret', 'api key', 'private key', 'certificate', 'credentials',
  'ssn', 'social security', 'passport', 'national id', 'biometric',
  'medical record', 'diagnosis', 'phi', 'health record',
  'credit card', 'bank account', 'routing number',
];

const KEYWORDS_RESTRICTED = [
  'confidential', 'proprietary', 'internal only', 'restricted',
  'nda', 'merger', 'acquisition', 'unannounced',
  'salary', 'compensation', 'employee record',
  'source code', 'algorithm', 'trade secret',
];

const KEYWORDS_CONFIDENTIAL = [
  'contract', 'agreement', 'invoice', 'financial', 'audit',
  'legal', 'compliance', 'risk', 'incident',
];

const KEYWORDS_INTERNAL = [
  'memo', 'meeting', 'notes', 'minutes', 'project', 'plan',
  'roadmap', 'sprint', 'spec', 'design',
];

export async function suggestClassification(input: ClassifyInput): Promise<ClassifyOutput> {
  // Check tenant AI feature flag
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { settings: true },
  });
  let aiEnabled = true;
  try {
    const settings = JSON.parse(tenant?.settings || '{}');
    aiEnabled = settings?.features?.ai !== false;
  } catch {}

  if (!aiEnabled) {
    return {
      code: 'PUBLIC',
      name: 'Public',
      reason: 'AI features are disabled for this tenant.',
      confidence: 0,
      source: 'heuristic',
    };
  }

  // Try LLM if configured
  if (process.env.AI_API_KEY) {
    try {
      const result = await llmClassify(input);
      if (result) return result;
    } catch (err) {
      logger.warn('ai', { message: '[ai:llm] fallback to heuristic:', error: err });
    }
  }
  return heuristicClassify(input);
}

function heuristicClassify(input: ClassifyInput): ClassifyOutput {
  const text = `${input.title} ${input.description ?? ''} ${input.fileName} ${input.tags.join(' ')} ${JSON.stringify(input.metadata)}`.toLowerCase();

  let matched: { code: string; reason: string; level: number } | null = null;

  for (const kw of KEYWORDS_HS) {
    if (text.includes(kw)) {
      matched = {
        code: 'HS',
        reason: `Heuristic match for highly-sensitive keyword: "${kw}"`,
        level: 4,
      };
      break;
    }
  }
  if (!matched) {
    for (const kw of KEYWORDS_RESTRICTED) {
      if (text.includes(kw)) {
        matched = {
          code: 'RESTRICTED',
          reason: `Heuristic match for restricted keyword: "${kw}"`,
          level: 3,
        };
        break;
      }
    }
  }
  if (!matched) {
    for (const kw of KEYWORDS_CONFIDENTIAL) {
      if (text.includes(kw)) {
        matched = {
          code: 'CONFIDENTIAL',
          reason: `Heuristic match for confidential keyword: "${kw}"`,
          level: 2,
        };
        break;
      }
    }
  }
  if (!matched) {
    for (const kw of KEYWORDS_INTERNAL) {
      if (text.includes(kw)) {
        matched = {
          code: 'INTERNAL',
          reason: `Heuristic match for internal keyword: "${kw}"`,
          level: 1,
        };
        break;
      }
    }
  }
  if (!matched) {
    matched = {
      code: 'PUBLIC',
      reason: 'No sensitive keywords detected; defaulting to Public.',
      level: 0,
    };
  }

  const cls = input.classifications.find((c) => c.code === matched!.code) ?? input.classifications[0];
  return {
    code: cls?.code ?? 'PUBLIC',
    name: cls?.name ?? 'Public',
    reason: matched.reason,
    confidence: 0.7,
    source: 'heuristic',
  };
}

/**
 * LLM-based classifier. Uses z-ai-web-dev-sdk when AI_API_KEY is set.
 * Falls back to null on any error so caller uses heuristic.
 *
 * NOTE: No customer content is sent for training; the SDK is invoked
 * with explicit no-store semantics.
 */
async function llmClassify(input: ClassifyInput): Promise<ClassifyOutput | null> {
  try {
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const ai = await ZAI.create();

    const clsList = input.classifications.map((c) => `- ${c.code}: ${c.name} (level ${c.level})`).join('\n');
    const prompt = `You are a security classification assistant for a document management system.
Classify the following document into ONE of the following sensitivity levels:

${clsList}

Document:
- Title: ${input.title}
- Description: ${input.description ?? '(none)'}
- Type: ${input.documentType}
- File name: ${input.fileName}
- MIME type: ${input.mimeType}
- Tags: ${input.tags.join(', ')}
- Metadata: ${JSON.stringify(input.metadata)}

Respond with a JSON object {"code": "<classification code>", "reason": "<one sentence>", "confidence": <0..1>}.
Do not include any other text.`;

    const completion = await ai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a precise document classification assistant. Never invent classifications outside the provided list.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
      max_tokens: 200,
      // Explicit no-store: do not use customer data for training
      store: false,
    } as any);

    const text = completion.choices?.[0]?.message?.content ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.code || !input.classifications.some((c) => c.code === parsed.code)) return null;

    return {
      code: parsed.code,
      name: input.classifications.find((c) => c.code === parsed.code)?.name ?? parsed.code,
      reason: parsed.reason ?? 'LLM-classified',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      source: 'llm',
    };
  } catch (err) {
    logger.warn('ai', { message: '[ai:llm:error]', error: err });
    return null;
  }
}
