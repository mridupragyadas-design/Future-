export type TradeStatus =
  | "PENDING"    // created, waiting for admin/parties to confirm funding
  | "FUNDED"     // buyer has marked payment as sent, awaiting admin verification
  | "RELEASED"   // admin released funds/crypto to seller
  | "REFUNDED"   // admin refunded buyer
  | "CANCELLED"  // trade cancelled before completion
  | "DISPUTED";  // flagged for admin review

export type CurrencySide = "INR" | "CRYPTO";

export interface Trade {
  id: string;               // human-friendly trade id, e.g. ESC-A1B2C3
  buyerId: number;          // telegram user id
  buyerUsername: string | null;
  sellerId: number;
  sellerUsername: string | null;
  amount: number;           // amount of the item being escrowed (see currency)
  currency: string;         // e.g. "INR", "USDT", "BTC"
  network: string | null;   // e.g. "TRC20", "ERC20" - null for INR
  feePercent: number;       // fee percent snapshotted at creation time
  feeAmount: number;        // computed fee in `currency` units
  netAmount: number;        // amount seller receives after fee
  status: TradeStatus;
  createdBy: number;        // telegram user id who created the trade
  createdAt: string;        // ISO timestamp
  updatedAt: string;        // ISO timestamp
  resolvedBy: number | null; // admin id who released/refunded/cancelled
  notes: string | null;
}

export interface PendingTradeDraft {
  step: "counterparty" | "role" | "amount" | "currency" | "network" | "confirm";
  creatorId: number;
  counterpartyUsername?: string;
  counterpartyId?: number;
  creatorRole?: "buyer" | "seller";
  amount?: number;
  currency?: string;
  network?: string;
}
