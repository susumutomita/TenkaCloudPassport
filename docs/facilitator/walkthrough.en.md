# Safe Document Walkthrough

- Kit Version: 1.0.
- Duration: 5–10 minutes.
- Audience: a Local Champion or Facilitator without complete physical evidence for a Product Lounge.

## Stop gate

This is a document-and-diagram review only. Do not start a Product Lounge. Enter no real participant information.
Collect no names, photographs, profiles, contact details, device IDs, or conversation content. Do not create or scan
a real QR. Do not start Nearby Transport. Do not operate the app, camera, Local Model, or multiple devices. Keep every
physical capability `Not run`.

## Read-through

1. Open the [Architecture Overview](../architecture/overview.md). Explain that the Domain is independent of React
   Native, Storage, Transport, and model runtimes, while the App layer calls external capabilities through Ports.
2. Explain that a Pet uses only a small set of clues its Owner chose to share and steps away with `no-signal` when
   evidence is weak. It never scores a person or compatibility.
3. Explain that a Bridge offers at most one reason for humans to begin a conversation. It does not promise contact
   exchange or a relationship.
4. Explain that a Host manages an ephemeral Lounge and a Guest makes their own preview and consent choices. This
   walkthrough recruits no Host, Guest, or participant.
5. Open the [Privacy Data Inventory](../privacy/data-inventory.md). Read that an Owner previews fields before sharing,
   Product Consent and Research Consent are separate choices, and Lounge-derived data is not persisted.
6. Open [Release Status](../releases/status.md). Confirm that `Implemented` describes source maturity, not
   `Verified` evidence for a target build. The Product Lounge remains blocked until required evidence exists.

Do not guess an answer; point to the canonical documents above. Do not switch into a demo, registration, or
recruitment. End by reading: “Every physical capability remains Not run. Walkthrough complete.”
