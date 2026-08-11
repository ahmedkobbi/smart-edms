<!--
Thank you for opening a pull request to Smart EDMS!

Before submitting, please review the CONTRIBUTING.md guidelines:
https://github.com/ahmedkobbi/smart-edms/blob/main/CONTRIBUTING.md

For non-trivial changes (more than ~50 lines of logic), an issue should
be opened first to align on direction.
-->

## Summary

<!-- One-paragraph description of what this PR changes and why. -->

## Related issue

<!-- Fixes #123 / Refs #456 / "No related issue (small fix)" -->

## Type of change

<!-- Check all that apply -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 🔒 Security fix (touches authentication, authorization, crypto, audit, or payments)
- [ ] 📚 Documentation update
- [ ] ♻️ Refactor (no functional change, no API change)
- [ ] ⚡ Performance improvement
- [ ] 🧪 Test addition / improvement
- [ ] 🔧 Chore (deps, CI, build tooling)
- [ ] 🌐 i18n / localization

## Scope

<!-- Roughly how big is this change? -->

- [ ] Small (~1–50 lines, single file)
- [ ] Medium (~50–500 lines, single feature)
- [ ] Large (~500+ lines, cross-cutting)

## Checklist

<!-- All non-documentation PRs must check the first six boxes. -->

- [ ] **Issue opened first** for non-trivial changes (more than ~50 lines of logic)
- [ ] **Code follows style** — `bun run lint` passes, no `any` without justification, strict TS
- [ ] **TypeScript clean** — `npx tsc --noEmit` passes with zero errors
- [ ] **Tests added** for any new logic; bug-fix PRs include a regression test that fails before the fix
- [ ] **All tests pass** — `bun run test` (unit) and, if UI-touching, `bun run test:e2e`
- [ ] **i18n complete** — every user-facing string flows through `t()`; `bun run check:translations` passes
- [ ] **No client-side secrets** — sensitive values live in `src/lib/` (server-only)
- [ ] **Audit logging** added for any route that mutates auth state, documents, classifications, or payments
- [ ] **Documentation updated** — API changes update `docs/openapi.json`; architectural changes update or add an ADR
- [ ] **Commit messages** follow Conventional Commits with a scope (see CONTRIBUTING.md)
- [ ] **No secrets in diff** — no `.env`, no API keys, no tokens, no KEK values, no real PII

## Security considerations

<!-- If this PR touches authentication, authorization, crypto, audit, payments,
     or any security-sensitive code path, describe the threat model and how
     the change preserves (or improves) the security posture. If it does not
     touch security-sensitive code, write "N/A". -->

## Migration notes

<!-- If this is a breaking change, describe the migration path for existing
     deployments. Include any required env-var changes, DB migrations, or
     manual steps. If non-breaking, write "N/A". -->

## Verification

<!-- How did you verify this change works? Include commands run, screenshots,
     or test output. For UI changes, include a screenshot of the affected view. -->

---

<div align="center">

*Algerian by origin. International by standard. Universal by design.* 🇩🇿

</div>
