import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { DB_PATH } from "./config";
import { AdminInfo, Trade } from "./types";

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  first_seen TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  crypto_address TEXT,
  qr_file_id TEXT
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  deal_info TEXT,
  buyer_username TEXT,
  buyer_id INTEGER,
  seller_username TEXT,
  seller_id INTEGER,
  amount REAL,
  currency TEXT,
  duration TEXT,
  escrow_until TEXT,
  release_condition TEXT,
  crypto_address TEXT,
  admin_id INTEGER,
  admin_username TEXT,
  fee_percent REAL,
  fee_amount REAL,
  seller_receives REAL,
  status TEXT,
  created_at TEXT,
  initiator_id INTEGER
);
`);

// ---------- users ----------

export function upsertUser(telegramId: number, username: string | undefined) {
  const existing = db.prepare("SELECT telegram_id FROM users WHERE telegram_id = ?").get(telegramId);
  if (existing) {
    db.prepare("UPDATE users SET username = ? WHERE telegram_id = ?").run(username || null, telegramId);
  } else {
    db.prepare("INSERT INTO users (telegram_id, username, first_seen) VALUES (?, ?, ?)").run(
      telegramId,
      username || null,
      new Date().toISOString()
    );
  }
}

export function findUserByUsername(username: string): number | null {
  const clean = username.replace(/^@/, "").toLowerCase();
  const row = db
    .prepare("SELECT telegram_id FROM users WHERE lower(username) = ?")
    .get(clean) as { telegram_id: number } | undefined;
  return row ? row.telegram_id : null;
}

// ---------- admins ----------

export function isAdminId(telegramId: number, configuredAdminIds: number[]): boolean {
  return configuredAdminIds.includes(telegramId);
}

export function ensureAdminRow(telegramId: number, username: string | undefined) {
  const existing = db.prepare("SELECT telegram_id FROM admins WHERE telegram_id = ?").get(telegramId);
  if (!existing) {
    db.prepare("INSERT INTO admins (telegram_id, username, crypto_address, qr_file_id) VALUES (?, ?, NULL, NULL)").run(
      telegramId,
      username || null
    );
  } else if (username) {
    db.prepare("UPDATE admins SET username = ? WHERE telegram_id = ?").run(username, telegramId);
  }
}

export function setAdminCrypto(telegramId: number, address: string) {
  db.prepare("UPDATE admins SET crypto_address = ? WHERE telegram_id = ?").run(address, telegramId);
}

export function setAdminQr(telegramId: number, fileId: string) {
  db.prepare("UPDATE admins SET qr_file_id = ? WHERE telegram_id = ?").run(fileId, telegramId);
}

export function getAdmin(telegramId: number): AdminInfo | null {
  const row = db.prepare("SELECT * FROM admins WHERE telegram_id = ?").get(telegramId) as any;
  if (!row) return null;
  return {
    telegramId: row.telegram_id,
    username: row.username,
    cryptoAddress: row.crypto_address,
    qrFileId: row.qr_file_id,
  };
}

export function listAdmins(): AdminInfo[] {
  const rows = db.prepare("SELECT * FROM admins").all() as any[];
  return rows.map((row) => ({
    telegramId: row.telegram_id,
    username: row.username,
    cryptoAddress: row.crypto_address,
    qrFileId: row.qr_file_id,
  }));
}

// ---------- trades ----------

export function createTrade(trade: Trade) {
  db.prepare(
    `INSERT INTO trades (
      id, deal_info, buyer_username, buyer_id, seller_username, seller_id,
      amount, currency, duration, escrow_until, release_condition, crypto_address,
      admin_id, admin_username, fee_percent, fee_amount, seller_receives,
      status, created_at, initiator_id
    ) VALUES (@id, @dealInfo, @buyerUsername, @buyerId, @sellerUsername, @sellerId,
      @amount, @currency, @duration, @escrowUntil, @releaseCondition, @cryptoAddress,
      @adminId, @adminUsername, @feePercent, @feeAmount, @sellerReceives,
      @status, @createdAt, @initiatorId)`
  ).run(trade as any);
}

export function getTrade(id: string): Trade | null {
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(id) as any;
  if (!row) return null;
  return rowToTrade(row);
}

export function updateTradeStatus(id: string, status: string) {
  db.prepare("UPDATE trades SET status = ? WHERE id = ?").run(status, id);
}

function rowToTrade(row: any): Trade {
  return {
    id: row.id,
    dealInfo: row.deal_info,
    buyerUsername: row.buyer_username,
    buyerId: row.buyer_id,
    sellerUsername: row.seller_username,
    sellerId: row.seller_id,
    amount: row.amount,
    currency: row.currency,
    duration: row.duration,
    escrowUntil: row.escrow_until,
    releaseCondition: row.release_condition,
    cryptoAddress: row.crypto_address,
    adminId: row.admin_id,
    adminUsername: row.admin_username,
    feePercent: row.fee_percent,
    feeAmount: row.fee_amount,
    sellerReceives: row.seller_receives,
    status: row.status,
    createdAt: row.created_at,
    initiatorId: row.initiator_id,
  };
}
