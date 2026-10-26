# Historical Store inspection context

This private configuration is only for the pinned EAS CLI 21.0.2 metadata
adapter and the reviewed 1.3.0(15) Store record. It has no build profiles or
plugins. It is not the application project and must not be used for builds.

Production uses the repository root's unchanged EAS CLI constraint and build
profiles. Inspection validates that the source and metadata contexts identify
the same existing Expo project, bundle and App Store app before authentication.
Listing text, screenshots and review notes are read from the repository root.
No credentials or environment files are copied here, and the CLI version check
remains enabled in both contexts.
