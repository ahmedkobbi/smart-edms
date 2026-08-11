# Security Hall of Fame

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

</div>

---

This page recognizes the security researchers who have responsibly
disclosed vulnerabilities in Smart EDMS. Their work makes the platform
safer for every tenant and end user.

## Reporting a Vulnerability

Want to join this list? Report a vulnerability privately:

> **[Open a Private Security Advisory](https://github.com/ahmedkobbi/smart-edms/security/advisories/new)**

See [`SECURITY.md`](../SECURITY.md) for the full policy: supported
versions, response SLAs (72h acknowledgement, 7-day assessment),
severity-based fix targets, scope, and coordinated disclosure.

---

## Hall of Fame

*No external reports yet. Be the first.*

---

## Recognition

Confirmed vulnerability reporters receive:

1. **Credit** in the GitHub Security Advisory (unless they request anonymity)
2. **Listing** on this page with their name, a link to their profile/site,
   and the advisory (once published)
3. **Mention** in the release notes of the fix release
4. **Gratitude** from the Author — this is a proprietary project without a
   monetary bug bounty, so recognition is the primary reward

### Severity recognition

| Severity | Recognition |
|----------|-------------|
| **Critical** | Top-of-page listing + dedicated release-notes section + CVE (if applicable) |
| **High** | Top-of-page listing + release-notes mention |
| **Medium** | Listing on this page + release-notes mention |
| **Low** | Listing on this page |

---

## Format

When the first report lands, this page will be updated with entries
following this format:

```
### [Researcher Name](https://github.com/handle) — YYYY-MM-DD
- **Severity:** Critical / High / Medium / Low
- **Component:** src/lib/... / API endpoint / UI
- **Advisory:** [GHSA-xxxx-xxxx-xxxx](link)
- **CVE:** CVE-YYYY-NNNNN (if assigned)
- **Summary:** One-sentence description of the vulnerability.
```

---

## Ground Rules

- **Private disclosure first.** Reports made via public issues, social
  media, or blog posts before a fix is available are not eligible for
  this list.
- **Coordinated disclosure.** Researchers who honor the coordinated
  disclosure timeline (see [`SECURITY.md`](../SECURITY.md)) are
  recognized. Researchers who publish early without notice forfeit
  listing.
- **No active exploitation.** Researchers who exploit the vulnerability
  against live deployments, or who use it to access real user data,
  forfeit listing and may face legal action.
- **Original research only.** Duplicate reports of the same issue are
  credited to the first reporter.
- **Anonymity respected.** Researchers who request anonymity are listed
  as "Anonymous" with no profile link.

---

## Past Audits

The platform underwent a comprehensive internal security review prior to
the v1.0.0 release, resulting in **125+ findings patched** across 5
severity levels (9 CRITICAL, 15 HIGH, 63 MEDIUM, 38 LOW, 5
infrastructure). This review was conducted by the Author and is
documented in [`docs/SECURITY.md`](./SECURITY.md) and the
[16 ADRs](./adr/).

External security researchers who contribute to hardening the platform
beyond this baseline will be recognized here.

---

<div align="center">

*Algerian by origin. International by standard. Universal by design.* 🇩🇿

</div>
