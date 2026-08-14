import { Telegraf, Markup, Telegram } from "telegraf";
import { ADMIN_IDS, GROUP_CHAT_ID, PAYMENT_REMINDER_MINUTES } from "../config";
import { getTrade, isAdminId, updateTradeStatus } from "../db";

// In-memory reminder timers, keyed by trade ID. Same "resets on restart, fine
// for an MVP" tradeoff as the wizard state in state.ts.
const reminderTimers = new Map<string, NodeJS.Timeout>();

export function paidButton(tradeId: string) {
  return Markup.inlineKeyboard([[Markup.button.callback("✅ I've Paid", `paid_${tradeId}`)]]);
}

function clearPaymentReminder(tradeId: string) {
  const existing = reminderTimers.get(tradeId);
  if (existing) {
    clearTimeout(existing);
    reminderTimers.delete(tradeId);
  }
}

// Called right after a trade's payment info (QR/crypto address) is sent.
// If the payer hasn't tapped "I've Paid" within the window, nudge them.
export function schedulePaymentReminder(telegram: Telegram, tradeId: string, payerId: number) {
  clearPaymentReminder(tradeId);
  const timer = setTimeout(async () => {
    reminderTimers.delete(tradeId);
    const trade = getTrade(tradeId);
    if (!trade || trade.status !== "PENDING") return; // already progressed, nothing to remind
    try {
      await telegram.sendMessage(
        payerId,
        `⏰ It's been ${PAYMENT_REMINDER_MINUTES} minutes on trade ${tradeId}. If you've already sent the payment, tap "I've Paid" below. If not, please complete it and then tap it.`,
        paidButton(tradeId)
      );
    } catch {
      // payer may have blocked the bot -- non-fatal
    }
  }, PAYMENT_REMINDER_MINUTES * 60 * 1000);
  reminderTimers.set(tradeId, timer);
}

export function registerPaymentFlow(bot: Telegraf) {
  // Payer taps "I've Paid" -- ask the admin to confirm receipt.
  bot.action(/^paid_(.+)$/, async (ctx) => {
    const tradeId = ctx.match[1];
    const trade = getTrade(tradeId);
    if (!trade) {
      await ctx.answerCbQuery("Trade not found.");
      return;
    }
    const payerId = ctx.from!.id;
    if (payerId !== trade.buyerId && payerId !== trade.sellerId) {
      await ctx.answerCbQuery("This isn't your trade.");
      return;
    }
    if (trade.status !== "PENDING") {
      await ctx.answerCbQuery(`Trade already ${trade.status}.`);
      return;
    }

    clearPaymentReminder(tradeId);
    await ctx.answerCbQuery("Noted!");
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
    await ctx.reply(
      `Got it -- I've let the admin know you sent the payment for ${tradeId}. Waiting on their confirmation.`
    );

    try {
      await ctx.telegram.sendMessage(
        trade.adminId,
        `💰 Payment claim for trade ${trade.id}\n\nAmount: ${trade.amount} ${trade.currency}\nBuyer: @${trade.buyerUsername}\nSeller: @${trade.sellerUsername}\n\nDid you receive the payment?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Yes, received", `paidyes_${trade.id}`)],
          [Markup.button.callback("❌ No, not yet", `paidno_${trade.id}`)],
        ])
      );
    } catch {
      // admin may have blocked the bot -- non-fatal
    }
  });

  // Admin confirms payment was received.
  bot.action(/^paidyes_(.+)$/, async (ctx) => {
    const tradeId = ctx.match[1];
    const adminId = ctx.from!.id;
    if (!isAdminId(adminId, ADMIN_IDS)) {
      await ctx.answerCbQuery("Only admins can do this.");
      return;
    }
    const trade = getTrade(tradeId);
    if (!trade) {
      await ctx.answerCbQuery("Trade not found.");
      return;
    }
    if (trade.adminId !== adminId) {
      await ctx.answerCbQuery("This trade is assigned to a different admin.");
      return;
    }
    if (trade.status !== "PENDING") {
      await ctx.answerCbQuery(`Trade already ${trade.status}.`);
      return;
    }

    updateTradeStatus(tradeId, "PAID");
    await ctx.answerCbQuery("Marked as paid.");
    await ctx.editMessageText(`✅ Payment confirmed received for trade ${tradeId}. Use your Release/Refund/Cancel buttons on the trade message when ready.`);

    const notify = async (userId: number | null) => {
      if (!userId) return;
      try {
        await ctx.telegram.sendMessage(
          userId,
          `✅ Your admin confirmed payment received for trade ${tradeId}. They'll release, refund, or cancel it shortly.`
        );
      } catch {
        // user may have blocked the bot -- non-fatal
      }
    };
    await notify(trade.buyerId);
    await notify(trade.sellerId);
  });

  // Admin says payment was NOT received.
  bot.action(/^paidno_(.+)$/, async (ctx) => {
    const tradeId = ctx.match[1];
    const adminId = ctx.from!.id;
    if (!isAdminId(adminId, ADMIN_IDS)) {
      await ctx.answerCbQuery("Only admins can do this.");
      return;
    }
    const trade = getTrade(tradeId);
    if (!trade) {
      await ctx.answerCbQuery("Trade not found.");
      return;
    }
    if (trade.adminId !== adminId) {
      await ctx.answerCbQuery("This trade is assigned to a different admin.");
      return;
    }
    if (trade.status !== "PENDING") {
      await ctx.answerCbQuery(`Trade already ${trade.status}.`);
      return;
    }

    await ctx.answerCbQuery("Marked as not received.");
    await ctx.editMessageText(`❌ Payment not confirmed for trade ${tradeId}.`);

    try {
      await ctx.telegram.sendMessage(
        GROUP_CHAT_ID,
        `❌ Payment not received for trade ${tradeId} (@${trade.buyerUsername} ↔ @${trade.sellerUsername}). Please try again.`
      );
    } catch {
      // bot may not be in the group, or lacks permission to post -- non-fatal
    }

    // Let the payer retry -- trade stays PENDING so the same "I've Paid" flow works again.
    const payerId = trade.initiatorId;
    try {
      await ctx.telegram.sendMessage(
        payerId,
        `❌ Your admin says the payment for trade ${tradeId} hasn't come through yet. Please double-check and try again, then tap "I've Paid" once more.`,
        paidButton(tradeId)
      );
    } catch {
      // payer may have blocked the bot -- non-fatal
    }
  });
}
