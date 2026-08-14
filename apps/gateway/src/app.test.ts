import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TicketStore } from "@jack-k/ticket-store";
import { createGateway } from "./app.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const setup = () => {
  const root = mkdtempSync(join(tmpdir(), "jack-k-gateway-"));
  roots.push(root);
  const store = new TicketStore({ dbPath: join(root, "tickets.db"), eventDir: join(root, "events") });
  return { store, app: createGateway({ store, telegramSecretToken: "telegram-secret", githubWebhookSecret: "github-secret", telegramAllowedUserIds: new Set([42]) }) };
};

describe("gateway", () => {
  it("accepts an authenticated Telegram ticket and rejects unknown users", async () => {
    const { app, store } = setup();
    const body = JSON.stringify({ message: { from: { id: 42 }, text: "/ticket acme/app Investigate parser" } });
    const accepted = await app.request("http://localhost/telegram", { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "telegram-secret" }, body });
    expect(accepted.status).toBe(200);
    expect(store.listTickets()).toHaveLength(1);
    const unknown = await app.request("http://localhost/telegram", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "telegram-secret" }, body: JSON.stringify({ message: { from: { id: 99 }, text: "/ticket acme/app nope" } }) });
    expect(unknown.status).toBe(200);
    expect(store.listTickets()).toHaveLength(1);
  });

  it("requires the Telegram secret token", async () => {
    const { app } = setup();
    const response = await app.request("http://localhost/telegram", { method: "POST", body: "{}" });
    expect(response.status).toBe(401);
  });

  it("verifies GitHub HMAC using a timing-safe comparison", async () => {
    const { app, store } = setup();
    const body = JSON.stringify({ action: "opened", issue: { title: "Bug", body: "Details" }, repository: { full_name: "acme/app" } });
    const signature = `sha256=${createHmac("sha256", "github-secret").update(body).digest("hex")}`;
    const response = await app.request("http://localhost/github", { method: "POST", headers: { "x-hub-signature-256": signature }, body });
    expect(response.status).toBe(200);
    expect(store.listTickets()[0]?.description).toContain("Bug");
    const invalid = await app.request("http://localhost/github", { method: "POST", headers: { "x-hub-signature-256": "sha256=bad" }, body });
    expect(invalid.status).toBe(401);
  });
});
