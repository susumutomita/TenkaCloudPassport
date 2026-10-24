# Coverage investigation: Bun modernization

This is a diagnostic record, not a passing-gate claim. The remaining-line inventory below matches the reviewed text-contract correction.
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
- Current app run: 1383 tests pass, line summary 99.91%. Current source-release run:
  122 tests pass, line summary 99.15%. Both strict100% coverage gates still fail.
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

Current invariant findings and corrected design boundaries:

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

- Lines 113: Unexpected runtime-error propagation; requires fault injection rather than normal serialized input.

### src/qr/encoder.ts

Gate: `app`. SHA256: `7a168b969dd92e87b776e7564d8f36809570d6c2197af006dfcf4f5d89122566`.

- Lines 198-201, 231, 527-528: Unreachable internal invariant under the current public encoder contract.

### scripts/atomic-output-publisher.ts

Gate: `source-release`. SHA256: `c6d589b9a147e3fb3a654c37534a46f7a2731904383b6605ebbcc5f5748826d9`.

- Lines 113, 117: Retained import-value checks; callable then exports make the old unconditional namespace claim invalid.
- Lines 119-122: ABI boundary rejection is exercised in isolated thenable-module tests; parent-process line coverage remains uncovered. No manual coverage merging is claimed.
- Lines 274-277, 364-367: Filesystem race or native-operation failure path.

### scripts/source-release.ts

Gate: `source-release`. SHA256: `6544336c029a2ba4a770c159e6e12e6b73c85740837b217395a59a12a0764850`.

- Lines 807, 849, 894-895, 978-982, 1007-1012, 1048, 1050-1054, 1092-1095, 1108-1112, 1138-1141, 1150-1154, 1157-1160, 1225-1227, 1317-1318, 1321-1335, 1337-1340, 1356-1371, 1373, 1377-1378, 1382-1383, 1442, 1445, 1481-1483, 2112, 2118-2119, 2155, 2230, 2241, 2257, 2264, 2270, 2273, 2276, 2292, 2515-2518: Reachable validation, rollback or filesystem-failure cases still missing; not claimed unreachable.
