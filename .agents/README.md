# Versioned task ledger

One Markdown file represents one independently reviewable deliverable. New work starts in `pending-task`, moves to `active-task` only when its prerequisites are done, and moves to `done-task` only with commands and acceptance evidence recorded. Keep the same filename and stable task ID when moving it. Never start a later phase before all earlier-phase acceptance gates are done.

Required fields: ID, phase, status, dependencies, scope, acceptance evidence, and GitHub issue URL/number once created. This ledger is authoritative locally; GitHub issues mirror it when authenticated repository access is available.
