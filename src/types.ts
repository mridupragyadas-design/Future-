export type Currency = "INR" | "CRYPTO";

export type TradeStatus = "PENDING" | "PAID" | "RELEASED" | "REFUNDED" | "CANCELLED";

export interface Trade {
  id: string;
  dealInfo: string;
  buyerUsername: string;
  buyerId: number | null;
  sellerUsername: string;
  sellerId: number | null;
  amount: number;
  currency: Currency;
  duration: string;
  escrowUntil: string;
  releaseCondition: string | null;
  cryptoAddress: string | null;
  adminId: number;
  adminUsername: string;
  feePercent: number;
  feeAmount: number;
  sellerReceives: number;
  status: TradeStatus;
  createdAt: string;
  initiatorId: number;
}

export interface AdminInfo {
  telegramId: number;
  username: string | null;
  cryptoAddress: string | null;
  qrFileId: string | null;
}

export type WizardStep =
  | "AWAIT_OTHER_PARTY"
  | "AWAIT_ROLE"
  | "AWAIT_DEAL_INFO"
  | "AWAIT_AMOUNT"
  | "AWAIT_DURATION"
  | "AWAIT_RELEASE_CONDITION"
  | "AWAIT_CURRENCY"
  | "AWAIT_CRYPTO_ADDRESS"
  | "AWAIT_ADMIN_SELECT";

export interface WizardState {
  step: WizardStep;
  initiatorId: number;
  initiatorUsername: string;
  otherPartyUsername?: string;
  otherPartyId?: number | null;
  initiatorRole?: "buyer" | "seller";
  dealInfo?: string;
  amount?: number;
  duration?: string;
  escrowUntil?: string;
  releaseCondition?: string | null;
  currency?: Currency;
  cryptoAddress?: string | null;
}
