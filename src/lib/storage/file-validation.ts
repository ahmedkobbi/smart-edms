/**
 * Smart EDMS — File validation
 */

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'application/rtf', 'text/plain', 'text/csv', 'text/markdown', 'application/json', 'text/html', 'application/xml',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff', 'image/bmp', 'image/svg+xml',
  'application/zip', 'application/x-7z-compressed', 'application/gzip', 'application/x-tar',
]);

export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB for formData uploads
export const MAX_TUS_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB for TUS resumable uploads

interface MagicRule { mime: string; offset: number; pattern: number[]; }

const MAGIC_RULES: MagicRule[] = [
  { mime: 'application/pdf', offset: 0, pattern: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/png', offset: 0, pattern: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', offset: 0, pattern: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', offset: 0, pattern: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 0, pattern: [0x52, 0x49, 0x46, 0x46] },
  { mime: 'application/zip', offset: 0, pattern: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/x-7z-compressed', offset: 0, pattern: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { mime: 'application/gzip', offset: 0, pattern: [0x1f, 0x8b] },
  { mime: 'application/x-tar', offset: 257, pattern: [0x75, 0x73, 0x74, 0x61, 0x72] },
  { mime: 'application/msword', offset: 0, pattern: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { mime: 'application/rtf', offset: 0, pattern: [0x7b, 0x5c, 0x72, 0x74, 0x66] },
];

export function detectMime(head: Buffer): string | null {
  if (head.length < 12) return null;
  for (const rule of MAGIC_RULES) {
    if (head.length >= rule.offset + rule.pattern.length) {
      let match = true;
      for (let i = 0; i < rule.pattern.length; i++) { if (head[rule.offset + i] !== rule.pattern[i]) { match = false; break; } }
      if (match) {
        if (rule.mime === 'image/webp') { if (head.length >= 12 && head.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'; return null; }
        if (rule.mime === 'application/zip') return classifyZip(head);
        return rule.mime;
      }
    }
  }
  if (isProbablyText(head)) {
    if (head.slice(0, 5).toString('ascii') === '<?xml') return 'application/xml';
    if (head.slice(0, 5).toString('ascii') === '<!DOC' || head.slice(0, 5).toString('ascii') === '<html') return 'text/html';
    if (head.slice(0, 3).toString('ascii') === '#!/') return 'text/plain';
    return 'text/plain';
  }
  return null;
}

function classifyZip(head: Buffer): string {
  const ascii = head.toString('latin1');
  if (ascii.includes('word/')) { if (ascii.includes('[Content_Types].xml')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; }
  if (ascii.includes('xl/')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ascii.includes('ppt/')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  if (ascii.includes('mimetypeapplication/vnd.oasis.opendocument')) {
    if (ascii.includes('opendocument.text')) return 'application/vnd.oasis.opendocument.text';
    if (ascii.includes('opendocument.spreadsheet')) return 'application/vnd.oasis.opendocument.spreadsheet';
  }
  return 'application/zip';
}

function isProbablyText(buf: Buffer): boolean {
  let printable = 0; const total = Math.min(buf.length, 512);
  for (let i = 0; i < total; i++) { const b = buf[i]; if (b === 0x09 || b === 0x0a || b === 0x0d) { printable++; continue; } if (b >= 0x20 && b <= 0x7e) { printable++; continue; } if (b === 0xef && i + 2 < buf.length && buf[i + 1] === 0xbb && buf[i + 2] === 0xbf) { printable += 3; i += 2; continue; } }
  return printable / total >= 0.85;
}

export interface ValidationResult { ok: boolean; detectedMime: string | null; error?: string; }

export function validateUploadedFile(declaredMime: string, head: Buffer, size: number): ValidationResult {
  if (size <= 0) return { ok: false, detectedMime: null, error: 'Empty file' };
  if (size > MAX_FILE_SIZE) return { ok: false, detectedMime: null, error: `File exceeds ${MAX_FILE_SIZE} bytes` };
  const detected = detectMime(head);
  if (!detected) return { ok: false, detectedMime: null, error: 'Unrecognized file type' };
  if (detected !== declaredMime) {
    const compatiblePairs: Record<string, string[]> = {
      'application/zip': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet', 'application/zip'],
    };
    const compatible = compatiblePairs[detected] ?? [detected];
    if (!compatible.includes(declaredMime)) return { ok: false, detectedMime: detected, error: `MIME type mismatch: declared=${declaredMime}, detected=${detected}` };
  }
  if (!ALLOWED_MIME_TYPES.has(detected)) return { ok: false, detectedMime: detected, error: `Disallowed file type: ${detected}` };
  return { ok: true, detectedMime: detected };
}
