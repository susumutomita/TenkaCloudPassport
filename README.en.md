# TenkaCloud Passport

[Japanese](./README.md)

TenkaCloud Passport is a free, account-free Expo app that lets you hand off an introduction without a business
card. Show your name, title, and self-introduction as a QR code, and the other person can save your contact using
only their phone's standard camera — no app install required. See the
[landing page](https://susumutomita.github.io/TenkaCloudPassport/en/) for details.

## What it does

- Enter your name (required), title, organization, self-introduction, and links. Nothing stays on the device until
  you explicitly save it.
- Once saved, it shows a real QR code (vCard 3.0) that a standard camera can scan.
- No server and no account are required. The only way data leaves the device is a manual JSON export you perform yourself.
- The existing Pet / Lounge / Bridge code and tests are kept but removed from the default screens. They are
  expected to return in roadmap Step 4 (a concept for on-device agents finding a connection). See the Roadmap
  section on the landing page for details.

## Try it in two minutes

```bash
make install
make start
```

Install Expo Go on your phone, connect it to the same network as your Mac, then scan the QR code shown in the
terminal. The app opens on the Intro Card creation screen. Enter a name and save it, and you move to the screen
that shows a QR code a standard camera can scan.

Verifying on a physical device that scanning this QR with a standard camera offers to add a contact is Not run as
of this README (a cloud environment cannot perform physical-device verification).

## Current release state

| Scope | State | Allowed now | Stop condition |
| --- | --- | --- | --- |
| Repository development | `Implemented` | Validate source, pure TypeScript Domain, Rules Provider, and Web Export, including on-device Intro Card storage and vCard QR generation. | Never treat green CI as physical-device evidence. |
| Source-only candidate | `Experimental` | Reproduce a draft candidate from one fixed commit. | Do not call it a public release or overwrite an existing output. |
| Public OSS Alpha | `Blocked` | Nothing. | Do not publish until every required physical gate is `Verified`. |
| Local Champion walkthrough | `Experimental` | Review documents, diagrams, roles, and stop conditions. | Do not use real participant data, real QR, Nearby, or a group Lounge. |
| Product Lounge | `Blocked / Not run` | Nothing. | Wait for distribution, device, Nearby, accessibility, full-delete, and dry-run evidence. |

`Implemented / Experimental / Planned` describe source maturity. `Verified / Not run / Blocked` describe evidence for
one environment. They are not interchangeable. See the
[Release Status and Device Matrix](./docs/releases/status.md) for evidence per combination.

## Choose one entry path

| Path | For whom | Prerequisites | First success | Current assurance |
| --- | --- | --- | --- | --- |
| Repository gate | Contributor | Git and Bun 1.3.11 | `make before-commit` exits 0. | Repository contract only. |
| Web | Rules and shared-UI reviewer | Bun and a supported browser | Metro prints a URL and the first screen opens. | Web Export and Rules Provider. Browser use remains `Not run` in the release matrix. |
| Expo Go | Physical-device UI reviewer | Compatible Expo Go and same network | The first screen opens from the Metro QR. | Expo Go's bundled native modules only; no Local LLM or real Nearby. |
| Native development build | Native developer | macOS + Xcode, or Android SDK / JDK | A dedicated build starts on the target device. | `Not run`; a simulator or successful compile is not provider evidence. |

### Repository gate

Check out the exact release tag or commit first. A moving `main` branch is not a reproducibility input.

```bash
make install_ci
make before-commit
```

Success means the architecture harness, tests, lint, typecheck, coverage, and Web Export all exit 0. On failure, fix the
first error. Do not weaken invariants, `biome.json`, or coverage thresholds.

### Web

```bash
make install_ci
bun run web
```

Open the printed URL and confirm only that the initial Passport screen appears. This is not evidence for Local LLM,
physical camera QR, or Nearby Transport. If the URL cannot be opened, return to the Web Export gate and keep Expo Go
as `Not run`.

### Expo Go

```bash
make install_ci
bun run start
```

Scan Metro's QR from Expo Go on the same network and confirm that the first screen appears. Expo Go cannot add arbitrary
custom native code, so Local LLM and real Nearby Transport are outside this path. If connectivity cannot be recovered,
keep this path as `Not run` and return to Web.

### Native development build

Read [Native Development Builds](./docs/development/native-builds.md) for platform prerequisites, generated files,
signing, and recovery. iOS / Android devices, Local LLM, and Nearby Transport are currently `Not run` or `Blocked` in
the release matrix.

## Reproduce a draft source candidate

This validates a source-only candidate, not a public release. Replace `<candidate-commit>` with the exact 40-character
commit SHA supplied by the release operator.

```bash
git checkout --detach <candidate-commit>
make install_ci
RELEASE_VERSION=0.1.0-alpha.1 RELEASE_REF=HEAD RELEASE_OUTPUT=release-output make release_candidate
cd release-output
shasum -a 256 -c checksums.txt
```

Success creates six files: source archive, SPDX SBOM, `LICENSE`, direct-dependency license notice, release manifest, and
checksums. The output path must not exist yet; symlinks and existing candidates are rejected. Never
distribute partial output or a checksum mismatch. Quarantine it and retry with another uncreated path. See the
[Source Release Runbook](./docs/development/source-release.md).

## Architecture and canonical documents

[Architecture Overview](./docs/architecture/overview.md) provides both a diagram and an equivalent text description.
The pure TypeScript Domain does not import React Native, Storage, Transport, or model runtimes. The App layer calls
Ports, and platform adapters implement external capabilities. Web and Expo Go use the Rules Provider. Local LLM and
real Nearby Transport are not supported capabilities on the default branch.

- [Concept](./CONCEPT.md) / [Product Contract](./docs/product/product-contract.md) / [Glossary](./docs/product/glossary.md)
- [Privacy Data Inventory](./docs/privacy/data-inventory.md) / [Retention](./docs/privacy/retention-policy.md)
- [Threat Model](./docs/security/threat-model.md) / [Security Policy](./SECURITY.md)
- [Peer Protocol](./docs/architecture/peer-protocol.md) / [ADR index](./docs/adr/)
- [Facilitator Kit](./docs/facilitator/README.md) / [Safe walkthrough](./docs/facilitator/walkthrough.en.md) / [Pilot Protocol](./docs/research/pilot-protocol.md)
- [Release Checklist](./docs/releases/checklist.md) / [Known Limitations](./docs/releases/0.1.0-alpha.1.md)
- [Contributing](./CONTRIBUTING.md) / [Good First Issue candidates](./docs/contributing/good-first-issues.md)

The Facilitator Kit is currently for a document walkthrough only. Do not enter names, photos, profiles, or device IDs;
do not create or scan a real QR; and do not start Nearby or a group Lounge. Follow the
[safe walkthrough](./docs/facilitator/walkthrough.en.md) and keep every physical capability `Not run`.

Development follows [AGENTS.md](./AGENTS.md), [CLAUDE.md](./CLAUDE.md), the
[Definition of Done](./docs/architecture/quality-bar.md), and the
[Architecture Harness](./docs/architecture/harness.md). An MVP, placeholder, or green CI alone is not complete.
