# ADR-008: Magic-byte MIME validation

**Status:** Accepted

## Context

File uploads must not trust the `Content-Type` header (trivially spoofable). A malicious user could:
- Upload an executable disguised as `image/png`
- Upload a macro-enabled Office file disguised as `application/pdf`
- Bypass file type restrictions

## Decision

Implement **magic-byte validation**:
1. Read the first 8KB of the uploaded file
2. Compare against known magic-byte signatures (PDF `%PDF`, PNG `89 50 4E 47`, JPEG `FF D8 FF`, etc.)
3. For ZIP-based formats (OOXML, ODF), inspect internal structure to classify
4. If detected MIME ≠ declared MIME → reject
5. If detected MIME not in allowlist → reject

## Consequences

### Positive
- Detects MIME spoofing (declared PDF but actual executable)
- Classifies OOXML correctly (Word vs Excel vs PowerPoint)
- Blocks upload of disallowed types even with spoofed headers

### Negative
- Some file types have ambiguous magic bytes (RTF looks like text)
- Cannot detect 100% of file types (falls back to `null` → reject)
- Adds ~5ms per upload for magic byte inspection

## Supported types

- **Documents**: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS, RTF, TXT, CSV, MD, JSON, HTML, XML
- **Images**: PNG, JPEG, GIF, WebP, TIFF, BMP, SVG
- **Archives**: ZIP, 7z, GZIP, TAR (flagged for malware scan)

## Alternatives considered

- **Trust Content-Type header only**: Trivially bypassed
- **File extension only**: Trivially bypassed
- **Infer type via `file` command**: Requires external process, not portable
