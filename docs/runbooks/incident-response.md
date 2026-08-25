# Incident-response runbook

1. **Contain:** enable global and affected-repository kill switches, stop new
   workers, revoke GitHub App installations/tokens and bot credentials, and
   keep L0/L1 available only if evidence integrity is assured.
2. **Preserve:** snapshot Postgres, JSONL, artifacts, worker metadata, and host
   audit logs. Do not paste raw environments or credentials into the ticket.
3. **Assess:** identify tickets, runs, policy fingerprints, artifacts, outbound
   notifications, Git refs, and draft PRs in the incident window.
4. **Eradicate:** destroy orphan workers, rotate affected credentials, remove
   untrusted skills/MCP registrations, and patch the policy or runtime.
5. **Recover:** follow `recovery.md`, verify signatures/hashes and repository
   state, then restore authority one repository at a time.
6. **Review:** document a redacted timeline, root cause, affected authority,
   tests added, and explicit operator decision before L2/L3 returns.

Never delete audit evidence, merge automatically, or retry ambiguous mutations.
