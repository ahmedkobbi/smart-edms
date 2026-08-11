# Support

<div align="center">

**صُنع في الجزائر — يخدم العالم**
*Made in Algeria — built for the world.*

</div>

---

## How to Get Help

Smart EDMS is a proprietary project maintained by a single author. To keep
the signal-to-noise ratio high and ensure every report reaches the right
channel, please use the routing table below.

### Routing table

| I want to... | Use this channel | Do NOT use |
|---|---|---|
| **Report a security vulnerability** | [Private Security Advisory](https://github.com/ahmedkobbi/smart-edms/security/advisories/new) (see [`SECURITY.md`](./SECURITY.md)) — recognized reporters are listed in the [Hall of Fame](./docs/SECURITY-HALL-OF-FAME.md) | Public GitHub Issues, Discussions, email, social media |
| **Report a bug** (functional defect) | [GitHub Issue — Bug Report](https://github.com/ahmedkobbi/smart-edms/issues/new?template=bug_report.yml) | Private advisories, direct email |
| **Request a feature** | [GitHub Issue — Feature Request](https://github.com/ahmedkobbi/smart-edms/issues/new?template=feature_request.yml) | Direct email to the Author |
| **Ask "how do I..." or discuss architecture** | [GitHub Discussions](https://github.com/ahmedkobbi/smart-edms/discussions) | GitHub Issues (Issues are for actionable defects/requests only) |
| **Propose a code change** | [Pull Request](https://github.com/ahmedkobbi/smart-edms/compare) (read [`CONTRIBUTING.md`](./CONTRIBUTING.md) first) | Direct email with code attached |
| **Report a Code of Conduct violation** | Private message via the [Author's GitHub profile](https://github.com/ahmedkobbi) | Public Issues, Discussions, social media |
| **Enterprise / commercial licensing inquiry** | Custom URL in [`.github/FUNDING.yml`](./.github/FUNDING.yml) or GitHub profile email | GitHub Issues |
| **Sponsor the project** | [GitHub Sponsors](https://github.com/sponsors/ahmedkobbi) | — |

### Before you reach out

1. **Read the documentation.** The [README](./README.md) (or
   [العربية](./README.ar.md)) covers the architecture, features, tech stack,
   API surface, deployment, and security posture. The
   [16 ADRs](./docs/adr/) explain *why* key design decisions were made.

2. **Search existing issues and discussions.** Your question may already be
   answered. Use the search bar in the
   [Issues](https://github.com/ahmedkobbi/smart-edms/issues?q=is%3Aissue) and
   [Discussions](https://github.com/ahmedkobbi/smart-edms/discussions) tabs.

3. **Check the operations runbook.** If you are running Smart EDMS in
   production and hit an operational issue, see
   [`docs/OPERATIONS-RUNBOOK.md`](./docs/OPERATIONS-RUNBOOK.md) for incident
   response, backup/restore, scaling, and troubleshooting.

4. **Check the API docs.** For endpoint-specific questions, the interactive
   OpenAPI 3.1 spec at `/api-docs` (or the raw
   [`docs/openapi.json`](./docs/openapi.json)) is authoritative.

5. **Verify you are on `main`.** The Author only supports the latest `main`
   branch and recent tagged releases. If you are running a fork or an old
   commit, reproduce on `main` before reporting (see
   [`SECURITY.md` → Supported Versions](./SECURITY.md#supported-versions)).

---

## Response Times

The Author is an individual, not a company. Expected response times:

| Channel | Target first response |
|---|---|
| Security advisory (private) | 72 hours (see [`SECURITY.md`](./SECURITY.md)) |
| Bug report (GitHub Issue) | 7 days (triage) |
| Feature request (GitHub Issue) | 14 days (initial assessment) |
| GitHub Discussion | Best-effort, no SLA |
| Pull Request review | 7 days (initial review) |
| Enterprise / licensing inquiry | 5 business days |

These are targets, not guarantees. If you have not heard back within 2× the
target window, a polite follow-up comment on the issue/PR is appropriate.

---

## What the Author Can Help With

- Reproducing and triaging bugs reported against `main`
- Reviewing and merging well-scoped pull requests that follow
  [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- Clarifying architectural decisions documented in the
  [ADRs](./docs/adr/)
- Coordinating security disclosure and fix timelines (see
  [`SECURITY.md`](./SECURITY.md))
- Answering "why is X designed this way?" questions in Discussions
- Evaluating enterprise licensing requests

## What the Author Cannot Help With

- Debugging your specific deployment (the runbook and `docs/DEPLOYMENT.md`
  are the starting point; from there, it's your infrastructure)
- Backporting fixes to old forks — upgrade to `main` or a recent tag
- Custom feature development for free (sponsor the project or commission the
  work via the enterprise licensing channel)
- Recommending third-party hosting providers or consultancies
- Legal advice on whether Smart EDMS fits your compliance regime — engage
  your own auditor
- Issues in dependencies (report those upstream; the Author will backport
  security fixes once the upstream patch lands)

---

## Commercial Support

Smart EDMS is proprietary software. If you need:

- **A commercial license** for terms beyond the evaluation/authorized-deployment
  scope in [`LICENSE`](./LICENSE)
- **Priority support** with guaranteed SLAs
- **Custom feature development** or integration work
- **Deployment assistance** or architectural review for your specific
  environment
- **Training** for your team on the codebase, threat model, or operations

…contact the Author via the email on the
[GitHub profile](https://github.com/ahmedkobbi) with the subject line
"Smart EDMS — Commercial Inquiry". Include your organization name, intended
use case, and the scope of support you need.

---

## Community Resources

- **GitHub Discussions** — community Q&A, architecture debates, and
  announcements. This is the primary public space for non-actionable
  conversation.
- **GitHub Issues** — actionable bugs and feature requests only. Use the
  templates.
- **Pull Requests** — code contributions. Read
  [`CONTRIBUTING.md`](./CONTRIBUTING.md) first.
- **Security Advisories** — for vulnerability reports. See
  [`SECURITY.md`](./SECURITY.md).

There is no Discord, Slack, mailing list, or forum today. If the community
grows to justify one, it will be announced in GitHub Discussions.

---

<div align="center">

*Algerian by origin. International by standard. Universal by design.* 🇩🇿

</div>
