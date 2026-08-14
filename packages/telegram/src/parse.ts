export interface TicketCommand {
  repo: string;
  description: string;
}

export interface ApprovalAction {
  ticketId: string;
  action: "open_draft_pr" | "reject" | "request_changes";
}

export const parseTicketCommand = (text: string): TicketCommand | undefined => {
  const match = /^\/ticket(?:@[A-Za-z0-9_]+)?\s+(\S+)\s+([\s\S]*\S)\s*$/.exec(text);
  if (!match || !/^[^/\s]+\/[^/\s]+$/.test(match[1] ?? "")) return undefined;
  return { repo: match[1] ?? "", description: match[2] ?? "" };
};

export const isAllowedUser = (userId: number | undefined, allowed: ReadonlySet<number>): boolean => userId !== undefined && allowed.has(userId);

export const parseApprovalAction = (data: string): ApprovalAction | undefined => {
  const match = /^(approve|reject|changes):([^:]+)$/.exec(data);
  if (!match) return undefined;
  return { ticketId: match[2] ?? "", action: match[1] === "approve" ? "open_draft_pr" : match[1] === "reject" ? "reject" : "request_changes" };
};
