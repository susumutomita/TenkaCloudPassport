# On-device content and Apple Intelligence expansion

Follow-on to PR210, isolated on `feat/passport-practice-expansion`.
The submitted1.4.0 review is unchanged. This work is not released.

## Actual catalog inventory

Pinned TenkaCloudChallenge commit `68b9fbe0d49f5f1d01e04cf8b52f284fd3153ee1` has26 metadata entries:17 Docker/Compose,7 external cloud/service problems, and2 with reusable embedded logic. No problem is supported merely because it lacks Docker.

| Existing problem | Scope / dependency |
|---|---|
| crypto-battle | Original arithmetic units only; full multiplayer/runtime not implemented |
| forensic-casebook | Complete original casebook in PR210 |
| hello-world-battle | External cloud/service deployment and grading |
| microservice-migration-battle | External cloud/service deployment and grading |
| security-battle-royale | External cloud/service deployment and grading |
| stackstack | External cloud/service deployment and grading |
| greeting-expression-lab | Docker/Compose runtime |
| hello-multicloud | External cloud/service deployment and grading |
| hello-world | External cloud/service deployment and grading |
| memory-slot-lab | Docker/Compose runtime |
| sqli-demo | Docker/Compose runtime |
| stackstack-defend | Docker/Compose runtime |
| stackstack-first-request | Docker/Compose runtime |
| stackstack-observability | Docker/Compose runtime |
| stackstack-onboarding | Docker/Compose runtime |
| stackstack-recover | Docker/Compose runtime |
| stackstack-safe-exposure | Docker/Compose runtime |
| stackstack-secrets | Docker/Compose runtime |
| stackstack-ship | Docker/Compose runtime |
| stackstack-vibe-build | Docker/Compose runtime |
| wp-exposed-backup | Docker/Compose runtime |
| wp-harden-leaks | Docker/Compose runtime |
| wp-midnight-admin | Docker/Compose runtime |
| wp2shell-friday-night-patch | External cloud/service deployment and grading |
| wp2shell-local-lab | Docker/Compose runtime |
| xss-demo | Docker/Compose runtime |

The crypto increment reuses the original field, RSA and Shamir source functions,
with original bounds and Apache-2.0 provenance. It is arithmetic practice, not a
replacement for the original Battle's timers, opponents, SSM materials, scores,
hints or completion. Other crypto units and the complete multiplayer game remain
unimplemented. Docker/cloud problems are not converted to substitute quizzes.

## Generation contract

An Expo local Swift module uses Apple's `SystemLanguageModel.default` and a fresh
`LanguageModelSession`. `@Generable`/`@Guide` constrain template and integer
parameters. There are no tools, external providers, learner inputs, downloaded
code, arbitrary prompts or cloud fallback. Only the fixed task description goes
to the on-device model. JavaScript separately validates exactly three own data
fields, bounded integers0–96 and a known template; it creates a fresh immutable
snapshot and rejects accessors, inherited fields, extra output and model answers.

The model selects a verified arithmetic template and fresh bounded numbers.
Canonical bilingual wording, formulas, examples, correct answers and choices are
constructed by the app using the original arithmetic. Free-form AI-authored
questions/explanations are deliberately not accepted as mathematical authority.
The model does not grade, execute code, or create external-target workflows.

Availability is checked at use and on foreground return. Unsupported platform,
missing native build, old OS, ineligible hardware, disabled Apple Intelligence,
model-not-ready and unknown availability stay distinct. Bundled practice can be
added explicitly when generation is unavailable; no fake AI success is shown.
Runtime errors and malformed output leave saved learning data unchanged.

Each generation first reserves an owned request ID and awaits its native acknowledgment before model dispatch. Cancellation removes that reservation, so a reordered late generate RPC cannot start work. A cancellation while reservation acknowledgment is pending is sent immediately after acknowledgment, without dispatching generation. Navigation/background cancels that ID;
JavaScript and Swift each request cancellation at30seconds. Late success/failure
cannot publish a catalog. New native work stays blocked until the prior task
settles; cancellation is cooperative, not a claim of forced model termination.
Cancellation transport failure remains observable until task settlement.

Generated and bundled catalogs enter the existing confirmation, validation,
LearningSession commit-before-publish, progress/history, backup and deletion
paths. No new storage engine or stronger certification claim is introduced.
Generated arithmetic catalogs are identified and retained offline. Existing
20-catalog limit applies; duplicate equivalent drafts do not erase progress.

## Validation boundaries

Unit tests use original arithmetic plus independent modular exponentiation and
linear reconstruction expectations, malformed output and cancellation faults.
Browser tests inject a clearly synthetic model boundary and exercise production
screens, confirmation, save failure/retry, persistence and navigation. Browser
storage is synthetic test data; it proves neither iOS Keychain nor model inference.

Native QA on 2026-10-27 used an isolated Xcode27.1 local ad-hoc Simulator
build of commit58ce9bcaee0ce66b117f901a01b2efb932c14de3, version1.5.0
(local build1). Executable and JavaScript hashes, installed-app bindings,
unchanged test-runner bindings, logs and active-display screenshots are retained
in the private PR211 native QA archive. PR210 evidence is not used to establish
this module's behavior.

The Xcode build verified native compilation. The iOS27.0 phone Simulator
verified availability and real Foundation Models generation, independent grading,
confirmation, durable saving and cold restart. A generated Shamir exercise with
points(1,23),(2,4) was independently checked as42. Generation observed running
before navigation or OS-confirmed backgrounding was cancelled without publishing
a pending catalog. Removing only the newly created QA catalogs survived restart.
Normal and maximum text exposed the phone's full multiline answer and final line;
The iOS27.1 Duo retained the same draft and software keyboard across actual466→951→466pt
outer/inner transitions. The corrective keyboard implementation also addresses
multiline growth after the predictive bar appears. Historical startup timeouts
and the earlier screenshot-confirmed clipping failure remain recorded, rather
than being counted as successes.

These are Simulator results, not physical-device or distribution verification.
Model availability varies with supported hardware, OS, enabled Apple Intelligence
and model readiness; unit/browser faults cover unavailable/error boundaries and
are not real-model successes. Production signing, Apple processing and Store
review require separate artifact-bound confirmation.

## Official references

- [Apple Foundation Models](https://developer.apple.com/documentation/foundationmodels)
- [Guided generation](https://developer.apple.com/documentation/foundationmodels/generating-swift-data-structures-with-guided-generation)
- [Availability and sessions](https://developer.apple.com/documentation/foundationmodels/generating-content-and-performing-tasks-with-foundation-models)
- [Expo native modules](https://docs.expo.dev/modules/overview/)
