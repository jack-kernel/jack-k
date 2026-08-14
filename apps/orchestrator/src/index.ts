import { homedir } from "node:os";
import { join } from "node:path";
import { parseEnv, loadRepos } from "@jack-k/config";
import { executorFor } from "@jack-k/executors";
import { GitWorker } from "@jack-k/git-worker";
import { createTelegramNotifier } from "@jack-k/telegram";
import { TicketStore } from "@jack-k/ticket-store";
import { Supervisor } from "./supervisor.js";

const env = parseEnv(process.env);
const dataDir = env.dataDir.startsWith("~") ? join(homedir(), env.dataDir.slice(2)) : env.dataDir;
const repos = loadRepos(env.reposFile);
const store = new TicketStore({ dbPath: join(dataDir, "tickets.db"), eventDir: join(dataDir, "events") });
const gitWorker = new GitWorker(store, repos, dataDir);
const telegramNotify = createTelegramNotifier({ token: env.telegramBotToken, store });
const supervisor = new Supervisor({
  store,
  repos,
  gitWorker,
  executor: executorFor,
  mode: process.env.FORGE_MODE === "draft-pr" ? "draft-pr" : "analysis",
  notify: async (ticketId, message) => {
    console.log(`[${ticketId}] ${message}`);
    await telegramNotify(ticketId, message);
  },
});

await supervisor.recoverOnBoot();
const tick = async (): Promise<void> => {
  await supervisor.pollOnce();
  await supervisor.processApprovals();
};
await tick();
const timer = setInterval(() => { void tick(); }, 5_000);
timer.unref();
