# TenkaCloud Passport

[Japanese](./README.md)

TenkaCloud Passport is a free, account-free Expo app that lets you hand off an introduction without a business
card. Just show a QR code and the other person opens your Intro Card page with their phone's standard camera,
no app required. See the [landing page](https://card.tenkacloud.com/en/) for details.

## Demo video

[![Demo video](https://img.youtube.com/vi/KgMwSKu05a4/hqdefault.jpg)](https://youtube.com/shorts/KgMwSKu05a4)

## What it does

Create a card, show the QR code, the other person scans it with their standard camera, their browser opens
your Intro Card page, and adding you to contacts stays optional.

- Enter your name (required), title, organization, self-introduction, and links. Nothing stays on the device
  until you explicitly save it.
- Once saved, it shows a real QR code (a URL to your Intro Card page) that a standard camera can scan.
  Scanning it opens the page in the other person's browser; adding you to contacts is an optional action they
  choose inside that page.
- Viewing the card itself works the same on iOS and Android. Adding to contacts has been verified only on
  iPhone/Safari. On Android, it requires one extra step—save the `.vcf` file, then open it—and remains
  unverified. In in-app browsers for SNS apps such as LINE, X, and Instagram, saving the `.vcf` file may fail
  entirely, so adding the contact may not work.
- No account is required, and no server stores the card. To share it, you display a QR code whose URL
  fragment contains the Intro Card data, and the recipient scans it. The fragment is not sent to the server.
- The existing Pet / Lounge / Bridge code and tests are kept but removed from the default screens. They are
  expected to return in roadmap Step 4 (a concept for on-device agents finding a connection). See the Roadmap
  section on the landing page for details.

This repository's Public OSS Alpha is currently `Blocked` (it stays unpublished until every required physical
verification gate is met). See the
[Release Status and Device Matrix](./docs/releases/status.md) for details.

## Try it now

Easiest options first.

### (a) Just open the Web version

<https://card.tenkacloud.com/app/>

No install needed, open it in your browser right away. Add it to your home screen to launch it like an app.

- Data is stored in the browser's on-device storage. Switching browsers or devices does not carry your card
  over.
- The first load requires an online connection. Full offline support via a Service Worker is not implemented
  yet (tracked as a follow-up).
- On iOS Safari, tap the Share icon and choose "Add to Home Screen"; on Android Chrome, open the menu and
  choose "Add to Home Screen" or "Install app". Either way you get an icon on your home screen that launches
  the app directly. This is not App Store or Play Store distribution.

### (b) For developers

```bash
make install
make dev
```

`make dev` targets a Development Build (dev-client). If you have not set one up on a device or simulator yet,
read [Native Development Builds](./docs/development/native-builds.md) first. If you just want to try it with
no setup, run `make start` after `make install` to launch it in Expo Go (`--go`) instead. `make start` and
`make dev` target different builds and do not connect to each other.

If Metro/Expo becomes a zombie and the port stays occupied, `make stop` stops only the matching
Expo/Metro process (it does not kill unrelated processes on 8081). Run `make restart` to stop it and
relaunch with `make dev`. See `make help` (running bare `make` shows the same output) for the full target
list.

The owner has verified on a physical device that scanning this QR with a standard camera opens the Intro Card
page in a browser. This does not carry the device family, OS version, and other evidence the release matrix
requires, so it stays `Not run` rather than `Verified`. See the
[Release Status and Device Matrix](./docs/releases/status.md) for details.

## For contributors

Everything below is for contributors and native developers.

### Current release state

| Scope | State | Allowed now | Stop condition |
| --- | --- | --- | --- |
| Repository development | `Implemented` | Validate source, pure TypeScript Domain, Rules Provider, and Web Export, including on-device Intro Card storage and QR generation that encodes the Intro Card page URL. | Never treat green CI as physical-device evidence. |
| Source-only candidate | `Experimental` | Reproduce a draft candidate from one fixed commit. | Do not call it a public release or overwrite an existing output. |
| Public OSS Alpha | `Blocked` | Nothing. | Do not publish until every required physical gate is `Verified`. |
| Local Champion walkthrough | `Experimental` | Review documents, diagrams, roles, and stop conditions. | Do not use real participant data, real QR, Nearby, or a group Lounge. |
| Product Lounge | `Blocked / Not run` | Nothing. | Wait for distribution, device, Nearby, accessibility, full-delete, and dry-run evidence. |

`Implemented / Experimental / Planned` describe source maturity. `Verified / Not run / Blocked` describe evidence for
one environment. They are not interchangeable. See the
[Release Status and Device Matrix](./docs/releases/status.md) for evidence per combination.

### Choose one entry path

| Path | For whom | Prerequisites | First success | Current assurance |
| --- | --- | --- | --- | --- |
| Repository gate | Contributor | Git and Bun 1.3.11 | `make before-commit` exits 0. | Repository contract only. |
| Web | Rules and shared-UI reviewer | Bun and a supported browser | Metro prints a URL and the first screen opens. | Web Export and Rules Provider. Browser use remains `Not run` in the release matrix. |
| Expo Go | Physical-device UI reviewer | Compatible Expo Go and same network | The first screen opens from the Metro QR. | Expo Go's bundled native modules only; no Local LLM or real Nearby. |
| Native development build | Native developer | macOS + Xcode, or Android SDK / JDK | A dedicated build starts on the target device. | `Not run`; a simulator or successful compile is not provider evidence. |

#### 1. Repository gate

Check out the exact release tag or commit first. A moving `main` branch is not a reproducibility input.

```bash
make install_ci
make before-commit
```

Success means the architecture harness, tests, lint, typecheck, coverage, and Web Export all exit 0. On failure, fix the
first error. Do not weaken invariants, `biome.json`, or coverage thresholds.

#### 2. Web

```bash
make install_ci
bun run web
```

Open the printed URL and confirm only that the initial Passport screen appears. This is not evidence for Local LLM,
physical camera QR, or Nearby Transport. If the URL cannot be opened, return to the Web Export gate and keep Expo Go
as `Not run`.

#### 3. Expo Go

```bash
make start
```

Install Expo Go on your phone, connect it to the same network as your Mac, and scan the QR code shown in
the terminal with Expo Go. `make start` installs dependencies first if they are missing, then overrides
expo-dev-client's default to start the dev server in Expo Go mode (`--go`). Expo Go cannot add arbitrary
custom native code, so Local LLM and real Nearby Transport are outside this path. If you cannot connect,
check the network prerequisites, and if that does not resolve it, keep this path as `Not run` and return to
Web.

#### 4. Native development build

Read [Native Development Builds](./docs/development/native-builds.md) for platform prerequisites, generated files,
signing, and recovery. iOS / Android devices, Local LLM, and Nearby Transport are currently `Not run` or `Blocked` in
the release matrix.

Read [iOS TestFlight Automated Release](./docs/development/ios-testflight-release.md) for the tag-push-to-TestFlight
pipeline (EAS Build + EAS Submit via GitHub Actions).

Distribution follows the [Pilot Distribution Tiers and Scale Gate](./docs/design/distribution-tiers.md): Tier A
for Web / Expo Go, Tier B for a small number of physical devices, and Tier C for continuous distribution to
non-developers. Do not present Local LLM or Nearby Transport as working in Tier A.

### Reproduce a draft source candidate

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

### Architecture

[Architecture Overview](./docs/architecture/overview.md) provides both a diagram and an equivalent text
description of the dependency direction across Domain, Agent Runtime, Rules / Local LLM, Storage, QR, and
Nearby Transport. The current highlights are:

- The pure TypeScript Domain does not import React Native, Storage, Transport, or model runtimes.
- The App layer calls Ports, and platform adapters implement external capabilities.
- Web and Expo Go use the Rules Provider.
- Local LLM and real Nearby Transport are not supported capabilities on the default branch.
- Lounge-derived data is never persisted; it is discarded at the earliest of leaving, the host ending the
  Lounge, or the 20-minute timeout.

### Canonical documents

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

### Development discipline

Development follows [AGENTS.md](./AGENTS.md), [CLAUDE.md](./CLAUDE.md), the
[Definition of Done](./docs/architecture/quality-bar.md), and the
[Architecture Harness](./docs/architecture/harness.md). An MVP, placeholder, or green CI alone is not complete.
