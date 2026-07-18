# Facilitator One-Page Checklist (English)

- Kit Version: 1.0.
- Physical Dry Run: `Not run`.
- Details: [Facilitator Guide](./guide.en.md).

## Field spine

- [ ] `P0` I checked build / OS / transport in the [support matrix](./README.md#kit-version-10-support-matrix-english) and
  depend on no `Not run` capability.
- [ ] `P1` Kit, devices, [QR poster](./qr-poster.en.md), and exit route are ready.
- [ ] `P2` Two to six people in total, including the Host, have their own devices and confirmed the Group locale. If only one
  person is present, use a walkthrough; seven or more split.
- [ ] `P3` I read the Product introduction and said `no-signal` and leaving are not failures.
- [ ] `P4` Research used a separate consent decision. Refusal or no answer keeps counters off.
- [ ] `P5` I read Product privacy; each Owner controlled Preview, sharing, and camera choice.
- [ ] `P6` The Host showed one fresh Invite to each non-Host participant in turn, removed each used QR, and rotated
  its Secret in the same Lounge. I did not begin `P7` until at least two participants were connected and every
  connected participant chose Ready themselves.
- [ ] `P7` I performed no proxy operation, answer pressure, outcome judgment, or content / contact recording.
- [ ] `P8` I named the result as `NORMAL END` or `STOP THIS LOUNGE` and completed individual exit without waiting.
- [ ] `P9` Every device ended the Lounge. No old QR, photo, secret, or Checklist writing is reused.
- [ ] `P10` I collected no contacts and showed only a public Meetup / Local Tournament notice on request.

## Three privacy boundaries

- [ ] Sharing is limited to the enabled Pet Name, optional Pet Emoji, optional Alias, Languages, and up to three clues.
- [ ] Lounge-derived data disappears at its earliest condition, including leaving, Host end, or 20-minute expiry.
- [ ] A JSON backup contains only Local Private Profile, device settings, and model verification. It excludes Public
  Passport, QR, Lounge, Owner Answer, Pet Message, inference data, Bridge, `no-signal`, and the GGUF model file.

## Recovery index

| ID | State | Safe decision |
| --- | --- | --- |
| `R1` | No Internet | Continue only on Verified offline transport; otherwise `NOT STARTED`. |
| `R2` | Camera denied | Product participation is `NOT STARTED`; refusal is not failure, and never force, type a secret, or take a proxy photo. |
| `R3` | Too few | `NOT STARTED`; wait for two or use a walkthrough. |
| `R4` | Full | Never add a seventh person; split with another Host and fresh QR. |
| `R5` | Host loss | `STOP THIS LOUNGE`; begin a fresh Lounge only after every remaining device shows discard completion. |
| `R6` | No model | Use Rules normally; without Rules, `NOT STARTED`. |
| `R7` | Invalid / non-Passport QR | Never open as a URL; without a current supported Invite, do not start. |
| `R8` | Duplicate / used QR | Dispose only the old Invite / Handshake; retain accepted membership and rotate. |
| `R9` | Expired QR | `STOP THIS LOUNGE`; never extend expiry, and use only a fresh Lounge. |
| `R10` | Wrong-group / unsupported QR | Never forward or reinterpret it; use only the intended Host's current Invite. |

An unknown state or privacy / safety incident is `STOP THIS LOUNGE`. Stop new Lounges and aggregate export.
Record no name, venue, exact time, Passport, Bridge, conversation, or incident content.
