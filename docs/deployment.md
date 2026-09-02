# Deployment

## Environment separation

| Environment | Purpose                      | Ingress                              | Data and credentials                          |
| ----------- | ---------------------------- | ------------------------------------ | --------------------------------------------- |
| Local       | development only             | loopback port                        | `.env` placeholders; disposable volumes       |
| Staging     | recovery/security validation | authenticated tunnel                 | separate database, GitHub App, bot, artifacts |
| Production  | one-operator service         | Cloudflare Tunnel or equivalent only | secrets manager; encrypted remote backups     |

The committed Compose file uses the non-secret `.env.example` placeholders so
it can boot safely. To customize local values, update an ignored local override
file rather than committing credentials, then run `docker compose up --build`.
The gateway is bound to `127.0.0.1`; Postgres is not published. This
Phase 0 composition validates packaging but the application still uses SQLite
until Phase 1 lands.

The first NixOS deployment runs as a headless libvirt/QEMU guest on the Linux
host, with one concurrent worker. Run gateway, orchestrator, and Postgres as
separate hardened services. Do not expose the application port publicly. Do not
run agents inside gateway/orchestrator: the orchestrator must provision an
ephemeral per-ticket worker. Host exports are allowlisted and must never include
the host home, root filesystem, Docker/libvirt sockets, or general credential
stores. Persistent state is outside the Nix store and has a separate encrypted
backup destination. The normative build, mount, identity, secret, rollback, and
recovery requirements are in the
[NixOS runtime baseline](specs/nixos-runtime-baseline.md).

## Subscription-backed coding tools

JACK-K may invoke operator-installed Codex CLI and Claude Code using their
interactive subscription authentication, rather than requiring API keys.
Codex CLI supports **Sign in with ChatGPT**; Claude Code supports Anthropic
Console or Claude Pro/Max authentication. Complete login interactively on the
operator-controlled host, store each tool's credential state outside JACK-K's
data/artifact paths with restrictive permissions, and mount only the minimum
tool-specific state into a dedicated worker profile. Never copy browser cookies,
session tokens, or credential files into tickets, images, Compose environment,
logs, or repositories.

Subscription terms, entitlements, and headless-login behavior can change; use
the vendors' current official setup pages before deployment:
[OpenAI Codex CLI authentication](https://developers.openai.com/codex/auth/)
and [Anthropic Claude Code authentication](https://docs.anthropic.com/en/docs/claude-code/authentication).
Treat subscription auth as a credential source, not an authority bypass: the
same sandbox, budget, policy, verification, and approval gates apply.
