# Recovery runbook

1. Freeze intake and enable the global L2/L3 kill switch.
2. Record incident time; preserve Postgres, JSONL, and artifact volumes.
3. Restore Postgres into a clean host, then restore JSONL and artifacts from the
   same recovery point. Verify artifact hashes and JSONL append continuity.
4. Start Postgres, then orchestrator without workers, then gateway.
5. Reconcile queued/provisioning/running runs against actual worker inventory.
   Never rerun an ambiguous write-capable execution. Preserve approvals and
   continue an approved publication idempotently.
6. Validate ticket/run counts, policy fingerprints, outbox delivery keys, and
   the latest audit event. Exercise a read-only ticket.
7. Re-enable intake; re-enable L2/L3 only after operator review. Record evidence.

Phase 10 must automate encrypted daily backups (7 daily, 4 weekly, 3 monthly)
and prove this procedure through reboot and clean-machine restore drills.
