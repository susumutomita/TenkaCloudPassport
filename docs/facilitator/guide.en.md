# Facilitator Guide (English)

- Kit Version: 1.0.
- The Japanese edition is authoritative; this edition has the same boundaries.
- Physical Dry Run: `Not run`.

## What this role does

The Facilitator helps participants make their own choices about Passport fields, permissions, research, and
leaving. The Facilitator never presses controls for a participant, judges a Bridge, mediates a conversation,
or collects contact details. `no-signal`, declining an answer, and leaving are normal choices, not failures by
the participant or Facilitator.

## Roles and required devices

- The Host is one of the two to six Owners and uses their own supported device to create the current QR and end the Lounge.
- Participants are the two to six Owners including the Host; each operates one supported device themselves.
- The Facilitator reads and makes stop decisions. When also an Owner or Host, they operate only their own device,
  never count as a second person, and never operate another person's device.
- A Dry Run Observer categorizes Kit confusion and is not counted as a Product participant.

Choose the read-aloud locale before setup. When the group needs both locales, read the JA and EN scripts separately
without omitting text to save time. If every person cannot be confirmed to understand their choices and stop
conditions, use `NOT STARTED`.

## Field action IDs

The Guide and One-Page Checklist use the same IDs. Never resume from a guessed step; another group or round
returns to `P2`.

| ID | Completion state |
| --- | --- |
| `P0` | Verified allows a Product Lounge; `Not run` limits the path to a walkthrough. |
| `P1` | Kit, devices, QR poster, and exit route are ready. |
| `P2` | A group of two to six, including a Host, is formed. |
| `P3` | The 60-second Product introduction is complete. |
| `P4` | Research is decided separately; any non-participating Lounge keeps counters off. |
| `P5` | Each Owner controls Product preview, sharing, and camera choice. |
| `P6` | The Host displays a fresh one-use Invite QR for each participant; all connected participants, at least two, move to Ready themselves. |
| `P7` | The Facilitator performs no proxy operation, judgment, or answer pressure. |
| `P8` | Outcome or exit is named as a normal end or stop state. |
| `P9` | Every device has ended the Lounge; no old QR is reused. |
| `P10` | Only an optional public event route is shown, with no contact collection. |

## P0 — Pre-event stop gate

If any item cannot be confirmed, do not use the Product steps below. Use only the
[safe walkthrough](./walkthrough.en.md).

- The selected build and OS combination is Verified in the [Kit support matrix](./README.md#kit-version-10-support-matrix-english).
- Native build distribution, per-participant Invite rotation, executable Rules or a Local Model, and per-device
  discard confirmation after Host loss are Verified.
- The selected transport has been tested under the venue conditions.
- If printed material is used, A4 / Letter output and reading order are Verified; otherwise use only the on-screen Guide.
- Two to six participants choose to use their own devices.
- Someone can end the Lounge after host loss, denied permission, or a participant leaving.
- If research is planned, a separate consent script and blank observation sheet are ready.

Green repository tests do not prove a physical-device path. Mark an unverified path `Not run`.

## P3 — 60-second introduction

Read this verbatim.

> TenkaCloud Passport is an app that uses a small number of clues each person chooses to disclose at an event.
> It presents at most one reason to speak to another person, then steps away. It uses no account or central people
> registry. When the evidence is weak, it ends with `no-signal`. That is a normal result, not a judgment of a
> person or compatibility.
>
> Participation, camera permission, each Passport field, answering a question, research, and leaving are all
> optional. Refusing has no penalty. Each person previews the shared fields before sharing. The Facilitator does
> not act on anyone's behalf.
>
> Lounge data stays in device memory and disappears at the earliest of leaving, the Host ending the Lounge, or
> the 20-minute expiry. Humans conduct the conversation, and the app does not collect contact details.

If a question cannot be answered from the [privacy script](#p5--privacy-script) or a normative document, do not guess
and do not start the Lounge.

## P1–P6 — Five-minute setup

Run this setup once and create the Host QR only after it completes. Never repeat it inside the 20-minute script.

| Target | ID | Facilitator action |
| --- | --- | --- |
| 0:00–1:00 | `P1` | Check build, Group locale, transport, Rules Provider, [QR poster](./qr-poster.en.md), and exit route. |
| 1:00–2:00 | `P2` | Choose two to six people and a Host. One uses a walkthrough; seven or more split into another Host / Lounge. |
| 2:00–3:00 | `P3` | Read the [60-second introduction](#p3--60-second-introduction). |
| 3:00–4:00 | `P4` | Only when research is planned, begin its separate consent script. A refusal keeps counters off. |
| 4:00–5:00 | `P5` | Read the [privacy script](#p5--privacy-script) and confirm each Owner controls Preview and camera choice. |
| Final action | `P6` | After everyone is ready to scan, the Host creates a fresh Lounge and the first Guest-specific QR. |

If the research script or a person's decision exceeds five minutes, never rush. Shorten the following Lounge
window or use a walkthrough; do not recover time by omitting privacy information.

## P6–P9 — Maximum 20-minute Lounge script

The clock starts when `P6` creates the current Invite. Setup is not counted twice, and Ready or recovery time
never extends the expiry.

| Since Invite creation | ID | Script and activity |
| --- | --- | --- |
| 0:00–5:00 | `P6` | Each non-Host participant scans a Guest-specific current QR in turn, reviews their own Preview and Product consent, and chooses Ready themselves. |
| 5:00–10:00 | `P7` | Run the Lounge. Each Owner chooses to answer, decline, or leave; the Facilitator never judges. |
| 10:00–15:00 | `P7` | After Pets step away, leave room for humans. Record no speech, contacts, or photographs. |
| 15:00–18:00 | `P8` | Name Bridge, `no-signal`, or voluntary exit with the matching normal-end sentence. |
| 18:00–20:00 | `P9` | Confirm Lounge end on every device. Optional self-report can be skipped without waiting. |

If the 20-minute expiry or Host end happens first, end the current Lounge on every device. For an individual exit,
discard only that person's current data immediately and continue with the remaining membership. If only one
participant remains during a Round, finish that participant with a normal `no-signal` and retain no outcome for
the person who left. A Host exit is not an individual exit; apply `R5` Host loss and stop every device.
Do not begin `P7` until at least two participants are connected and every connected participant has chosen Ready
themselves. Never exclude a not-ready participant to start or mark Ready by proxy. If the gate is not satisfied
before the 20-minute expiry, use `STOP THIS LOUNGE`; never extend the expiry.

For each non-Host participant, the Host displays one fresh Invite and only that person scans it. After successful
authentication, remove that QR immediately and rotate its Secret to display a different fresh Invite for the next
person in the same Lounge. The Host never scans a Guest QR. Never show one QR to two people or allow simultaneous
scans. If a build cannot issue sequential Invites for the intended group of two to six, keep it `Not run` in the
Support Matrix and do not begin a Product Lounge.

## Event formats

| Total time | Format | Limit |
| --- | --- | --- |
| 30 minutes | Five-minute setup, a Lounge of at most 20 minutes, and a five-minute closing. | One Lounge. |
| 60 minutes | Five-minute setup, at most 20-minute Lounge, ten-minute break, fresh five-minute setup, at most 15-minute Lounge, five-minute closing. | Every Lounge uses a new Host QR. |
| 90 minutes | Five-minute setup plus at most 20-minute Lounge, ten-minute break, five-minute setup plus at most 20-minute Lounge, ten-minute break, five-minute setup plus at most ten-minute Lounge, five-minute closing. | Lounges are independent and close within 20 minutes. |

Research, another Lounge, and responding to the Meetup invitation remain optional in all 30 / 60 / 90 minute formats.

## P5 — Privacy script

Read this verbatim before Product interaction.

> The shared fields are the Pet Name, optional Pet Emoji, optional Alias, Languages, and up to three clues you enable in this Lounge's
> preview. They are intended only for people who can see the current QR and authenticated Pets in this Lounge.
> A question response itself is not transmitted; only a confirmed reference that you allow for this Lounge may
> be used.
>
> Public Passport, QR, Lounge IDs and state, Owner Questions and Answers, Pet Messages, inference data, Bridges,
> and `no-signal` are not persisted. Each disappears at its earliest deletion condition, including closing the
> screen, leaving, Host end, or the 20-minute expiry. You may leave early.
>
> A manual JSON backup includes only the Local Private Profile, device settings, and model verification record.
> It excludes Public Passport, QR, Lounge data, Owner Answers, Pet Messages, inference data, Bridges, `no-signal`,
> and the GGUF model file. The Local Private Profile and model remain on the device after a Lounge until the Owner
> chooses a separate deletion action.
>
> Product use and research participation are separate. You may use the Product after refusing research. The
> research choice is asked with another script. For now, inspect your own Product sharing Preview; if you do not
> want to share, do not continue and leave. Neither choice has a penalty.

Continue only after every participant confirms Product sharing. If research is planned, separately read the
[research consent script](../research/consent-script.en.md), and enable counters only in a Lounge where everyone
explicitly agrees. Research consent never replaces Product consent.

## Recovery cards

Use text, not color alone. Begin every state with `NORMAL END`, `NOT STARTED`, or `STOP THIS LOUNGE`.

### R1 — No Internet

- Label: `NOT STARTED`.
- Do: Continue only when the build and venue offline transport are Verified.
- Do not: Add an external relay or unverified path.
- End: If unverified or disconnected, create no Lounge and use a walkthrough.

### R2 — Camera denied

- Label: Product participation is `NOT STARTED` for that person. Declining or leaving is a normal choice; if fewer
  than two remain, the group is also `NOT STARTED`.
- Do: Scan only if the person grants access themselves; otherwise offer observation or exit.
- Do not: Force permission, type a secret, or take a proxy photograph.
- End: Do not make the person wait.

### R3 — Too few participants

- Label: `NOT STARTED`.
- Do: Wait for at least two people or use a walkthrough.
- Do not: Count one person or the Facilitator as a Product Lounge.
- End: Create no Lounge.

### R4 — Full group

- Label: The additional group is `NOT STARTED`.
- Do: Split into two-to-six-person groups with another Host and fresh QR.
- Do not: Add a seventh person or reuse the existing QR.
- End: If splitting is impossible, offer another round.

### R5 — Host loss

- Label: `STOP THIS LOUNGE`.
- Do: Confirm “Discarded this Lounge’s data from this device” on every remaining device; only then may another Host
  create a fresh Lounge.
- Do not: Recover a snapshot, old QR, secret, or outcome.
- End: If discard completion is not visible on even one device, do not restart; end the current round.

### R6 — No model

- Label: Continue with Rules; without Rules, `NOT STARTED`.
- Do: Use the Rules Provider as a normal path.
- Do not: Download a model during the event or use remote inference.
- End: Without Rules, create no Lounge.

### R7 — Non-Passport or invalid QR

- Label: `NOT STARTED`.
- Do: Follow the app's typed rejection and inspect the current Host display.
- Do not: Open it as a URL or transcribe its content.
- End: Without a fresh Invite from a supported build, do not start.

### R8 — Duplicate or used QR

- Label: `NOT STARTED`.
- Do: Never scan it again. The Host disposes only the old Invite / Handshake, retains authenticated membership,
  rotates the Secret in the same Lounge, and displays a fresh Invite for the next one person.
- Do not: Treat `DUPLICATE_SCAN` as success, remove an accepted participant, or reuse a secret.
- End: Without a safely created fresh Invite, admit no next person and do not begin `P7` unless the All-Ready Gate holds.

### R9 — Expired QR

- Label: `STOP THIS LOUNGE`.
- Do: End the expired Lounge everywhere; continuing requires a fresh Lounge and Invite.
- Do not: Extend expiry, redisplay the old QR, or restore an old snapshot.
- End: End the expired round.

### R10 — Wrong-group or unsupported-version QR

- Label: `NOT STARTED`.
- Do: Confirm the intended Group Host and supported build, then use that Host's current Invite.
- Do not: Forward QR codes across groups or reinterpret unsupported payloads.
- End: Without a supported current Invite, do not start.

For an unknown display, never guess; use `STOP THIS LOUNGE`. If one privacy or safety incident is recognized,
stop new Lounges and aggregate export. Record no incident details on the observation sheet; pass the restart
decision to the [pilot decision gates](../research/pilot-decision-gates.md).

## P8 — Outcome and exit read-aloud

- Bridge: “The Pet has stepped away. If you want, the humans can take over the conversation now.”
- `no-signal`: “This is a normal `no-signal`. We will not guess or retry it in this Lounge.”
- Exit: “You may leave without giving a reason. This device will discard the current Lounge data.”
- Research refusal or no answer: “No answer is required. You may continue with the Product or finish without waiting.”

## P9 — End and forget

Complete an individual exit immediately at `P8`; never make that person wait for other devices to end. At Group end,
confirm that all remaining devices ended the current Lounge. Carry no old QR, screen photograph, or Checklist writing
into another group. Start another group from `P2`.

## P10 — Closing script

> If you are interested, we can show only an already-public announcement for a TenkaCloud Meetup or Local
> Tournament. You do not need to give the Facilitator a response or contact details, and you do not need to
> decide now.

## Local Champion lifecycle

### 1. Discovery

Use only public OSS contributions, public Cloud / CTF / education events, public talks, and public organizer
information. Never use private groups, scraped member lists, purchased lists, or another person's private judgment.

Public information is an opening for a respectful invitation, not a score. Ask the person only about:

- interest in the Product purpose;
- the possibility of preparing a space and devices for two to six people;
- their public connection to a local community;
- whether they may want to consider another event or prefer a single event.

Never score, rank, or compare the answers. Being unavailable or declining continuity is not a failed assessment.

### 2. Invitation and orientation

State that the invitation creates no employment, payment, credential, or obligation. The person may decline
without a reason and request deletion of optional contact details and manual notes held in the invitation channel.
Never copy them into a central Champion registry.

Keep synchronous orientation within 30 minutes.

1. Five minutes for the Product Contract and `no-signal`.
2. Ten minutes to read privacy and separate Product / Research consent.
3. Ten minutes for all ten recovery scenarios and the QR reuse prohibition.
4. Five minutes for dry run, declining, deletion requests, and the support channel.

### 3. Dry run through rerun or decline

Show an inexperienced person the Guide and Checklist in no more than ten minutes, then run the dry run without
oral hints. Record only categories of confusion, undecidable steps, and privacy omissions in the
[dry run record](./dry-run-record.md). Revise the Kit and repeat whenever any category is present.

After the first event, do not evaluate attendance, Bridge rate, or Champion speed. Use feedback only to improve
the Kit, and let the person choose another event or decline without giving a reason.
