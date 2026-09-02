# NixOS runtime baseline specification

## Purpose and status

This specification defines the baseline for running the JACK-K control plane in
a reproducible NixOS virtual machine on a Linux Mint host. JK-022 owns the first
implementation. JK-023 aligns the later per-ticket execution backend with Nix
microVMs. Requirement keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY**
are normative.

The NixOS guest is a deployment and recovery boundary. It is not, by itself,
the security boundary for untrusted agent-written L2 code. Every L2 run still
requires a short-lived, separately isolated worker as specified by JK-005 and
ADR-002.

## Target topology

```text
Linux Mint host
  libvirt + QEMU/KVM
  persistent JACK-K dataset (explicit exports only)
    |
    +-- NixOS guest: jack-k-core
          gateway + orchestrator + operational services
          pinned operator CLI packages
          read-only Nix store
          explicitly mounted persistent state
          |
          +-- per-ticket worker boundary (JK-005; JK-023 alignment)
```

## Baseline requirements

### Reproducibility and supply chain

- **NIX-001:** The repository MUST contain a flake lock pinning nixpkgs and all
  image/module inputs. Production builds MUST reject an unlocked input update.
- **NIX-002:** The `jack-k-core` configuration MUST build a headless
  `x86_64-linux` qcow2 image from one documented command.
- **NIX-003:** Node.js 22, pnpm, Git, GitHub CLI, Codex CLI, and Claude Code MUST
  be version-pinned through Nix derivations or a locked repository artifact.
  Mutable `npm install -g` provisioning MUST NOT be part of production setup.
- **NIX-004:** Package source hashes and licenses MUST be declared. Updates MUST
  be reviewed through the normal ticket, verification, and approval path.
- **NIX-005:** Native Node build dependencies MUST be present only in build or
  development closures unless runtime use is demonstrated.

### Host and guest boundary

- **NIX-010:** The supported baseline MUST use libvirt with QEMU/KVM on Linux;
  software emulation MAY be used for CI smoke tests but not production.
- **NIX-011:** The guest MUST use UEFI or another explicitly documented boot
  mode, have no graphical console, and expose no public listener by default.
- **NIX-012:** Host sharing MUST be an allowlist. The guest MUST NOT receive the
  host home, `/`, Docker socket, libvirt socket, SSH agent, browser state, or a
  general secrets directory.
- **NIX-013:** A virtiofs or block-device export MUST name each permitted path,
  access mode, owner, and purpose. Unsupported host filesystem semantics MUST
  fail provisioning rather than broaden access.
- **NIX-014:** Guest resource limits MUST cover vCPU, memory, disk, and process
  counts. Unexpected exhaustion MUST stop work safely and emit an audit event.

### Identity, services, and networking

- **NIX-020:** Gateway, orchestrator, and other control-plane services MUST use
  distinct systemd identities where their data access differs. `DynamicUser`
  MAY be used only when persistent-directory ownership remains deterministic.
- **NIX-021:** Units MUST declare least-privilege systemd hardening, including
  filesystem protection, private temporary space, restricted capabilities,
  syscall/address-family restrictions where compatible, restart bounds, and
  explicit writable paths.
- **NIX-022:** Services MUST run from immutable package outputs, not `/opt` or a
  mutable checkout. Deploying a new application build MUST create a new NixOS
  generation.
- **NIX-023:** Host and guest firewalls MUST default deny. Ingress MUST be
  limited to the authenticated tunnel or explicitly documented management
  path; the database MUST NOT be publicly exposed.
- **NIX-024:** The control plane MUST NOT pass a hypervisor/container socket or
  publication credentials to an untrusted worker.

### State and secrets

- **NIX-030:** Operational data, audit JSONL, artifacts, mirrors, and worktrees
  MUST live outside `/nix/store` on explicit persistent filesystems. Each class
  MUST have documented ownership, permissions, backup policy, and retention.
- **NIX-031:** Replacement of the guest OS disk MUST preserve persistent data,
  while replacement of a worker MUST preserve only approved output/artifacts.
- **NIX-032:** Application/API secrets MUST come from the selected external
  secrets manager. A Nix-native mechanism such as agenix MAY hold boot-time
  host secrets only; one secret MUST NOT have two authorities of record.
- **NIX-033:** Decrypted secrets MUST materialize at runtime with restrictive
  ownership, MUST NOT enter the Nix store, image, flake lock, logs, tickets, or
  artifacts, and MUST be absent from failure diagnostics.
- **NIX-034:** Subscription-backed CLI credentials MUST use a dedicated,
  minimal projection per tool and role. A general operator home mount is
  forbidden.

### Upgrade, rollback, and recovery

- **NIX-040:** Upgrades MUST build and test before activation, record the flake
  revision and system generation, and retain at least one known-good generation.
- **NIX-041:** A documented rollback MUST restore the prior generation without
  rolling back or corrupting the operational database or append-only audit log.
- **NIX-042:** Backup and restore MUST be tested onto a replacement guest. A
  successful boot without verified state consistency is not a successful restore.
- **NIX-043:** Generation rollback MUST NOT be presented as recovery from
  compromised persistent state; incident response and restore from verified
  backup remain separate procedures.

### Per-ticket execution alignment

- **NIX-050:** L0/L1 remain read-only. L2 MUST execute outside the long-lived
  control-plane service context in a short-lived, non-root boundary.
- **NIX-051:** The worker receives one ticket identity, one worktree, explicit
  resource budgets, deny-by-default networking, and only policy-approved tools
  and credential projections.
- **NIX-052:** Nix-store sharing with a worker MUST be read-only. Writable
  overlays/disks MUST be unique to the ticket and destroyed on every terminal
  path, including cancellation and supervisor restart.
- **NIX-053:** Workers MUST NOT commit, push, create PRs, merge, deploy, or reach
  control-plane and publication secrets. Verified outputs return to the control
  plane for the existing approval and publication flow.
- **NIX-054:** microVM adoption MUST preserve a backend-neutral job contract and
  pass the same policy and lifecycle tests as the JK-005 baseline. Backend
  fallback MUST be explicit and observable, never silent.

## Acceptance matrix

| Scenario                 | Required result                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| Locked build             | Repeated builds use the committed lock and produce the expected image/package closures.        |
| Headless boot            | Guest reaches the target with only intended units/listeners active.                            |
| Service compromise probe | Unit cannot write outside declared paths or read another service's state.                      |
| Mount denial             | Guest cannot see unapproved host paths, sockets, homes, or credential stores.                  |
| Persistence              | Seeded database/audit/artifact data survives guest OS disk replacement.                        |
| Secret scan              | Image, Nix store paths, logs, and artifacts contain no test secret.                            |
| Upgrade                  | Candidate generation passes health and schema compatibility checks before activation.          |
| Rollback                 | Prior generation boots and reads forward-compatible persistent state without audit loss.       |
| Worker teardown          | Success, error, timeout, cancellation, and restart leave no running worker or reusable secret. |
| Authority                | Worker attempts to publish, reach the host, or access another ticket fail and are audited.     |

## Delivery boundary

JK-022 is complete when the long-lived NixOS guest baseline satisfies
NIX-001 through NIX-043 and the NIX-050 boundary is demonstrated with the
current supported worker backend. JK-023 owns NIX-051 through NIX-054 for a
microVM backend. Neither task may weaken the authority ladder to claim parity.
