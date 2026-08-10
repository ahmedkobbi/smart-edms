# ADR-010: AI with mandatory human-in-the-loop

**Status:** Accepted

## Context

AI can assist with:
- Document classification suggestions
- PII detection
- Summarization
- Metadata extraction
- Policy risk analysis

However, AI must NEVER silently perform:
- Classification downgrade
- Deletion
- Legal hold removal
- Access grant expansion
- Export of restricted content

These are high-risk governance decisions that require human judgment and accountability.

## Decision

Implement AI as **advisory only** with mandatory human approval:

1. **AI generates suggestions** — stored with `aiSuggestionState: 'pending'`
2. **Human reviews** — sees the suggestion + reasoning + confidence
3. **Human approves/rejects** — only then is the change applied
4. **All AI actions are audit-logged** — including suggestions that were rejected

### Tenant-level opt-out
AI features can be disabled per tenant via `settings.features.ai = false`.

### Data minimization
- No customer content is sent to external AI services for training
- LLM calls use explicit `no-store` semantics
- Heuristic fallback when no LLM is configured (no external calls)

## Consequences

### Positive
- Human accountability for all governance decisions
- AI accelerates but doesn't replace human judgment
- Full audit trail of AI suggestions + human decisions
- Tenants can disable AI entirely if policy requires

### Negative
- Slower than fully-automated AI (human must approve)
- Users may blindly approve suggestions (mitigated by showing reasoning + confidence)
- Heuristic fallback is less accurate than LLM

## Implementation

- `suggestClassification()` — returns suggestion, requires PATCH to apply
- `detectPii()` — returns findings, no automatic redaction
- `summarizeDocument()` — returns summary, no document modification
- `extractMetadataSuggestions()` — returns suggestions, requires PATCH to apply
- Policy risk analysis — returns risk assessment, no automatic remediation

## Alternatives considered

- **Fully automated AI**: Faster, but unacceptable for regulated industries
- **AI with audit-only oversight**: AI acts, humans review later — too risky for downgrades
- **No AI**: Loses efficiency benefits; human-only classification is error-prone at scale
