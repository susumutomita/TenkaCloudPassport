# On-device TenkaCloud prototype — next version only

This is the1.5.0 on-device practice candidate, based on the reviewed1.4.0 source
(tree `39b5da8f6e6abf91a5efc7f95668b8ad3e693791`). It implements one existing problem,
not the entire TenkaCloud local-host runtime. The submitted1.4.0 review is not
withdrawn or replaced. Candidate CI and native verification remain required.

## Existing problem, unchanged grading

This embeds TenkaCloudChallenge **forensic-casebook**, revision
`68b9fbe0d49f5f1d01e04cf8b52f284fd3153ee1`: all four cases, fifteen questions,
original generated evidence, exact answer/citation validation, sequential free
hints, no wrong-answer penalty, replay receipts and maximum400 points. It does
not substitute simpler questions. `src/domain/forensic/provenance.json` records
original file hashes and adaptations. Its Apache-2.0 license is retained in
[TenkaCloudChallenge-LICENSE.md](../licenses/TenkaCloudChallenge-LICENSE.md).

The original `game/fixtures.ts` is the real server-side evidence generator and
answer predicates, not a test double. Screens receive only `projectForTeam`
output, never private state, receipts or answer predicates. This is personal
practice on an owner-controlled device, not a remote trusted grader. Scores are
not sent to a competition or claimed as independent skill certification.
The endpoint case remains a data-only simulation; it operates no real OS,
container, credential, target service or network.

## Composition and durable data

Learning → embedded host → original game → SQLite. The app starts no Bun, shell,
listener, Docker or external server. There is no downloaded executable code,
eval, runtime compiler, dynamic plugin loading or WebView. Executable problem
editions are bundled with the app. Existing external InterviewCatalog JSON
discovery/import/storage remains separate and unchanged.

Installed Expo58's compatibility table selects `expo-sqlite~58.0.14` and
`expo-secure-store~58.0.2`. The existing noble SHA-256/HMAC implementation replaces
the original Node hash contract, retaining UTF-8 bytes and hex output. Expo58's
native startup supplies structuredClone. Neither fact substitutes for device QA.
The two new native modules require a fresh native build; this is not a JavaScript-only
update for the already submitted1.4.0 binary.

SQLite stores a pinned-edition snapshot and corruption checksum. The generated
match seed lives only in device-only, when-unlocked Keychain storage, never in
SQLite, logs, browser storage or UI projections. A checksum is not an
anti-tampering signature. Recovery validates the full question map, types,
counters, receipts and score consistency. Missing keys, corrupt data or unknown
editions fail without silently starting over or overwriting progress. Cross-device
seed recovery and practice-backup import are not implemented.

Operations are serialized under the existing data-write/deletion lease. SQLite BEGIN IMMEDIATE is acquired before Keychain seed initialization, including
across overlapping host owners. Original validation, save and COMMIT complete
before the new projection is published. Failed saves retain the operation ID for retry; original
receipts prevent duplicate scores across restart. The screen also permits
reloading durable progress. Original limits remain512 answer characters and four
cited files. Switching questions clears the unsubmitted draft; only committed
progress is durable.

Global deletion includes practice. It closes its one connection, deletes only
its owned database/journal/WAL/SHM files, then removes the Keychain seed. It never
opens a database merely to erase it or inspect an unused feature. Throwing file
inspection distinguishes confirmed absence from permission failure. Open, close,
delete and key failures propagate to the existing deletion recovery journal.
A rejected first open is cleared so Retry can reconnect. Web has no weaker
persistence fallback and does not advertise the native-only feature.

## Compatibility scope at the inspected Challenge revision

| Existing content | Prototype scope and remaining dependency |
|---|---|
| forensic-casebook | Implemented4/15/400. Native SQLite/Keychain/device QA still needed. |
| crypto-battle | Not implemented. Node SHA/HMAC/Buffer, larger state/timers, custom UI, multiplayer rules and device performance require separate port/regression. |
| microservice-migration-battle | Not offline-compatible as-is. Its coordination router is only part of a problem requiring actual deployed services, CloudFormation and live polling/probes. |
| hello-world-battle, security-battle-royale, stackstack | Not supported. Original CloudFormation/live-service and uptime/phased grading are not replaced with quizzes. |
| greeting-expression-lab, memory-slot-lab and Compose challenges | Excluded. Their original entry/grader uses Docker; pure JS fragments do not establish equivalent runtime/grading. |
| pi-siege, session-defense, tenant-boundary-duel | Unverified: the host registry mentions them, but their implementations are absent from the inspected Challenge snapshot. |

LAN hosting is outside this slice: real native transport, authorization, origins,
local-network permissions and lifecycle behavior would need separate validation.
Foreground practice/restart recovery is not a continuously running background
server. No arbitrary Terminal-app runtime compatibility is claimed.

## Verification and limits

`bun test src/app/forensic src/domain/forensic` uses real file-backed Bun SQLite
and controlled native-boundary failures. A separate cold-process test also writes
a real SQLite file, exits, and recovers its score in a new Bun process with a
controlled key port; this is not a physical Keychain claim. `bun run test:offline` renders production
LearningScreen/ForensicScreen against that same host and real SQLite through a
test-only localhost transport. Test keys are synthetic. Browser restart closes
and reopens the real database; it is not an in-memory persistence claim.
`make before-commit` also includes this new rendered target.

Native SQLite, Keychain lock/uninstall/backup behavior, iOS sidecar erasure,
suspension/resume, keyboard/text scaling and iPhone/Duo performance remain
unverified. Use an isolated simulator/development build. Do not overwrite a
user's submitted1.4.0 installation or data to test this prototype.
