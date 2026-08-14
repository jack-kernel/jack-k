import { randomUUID } from "node:crypto";
import { Bot, InlineKeyboard } from "grammy";
import { TicketStore } from "@jack-k/ticket-store";
import { isAllowedUser, parseApprovalAction, parseTicketCommand } from "./parse.js";

export interface TelegramBotOptions {
  token: string;
  allowedUserIds: ReadonlySet<number>;
  store: TicketStore;
}

export interface TelegramNotifierOptions {
  token: string;
  store: TicketStore;
}

export const createTelegramNotifier = (options: TelegramNotifierOptions): ((ticketId: string, message: string) => Promise<void>) => {
  const bot = new Bot(options.token);
  return async (ticketId, message) => {
    const ticket = options.store.getTicket(ticketId);
    const chatId = ticket?.source === "telegram" && ticket.sourceId ? Number(ticket.sourceId) : NaN;
    if (!Number.isSafeInteger(chatId)) return;
    await bot.api.sendMessage(chatId, message);
  };
};

export const createTelegramBot = (options: TelegramBotOptions): Bot => {
  const bot = new Bot(options.token);
  bot.use(async (ctx, next) => {
    if (!isAllowedUser(ctx.from?.id, options.allowedUserIds)) return;
    await next();
  });
  bot.command("ticket", async (ctx) => {
    const command = parseTicketCommand(ctx.message?.text ?? "");
    if (!command) { await ctx.reply("Usage: /ticket <owner/repo> <description>"); return; }
    const ticket = options.store.createTicket({ id: randomUUID(), ...command, source: "telegram", sourceId: String(ctx.from?.id ?? 0), authority: 2 });
    await ctx.reply(`Ticket ${ticket.id} received for ${ticket.repo}.`);
  });
  bot.command("status", async (ctx) => {
    const id = ctx.message?.text.split(/\s+/)[1];
    const ticket = id ? options.store.getTicket(id) : undefined;
    await ctx.reply(ticket ? `${ticket.id}: ${ticket.state}` : "Ticket not found.");
  });
  bot.command("cancel", async (ctx) => {
    const id = ctx.message?.text.split(/\s+/)[1];
    if (!id || !options.store.getTicket(id)) { await ctx.reply("Ticket not found."); return; }
    await ctx.reply("Cancellation is recorded for supervisor handling.");
    options.store.recordApproval(id, "cancel", String(ctx.from?.id ?? 0));
  });
  bot.on("callback_query:data", async (ctx) => {
    const action = parseApprovalAction(ctx.callbackQuery.data);
    if (!action) { await ctx.answerCallbackQuery({ text: "Invalid action" }); return; }
    options.store.recordApproval(action.ticketId, action.action, String(ctx.from?.id));
    await ctx.answerCallbackQuery({ text: "Recorded" });
    await ctx.editMessageText(`Approval ${action.action} recorded for ${action.ticketId}.`);
  });
  return bot;
};

export const approvalKeyboard = (ticketId: string): InlineKeyboard => new InlineKeyboard()
  .text("Approve", `approve:${ticketId}`)
  .text("Reject", `reject:${ticketId}`)
  .text("Request changes", `changes:${ticketId}`);
