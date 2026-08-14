import type { AuthorityLevel } from "./authority.js";

export type TicketState =
  | "received"
  | "triaging"
  | "planned"
  | "executing"
  | "awaiting_approval"
  | "pr_open"
  | "merged"
  | "rejected"
  | "failed";

export interface Ticket {
  id: string;
  repo: string;
  description: string;
  source: "telegram" | "github" | "manual";
  sourceId?: string;
  state: TicketState;
  authority: AuthorityLevel;
  createdAt: string;
  updatedAt: string;
}

const transitions: Readonly<Record<TicketState, readonly TicketState[]>> = {
  received: ["triaging", "failed"],
  triaging: ["planned", "failed"],
  planned: ["executing", "failed"],
  executing: ["awaiting_approval", "failed"],
  awaiting_approval: ["pr_open", "rejected", "failed"],
  pr_open: ["merged", "failed"],
  merged: [],
  rejected: [],
  failed: [],
};

export const canTransition = (from: TicketState, to: TicketState): boolean =>
  transitions[from]?.includes(to) ?? false;
