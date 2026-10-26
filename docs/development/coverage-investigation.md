# Coverage investigation: Bun modernization

This is a diagnostic record, not a passing-gate claim. The remaining-line inventory below records the reviewed text-contract correction; the final QR section supersedes its historical QR entries.
No thresholds or instrumentation rules changed. The 100% thresholds and
all integrity guards remain unchanged. No coverage-ignore directives or relevant
file exclusions were added.

## Reproduced outcomes

- Original HEAD `5040fd217f231a24d961e014a0489b9f5caa17b4`: 1302 tests pass under
  both Bun 1.3.11 and 1.4.4; reported app line coverage is respectively 100% and
  98.21%. This isolates the reporting change from the responsive implementation.
- Added tests execute real public boundary cases: storage read/write/delete
  failures, unchanged saved bytes on rejected writes, interrupted deletion,
  legacy draft inspection, self-assessment progression, plain catalog import,
  share-field privacy, input validation and deadline transitions.
- Source-release additions reject malformed tracked package/license/inventory
  metadata, inconsistent Git output and unsafe descriptor/cleanup operations.
  Failed candidates never appear at the requested output path; unknown bytes
  survive failed cleanup.
- Current app run after the reviewed corrections: 1423 tests pass, line summary 99.96%. Current source-release run:
  130 tests pass, line summary 99.44%. Both strict100% coverage gates still fail.
- The complete missing-line lists below come from the same runs' LCOV reports.
  Bun's displayed aggregate is not the weighted sum of LCOV lines; neither
  calculation reaches 100% here.

Additional public scenarios now assert repeated handshake rejection, endpoint
membership requirements, cleanup exceptions, late events after departure or
destruction, malformed IDs, stale membership revisions, retired identity reintroduction,
and malformed SPDX relationships/checksums/manifests.
These tests use existing public APIs; production guards and internal visibility
are unchanged.

Release preparation added real cases for stale reconnect generations,
post-settlement reconnect, unaffected outcomes after participant departure,
noncanonical manifest timestamps and unknown release-file fields. Group Lounge
session now reports 100% lines. One combined script run observed the existing
in-place mutation race test complete verification before the competitor's write;
an isolated source-release rerun passed all 85 assertions. The fixture now uses deterministic post-hash mutation; no product defect was
proved by the earlier scheduling-dependent result.

## Decisive compatibility limit

There is no reproduced Bun execution defect. Some remaining paths are genuine
missing tests and remain listed as work. Independently of those gaps, the current
100%-of-all-instrumented-lines contract also counts retained internal invariant
branches that no normal public input can reach. More public-input tests alone
cannot make the gate pass while those branches and that contract both remain.

Historical invariant findings and corrected design boundaries (QR items 1–3 are superseded by the reviewed correction below):

1. `src/qr/encoder.ts:198-201`: `rsBlocks` is called with versions 1–26 from
   `chooseVersion` or a version returned by that function. The private static
   `RS_BLOCKS_L` table has all 26 entries. A missing table entry requires an
   internal code/table defect, not a public payload.
2. `src/qr/encoder.ts:231`: `encodeQr` rejects byte lengths above 1367 before
   `chooseVersion`. At version 26, required bits are at most
   `4 + 16 + 8*1367 = 10956`, below the table's 10960-bit capacity. Every accepted
   length therefore returns from the loop; exhaustion cannot occur.
3. `src/qr/encoder.ts:527-528`: masks originate only from `bestMatrix`'s loop
   `0 <= mask < 8`, or its selected member of that same range. No public caller
   supplies a mask, so the default guard cannot execute normally.
4. The earlier claim that every successful dynamic import resolves to a namespace
   object was too broad. An exported callable `then` can affect promise resolution.
   See [MDN's import reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import#module_namespace_object).
   Keep the import/object and export-function ABI checks. They are not justified
   candidates for removal based on the earlier claim.
5. The private writer's actual producers all supply strings. Its contract is now
   narrowed to text, while command/binary streaming remains separate. Requested
   UTF-8 bytes are fingerprinted before process execution so mutable stdin cannot
   weaken the original-content hash/length guard. Descriptor, record, publication
   and rollback checks remain. This is a reviewed contract correction, not an
   exclusion or a coverage-policy change.

Strict requirement recorded on 2026-10-24: coverage exceptions are rejected.
The 100% threshold remains. No exception list, exclusions, blanket waiver,
instrumentation trick or removal of useful guards is authorized. Remaining
reachable failures need meaningful tests. A substantively justified QR invariant
redesign must be reviewed separately before any implementation.

Privacy lifecycle sanity guards now have negative harness tests using legitimate
no-signal and declining-answer outcomes, plus restored successful controls.
Verifier mutation tests now mutate real files immediately after the real hash
operation, before final validation; they no longer depend on atime polling.
They test post-hash mutation, not mutation during the hash read itself.

Bun 1.4.4 documents changes to line coverage for default/case labels and other
source positions in its [official release notes](https://bun.com/blog/bun-v1.4.4).
That supports a reporting change; it does not establish a runtime bug.

## Minimal standalone contract reproduction

The transfer archive includes `coverage-repro/encoder.ts`, `encoder.test.ts`,
`bunfig.toml` and both run logs. Run it in its own directory:

```sh
/path/to/bun test --coverage
```

Every accepted input of a two-value encoder and invalid numeric classes is
asserted. Its retained table-exhaustion guard is mathematically unreachable.
Both runtimes pass all assertions and fail the unchanged 100% threshold; 1.3.11
reports 77.78%, 1.4.4 reports 85.71%. This is a minimal reproduction of the contract
limitation, **not** a claim of a Bun execution bug. It is intentionally outside
normal project test discovery.

## Exact remaining locations

The classification names the required test/fault boundary. It does not claim
that the remaining reachable cases have been implemented or are impossible.
Source SHA256 values identify the inspected file bytes.

### src/adapters/loopback-nearby-transport.ts

Gate: `app`. SHA256: `3ebcb933ebd84e387bdb9e4e114c3a9113d76c9320be5962089fd8b426778783`.

- Lines 234, 280, 283-284, 289-291, 325, 350, 365, 375, 403, 460, 477-478, 481-483, 538, 579, 635, 662, 665, 707, 769-770, 772, 778-779, 781, 797, 860, 887, 909, 927, 933, 941, 954, 993, 1000, 1015, 1041-1042, 1083-1084, 1087-1088, 1103, 1165, 1191-1192, 1266-1267, 1301, 1328: Reachable protocol state, callback failure or cancellation cases still missing; not claimed unreachable.

### src/app/agent-provider-session.ts

Gate: `app`. SHA256: `c869c03e9a6374e1a895613c6db84fb6b57f9f7cb02ef21f0022bd1247552588`.

- Lines 177: Reachable protocol state, callback failure or cancellation cases still missing; not claimed unreachable.

### src/domain/intro-card.ts

Gate: `app`. SHA256: `79e19969a2eb25120adca546aad2a4dcf76ad953769ceb14afb084b629f6ade9`.

- Lines 457, 530: Unexpected runtime-error propagation; requires fault injection rather than normal serialized input.

### src/protocol/lounge-handshake.ts

Gate: `app`. SHA256: `d092f98a6a946811106add658ce785544ded5103549e6dbfd81afcefd4358633`.

- Lines 317: Unexpected runtime-error propagation; requires fault injection rather than normal serialized input.

### src/protocol/peer-protocol-session.ts

Gate: `app`. SHA256: `b4322e247fef64b2d305a18d4d49f256916e7598e35d66e1b7339f27b1a1834e`.

- Lines 537: Unexpected runtime-error propagation; requires fault injection rather than normal serialized input.

### src/protocol/qr-payload.ts

Gate: `app`. SHA256: `101aac9fb8f51f1c6fe4f42f3a1a1a503f4192dc970a85a378b3880ff664a4e4`.

- Historical line 113: now covered by a decoded-object inspection fault through the JSON boundary, with restored malformed and valid controls. Current QR payload line coverage is 100%.

### src/qr/encoder.ts

Gate: `app`. SHA256: `7a168b969dd92e87b776e7564d8f36809570d6c2197af006dfcf4f5d89122566`.

- Historical lines 198-201, 231, 527-528: superseded by the reviewed finite-domain correction below. Current encoder line coverage is 100% (505/505 LCOV lines).

### scripts/atomic-output-publisher.ts

Gate: `source-release`. SHA256: `c6d589b9a147e3fb3a654c37534a46f7a2731904383b6605ebbcc5f5748826d9`.

- Lines 113, 117: Retained import-value checks; callable then exports make the old unconditional namespace claim invalid.
- Lines 119-122: ABI boundary rejection is exercised in isolated thenable-module tests; parent-process line coverage remains uncovered. No manual coverage merging is claimed.
- Lines 274-277, 364-367: Filesystem race or native-operation failure path.

### scripts/source-release.ts

Gate: `source-release`. SHA256: `6544336c029a2ba4a770c159e6e12e6b73c85740837b217395a59a12a0764850`.

- Lines 807, 849, 894-895, 978-982, 1007-1012, 1048, 1050-1054, 1092-1095, 1108-1112, 1138-1141, 1150-1154, 1157-1160, 1225-1227, 1317-1318, 1321-1335, 1337-1340, 1356-1371, 1373, 1377-1378, 1382-1383, 1442, 1445, 1481-1483, 2112, 2118-2119, 2155, 2230, 2241, 2257, 2264, 2270, 2273, 2276, 2292, 2515-2518: Reachable validation, rollback or filesystem-failure cases still missing; not claimed unreachable.

## Reviewed QR closed-domain correction

Base: `a294e23460e620a84d517eb732d691a05a0b7edf`.

Private versions and masks previously accepted unrestricted numbers, although
only versions 1–26 and masks 0–7 can be produced. The correction models those
closed domains with private literal unions and complete keyed tables. Missing
alignment rows previously silently fell back to an empty list; incomplete
alignment or Reed–Solomon tables and an incomplete typed mask switch now fail type checking. No public caller
can supply a version or mask. No cast admits arbitrary numbers into those types.
The public interfaces and exported literal byte limit remain unchanged.

Version 26 has `10 * 114 + 2 * 115 = 1370` data codewords, or 10960 bits.
Subtracting the four mode bits and sixteen count bits leaves 10940 bits:
`floor(10940 / 8) = 1367` bytes. The independent capacity fixtures cover every
version. The UTF-16 length guard still rejects oversized strings before UTF-8
allocation. After encoding, version selection is the single byte-capacity
admission point; oversized UTF-8 throws the same typed error before codeword
or matrix construction. The public limit keeps its original literal type.

The eight mask formulas are unchanged. Iteration remains ascending, and strict
`<` penalty comparison preserves the first mask on ties. Padding, RS arithmetic,
BCH, placement, scoring and matrix dimensions are unchanged.

Before application, an isolated baseline comparison checked complete public
outputs and error name/code/message for 321 strings: capacity minus one, exact
capacity and plus one at all 26 versions, repeated and varied ASCII, three-byte
Unicode and emoji, plus empty strings, lone surrogates, HELLO WORLD, a dense URL
and oversized input. Eight untyped runtime probes also matched; those probes
do not expand the supported string API. All cases matched exactly.

Twenty-six checked-in SHA256 goldens capture the baseline output, including
mask choice, at every version's maximum ASCII capacity. Existing independent
HELLO WORLD matrix and jsQR decoding tests remain. Version 23 retains its
existing documented jsQR limitation; it is covered by baseline equivalence,
not claimed as an independent decoder success. Additional multibyte cases test
1367-byte acceptance and adjacent rejection.

Isolated compiler checks accepted the complete implementation and rejected
missing alignment or RS entries, a missing mask-switch case, and invalid version 27 or mask 8.
Independent review found no material boundary protection weakening. Malformed
external wire input is still rejected by the unchanged protocol parser.

This app-source change invalidates the previous native source binding. Affected
native checks must be renewed before release. Strict 100% gates remain and
other remaining coverage gaps are not waived.

Final local app verification: 1411 tests pass; both encoder and QR payload files
report 100% lines. The app aggregate remains 99.93%, so the strict gate fails.
The remaining LCOV app gaps are:

- `src/adapters/loopback-nearby-transport.ts`: 234, 280, 283, 284, 289, 290, 291, 325, 350, 365, 375, 403, 460, 477, 478, 481, 482, 483, 538, 579, 635, 662, 665, 707, 769, 770, 772, 778, 779, 781, 797, 860, 887, 909, 927, 933, 941, 954, 993, 1000, 1015, 1041, 1042, 1083, 1084, 1087, 1088, 1103, 1165, 1191, 1192, 1266, 1267, 1301, 1328.
- `src/app/agent-provider-session.ts`: 177.
- `src/domain/intro-card.ts`: 457, 530.
- `src/protocol/lounge-handshake.ts`: 317.
- `src/protocol/peer-protocol-session.ts`: 537.

A bounded local benchmark found the initial mask-function table slower than
the original switch. The final implementation retains an exhaustive typed
switch with the original eight formulas. Independent review and negative
compiler checks confirm that omitting a case is rejected. Complete output
equivalence was rerun successfully for this final switch revision.

## Filesystem identity failure: reproduced and corrected

The four Linux failures were actual guard failures, not dismissed as generic
environment noise. Two expected a valid app version/CLI success but received
`ANDROID_CONFIG_CHANGED`/exit 1. Two expected wrong-hash or replacement-ref
rejection but instead failed earlier with `INVALID_ANDROID_TOOL_PATH`.

On the saved filesystem, Python and `stat` report app inode
`9223372036855939972` and Git inode `9223372036855113675`. Both Node 24 and
Bun 1.4.4 report the same 64-bit patterns as signed BigInts:
`-9223372036853611644` and `-9223372036854437941`. Adding `2^64` recovers the
unsigned values exactly. The unchanged positive-inode checks rejected them.

Baseline `5040fd2` has identical affected guard code. Its materialized checkout
reproduced both Git failures (44/46 tests passed). Its newly written app file had
a low inode and passed; invoking the baseline reader on the exact saved app
path reproduced `ANDROID_CONFIG_CHANGED`. Current pre-fix tests reproduced
all four failures (42/46 passed). This distinguishes code from file allocation.

The reviewed correction canonicalizes valid signed-64 representations to unsigned
inodes after checking bounds. Zero and out-of-range values are rejected before
conversion; overflow cannot alias inode 1. Device equality, descriptor identity,
canonical paths, executable permission, timestamps, size, hashes and symlink
protections remain. Publisher and external record contracts are unchanged.
Portable tests compare signed/unsigned snapshots and exercise lstat/descriptor
representations, then reject a distinct inode. Existing replacement, deletion,
symlink, content-mutation and wrong-tool-hash tests remain. All 56 targeted
Android tests passed after correction.

## Additional reachable fault cases and invariant limit

New tests exercise real truncation during descriptor reads/hashes, staging
creation/open failures, writer-record read/hash failures, mutable caller version
changes, disposed/idle endpoint operations, issuer failures, replacement cleanup,
capacity mismatch and unexpected text-normalization failures. Boundary mocks
are restored and valid retry controls run. No production fallback was added.

Independent review found public counterexamples to two earlier hypotheses.
A queued send followed synchronously by network change reaches the nonconnected
drain guard; both host and guest cases now require rejection without delivery.
Changing caller-owned options.version across a real Git await reaches the
missing-writer-record guard; a test requires rejection without mixed publication
and verifies a restored successful retry. Neither guard is classified unreachable.

Two narrower retained defenses have no supported public path identified:

- `recordCreatedFile` rejects a mismatching or duplicate writer filename. The
  parser has already checked the requested name and returns a new plain record;
  the private write sequence uses distinct names and exposes neither its Map nor
  the recorder. Ordinary filesystem/process faults cannot forge that private
  parsed record or duplicate the call sequence.
- The disposed branch in the synchronous transport drain follows queue shift
  without an await or callback. Public disposal rejects and empties the queue
  synchronously before marking disposed. A previously queued microtask therefore
  sees an empty queue. The reachable reconnect case is separately tested.

These are narrow control-flow findings, not exceptions or a proof that every
other missing branch is unreachable. Strict 100% still fails. Reaching these
branches would require corrupting private state, replacing unrelated standard
operations solely to force impossible states, or changing the implementation.
No such metric-only test, exclusion, threshold change or guard deletion is made.
A separately reviewed transaction/state invariant design would be needed before
changing retained defenses; a coverage waiver is explicitly prohibited.

## Latest strict-gate inventory after fault regressions

App: 1423 tests pass, 99.96% lines. Source-release: 130 tests pass, 99.44%
lines. Both strict gates still fail. This inventory supersedes earlier missing
line inventories; it does not classify all remaining cases as unreachable.

### app current missing lines

- `src/adapters/loopback-nearby-transport.ts` (SHA256 `3ebcb933ebd84e387bdb9e4e114c3a9113d76c9320be5962089fd8b426778783`): 280, 283, 284, 289, 290, 291, 325, 350, 365, 375, 403, 538, 635, 662, 665, 707, 769, 770, 772, 778, 779, 781, 797, 860, 887, 909, 1015, 1083, 1084, 1103, 1165, 1191, 1192, 1266, 1267, 1301, 1328.
- `src/app/agent-provider-session.ts` (SHA256 `c869c03e9a6374e1a895613c6db84fb6b57f9f7cb02ef21f0022bd1247552588`): 177.
- `src/protocol/lounge-handshake.ts` (SHA256 `d092f98a6a946811106add658ce785544ded5103549e6dbfd81afcefd4358633`): 317.
- `src/protocol/peer-protocol-session.ts` (SHA256 `b4322e247fef64b2d305a18d4d49f256916e7598e35d66e1b7339f27b1a1834e`): 537.

### release current missing lines

- `scripts/atomic-output-publisher.ts` (SHA256 `c6d589b9a147e3fb3a654c37534a46f7a2731904383b6605ebbcc5f5748826d9`): 113, 117, 119, 120, 121, 122.
- `scripts/source-release.ts` (SHA256 `6544336c029a2ba4a770c159e6e12e6b73c85740837b217395a59a12a0764850`): 807, 849, 894, 895, 978, 979, 980, 981, 982, 1048, 1050, 1051, 1052, 1053, 1054, 1092, 1093, 1094, 1095, 1108, 1109, 1110, 1111, 1112, 1225, 1226, 1227, 1317, 1318, 1321, 1322, 1323, 1324, 1325, 1326, 1327, 1328, 1329, 1330, 1331, 1332, 1333, 1334, 1335, 1337, 1338, 1339, 1340, 1356, 1357, 1358, 1359, 1360, 1361, 1362, 1363, 1364, 1365, 1366, 1367, 1368, 1369, 1370, 1371, 1373, 1377, 1378, 1382, 1383, 1442, 1445, 1481, 1482, 1483, 2112, 2118, 2119, 2155, 2230, 2241, 2257, 2264, 2270, 2273, 2276, 2292, 2515, 2516, 2517, 2518.

Final `make -k before-commit` on this correction/test slice: 502 script tests,
1423 app tests and 17 browser scenarios pass. Architecture/pre-release, lint,
three typechecks, textlint, duplication and web export pass. Only the unchanged
coverage gates fail (99.96% app; 99.44% source-release). No native validation
was reused or rerun for the changed QR source.

## Ownership and isolated ABI contract correction

The current ownership component retains both mismatch and duplicate admission
guards. It privately owns copied, frozen records and returns immutable snapshots,
so verification and cleanup cannot lose ownership through mutable aliases. The
shared error module is re-exported from the original entry point; constructor
identity, error codes and messages remain. Contract tests use an actual exclusive
writer record, reject mismatching/duplicate admissions without changing it,
mutate the input/returned aliases, and validate retained descriptor identities.
The earlier private-recorder coverage finding is historical, not guard removal.

Bun 1.4.4 supports fresh globals and module registries with
[`--isolate`](https://bun.com/docs/test/parallel).
[`mock.restore()` does not reset module mocks](https://bun.com/docs/test/mocks).
Canonical package/test/watch/script runners therefore isolate discovered module
mocks. The release coverage gate includes the ABI fault file and the original
release suite; actual loader guards execute and Bun combines their coverage.
The ABI file runs first so subsequent real publication tests verify isolation.
No files or assertions are omitted, no manual coverage is merged, and threshold
1 remains unchanged. Application-only coverage retains its existing source scope.

The package script change also changes its source fingerprint. Static screening
now binds the exact package.json SHA256
`994ac4f006f961de0898db256ac1e6908c5de93708a0dc716e7a4de51035a6bb`;
its dependency versions, lockfile fingerprint, checks and physical-test statuses
are unchanged. The 15 screening tests pass after that exact binding update.

Additional reconnect tests cover terminal guests retained after readiness failure
and authorization rotation during pending reconnect readiness. They require
rejection/no stale delivery, then explicit cleanup and a working fresh connection.
These disprove two earlier lifecycle hypotheses; no blanket unreachable claim
is made. Remaining lifecycle guards need individual control-flow/design review.

A shared generation/verification metadata-binding policy exists only as a
separate scratch proposal. It retains runtime checks but rejects inconsistent
generated metadata before manifest/checksum writes, changing quarantine contents
from six files to four. That observable change is awaiting an explicit decision;
it has not been applied to this source tree.

## Final reviewed ownership/isolation slice

The complete aggregate passes 525 script tests, 153 release tests, 1448 app tests
and 17 browser scenarios. Architecture/pre-release, duplication, textlint, lint,
three typechecks and web export pass. Only the unchanged 100% gates fail:
release 99.98%, app 99.99%. The race fixture orders actual path resolution after
actual replacement and retains its exact error assertion; 12 repeated cases
and the full aggregate pass. No coverage exclusions, ignore directives or
threshold changes were made.

The native ABI loader, ownership component, error module and provider session
now report 100% lines. Remaining release lines are `source-release.ts`
2207, 2223, 2230, 2236, 2239 and 2242: fallbacks after the full schema validators.
The unapplied shared-binding proposal passes 164 tests with strict release
coverage 100%, typechecks and lint. Its semantic decision remains the earlier
rejection/quarantine/error-ordering change; those results are not this tree's
release-gate result.

All remaining app gaps are in the loopback reference adapter:

- 289–291: fallback after valid host, guest, pending, idle and terminal branches.
- 365 and 403: preparation checks established earlier without a callback between.
- 707 and 797: retained reconnect identity and reserved-capacity correlations.
- 769–772: inactive-host handling after generation checks; shutdown invalidates
  member/pending generations before invoking callbacks.
- 1083–1084 and 1103: disposed delivery and route context; disposal empties the
  queue and drain checks connection state immediately before routing.
- 1191–1192: missing guest membership during removal; Map/record/role are cleared
  before callbacks can reenter removal.

Independent control-flow review found no supported public counterexamples for
these specific paths. Runtime defenses remain. A further substantive model would
need to own pending deliveries and host memberships/reservations/auth revisions,
including retained terminal members after failed reconnect. Merely exporting
private helpers or removing checks to make these lines disappear is prohibited.
No such model change has been applied.

## Resumed queue ownership verification (2026-10-25)

The independently reviewed pending-delivery component is now integrated locally.
It owns immutable envelope snapshots, bounded admission and once-only settlement;
the adapter retains scheduling, live host-session state and recipient guards.
Accessor snapshot and reentrant admission regressions accompany the component.
The terminal-guest contract now asserts that no event is emitted, rather than
testing only the absence of a reconnecting event in an empty event list.

The complete aggregate runs 1469 app tests, 153 release tests and 17 rendered
browser scenarios successfully, but the unchanged coverage gates still fail at
99.99% and 99.98%. Script tests report 524 passes and one 5000ms icon-generation
timeout; the same ten icon tests pass in an isolated rerun with unchanged timeout.
This rerun does not convert the failed aggregate into a success. Architecture,
pre-release checks, duplication, textlint, lint, typechecks and web export pass.

The current queue slice has not received native validation. No earlier native
result certifies it. Metadata's earlier-rejection proposal remains unapplied:
its four-versus-six quarantined files and combined-fault precedence need an
explicit decision. All required gates must pass before merging PR #208.

Independent review identifies the remaining state-model boundary as a membership
ledger owning reservations, identities and capacity, separate reconnect-attempt
tokens owning generation/authorization revision, and one endpoint affiliation
value replacing independently mutable role/record/identity links. The model must
retain terminal membership after failed reconnect, admitted deliveries through
invite refresh, generation-first shutdown and departure callback identity/order.
A Map wrapper alone does not establish those correlations. This design has not
been implemented; no stale-operation errors, automatic detach or callback ordering
changes have been selected. The two top-level metadata-reference fallbacks remain
distinct from mutable decoded-field faults, which have tests without code changes.

The subsequent aggregate includes four decoded-field regression tests. It reports
529 script passes, 157 release passes and 1469 app passes, with both unchanged
line-coverage gates at 99.99%. The icon timeout did not reproduce in that aggregate.
Release gaps are now only the stable top-level object-reference fallbacks at
`source-release.ts` lines 2207 and 2230. App gaps are adapter lines 283–285, 359,
397, 701, 763–764, 766, 791 and 1177–1178; pending-delivery ownership has 100%
coverage. These results do not establish 100% or authorize a merge.

## Stable metadata-root contract correction

Both schema validators now express their existing non-null, non-array object-root
guarantee as a TypeScript assertion. Their runtime validation bodies are unchanged.
After successful validation, the verifier reads fields from those established
roots directly, while all nested mutable-field checks and cross-file integrity
guards remain. The assertion deliberately makes no claim about nested types or
immutability. Unknown-root compile checks, primitive rejection cases and the
four changing-field regressions verify that distinction.

The strict release gate passes 158 tests at 100% with the same threshold and no
exclusions. No generation-stage call was added: six-file quarantine, existing
domain errors and validation/write ordering remain. The independent reviewer
approved this correction. A replaced decoder returning an exotic revoked Proxy
can still produce a native TypeError at a different operation, with different
native wording; standard JSON bytes cannot construct that case, and it remains
fail-closed. No native-error wording equivalence is claimed for a replaced parser.

GitHub writes remain paused. The authorized retry of create_blob for
`docs/development/coverage-investigation.md` in susumutomita/TenkaCloudPassport
returned `aborted before dispatch`, without an approval prompt or reason. This
does not establish a new authorization requirement: the October 25 authorization
already covers this PR publication. No dispatch or ref update occurred. A separate
read of main branch protection returned integration error 403; it was not retried
through another surface. Neither failure is being bypassed.

## Integrated membership and lifecycle ownership

HostMembership owns private admission/member indices, capacity and immutable
reservation/identity copies. EndpointLifecycle owns phase, generation and one
atomic affiliation value; departing identity remains available through callbacks
after the affiliation is detached. Join checks compare the attempt's captured
generation and authorization identity with current lifetime/session state, while
membership remains stable across invite refresh. Terminal reconnect failures keep
their membership and capacity until explicit removal.

The existing stale/foreign admission, phase, inactive-session and removal guards
now execute within these owners. Tests exercise real ownership operations,
immutable aliases, ended sessions, stale observations, terminal retention,
departure reentrancy and generation/error precedence. No guard is excluded or
replaced by a mock fallback. The network retains event dispatch, delivery and
generation-first shutdown ordering.

Independent review caught a missing recovery state notification in the first
prototype despite its 100% report. The correction announces the committed phase
before rereading affiliation for host refresh, preserving reentrant detach and
disposal behavior. Removing that announcement makes the new regression fail;
the restored implementation passes. Independent final comparison of the unchanged
059666f network and this proposal passes 110 shared-contract cases with matching
reviewed production hashes and no blocking review findings.

The combined candidate passes 1485 app tests with strict function/line coverage
100%, all three typechecks and targeted lint. The previously corrected release
gate remains 158 tests at 100%; the integrated aggregate is recorded separately
when complete. Native evidence is still required for the exact final tree.
