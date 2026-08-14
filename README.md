# JACK-K

Self-hosted repository agent platform. Phase 0 and Phase 1 are intentionally
small: Telegram/GitHub intake, an append-only ticket store, swappable CLI
executors, and a code-enforced authority boundary around git mutations.

Release management uses the verified MIT package `@edcalderon/versioning@1.5.11`.
Run `pnpm version:patch`, `pnpm version:minor`, or `pnpm version:major`; the
configuration lives in `versioning.config.json`.

## 📋 Latest Changes (v0.1.0)

### Added

- Initial JACK-K autonomous repository agent platform skeleton.
- Authority-gated ticket intake, execution, and draft PR workflow.

For full version history, see [CHANGELOG.md](./CHANGELOG.md) and [GitHub releases](https://github.com/jack-kernel/jack-k/releases)
