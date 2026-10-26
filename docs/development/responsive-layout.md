# Responsive layout verification

The current app uses Expo SDK 58.0.19, React Native 0.88.0 and React 19.3.0,
matching the [Expo SDK compatibility table](https://docs.expo.dev/versions/v58.0.0/)
and SDK 58's bundled native package versions. SDK 58 adopts the scene lifecycle
and scene-aware geometry needed for iOS 27 and Duo. See the
[SDK 58 release notes](https://expo.dev/changelog/sdk-58) and
[Apple's resizing guidance](https://developer.apple.com/iphone-duo/prepare/).

React stays at Expo's supported 19.3.0 rather than independently moving to
19.3.1. TypeScript stays at 6.0.3: the repository's JSONC duplicate-key validator
uses its compiler API, which TypeScript 7 no longer exports. These are deliberate
compatibility constraints, not prerelease substitutions. Other direct tools and
non-SDK packages were updated to stable versions available on 2026-10-23.
The historical Store inspection adapter retains EAS CLI 21.0.2 because it
validates that exact private metadata API. App builds use CLI 25.3.0 separately;
updating a build SDK must not break the guarded historical inspection route.
Biome's new Markdown/YAML formatting is left disabled to preserve the previous
lint scope and avoid rewriting historical evidence and repository instructions.
JavaScript, TypeScript, JSON and existing HTML checks remain enabled.

The app allows rotation and measures available layout space rather than identifying
devices. Safe-area-context handles changing horizontal and vertical insets. The
content and footer share a readable column; short windows and large text put the
footer in the scrollable content. QR sizing measures its own parent and aligns
modules to the physical pixel grid. This changes presentation without changing
card payloads, storage schemas, learning progress, or external catalog sources.
The camera's control panel also scrolls within a bounded portion of the window,
so large text cannot push its cancel action off-screen or consume the preview.

## Browser regression checks

```sh
bun install --frozen-lockfile --ignore-scripts
bun x playwright install chromium
bun run test:responsive
```

For an existing Chromium installation, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium`.
`make before-commit` includes these checks. They render production React Native
Web components with synthetic test data and exercise 240–1366px widths, dense
QR screenshot decoding, window transitions, persistent focused input, safe-area
insets, learning tabs, 200% browser text and short viewport heights. The editor
and learning screens are actual screen components. Fixtures remain test-only.

These checks are browser evidence. A short viewport is not evidence of a native
software keyboard, and 200% browser text is not native Dynamic Type.

## Native checks

The `ios-compatibility` workflow builds current source unsigned using Xcode 27.1
and runs `tests/ios-responsive` on fresh test-only phone, Duo and tablet simulators.
The Duo-only iOS 27.1 runtime is used for Duo; the other models use iOS 27.0.
It records native orientation, editor/keyboard screenshots and saved-card checks
at normal and accessibility text sizes. It requires the matching Xcode, simulator
runtime and devices on its runner, and fails if they are missing. The historical
`store-screenshots` workflow intentionally remains frozen to the approved 1.3.0 UI
and must not be used to claim validation of this change.

EAS iOS profiles select `macos-tahoe-26.6-xcode-27.1`. Apple lists Xcode 27.1 build
27A9275 as released on October 15 in its
[release catalog](https://developer.apple.com/news/releases/). Expo's infrastructure
page still labels that same build RC; inspect the actual build log before release.
No EAS build or workflow has been dispatched as part of this local change.

Before release, use Xcode 27.1 Device Hub or a physical Duo to fold and unfold
while editing, showing QR, studying, importing catalogs and using Settings.
Check both displays, split view, rotation, horizontal safe areas, large text,
keyboard visibility, scroll position and persisted state. The automated native
runner rotates devices; it does not automate hinge poses. Neither the native
workflow nor physical-device checks can be executed on the Linux workspace.

## Aggregate check limits found during modernization

Bun 1.4.4 reports different line coverage for the unchanged original source.
After adding public boundary and failure tests, 1383 application tests pass with
99.91% line coverage, and 122 source-release tests pass with 99.15%. Both unchanged
100% gates still fail. The [coverage investigation](./coverage-investigation.md)
records exact missing locations, reachable missing cases, proved internal
invariants and a standalone reproduction. No Bun execution bug was reproduced.

Four release integrity tests fail in the saved Linux filesystem because Node and
Bun report negative inode values for inherited files such as `app.json` and
`/usr/bin/git`; the existing guards require positive identities. The connected Mac independently passed these tests on the previous transferred
snapshot. The guards remain unchanged; the newest snapshot still needs its own
Mac check.
An image-generation test exceeded its 5-second deadline during an aggregate run;
the separate ten-test icon suite passed without changing its timeout. The
brand-mark suite rerun still timed out on that case (13 pass, 1 timeout); no
assertion failure was reported. The Mac passed the prior snapshot's script suite.

## Reconciled Mac verification evidence (2026-10-24)

Historical SDK 58.0.17 evidence: the parent Mac task reported ten passing simulator scenarios: SE, Pro Max, iPad,
Duo outer and Duo inner, each at normal and maximum text size. Official fold
controls were also exercised while opening Duo with the name and keyboard
retained. These are reported native simulator results, not Linux execution.
Physical hardware and all Duo rotations remain explicitly unverified. The
repository runner does not automate hinge poses or the complete reported matrix.

The three-file verification-only patch was retrieved as UTF-8 text from Library
`libfile_0337cade32508191a5be178a057ee8b5`, 7650 bytes, SHA256
`70889629c2ff767219324c454d7ed306481258f34a417337a020d2644773d483`.
Its hunks checked and applied cleanly against the preserved source at base
`5040fd217f231a24d961e014a0489b9f5caa17b4`. Product code, assertions, thresholds
and exclusions were not weakened. The harness uses the window frame, bounds
scrolling to avoid overshoot, waits for stable geometry, captures every screen,
and exercises the visible keyboard submit action.

The larger native archive could not be downloaded after two supported transfer
attempts. Its parent-supplied SHA256 is not independently verified here; the
standalone patch's exact byte checksum is verified. Source tests and script
syntax can run on Linux; Swift/XCTest compilation and native execution cannot.
This evidence records validation limits, not release approval.

Release CI on 2026-10-24 required the SDK 58 patch set Expo 58.0.19,
expo-dev-client 58.0.15 and expo-file-system 58.0.11. Package metadata, frozen
lockfile, direct-license notices and static-screening hash bindings were updated
without altering the gates. Earlier reported Mac native results used 58.0.17;
the signed release candidate needs native validation on this patch set.

Updated SDK 58.0.19 evidence: the parent Mac task reports the unsigned build and
8/10 scenarios passing (SE, Pro Max, iPad and Duo outer at normal/max text).
Duo inner normal/max and fold retention on the updated modules remain pending:
the Mac is locked and supported CUA needs manual unlock. This is not a permanent
tool absence. Earlier ten-scenario results do not establish current full coverage.
Hardware and all Duo rotations remain explicitly unverified.

## Final-candidate native handoff requirements

The current Linux workspace has no Xcode or simulator runtime. A final native
handoff must carry the exact local commit, its base commit, a checked patch and
SHA256 manifest for app source, configuration and locked dependencies. Apply the
patch in an isolated checkout after verifying the base and clean application;
do not overwrite the Mac's existing work. A prior artifact or successful build
does not certify a later source tree.

Use Xcode 27.1 with the installed compatible runtimes, frozen dependencies and
the unsigned build commands in `.github/workflows/ios-compatibility.yml`. The
existing `tests/ios-responsive/run.sh` creates test-only simulators and records
source revision, Xcode, runtime/device identities, XCTest logs and screenshots.
Its automated matrix is four models at two text sizes; it does not automate the
Duo hinge. Include a large phone, SE and tablet at normal and maximum text, and
Duo outer/inner at both sizes. Record the actual model identifiers rather than
relabeling the runner's Pro model as Pro Max.

On Duo, additionally use official fold controls to verify opening/closing during
editing with text and keyboard retained, readable QR and reachable actions on
both displays. Exercise applicable rotation and resize checks, saving/reopening
the card, learning controls and camera cancellation. Preserve the actual tested
coverage and list any missing rotations, hardware or system-permission behavior.
Loopback membership tests establish reference-adapter behavior; they do not
establish real radio transport or hardware compatibility.

No signing, tag, TestFlight or Store operation is part of this merge-only handoff.
Do not dispatch a workflow or report native success before the final source
binding and its evidence have been verified.
