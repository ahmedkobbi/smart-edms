# ADR-004: Argon2id for password hashing

**Status:** Accepted

## Context

Password hashing must be:
- Memory-hard (resistant to GPU/ASIC attacks)
- Slow enough to deter brute force, fast enough for UX
- Widely vetted and standardized

## Decision

Use **Argon2id** with parameters:
- `memoryCost`: 19 MiB (19456 KB)
- `timeCost`: 2 iterations
- `parallelism`: 1

These are the OWASP-recommended parameters for interactive systems.

## Consequences

### Positive
- Winner of the Password Hashing Competition (2015)
- Resistant to GPU, ASIC, and side-channel attacks
- OWASP-recommended
- Adjustable parameters for future hardware improvements

### Negative
- Native module (`argon2` npm package) requires compilation
- ~50ms per hash/verify (acceptable for login, but slow for bulk operations)
- Not available in Edge runtime (must run in Node.js)

## Alternatives considered

- **bcrypt**: Mature, but 72-byte password limit and not memory-hard
- **scrypt**: Memory-hard, but less widely vetted than Argon2
- **PBKDF2**: Weaker than Argon2; only use if Argon2 unavailable
