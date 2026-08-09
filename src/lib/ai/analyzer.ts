/**
 * Smart EDMS — AI analysis service
 *
 * - PII detection (heuristic regex + LLM fallback)
 * - Document summarization (LLM)
 * - Metadata extraction suggestions
 *
 * All operations are advisory. No silent mutations.
 */

import { db } from '@/lib/db';
import { getFileStorage } from '@/lib/storage/file-storage';

export interface PiiFinding {
  type: string; // email, phone, ssn, credit_card, passport, iban, ip
  value: string; // masked
  start: number;
  end: number;
  page?: number;
}

const PII_PATTERNS: { type: string; regex: RegExp; mask: (m: string) => string }[] = [
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    mask: (m) => m.replace(/(^.).+(@.)/, '$1***$2'),
  },
  {
    type: 'phone',
    regex: /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    mask: (m) => m.replace(/\d(?=\d{2})/g, '*'),
  },
  {
    type: 'ssn',
    regex: /\b\d{3}-\d{2}-\d{4}\b/g,
    mask: (m) => '***-**-' + m.slice(-4),
  },
  {
    type: 'credit_card',
    regex: /\b(?:\d[ -]*?){13,16}\b/g,
    mask: (m) => '**** **** **** ' + m.replace(/\s/g, '').slice(-4),
  },
  {
    type: 'iban',
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
    mask: (m) => m.slice(0, 4) + '****' + m.slice(-4),
  },
  {
    type: 'ip',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    mask: (m) => m,
  },
  {
    type: 'passport',
    regex: /\b[A-Z]{1,2}\d{6,9}\b/g,
    mask: (m) => m.slice(0, 2) + '******',
  },
];

export async function detectPii(tenantId: string, documentId: string): Promise<{
  findings: PiiFinding[];
  totalMatches: number;
  byType: Record<string, number>;
  source: 'heuristic' | 'llm';
}> {
  const doc = await db.document.findFirst({
    where: { id: documentId, tenantId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!doc) throw new Error('Document not found');

  const text = await extractText(doc);

  const findings: PiiFinding[] = [];
  for (const pattern of PII_PATTERNS) {
    const matches = text.matchAll(pattern.regex);
    for (const m of matches) {
      if (m.index === undefined) continue;
      findings.push({
        type: pattern.type,
        value: pattern.mask(m[0]),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  const byType: Record<string, number> = {};
  for (const f of findings) byType[f.type] = (byType[f.type] || 0) + 1;

  return {
    findings: findings.slice(0, 200),
    totalMatches: findings.length,
    byType,
    source: 'heuristic',
  };
}

async function extractText(doc: any): Promise<string> {
  if (!doc.versions[0]) return '';
  const version = doc.versions[0];
  const storage = getFileStorage();

  // For text files, read directly
  if (version.mimeType.startsWith('text/') || version.mimeType === 'application/json') {
    const buf = await storage.get(version.storageKey);
    return buf.toString('utf-8');
  }

  // For PDFs, parse text (basic — production would use pdf-parse)
  if (version.mimeType === 'application/pdf') {
    try {
      const buf = await storage.get(version.storageKey);
      // Extract text between BT/ET markers (very basic)
      const text = buf.toString('latin1');
      const matches = text.match(/\(([^)]+)\)/g);
      if (matches) return matches.map((m) => m.slice(1, -1)).join(' ');
    } catch {
      return '';
    }
  }

  // Fallback: use title + description + metadata
  return `${doc.title} ${doc.description ?? ''} ${doc.documentType}`;
}

export async function summarizeDocument(tenantId: string, documentId: string): Promise<{
  summary: string;
  keyPoints: string[];
  source: 'llm' | 'heuristic';
}> {
  const doc = await db.document.findFirst({
    where: { id: documentId, tenantId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!doc) throw new Error('Document not found');

  const text = (await extractText(doc)).slice(0, 8000);

  // Try LLM if configured
  if (process.env.AI_API_KEY) {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const ai = await ZAI.create();
      const completion = await ai.chat.completions.create({
        messages: [
          { role: 'system', content: 'You are a document summarization assistant. Produce a concise summary and 3-5 key bullet points.' },
          { role: 'user', content: `Summarize this document.\n\nTitle: ${doc.title}\n\nContent:\n${text}` },
        ],
        temperature: 0.2,
        max_tokens: 500,
      });
      const out = completion.choices?.[0]?.message?.content ?? '';
      // Parse summary + bullets
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      const bullets = lines.filter((l) => /^[-*•]/.test(l)).map((l) => l.replace(/^[-*•]\s*/, ''));
      const summary = lines.filter((l) => !/^[-*•]/.test(l)).join(' ') || out;
      return {
        summary: summary.slice(0, 1000),
        keyPoints: bullets.slice(0, 5),
        source: 'llm',
      };
    } catch (err) {
      console.warn('[ai:summarize] LLM failed, falling back to heuristic:', err);
    }
  }

  // Heuristic: first 200 chars of text + title-based key points
  const summary = text.slice(0, 280).trim() + (text.length > 280 ? '…' : '');
  const keyPoints = [
    `Document type: ${doc.documentType}`,
    `Current version: v${doc.currentVersion}`,
    text.length > 0 ? `Content length: ${text.length} chars` : 'No extractable text',
  ];
  return { summary, keyPoints, source: 'heuristic' };
}

export async function extractMetadataSuggestions(tenantId: string, documentId: string): Promise<{
  suggestions: Record<string, string>;
  source: 'heuristic' | 'llm';
}> {
  const doc = await db.document.findFirst({
    where: { id: documentId, tenantId },
    include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
  });
  if (!doc) throw new Error('Document not found');

  const text = (await extractText(doc)).toLowerCase();
  const suggestions: Record<string, string> = {};

  // Extract dates
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) suggestions['date'] = dateMatch[0];

  // Extract amounts
  const amountMatch = text.match(/\$[\d,]+(\.\d{2})?|€[\d,]+(\.\d{2})?|£[\d,]+(\.\d{2})?/);
  if (amountMatch) suggestions['amount'] = amountMatch[0];

  // Extract case numbers
  const caseMatch = text.match(/\b(case|ref|docket)[\s:-]*([a-z0-9-]+)/i);
  if (caseMatch) suggestions['caseNumber'] = caseMatch[2];

  // Extract jurisdiction hints
  if (/\bgdpr\b|\beu\b|\beuropean union\b/.test(text)) suggestions['jurisdiction'] = 'EU';
  else if (/\bhipaa\b|\busa\b|\bunited states\b/.test(text)) suggestions['jurisdiction'] = 'US';

  // Department inference from document type
  if (doc.documentType === 'invoice' || doc.documentType === 'financial') suggestions['department'] = 'Finance';
  else if (doc.documentType === 'contract') suggestions['department'] = 'Legal';
  else if (doc.documentType === 'policy') suggestions['department'] = 'Compliance';

  return { suggestions, source: 'heuristic' };
}
