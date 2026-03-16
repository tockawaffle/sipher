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
- - [ ] — Add a "nuke" endpoint where if a federation loses their old keys and cannot rotate them, it'll nuke everything and make the other federations reset that federation score.
- **Phase 3** — Opt-in relay network for censorship resistance.
- **Phase 4** — End-to-end encryption via TBD.

---

## Instructions

<details>
<summary><strong>Rotating Federation Keys</strong></summary>

Federation identity is tied to two keypairs (Ed25519 for signing, X25519 for encryption). The `rotateKeys.ts` script walks through every known federation, proves ownership of both the old and new keys via a challenge-response protocol, and updates `.env.local` when all federations confirm.

You **need** the old keys in order to run this script, if you lost them, you'll have to use the nuke endpoint. (Yet to be made)

### Prerequisites

- A running database with the server registry populated (at least one peer federation).
- `.env.local` with valid `FEDERATION_*` keys and `BETTER_AUTH_URL`.

### Basic rotation

```sh
bun run rotateKeys.ts
```

The script will:

1. List all federations in the registry.
2. Ask for confirmation before proceeding.
3. For each federation: request a challenge, solve it, and confirm.
4. On full success: back up `.env.local` and write the new keys.
5. On any failure: print a retry command and exit without writing keys.

### Retrying after partial failure

If some federations failed while others succeeded, the script prints a ready-to-copy command targeting only the failures:

```sh
bun run rotateKeys.ts --resume '<keys-json>' --only '<failed-urls>'
```

- `--resume <json>` — Reuse the new keys from the previous run instead of generating fresh ones (required because successful federations already registered them).
- `--only <urls>` — Comma-separated list of federation URLs to retry. Federations not in this list are skipped.

You can also retry all federations with just `--resume`:

```sh
bun run rotateKeys.ts --resume '<keys-json>'
```

</details>


## Author

**Marcello Brito** (Tocka) — [tockanest.com](https://tockanest.com)

## Mirrors

[Gitea](https://git.tockanest.com/Cete/sipher)
[GitHub](https://github.com/tockawaffle/sipher)

## Security

SiPher implements custom federation and cryptographic protocols. I am not a professional cryptographer or security researcher — this system has not been audited and almost certainly contains multiple vulnerabilities I am not aware of.

If you find one, please open an issue or contact me directly at tocka@tockanest.com. Responsible disclosure is appreciated.

Contributions from people with security or cryptography experience are especially welcome, even if just pure criticism.

**Do not use SiPher in any context where your physical safety depends on it — not yet.**

## License

[AGPL-3.0](./LICENSE)