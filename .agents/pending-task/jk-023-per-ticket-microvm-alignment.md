# JK-023: Align per-ticket execution with Nix microVM isolation

- Phase: 3
- Status: pending
- Dependencies: JK-005, JK-022
- GitHub issue: pending creation (no authenticated repository remote is configured in this environment)
- Scope: Evaluate and implement a Nix-declared, ephemeral microVM backend for L2 per-ticket execution without changing JACK-K's authority model. Preserve the JK-005 worker contract while replacing or supplementing its rootless-container backend only after measured compatibility, isolation, cleanup, and recovery gates pass.
- Acceptance evidence: an ADR records the selected hypervisor/backend and fallback; contract tests run the same worker job against the supported backend(s); each run receives only its ticket worktree and approved credential projection; network, CPU, memory, process, and time limits fail closed; the VM and secrets are destroyed after success, failure, cancellation, and supervisor restart; no worker can access the host, control-plane state, hypervisor socket, another ticket, or publication credentials; measured boot/runtime overhead and Linux host prerequisites are documented.

## Alignment decisions required

- Choose and pin `microvm.nix` plus QEMU, cloud-hypervisor, or Firecracker based on host support and test evidence.
- Define a backend-neutral worker lifecycle interface so policy does not depend on a hypervisor.
- Decide whether rootless containers remain a supported local-development fallback; they must never silently replace the configured production boundary.
- Define read-only Nix-store sharing, writable ephemeral disks, worktree transfer/mount behavior, and artifact extraction.
- Define subscription-backed CLI credential injection without mounting a general home directory.
- Preserve control-plane-only commit, push, and draft-PR publication.

## Gate

Do not start this task until JK-005 and JK-022 acceptance evidence is complete. A proof of concept may inform the ADR, but it is not a production isolation boundary until all denial and teardown tests pass.
