# Agentic development contract

TenkaCloudPassport participates in the TenkaCloud Symphony fleet as an independent product repository. Symphony creates one isolated workspace per GitHub Issue and must not couple Passport changes to the TenkaCloud platform runtime.

## Completion gate

The machine-readable completion contract is:

```bash
make agent-gate
```

The target delegates to the existing `before-commit` gate. That gate owns the architecture harness, harness tests, source-release coverage, pre-release checks, duplication ratchet, prose and code linting, type checking, application coverage, and web export.

An agent must fix the implementation when the gate fails. It must not weaken architecture invariants, privacy rules, Biome, TypeScript, coverage, release checks, or Expo compatibility to make a change pass.

## Product boundary

Passport remains backend-free for its core profile exchange flow and treats local data as private by default.

- Do not add a central account, persistent participant identifier, location collection, contact upload, or telemetry without an explicit approved design.
- Local language-model output may refine confirmed evidence, but it must not invent shared interests or facts.
- Rules Provider data remains the offline source of truth where the product contract requires it.
- Lounge state must remain ephemeral and be destroyed according to the product lifecycle.
- Native modules must stay behind the Development Build boundary; Expo Go and web paths must retain their documented fallback behavior without silent degradation.

## Autonomous workflow

1. Read the Issue and extract acceptance criteria.
2. Record current behavior before editing.
3. Inspect existing privacy, transport, Rules Provider, and native-module boundaries.
4. Keep the change inside the Issue scope.
5. Add behavior-level tests without replacing real product boundaries with mock APIs.
6. Run `make agent-gate` until it passes.
7. Review the complete diff for privacy leakage, persistence, lifecycle cleanup, unsupported Expo paths, accessibility, and user-visible regressions.
8. Put acceptance criteria, risk, validation evidence, and known device limitations in the pull request.

## High-risk changes

The following require human review and must not be auto-merged:

- privacy, identity, storage, telemetry, transport, cryptography, QR authentication, or Lounge lifecycle;
- native modules, model binaries, signing, release, or store distribution;
- public profile encoding or compatibility contracts;
- `GNUmakefile`, `Makefile`, agent guidance, harness rules, dependency manifests, or lockfiles;
- any change that introduces a backend or persistent shared service.

## Prohibited actions

The autonomous workflow must not publish a release, sign an application, deploy a backend, access production secrets, force-push, or erase user data outside a test fixture. A missing device, signing identity, or external credential is a documented blocker, not a reason to bypass the gate.
