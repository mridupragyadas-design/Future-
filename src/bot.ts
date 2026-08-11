import { Telegraf, Context, Markup } from "telegraf";
import { config, isAdmin } from "./config";
import { PendingTradeDraft } from "./types";
import { createTrade, formatTrade } from "./tradeManager";
import {
  getTrade,
  updateTradeStatus,
  getTradesForUser,
  getOpenTrades,
} from "./db";

const bot = new Telegraf(config.botToken);

// In-memory draft state per user while they're building a new trade.
// Fine for a single-process bot; swap for a DB-backed store if you scale out.
const drafts = new Map<number, PendingTradeDraft>();

// ---------- /start & /help ----------

bot.start((ctx) =>
  ctx.reply(
    "Welcome to the escrow bot 👋\n\n" +
      "Commands:\n" +
      "/newtrade – start a new escrow trade\n" +
      "/trade <id> – check a trade's status\n" +
      "/mytrades – list your recent trades\n" +
      "/cancel – cancel the trade draft you're building\n" +
      (isAdmin(ctx.from.id)
        ? "\nAdmin commands:\n" +
          "/release <id>\n/refund <id>\n/canceltrade <id>\n/dispute <id>\n/opentrades"
        : "")
  )
);

bot.help((ctx) => ctx.reply("Use /start to see available commands."));

// ---------- New trade flow ----------

bot.command("newtrade", (ctx) => {
  drafts.set(ctx.from.id, { step: "counterparty", creatorId: ctx.from.id });
  ctx.reply(
    "Let's set up a new trade.\n\nSend the *Telegram @username* of the other party (they must have messaged this bot at least once).",
    { parse_mode: "Markdown" }
  );
});

bot.command("cancel", (ctx) => {
  if (drafts.delete(ctx.from.id)) {
    ctx.reply("Draft cancelled.");
  } else {
    ctx.reply("You don't have an active trade draft.");
  }
});

// Handles the step-by-step draft conversation for anyone with an active draft.
bot.on("text", async (ctx, next) => {
  const draft = drafts.get(ctx.from.id);
  if (!draft) return next();

  const text = ctx.message.text.trim();

  switch (draft.step) {
    case "counterparty": {
      const username = text.replace(/^@/, "");
      if (!username) {
        return ctx.reply("Please send a valid @username.");
      }
      draft.counterpartyUsername = username;
      draft.step = "role";
      return ctx.reply(
        "Are you the buyer or the seller in this trade?",
        Markup.inlineKeyboard([
          Markup.button.callback("I'm the buyer", "role:buyer"),
          Markup.button.callback("I'm the seller", "role:seller"),
        ])
      );
    }

    case "amount": {
      const amount = Number(text.replace(/,/g, ""));
      if (!amount || amount <= 0) {
        return ctx.reply("Please send a valid positive number for the amount.");
      }
      draft.amount = amount;
      draft.step = "currency";
      return ctx.reply(
        "What's being escrowed?",
        Markup.inlineKeyboard([
          Markup.button.callback("INR", "currency:INR"),
          Markup.button.callback("Crypto", "currency:CRYPTO"),
        ])
      );
    }

    case "network": {
      // reused to capture free-text "ASSET NETWORK" for crypto trades
      draft.network = text;
      draft.step = "confirm";
      return sendConfirmation(ctx, draft);
    }

    default:
      return next();
  }
});

bot.action(/^role:(buyer|seller)$/, async (ctx) => {
  const draft = drafts.get(ctx.from!.id);
  if (!draft) return ctx.answerCbQuery("No active draft. Use /newtrade.");
  draft.creatorRole = ctx.match[1] as "buyer" | "seller";
  draft.step = "amount";
  await ctx.answerCbQuery();
  await ctx.editMessageText(`Role set: ${draft.creatorRole}.`);
  await ctx.reply("What's the trade amount? (numbers only)");
});

bot.action(/^currency:(INR|CRYPTO)$/, async (ctx) => {
  const draft = drafts.get(ctx.from!.id);
  if (!draft) return ctx.answerCbQuery("No active draft. Use /newtrade.");
  await ctx.answerCbQuery();

  if (ctx.match[1] === "INR") {
    draft.currency = "INR";
    draft.step = "confirm";
    await ctx.editMessageText("Currency set: INR.");
    return sendConfirmation(ctx, draft);
  } else {
    draft.currency = "CRYPTO";
    draft.step = "network"; // reuse network step to capture asset+network, e.g. "USDT TRC20"
    await ctx.editMessageText("Currency set: Crypto.");
    return ctx.reply("Send the asset and network, e.g. `USDT TRC20` or `BTC`.", {
      parse_mode: "Markdown",
    });
  }
});

async function sendConfirmation(ctx: Context, draft: PendingTradeDraft) {
  ctx.reply(
    `Please confirm:\n\n` +
      `Counterparty: @${draft.counterpartyUsername}\n` +
      `Your role: ${draft.creatorRole}\n` +
      `Amount: ${draft.amount}\n` +
      `Type: ${draft.currency}${draft.network ? " (" + draft.network + ")" : ""}\n\n` +
      `Confirm to create this trade?`,
    Markup.inlineKeyboard([
      Markup.button.callback("✅ Confirm", "confirm_trade"),
      Markup.button.callback("❌ Cancel", "cancel_trade"),
    ])
  );
}

bot.action("cancel_trade", async (ctx) => {
  drafts.delete(ctx.from!.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText("Trade draft cancelled.");
});

bot.action("confirm_trade", async (ctx) => {
  const draft = drafts.get(ctx.from!.id);
  if (!draft || !draft.amount || !draft.currency || !draft.counterpartyUsername) {
    await ctx.answerCbQuery();
    return ctx.editMessageText("Draft expired or incomplete. Start again with /newtrade.");
  }

  await ctx.answerCbQuery();

  // Resolve currency/network fields. For crypto, `network` field temporarily
  // held the free-text "ASSET NETWORK" string entered by the user.
  let currency = draft.currency;
  let network: string | null = null;
  if (draft.currency === "CRYPTO" && draft.network) {
    const parts = draft.network.trim().split(/\s+/);
    currency = parts[0].toUpperCase();
    network = parts.slice(1).join(" ") || null;
  }

  const creatorId = ctx.from!.id;
  const creatorUsername = ctx.from!.username || null;

  // We only have the counterparty's username, not their numeric ID, until
  // they've interacted with the bot. Telegram bots can't resolve a bare
  // @username to an ID without that prior interaction, so we store 0 as a
  // placeholder and backfill it the first time that user messages the bot.
  const counterpartyPlaceholderId = 0;

  const isBuyer = draft.creatorRole === "buyer";

  const trade = createTrade({
    buyerId: isBuyer ? creatorId : counterpartyPlaceholderId,
    buyerUsername: isBuyer ? creatorUsername : draft.counterpartyUsername!,
    sellerId: isBuyer ? counterpartyPlaceholderId : creatorId,
    sellerUsername: isBuyer ? draft.counterpartyUsername! : creatorUsername,
    amount: draft.amount!,
    currency,
    network,
    createdBy: creatorId,
  });

  drafts.delete(creatorId);

  await ctx.editMessageText(
    `✅ Trade created!\n\n${formatTrade(trade)}\n\n` +
      `Share ID *${trade.id}* with the other party. Once your admin verifies payment, they'll release, refund, or cancel it.`,
    { parse_mode: "Markdown" }
  );
});

// ---------- Lookup commands ----------

bot.command("trade", (ctx) => {
  const id = ctx.message.text.split(/\s+/)[1];
  if (!id) return ctx.reply("Usage: /trade <trade_id>");
  const trade = getTrade(id.toUpperCase());
  if (!trade) return ctx.reply(`No trade found with ID ${id}.`);
  ctx.reply(formatTrade(trade), { parse_mode: "Markdown" });
});

bot.command("mytrades", (ctx) => {
  const trades = getTradesForUser(ctx.from.id);
  if (trades.length === 0) return ctx.reply("You have no trades yet.");
  ctx.reply(
    trades.map((t) => `${t.id} — ${t.status} — ${t.amount} ${t.currency}`).join("\n")
  );
});

// ---------- Admin commands ----------

function requireAdmin(ctx: Context): boolean {
  if (!ctx.from || !isAdmin(ctx.from.id)) {
    ctx.reply("⛔ This command is restricted to trusted admins.");
    return false;
  }
  return true;
}

bot.command("opentrades", (ctx) => {
  if (!requireAdmin(ctx)) return;
  const trades = getOpenTrades();
  if (trades.length === 0) return ctx.reply("No open trades.");
  ctx.reply(
    trades.map((t) => `${t.id} — ${t.status} — ${t.amount} ${t.currency}`).join("\n")
  );
});

async function adminResolve(
  ctx: Context,
  idArg: string | undefined,
  status: "RELEASED" | "REFUNDED" | "CANCELLED" | "DISPUTED",
  verb: string
) {
  if (!requireAdmin(ctx)) return;
  if (!idArg) return ctx.reply(`Usage: /${verb.toLowerCase()} <trade_id>`);

  const trade = getTrade(idArg.toUpperCase());
  if (!trade) return ctx.reply(`No trade found with ID ${idArg}.`);

  if (["RELEASED", "REFUNDED", "CANCELLED"].includes(trade.status)) {
    return ctx.reply(`Trade ${trade.id} is already ${trade.status} and can't be changed.`);
  }

  updateTradeStatus(trade.id, status, ctx.from!.id);
  const updated = getTrade(trade.id)!;

  await ctx.reply(`${verb} ✅\n\n${formatTrade(updated)}`, { parse_mode: "Markdown" });

  // Notify both parties if we have their numeric IDs on file.
  const notifyText = `Trade ${trade.id} has been *${status}* by an admin.`;
  for (const uid of [trade.buyerId, trade.sellerId]) {
    if (uid && uid !== 0) {
      bot.telegram.sendMessage(uid, notifyText, { parse_mode: "Markdown" }).catch(() => {});
    }
  }
}

bot.command("release", (ctx) =>
  adminResolve(ctx, ctx.message.text.split(/\s+/)[1], "RELEASED", "Released")
);
bot.command("refund", (ctx) =>
  adminResolve(ctx, ctx.message.text.split(/\s+/)[1], "REFUNDED", "Refunded")
);
bot.command("canceltrade", (ctx) =>
  adminResolve(ctx, ctx.message.text.split(/\s+/)[1], "CANCELLED", "Cancelled")
);
bot.command("dispute", (ctx) =>
  adminResolve(ctx, ctx.message.text.split(/\s+/)[1], "DISPUTED", "Marked disputed")
);

bot.launch().then(() => console.log("Escrow bot running."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
