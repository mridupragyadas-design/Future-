import "dotenv/config";

export const BOT_TOKEN = process.env.BOT_TOKEN || "";
export const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);
export const DB_PATH = process.env.DB_PATH || "./data/escrow.db";
export const FEE_PERCENT = 3;
export const GROUP_CHAT_ID = Number(process.env.GROUP_CHAT_ID || "-1003158424354");
export const PAYMENT_REMINDER_MINUTES = 10;

// The single group where "payment not received" notices get posted. Defaults
// to the EXPERIMENTAL GROUP id but can be overridden via env without a code change.
export const GROUP_CHAT_ID = Number(process.env.GROUP_CHAT_ID || "-1003158424354");

// How long a payer gets to tap "I've Paid" before the bot sends them a reminder.
export const PAYMENT_REMINDER_MINUTES = 10;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing. Set it in your .env file or Render environment variables.");
}

if (ADMIN_IDS.length === 0) {
  console.warn("[warn] No ADMIN_IDS configured. No one will be able to act as an escrow admin.");
}
