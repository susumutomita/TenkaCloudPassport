# Learning integration simulator checks

This XCTest runner launches the existing `cloud.tenka.passport` app. It does not create a new product app or change signing. Use a **new, test-only simulator**: the final test deliberately deletes all of that simulator app's test data. Never run it against a simulator containing personal data.

1. Install existing locked dependencies with `bun install --frozen-lockfile --ignore-scripts`.
2. Generate the existing app's native project with `bunx expo prebuild --platform ios --no-install`, explicitly verify/install its existing native artifacts with `make setup-llama-native`, then run `pod install` in `ios`.
3. Build `TenkaCloudPassport.xcworkspace`, scheme `TenkaCloudPassport`, for the dedicated simulator with `CODE_SIGNING_ALLOWED=NO`.
4. Start a separate localhost Metro port, e.g. `NODE_OPTIONS=--dns-result-order=ipv4first CI=1 bunx expo start --dev-client --port 8097 --localhost`. Node's IPv6-only localhost binding otherwise conflicts with Expo's `127.0.0.1` manifest URL on this machine.
5. Open the development-client URL on the dedicated simulator. Set its app locale to Japanese using the normal locale toggle or a test-only `tenkacloud-passport-locale-preference` file containing `ja`.
6. Generate the runner: `ruby tests/ios-learning/generate-project.rb /tmp/PassportLearningQA` (requires CocoaPods' `xcodeproj` gem).
7. Run `xcodebuild test` with that project, scheme `PassportLearningQA`, the dedicated simulator UUID, and `CODE_SIGNING_ALLOWED=NO`. Skip `testLargeTextLearningScreens` for the baseline run.
8. Run the large-text test separately after setting that dedicated simulator's content size to `accessibility-extra-extra-extra-large`; restore `large` afterward.

The learning test expects an empty learning history. The draft/card and deletion tests follow it alphabetically. It records incorrect/correct feedback, relaunch/resume, self-assessment, completion, review, history, native file sharing, preserved card editing/QR, and deletion confirmation. The large-text test samples a CS/math lesson.

JSON schema and transitions are tested in Bun independently, including corrupt saved state, stale operations, backup restoration, version conflicts, source payload hashes, legacy key preservation, interrupted deletion, and owned-import URI boundaries. The UI runner does not claim to exercise every lesson or a physical device/iCloud provider.

## External-catalog migration status

The current app now starts without built-in catalogs. The earlier learning UI scenarios require test-only catalogs to be imported or explicitly seeded in the dedicated simulator; they must not be treated as a passing end-to-end download check. The fixture data in `tests/fixtures/learning` is never imported by production code. Card/QR/deletion and large-text checks passed before this migration, as documented in the local handoff. Restart CI Metro with `--clear` after source changes because CI mode disables watching.

The production catalog manager accepts a public GitHub raw manifest URL and downloads immutable commit-pinned payloads with bounded streaming, digest verification, cancellation and local persistence. Six public manifests are configured under https://github.com/susumutomita/TenkaCloudInterviewCatalog. Discovery URLs track main, while each downloaded payload is pinned to its full immutable commit and SHA256. testPublishedCatalogDownloadAndPersistedReload exercises the real published source, native registration/download and persisted relaunch on the dedicated simulator. Real-response cancellation/retry is also checked at the catalog transport boundary. Physical-device and iCloud checks remain pending.
