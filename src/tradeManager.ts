import { customAlphabet } from "nanoid";
import { Trade } from "./types";
import { config } from "./config";
import { insertTrade } from "./db";

// Unambiguous alphabet (no 0/O/1/I) for trade IDs read aloud/typed by users
const genId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export function generateTradeId(): string {
  return `ESC-${genId()}`;
}

export function calculateFee(
  amount: number,
  feePercent: number
): { feeAmount: number; netAmount: number } {
  const feeAmount = Math.round(amount * (feePercent / 100) * 100) / 100;
  const netAmount = Math.round((amount - feeAmount) * 100) / 100;
  return { feeAmount, netAmount };
}

export function createTrade(params: {
  buyerId: number;
  buyerUsername: string | null;
  sellerId: number;
  sellerUsername: string | null;
  amount: number;
  currency: string;
  network: string | null;
  createdBy: number;
}): Trade {
  const { feeAmount, netAmount } = calculateFee(
    params.amount,
    config.feePercent
  );
  const now = new Date().toISOString();

  const trade: Trade = {
    id: generateTradeId(),
    buyerId: params.buyerId,
    buyerUsername: params.buyerUsername,
    sellerId: params.sellerId,
    sellerUsername: params.sellerUsername,
    amount: params.amount,
    currency: params.currency,
    network: params.network,
    feePercent: config.feePercent,
    feeAmount,
    netAmount,
    status: "PENDING",
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
    resolvedBy: null,
    notes: null,
  };

  insertTrade(trade);
  return trade;
}

export function formatTrade(trade: Trade): string {
  const networkLine = trade.network ? ` (${trade.network})` : "";
  return [
    `🧾 *Trade ${trade.id}*`,
    `Status: *${trade.status}*`,
    `Buyer: ${trade.buyerUsername ? "@" + trade.buyerUsername : trade.buyerId}`,
    `Seller: ${trade.sellerUsername ? "@" + trade.sellerUsername : trade.sellerId}`,
    `Amount: ${trade.amount} ${trade.currency}${networkLine}`,
    `Fee (${trade.feePercent}%): ${trade.feeAmount} ${trade.currency}`,
    `Seller receives: ${trade.netAmount} ${trade.currency}`,
    `Created: ${new Date(trade.createdAt).toLocaleString()}`,
  ].join("\n");
}
