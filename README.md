# SiPher
> *Silent Whisper — A federated social network built for the modern age.*

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0-purple.svg)
![Status](https://img.shields.io/badge/status-early%20development-orange.svg)

SiPher is a federated social network. Each server is independent — no central authority, no single point of failure.

Your identity is `you@yourserver.com`. Your server, your data, your rules.

---

## Roadmap

- **Phase 1** — Core federation. Two servers can follow each other, post, and see each other's posts.
- - [X] — Two servers can follow each other, trust their keys and rotate them.
- - [ ] — One server can create posts, have users following each other and dms (unencrypted for now) works.
- - [ ] — Two servers can fetch posts, follows and other data from their users, including DMs.
- **Phase 2** — Server trust scoring and a public vouch ledger.
- **Phase 3** — Opt-in relay network for censorship resistance.
- **Phase 4** — End-to-end encryption via TBD.

---

## Author

**Marcello Brito** (Tocka) — [tockanest.com](https://tockanest.com)

## License

[AGPL-3.0](./LICENSE)