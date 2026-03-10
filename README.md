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

## Security

SiPher implements custom federation and cryptographic protocols. I am not a professional cryptographer or security researcher — this system has not been audited and almost certainly contains multiple vulnerabilities I am not aware of.

If you find one, please open an issue or contact me directly at tocka@tockanest.com. Responsible disclosure is appreciated.

Contributions from people with security or cryptography experience are especially welcome, even if just pure criticism.

**Do not use SiPher in any context where your physical safety depends on it — not yet.**

## License

[AGPL-3.0](./LICENSE)