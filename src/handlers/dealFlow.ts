import { Telegraf, Markup, Context } from "telegraf";
import { ADMIN_IDS, FEE_PERCENT } from "../config";
import { clearWizardState, getWizardState, setWizardState } from "../state";
import { findUserByUsername, listAdmins, createTrade } from "../db";
import { generateTradeId } from "../id";
import { startTradePrompt, tradeCreatedTemplate, welcomeFormTemplate } from "../templates";
import { Currency, Trade, WizardState } from "../types";
import { paidButton, schedulePaymentReminder } from "./paymentFlow";

const TRIGGER_WORDS = new Set(["form", "/form", "dd", "deal", "/deal"]);

// The whole wizard is a DM-only experience (per README). Without this guard,
// a user with an active DM wizard session gets the wizard's prompts echoed
// into any group they type in too, since state is keyed by user ID only.
function isPrivateChat(ctx: Context): boolean {
  return ctx.chat?.type === "private";
}

function resolveUsername(input: string, ctx: Context): string {
  const trimmed = input.trim();
  if (trimmed.toLowerCase() === "me") {
    const from = ctx.from;
    return from?.username ? from.username : `id${from?.id}`;
  }
  return trimmed.replace(/^@/, "");
}

export function registerDealFlow(bot: Telegraf) {
  // Entry point: trigger words start the wizard. DM-only -- see isPrivateChat.
  bot.hears(/^(form|\/form|dd|deal|\/deal)$/i, async (ctx) => {
    if (!isPrivateChat(ctx)) return;
    const userId = ctx.from.id;
    await ctx.reply(welcomeFormTemplate());

    const state: WizardState = {
      step: "AWAIT_OTHER_PARTY",
      initiatorId: userId,
      initiatorUsername: ctx.from.username || `id${userId}`,
    };
    setWizardState(userId, state);

    await ctx.reply(startTradePrompt());
  });

  bot.command("cancel", async (ctx) => {
    if (!isPrivateChat(ctx)) return;
    if (getWizardState(ctx.from.id)) {
      clearWizardState(ctx.from.id);
      await ctx.reply("Trade setup cancelled.");
    } else {
      await ctx.reply("No trade setup in progress.");
    }
  });

  // Main wizard text handler. Runs for any text message; ignores users with no active state.
  // DM-only -- otherwise a user's in-progress DM wizard leaks its prompts into
  // whichever group they happen to type in next (see isPrivateChat).
  bot.on("text", async (ctx, next) => {
    if (!isPrivateChat(ctx)) return next();
    const userId = ctx.from.id;
    const state = getWizardState(userId);
    if (!state) return next();

    const text = ctx.message.text.trim();

    switch (state.step) {
      case "AWAIT_OTHER_PARTY": {
        const otherUsername = resolveUsername(text, ctx);
        if (!/^[a-zA-Z0-9_]{5,32}$/.test(otherUsername)) {
          await ctx.reply(
            "That doesn't look like a Telegram username. Send it like @username (5-32 letters, numbers, or underscores), or type 'me' if you're the other party."
          );
          return;
        }
        if (otherUsername.toLowerCase() === state.initiatorUsername.toLowerCase()) {
          await ctx.reply("The other party has to be someone different from you. Send their @username.");
          return;
        }
        const otherId = findUserByUsername(otherUsername);
        if (!otherId) {
          await ctx.reply(
            `I haven't seen @${otherUsername} message this bot yet. Ask them to send /start to this bot first, then send their @username again.`
          );
          return;
        }
        state.otherPartyUsername = otherUsername;
        state.otherPartyId = otherId;
        state.step = "AWAIT_ROLE";
        setWizardState(userId, state);
        await ctx.reply(
          "Are you the buyer or the seller in this deal?",
          Markup.inlineKeyboard([
            Markup.button.callback("I'm the Buyer", "role_buyer"),
            Markup.button.callback("I'm the Seller", "role_seller"),
          ])
        );
        return;
      }

      case "AWAIT_DEAL_INFO": {
        state.dealInfo = text;
        state.step = "AWAIT_AMOUNT";
        setWizardState(userId, state);
        await ctx.reply("What's the deal amount? (numbers only, e.g. 5000)");
        return;
      }

      case "AWAIT_AMOUNT": {
        const amount = Number(text.replace(/[,₹]/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) {
          await ctx.reply("That doesn't look like a valid amount. Send a number, e.g. 5000");
          return;
        }
        state.amount = amount;
        state.step = "AWAIT_DURATION";
        setWizardState(userId, state);
        await ctx.reply("How long should escrow hold funds for? (e.g. '2 days', '24 hours')");
        return;
      }

      case "AWAIT_DURATION": {
        state.duration = text;
        state.step = "AWAIT_RELEASE_CONDITION";
        setWizardState(userId, state);
        await ctx.reply("Any release condition? (optional -- type 'skip' to leave blank)");
        return;
      }

      case "AWAIT_RELEASE_CONDITION": {
        state.releaseCondition = text.toLowerCase() === "skip" ? null : text;
        state.step = "AWAIT_CURRENCY";
        setWizardState(userId, state);
        await ctx.reply(
          "Which currency is this deal in?",
          Markup.inlineKeyboard([
            Markup.button.callback("INR", "currency_inr"),
            Markup.button.callback("Crypto", "currency_crypto"),
          ])
        );
        return;
      }

      case "AWAIT_CRYPTO_ADDRESS": {
        state.cryptoAddress = text.toLowerCase() === "skip" ? null : text;
        await promptAdminSelect(ctx, state);
        return;
      }

      default:
        return next();
    }
  });

  // Role selection
  bot.action(/^role_(buyer|seller)$/, async (ctx) => {
    const userId = ctx.from!.id;
    const state = getWizardState(userId);
    if (!state) return ctx.answerCbQuery("No active trade setup. Send /form to start again.");

    state.initiatorRole = ctx.match[1] as "buyer" | "seller";
    state.step = "AWAIT_DEAL_INFO";
    setWizardState(userId, state);

    await ctx.answerCbQuery();
    await ctx.editMessageText(`Got it -- you're the ${state.initiatorRole}.`);
    await ctx.reply("Describe the deal (what's being exchanged):");
  });

  // Currency selection
  bot.action(/^currency_(inr|crypto)$/, async (ctx) => {
    const userId = ctx.from!.id;
    const state = getWizardState(userId);
    if (!state) return ctx.answerCbQuery("No active trade setup. Send /form to start again.");

    const currency: Currency = ctx.match[1] === "inr" ? "INR" : "CRYPTO";
    state.currency = currency;
    await ctx.answerCbQuery();
    await ctx.editMessageText(`Currency: ${currency}`);

    if (currency === "CRYPTO") {
      state.step = "AWAIT_CRYPTO_ADDRESS";
      setWizardState(userId, state);
      await ctx.reply("Send the crypto address for this deal (optional -- type 'skip' to leave blank).");
    } else {
      setWizardState(userId, state);
      await promptAdminSelect(ctx, state);
    }
  });

  // Admin selection
  bot.action(/^pick_admin_(\d+)$/, async (ctx) => {
    const userId = ctx.from!.id;
    const state = getWizardState(userId);
    if (!state) return ctx.answerCbQuery("No active trade setup. Send /form to start again.");

    const adminId = Number(ctx.match[1]);
    const admin = listAdmins().find((a) => a.telegramId === adminId);
    if (!admin) {
      await ctx.answerCbQuery("That admin is no longer available.");
      return;
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(`Admin selected: @${admin.username || adminId}`);

    // Confirm the admin actually has payment info to show before we create
    // anything -- same guard as before, just moved ahead of trade creation.
    if (state.currency === "CRYPTO" && !admin.cryptoAddress) {
      await ctx.reply("This admin hasn't set a crypto address yet -- pick another admin, or ask them to run /setcrypto.");
      return;
    }
    if (state.currency === "INR" && !admin.qrFileId) {
      await ctx.reply("This admin hasn't uploaded a QR code yet -- pick another admin, or ask them to upload one.");
      return;
    }

    // Finalize the trade.
    const amount = state.amount!;
    const feeAmount = Math.round(amount * (FEE_PERCENT / 100) * 100) / 100;
    const sellerReceives = Math.round((amount - feeAmount) * 100) / 100;

    const buyerUsername = state.initiatorRole === "buyer" ? state.initiatorUsername : state.otherPartyUsername!;
    const buyerId = state.initiatorRole === "buyer" ? state.initiatorId : state.otherPartyId ?? null;
    const sellerUsername = state.initiatorRole === "seller" ? state.initiatorUsername : state.otherPartyUsername!;
    const sellerId = state.initiatorRole === "seller" ? state.initiatorId : state.otherPartyId ?? null;

    const trade: Trade = {
      id: generateTradeId(),
      dealInfo: state.dealInfo!,
      buyerUsername,
      buyerId,
      sellerUsername,
      sellerId,
      amount,
      currency: state.currency!,
      duration: state.duration!,
      escrowUntil: computeEscrowUntil(state.duration!),
      releaseCondition: state.releaseCondition ?? null,
      cryptoAddress: state.cryptoAddress ?? null,
      adminId: admin.telegramId,
      adminUsername: admin.username || String(admin.telegramId),
      feePercent: FEE_PERCENT,
      feeAmount,
      sellerReceives,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      initiatorId: state.initiatorId,
    };

    createTrade(trade);
    clearWizardState(userId);

    // Show the admin's payment info now that the trade exists, with a
    // "done" button so we can tell when the payer says they've sent it.
    if (state.currency === "CRYPTO") {
      await ctx.reply(
        `Send payment to this crypto address:\n\n${admin.cryptoAddress}`,
        paidButton(trade.id)
      );
    } else {
      await ctx.replyWithPhoto(admin.qrFileId!, {
        caption: "Scan this QR to pay via UPI.",
        ...paidButton(trade.id),
      });
    }
    schedulePaymentReminder(ctx.telegram, trade.id, userId);

    await ctx.reply(tradeCreatedTemplate(trade));

    // Notify the admin with action buttons.
    try {
      await ctx.telegram.sendMessage(
        admin.telegramId,
        `📥 New trade needs verification\n\n${tradeCreatedTemplate(trade)}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("✅ Release", `release_${trade.id}`)],
          [Markup.button.callback("↩️ Refund", `refund_${trade.id}`)],
          [Markup.button.callback("❌ Cancel", `cancel_${trade.id}`)],
        ])
      );
    } catch {
      // Admin may have blocked the bot or never started a DM -- non-fatal.
    }
  });
}

async function promptAdminSelect(ctx: Context, state: WizardState) {
  const admins = listAdmins().filter((a) => ADMIN_IDS.includes(a.telegramId));
  if (admins.length === 0) {
    await ctx.reply("No escrow admins are configured yet. Ask an admin to message this bot and run /adminlist.");
    return;
  }

  state.step = "AWAIT_ADMIN_SELECT";
  const userId = state.initiatorId;
  setWizardState(userId, state);

  await ctx.reply(
    "Pick an admin to handle this trade:",
    Markup.inlineKeyboard(
      admins.map((a) => [Markup.button.callback(`@${a.username || a.telegramId}`, `pick_admin_${a.telegramId}`)])
    )
  );
}

function computeEscrowUntil(duration: string): string {
  const match = duration.match(/(\d+)\s*(hour|hr|day|d|minute|min)/i);
  const now = new Date();
  if (!match) return "Not specified";

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (unit.startsWith("hour") || unit === "hr") {
    now.setHours(now.getHours() + value);
  } else if (unit.startsWith("day") || unit === "d") {
    now.setDate(now.getDate() + value);
  } else if (unit.startsWith("min")) {
    now.setMinutes(now.getMinutes() + value);
  }

  return now.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
        }
