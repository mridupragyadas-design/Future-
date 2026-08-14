import { Trade } from "./types";

export function welcomeFormTemplate(): string {
  return `Welcome to the escrow bot 👋

𝙈𝙍𝙄𝙓𝘿𝙐 𝙀𝙎𝘾𝙍𝙊𝙒 𝙂𝙍𝙊𝙐𝙋🔐

𝘿𝙚𝙖𝙡 𝘿𝙚𝙩𝙖𝙞𝙡𝙨
• Deal Info: 
• Buyer: 
• Seller:  
• Amount:  
• Duration: 
• Escrow Until:  
• Releasee Condition: (Optional) after codes completed 

𝙀𝙓𝙏𝙍𝘼
CRYPTO ADDRESS : (Optional)

⚠️ 𝙎𝙚𝙘𝙪𝙧𝙞𝙩𝙮 𝙉𝙤𝙩𝙞𝙘𝙚
Admins will NEVER DM you for payment.Verify via /adminlist before proceeding.`;
}

export function startTradePrompt(): string {
  return `Let's set up a new trade.

Send the Telegram @username of the other party (they must have messaged this bot at least once).`;
}

function formatMoney(amount: number, currency: "INR" | "CRYPTO"): string {
  if (currency === "INR") return `₹${amount.toLocaleString("en-IN")}`;
  return `${amount}`;
}

export function tradeCreatedTemplate(trade: Trade): string {
  const created = new Date(trade.createdAt);
  const createdStr = created.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return `✅ Trade created!

🧾 Trade ${trade.id}
Status: ${trade.status}
Buyer: @${trade.buyerUsername}
Seller: @${trade.sellerUsername}
Amount: ${formatMoney(trade.amount, trade.currency)}
Fee (${trade.feePercent}%): ${formatMoney(trade.feeAmount, trade.currency)}
Seller receives: ${formatMoney(trade.sellerReceives, trade.currency)}
Created: ${createdStr}

Share ID ${trade.id} with the other party. Once your admin verifies payment, they'll release, refund, or cancel it.`;
}

export function tradeStatusTemplate(trade: Trade): string {
  return `🧾 Trade ${trade.id}
Status: ${trade.status}
Buyer: @${trade.buyerUsername}
Seller: @${trade.sellerUsername}
Amount: ${formatMoney(trade.amount, trade.currency)}
Fee (${trade.feePercent}%): ${formatMoney(trade.feeAmount, trade.currency)}
Seller receives: ${formatMoney(trade.sellerReceives, trade.currency)}
Admin: @${trade.adminUsername}`;
}
