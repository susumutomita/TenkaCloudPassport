# Current App Store screenshots

The cloud capture workflow reuses the existing unsigned XCTest project generator on a standard public GitHub `macos-26` runner. No Apple credentials, signing, new EAS production build or submission are used. The application UI/config/dependencies must equal release commit `d42f0439639dfdb7b31d1560f83493a7cd4e73b8` (1.3.0). The simulator build is separate from the signed production build 15; it never claims to execute that IPA.

Fresh test-only iPhone 17 Pro, iPhone 17 Pro Max and iPad Pro 13-inch (M5) simulators on iOS 26.5 capture five real app screens: editing a synthetic card, its QR, downloaded lesson library, lesson study, and Settings. The real public catalog is explicitly downloaded through the UI. Screens are raw native `XCTAttachment` PNGs; no browser emulation, composited controls or invented states. They contain only the synthetic `Sample Creator` card. No private contact information is seeded.

The workflow records source/UI commits, Xcode, simulator identity, test logs and xcresult attachments as an Actions artifact. Successful native test execution, attachment name/size checks and visual review are required before selecting store assets. Capture failure is a blocker, not permission to fabricate a screen. Existing web QA screenshots are review evidence only, not iOS Simulator screenshots.

The old `docs/assets/app-store-screenshots/v1.2.0` files are historical; QR, conversation and Settings images advertise removed controls and must not be selected for 1.3.0. Current approved listing text is in `store.config.json` and `docs/release/app-store-submission-1.3.0.md`.

`store-inspection` reads the exact build 1.3.0 (15), EAS commit/submission status, Apple processing status, current version metadata and screenshot file/status lists using the existing pinned EAS Metadata authentication route. It freezes credentials, has no listing mutation and never outputs auth contexts or keys. The Linux workspace has no authenticated EAS session, so the existing GitHub `EXPO_TOKEN` is used without exposing or replacing it.

Do not run a blanket `eas metadata:push` of historical settings: categories, age declarations and release options are outside the approved text/image update. Apply only reviewed descriptions, keywords, promotional text/release notes and selected current screenshots to the verified editable version; read them back afterward. Do not submit review, publish, change declarations or credentials as part of listing synchronization.
