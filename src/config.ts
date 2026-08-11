import * as dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

export const config = {
  botToken: required("BOT_TOKEN"),
  adminIds: (process.env.ADMIN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number),
  feePercent: Number(process.env.FEE_PERCENT || "3"),
  dbPath: process.env.DB_PATH || "./escrow.db",
};

export function isAdmin(userId: number): boolean {
  return config.adminIds.includes(userId);
}
