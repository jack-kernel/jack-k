# JK-022: NixOS guest runtime baseline

- Phase: 0
- Status: in progress
- Dependencies: JK-020
- GitHub issue: pending creation (no authenticated repository remote is configured in this environment)
- Scope: Specify and implement the reproducible NixOS guest that runs the JACK-K control plane on a Linux host. Pin the OS and supported operator tooling, declare hardened systemd services, keep durable state outside the Nix store, and provide build, boot, rollback, and recovery checks. The first delivery targets a libvirt/QEMU guest; it does not replace the separate per-ticket L2 worker isolation required by JK-005.
- Acceptance evidence: all requirement IDs in `docs/specs/nixos-runtime-baseline.md` are covered by committed configuration or an explicitly recorded follow-up; the guest image builds from the locked flake, boots without a graphical console, passes service-hardening checks, preserves test data across guest replacement, rejects unapproved host paths and credentials, and completes a tested generation rollback. Record exact commands, results, image/flake revision, and any environment limitations here before moving this task to `done-task`.

## Deliverables

- Locked Nix flake and a `jack-k-core` NixOS configuration for `x86_64-linux`.
- Reproducible qcow2 image build and documented Linux Mint libvirt provisioning path.
- Dedicated systemd identities and sandbox settings for gateway and orchestrator.
- Explicit, least-privilege persistent mounts for state, artifacts, mirrors, and worktrees.
- Pinned Node.js, pnpm, Git, GitHub CLI, Codex CLI, and Claude Code packages; no mutable global npm installation in the production baseline.
- Operator runbook for initial boot, upgrade, rollback, guest replacement, backup, and recovery.
- Automated configuration assertions and smoke checks suitable for CI where KVM is unavailable.

## Non-goals

- Granting workers the libvirt socket, host filesystem, publication credentials, or control-plane secrets.
- Treating the long-lived NixOS guest as the L2 execution sandbox.
- Enabling public ingress, automatic merge, deployment authority, or L4-L6 authority.
- Migrating production to per-ticket microVMs in this task; that alignment is tracked by JK-023.

## Implementation order

1. Commit the flake lock, package overlay, module assertions, and image build.
2. Add systemd units and explicit persistent mount contracts.
3. Add host provisioning and guest lifecycle scripts/runbooks.
4. Exercise build, boot, persistence, denial, rollback, and recovery acceptance scenarios.
5. Record evidence and reconcile JK-005/JK-023 before marking complete.
