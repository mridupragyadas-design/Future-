import Database from "better-sqlite3";
import { config } from "./config";
import { Trade, TradeStatus } from "./types";

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    buyerId INTEGER NOT NULL,
    buyerUsername TEXT,
    sellerId INTEGER NOT NULL,
    sellerUsername TEXT,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    network TEXT,
    feePercent REAL NOT NULL,
    feeAmount REAL NOT NULL,
    netAmount REAL NOT NULL,
    status TEXT NOT NULL,
    createdBy INTEGER NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    resolvedBy INTEGER,
    notes TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyerId);
  CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(sellerId);
  CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);
`);

export function insertTrade(trade: Trade): void {
  db.prepare(
    `INSERT INTO trades (
      id, buyerId, buyerUsername, sellerId, sellerUsername,
      amount, currency, network, feePercent, feeAmount, netAmount,
      status, createdBy, createdAt, updatedAt, resolvedBy, notes
    ) VALUES (
      @id, @buyerId, @buyerUsername, @sellerId, @sellerUsername,
      @amount, @currency, @network, @feePercent, @feeAmount, @netAmount,
      @status, @createdBy, @createdAt, @updatedAt, @resolvedBy, @notes
    )`
  ).run(trade);
}

export function getTrade(id: string): Trade | undefined {
  return db.prepare(`SELECT * FROM trades WHERE id = ?`).get(id) as
    | Trade
    | undefined;
}

export function updateTradeStatus(
  id: string,
  status: TradeStatus,
  resolvedBy: number | null,
  notes?: string
): void {
  db.prepare(
    `UPDATE trades SET status = ?, resolvedBy = ?, updatedAt = ?, notes = COALESCE(?, notes) WHERE id = ?`
  ).run(status, resolvedBy, new Date().toISOString(), notes ?? null, id);
}

export function getTradesForUser(userId: number): Trade[] {
  return db
    .prepare(
      `SELECT * FROM trades WHERE buyerId = ? OR sellerId = ? ORDER BY createdAt DESC LIMIT 20`
    )
    .all(userId, userId) as Trade[];
}

export function getOpenTrades(): Trade[] {
  return db
    .prepare(
      `SELECT * FROM trades WHERE status IN ('PENDING','FUNDED','DISPUTED') ORDER BY createdAt ASC`
    )
    .all() as Trade[];
}

export default db;
