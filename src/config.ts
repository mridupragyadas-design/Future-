import "dotenv/config";

export const BOT_TOKEN = process.env.BOT_TOKEN || "";
export const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);
export const DB_PATH = process.env.DB_PATH || "./data/escrow.db";
export const FEE_PERCENT = 3;

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is missing. Set it in your .env file or Render environment variables.");
}

if (ADMIN_IDS.length === 0) {
  console.warn("[warn] No ADMIN_IDS configured. No one will be able to act as an escrow admin.");
}
