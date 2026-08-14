import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { parseTicketCommand } from "@jack-k/telegram";
import { TicketStore } from "@jack-k/ticket-store";

export interface GatewayOptions {
  store: TicketStore;
  telegramSecretToken: string;
  githubWebhookSecret: string;
  telegramAllowedUserIds: ReadonlySet<number>;
}

interface TelegramUpdate {
  message?: { from?: { id?: number }; chat?: { id?: number }; text?: string };
}

interface GitHubIssueEvent {
  action?: string;
  issue?: { number?: number; title?: string; body?: string | null };
  repository?: { full_name?: string };
}

export const createGateway = (options: GatewayOptions): Hono => {
  const app = new Hono();
  app.get("/health", (context) => context.json({ ok: true }));
  app.post("/telegram", async (context) => {
    if (context.req.header("x-telegram-bot-api-secret-token") !== options.telegramSecretToken) return context.json({ ok: false }, 401);
    const update = await context.req.json<TelegramUpdate>();
    const userId = update.message?.from?.id;
    if (userId === undefined || !options.telegramAllowedUserIds.has(userId)) return context.json({ ok: true });
    const command = parseTicketCommand(update.message?.text ?? "");
    if (!command) return context.json({ ok: false, error: "Expected /ticket <repo> <description>" }, 400);
    const ticket = options.store.createTicket({ id: randomUUID(), ...command, source: "telegram", sourceId: String(update.message?.chat?.id ?? userId), authority: 2 });
    return context.json({ ok: true, ticketId: ticket.id });
  });
  app.post("/github", async (context) => {
    const raw = await context.req.text();
    const signature = context.req.header("x-hub-signature-256");
    if (!signature || !verifySignature(raw, signature, options.githubWebhookSecret)) return context.json({ ok: false }, 401);
    const event = JSON.parse(raw) as GitHubIssueEvent;
    if (event.action !== "opened" && event.action !== "reopened") return context.json({ ok: true, ignored: true });
    const repo = event.repository?.full_name;
    const title = event.issue?.title;
    if (!repo || !title) return context.json({ ok: false, error: "Missing issue repository or title" }, 400);
    const ticket = options.store.createTicket({ id: randomUUID(), repo, description: `${title}\n\n${event.issue?.body ?? ""}`.trim(), source: "github", sourceId: `${repo}#${event.issue?.number ?? "unknown"}`, authority: 2 });
    return context.json({ ok: true, ticketId: ticket.id });
  });
  return app;
};

export const verifySignature = (payload: string, signature: string, secret: string): boolean => {
  if (!signature.startsWith("sha256=")) return false;
  const provided = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(payload).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};
