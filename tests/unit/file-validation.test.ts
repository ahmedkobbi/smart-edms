/**
 * Smart EDMS — File validation tests
 *
 * Tests magic-byte detection and MIME type validation:
 *   - PDF detection
 *   - Image format detection (PNG, JPEG, GIF, WebP)
 *   - ZIP/OOXML classification
 *   - Text file detection
 *   - MIME spoofing detection (declared ≠ detected)
 *   - File size limits
 *   - Disallowed types rejection
 */

import { describe, it, expect } from 'vitest';
import { detectMime, validateUploadedFile, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/storage/file-validation';

describe('File Validation — Magic Byte Detection', () => {
  it('detects PDF files', () => {
    const buf = Buffer.from('%PDF-1.4\nrest of content', 'utf-8');
    expect(detectMime(buf)).toBe('application/pdf');
  });

  it('detects PNG files', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(detectMime(buf)).toBe('image/png');
  });

  it('detects JPEG files', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(detectMime(buf)).toBe('image/jpeg');
  });

  it('detects GIF files', () => {
    const buf = Buffer.from('GIF89a' + 'rest_of_file_content_here', 'utf-8');
    expect(detectMime(buf)).toBe('image/gif');
  });

  it('detects WebP files (RIFF + WEBP)', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(0, 4);
    buf.write('WEBP', 8);
    expect(detectMime(buf)).toBe('image/webp');
  });

  it('detects ZIP files', () => {
    // ZIP needs at least 12 bytes for detection (magic + classification)
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(detectMime(buf)).toBe('application/zip');
  });

  it('detects plain text files', () => {
    const buf = Buffer.from('Hello, this is a plain text file.\nLine 2.', 'utf-8');
    expect(detectMime(buf)).toBe('text/plain');
  });

  it('detects XML files', () => {
    const buf = Buffer.from('<?xml version="1.0"?>\n<root></root>', 'utf-8');
    expect(detectMime(buf)).toBe('application/xml');
  });

  it('detects HTML files', () => {
    const buf = Buffer.from('<!DOCTYPE html>\n<html><body></body></html>', 'utf-8');
    expect(detectMime(buf)).toBe('text/html');
  });

  it('detects RTF files', () => {
    const buf = Buffer.from('{\\rtf1\\ansi\\deff0}', 'utf-8');
    expect(detectMime(buf)).toBe('application/rtf');
  });

  it('returns null for unrecognized content', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b]);
    expect(detectMime(buf)).toBeNull();
  });

  it('handles very short buffers gracefully', () => {
    const buf = Buffer.from([0x25, 0x50]);
    expect(detectMime(buf)).toBeNull();
  });
});

describe('File Validation — Upload Validation', () => {
  it('accepts a valid PDF with correct declared MIME', () => {
    const buf = Buffer.from('%PDF-1.4\ncontent', 'utf-8');
    const result = validateUploadedFile('application/pdf', buf, 100);
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe('application/pdf');
  });

  it('rejects MIME spoofing (declared PDF, actual text)', () => {
    const buf = Buffer.from('This is just text, not a PDF', 'utf-8');
    const result = validateUploadedFile('application/pdf', buf, 100);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('mismatch');
  });

  it('rejects empty files', () => {
    const buf = Buffer.alloc(0);
    const result = validateUploadedFile('text/plain', buf, 0);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Empty');
  });

  it('rejects files exceeding size limit', () => {
    const buf = Buffer.from('%PDF-1.4\ncontent', 'utf-8');
    const result = validateUploadedFile('application/pdf', buf, MAX_FILE_SIZE + 1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('exceeds');
  });

  it('rejects disallowed MIME types (executable)', () => {
    // MZ header (PE executable)
    const buf = Buffer.alloc(8);
    buf[0] = 0x4d;
    buf[1] = 0x5a;
    buf[2] = 0x90;
    buf[3] = 0x00;
    // detectMime won't recognize MZ as a known type, so it returns null
    const result = validateUploadedFile('application/x-msdownload', buf, 100);
    expect(result.ok).toBe(false);
  });

  it('accepts PNG with correct declared MIME', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const result = validateUploadedFile('image/png', buf, 100);
    expect(result.ok).toBe(true);
    expect(result.detectedMime).toBe('image/png');
  });

  it('accepts ZIP as OOXML when declared as Word docx', () => {
    // Minimal ZIP header
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = validateUploadedFile(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buf,
      100,
    );
    // The validator should accept this (ZIP is compatible with OOXML)
    expect(result.ok).toBe(true);
  });

  it('MAX_FILE_SIZE is 100MB', () => {
    expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });

  it('ALLOWED_MIME_TYPES includes common document types', () => {
    expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('text/plain')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('image/png')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('application/json')).toBe(true);
  });

  it('ALLOWED_MIME_TYPES excludes executables', () => {
    expect(ALLOWED_MIME_TYPES.has('application/x-msdownload')).toBe(false);
    expect(ALLOWED_MIME_TYPES.has('application/x-executable')).toBe(false);
  });
});
