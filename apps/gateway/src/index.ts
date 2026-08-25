import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "@jack-k/config";
import { TicketStore } from "@jack-k/ticket-store";
import { createGateway } from "./app.js";

const env = parseEnv(process.env);
const dataDir = env.dataDir.startsWith("~")
  ? join(homedir(), env.dataDir.slice(2))
  : env.dataDir;
const store = new TicketStore({
  dbPath: join(dataDir, "tickets.db"),
  eventDir: join(dataDir, "events"),
});
const app = createGateway({
  store,
  telegramSecretToken: env.telegramSecretToken,
  githubWebhookSecret: env.githubWebhookSecret,
  telegramAllowedUserIds: new Set(env.telegramAllowedUserIds),
});
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const url = `http://${request.headers.host ?? "127.0.0.1"}${request.url ?? "/"}`;
  const init: RequestInit = {
    method: request.method ?? "GET",
    headers: request.headers as HeadersInit,
  };
  if (
    chunks.length > 0 &&
    request.method !== "GET" &&
    request.method !== "HEAD"
  )
    init.body = Buffer.concat(chunks);
  const result = await app.fetch(new Request(url, init));
  response.statusCode = result.status;
  result.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(Buffer.from(await result.arrayBuffer()));
}).listen(port, host, () =>
  console.log(`JACK-K gateway listening on ${host}:${port}`),
);
