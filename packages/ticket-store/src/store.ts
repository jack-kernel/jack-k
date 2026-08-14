import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { canTransition } from "@jack-k/core";
import type { AuthorityLevel, Ticket, TicketState } from "@jack-k/core";

export type StoreEvent =
  | { type: "ticket_created"; ticket: Ticket }
  | { type: "ticket_transitioned"; ticketId: string; from: TicketState; to: TicketState; reason?: string }
  | { type: "approval_recorded"; ticketId: string; action: string; actor: string }
  | { type: "authority_assertion"; ticketId: string; operation: string; required: number; actual: number; allowed: boolean }
  | { type: "claim_acquired"; ticketId: string; repo: string }
  | { type: "claim_released"; ticketId: string; repo: string };

export interface StoredEvent {
  offset: number;
  at: string;
  event: StoreEvent;
  filePath: string;
}

export interface TicketStoreOptions {
  dbPath: string;
  eventDir: string;
}

interface TicketRow {
  id: string;
  repo: string;
  description: string;
  source: Ticket["source"];
  source_id: string | null;
  state: TicketState;
  authority: number;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
}

const now = (): string => new Date().toISOString();

export class TicketStore {
  private readonly db: Database.Database;
  private readonly eventDir: string;

  public constructor(options: TicketStoreOptions) {
    this.eventDir = options.eventDir;
    mkdirSync(this.eventDir, { recursive: true });
    this.db = new Database(options.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        repo TEXT NOT NULL,
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        source_id TEXT,
        state TEXT NOT NULL,
        authority INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        claimed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        executor TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        transcript TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS approvals (
        ticket_id TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        PRIMARY KEY (ticket_id, action)
      );
    `);
  }

  public createTicket(input: Omit<Ticket, "state" | "createdAt" | "updatedAt"> & Partial<Pick<Ticket, "state" | "createdAt" | "updatedAt">>): Ticket {
    const createdAt = input.createdAt ?? now();
    const ticket: Ticket = {
      ...input,
      state: input.state ?? "received",
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
    };
    this.append({ type: "ticket_created", ticket });
    this.projectTicket(ticket);
    return ticket;
  }

  public transition(ticketId: string, to: TicketState, reason?: string): Ticket {
    const current = this.getTicket(ticketId);
    if (!current) throw new Error(`Ticket not found: ${ticketId}`);
    if (!canTransition(current.state, to)) {
      throw new Error(`Illegal ticket transition: ${current.state} -> ${to}`);
    }
    this.append({ type: "ticket_transitioned", ticketId, from: current.state, to, ...(reason ? { reason } : {}) });
    const updated: Ticket = { ...current, state: to, updatedAt: now() };
    this.projectTicket(updated);
    return updated;
  }

  public append(event: StoreEvent): StoredEvent {
    const at = now();
    const filePath = join(this.eventDir, `${at.slice(0, 10)}.jsonl`);
    const line = `${JSON.stringify({ at, event })}\n`;
    const fd = openSync(filePath, "a");
    try {
      appendFileSync(fd, line, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const offset = this.streamEvents(0).length;
    return { offset, at, event, filePath };
  }

  public getTicket(ticketId: string): Ticket | undefined {
    const row = this.db.prepare("SELECT * FROM tickets WHERE id = ?").get(ticketId) as TicketRow | undefined;
    return row ? this.toTicket(row) : undefined;
  }

  public listTickets(filter?: { state?: TicketState; repo?: string }): Ticket[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter?.state) { clauses.push("state = ?"); values.push(filter.state); }
    if (filter?.repo) { clauses.push("repo = ?"); values.push(filter.repo); }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM tickets${where} ORDER BY created_at ASC`).all(...values) as TicketRow[];
    return rows.map((row) => this.toTicket(row));
  }

  public streamEvents(sinceOffset = 0): StoredEvent[] {
    const paths = readdirSync(this.eventDir).filter((file) => file.endsWith(".jsonl")).sort().map((file) => join(this.eventDir, file));
    const events: StoredEvent[] = [];
    for (const filePath of paths) {
      const content = readFileSync(filePath, "utf8");
      for (const line of content.split("\n").filter(Boolean)) {
        const parsed = JSON.parse(line) as { at: string; event: StoreEvent };
        events.push({ offset: events.length, at: parsed.at, event: parsed.event, filePath });
      }
    }
    return events.slice(sinceOffset);
  }

  public rebuild(): void {
    const events = this.streamEvents(0);
    const rebuild = this.db.transaction(() => {
      this.db.prepare("DELETE FROM tickets").run();
      this.db.prepare("DELETE FROM approvals").run();
      for (const { event } of events) {
        if (event.type === "ticket_created") this.projectTicket(event.ticket);
        if (event.type === "ticket_transitioned") {
          const ticket = this.getTicket(event.ticketId);
          if (ticket) this.projectTicket({ ...ticket, state: event.to, updatedAt: now() });
        }
        if (event.type === "approval_recorded") {
          this.db.prepare("INSERT OR REPLACE INTO approvals(ticket_id, action, actor, approved_at) VALUES (?, ?, ?, ?)").run(event.ticketId, event.action, event.actor, now());
        }
      }
    });
    rebuild();
  }

  public claim(ticketId: string): boolean {
    const claimedAt = now();
    const claim = this.db.transaction(() => {
      const ticket = this.getTicket(ticketId);
      if (!ticket) return false;
      const result = this.db.prepare("UPDATE tickets SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL AND NOT EXISTS (SELECT 1 FROM tickets WHERE repo = ? AND claimed_at IS NOT NULL)").run(claimedAt, ticketId, ticket.repo);
      if (result.changes === 0) return false;
      this.append({ type: "claim_acquired", ticketId, repo: ticket.repo });
      return true;
    });
    return claim();
  }

  public release(ticketId: string): void {
    const ticket = this.getTicket(ticketId);
    if (!ticket) return;
    this.db.prepare("UPDATE tickets SET claimed_at = NULL WHERE id = ?").run(ticketId);
    this.append({ type: "claim_released", ticketId, repo: ticket.repo });
  }

  public recordApproval(ticketId: string, action: string, actor: string): void {
    this.db.prepare("INSERT OR REPLACE INTO approvals(ticket_id, action, actor, approved_at) VALUES (?, ?, ?, ?)").run(ticketId, action, actor, now());
    this.append({ type: "approval_recorded", ticketId, action, actor });
  }

  public hasApproval(ticketId: string, action: string): boolean {
    const row = this.db.prepare("SELECT 1 AS present FROM approvals WHERE ticket_id = ? AND action = ?").get(ticketId, action) as { present: number } | undefined;
    return row?.present === 1;
  }

  public close(): void { this.db.close(); }

  private projectTicket(ticket: Ticket): void {
    this.db.prepare(`INSERT INTO tickets(id, repo, description, source, source_id, state, authority, created_at, updated_at)
      VALUES (@id, @repo, @description, @source, @sourceId, @state, @authority, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET repo=@repo, description=@description, source=@source, source_id=@sourceId,
      state=@state, authority=@authority, created_at=@createdAt, updated_at=@updatedAt`).run({
      id: ticket.id, repo: ticket.repo, description: ticket.description, source: ticket.source,
      sourceId: ticket.sourceId ?? null, state: ticket.state, authority: ticket.authority,
      createdAt: ticket.createdAt, updatedAt: ticket.updatedAt,
    });
  }

  private toTicket(row: TicketRow): Ticket {
    return {
      id: row.id,
      repo: row.repo,
      description: row.description,
      source: row.source,
      ...(row.source_id ? { sourceId: row.source_id } : {}),
      state: row.state,
      authority: row.authority as AuthorityLevel,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
