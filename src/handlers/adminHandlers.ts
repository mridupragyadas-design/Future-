import { Telegraf } from "telegraf";
import { ADMIN_IDS } from "../config";
import { ensureAdminRow, getTrade, isAdminId, listAdmins, setAdminCrypto, setAdminQr, updateTradeStatus } from "../db";
import { tradeStatusTemplate } from "../templates";

export function registerAdminHandlers(bot: Telegraf) {
  // Auto-register configured admins the first time they message the bot.
  bot.use(async (ctx, next) => {
    if (ctx.from && isAdminId(ctx.from.id, ADMIN_IDS)) {
      ensureAdminRow(ctx.from.id, ctx.from.username);
    }
    return next();
  });

  bot.command("adminlist", async (ctx) => {
    const admins = listAdmins().filter((a) => ADMIN_IDS.includes(a.telegramId));
    if (admins.length === 0) {
      await ctx.reply("No admins have registered with the bot yet.");
      return;
    }
    const lines = admins.map((a) => {
      const flags = [a.cryptoAddress ? "crypto ✅" : "crypto ❌", a.qrFileId ? "INR QR ✅" : "INR QR ❌"];
      return `@${a.username || a.telegramId} -- ${flags.join(", ")}`;
    });
    await ctx.reply(
      `🔐 Verified escrow admins:\n\n${lines.join("\n")}\n\n⚠️ Admins will NEVER DM you first for payment. Only pay an admin you selected from this bot's own trade flow.`
    );
  });

  bot.command("setcrypto", async (ctx) => {
    if (!isAdminId(ctx.from.id, ADMIN_IDS)) {
      await ctx.reply("Only configured admins can use this command.");
      return;
    }
    const address = ctx.message.text.replace(/^\/setcrypto/i, "").trim();
    if (!address) {
      await ctx.reply("Usage: /setcrypto <your address>");
      return;
    }
    setAdminCrypto(ctx.from.id, address);
    await ctx.reply("Crypto receiving address updated.");
  });

  // Admin sends a photo with caption /setqr to register their UPI/INR QR code.
  bot.on("photo", async (ctx, next) => {
    const caption = ctx.message.caption || "";
    if (!/^\/setqr/i.test(caption.trim())) return next();

    if (!isAdminId(ctx.from.id, ADMIN_IDS)) {
      await ctx.reply("Only configured admins can use this command.");
      return;
    }
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;
    setAdminQr(ctx.from.id, fileId);
    await ctx.reply("QR code saved. It'll be shown to users who pick you for an INR trade.");
  });

  bot.command("trade", async (ctx) => {
    const id = ctx.message.text.replace(/^\/trade/i, "").trim();
    if (!id) {
      await ctx.reply("Usage: /trade ESC-XXXXXX");
      return;
    }
    const trade = getTrade(id);
    if (!trade) {
      await ctx.reply(`No trade found with ID ${id}`);
      return;
    }
    await ctx.reply(tradeStatusTemplate(trade));
  });

  registerTradeAction(bot, "release", "RELEASED", "✅ Trade released. Funds sent to seller.");
  registerTradeAction(bot, "refund", "REFUNDED", "↩️ Trade refunded. Funds returned to buyer.");
  registerTradeAction(bot, "cancel", "CANCELLED", "❌ Trade cancelled.");
}

function registerTradeAction(
  bot: Telegraf,
  actionPrefix: "release" | "refund" | "cancel",
  newStatus: "RELEASED" | "REFUNDED" | "CANCELLED",
  confirmationText: string
) {
  bot.action(new RegExp(`^${actionPrefix}_(.+)$`), async (ctx) => {
    const adminId = ctx.from!.id;
    if (!isAdminId(adminId, ADMIN_IDS)) {
      await ctx.answerCbQuery("Only admins can do this.");
      return;
    }

    const tradeId = ctx.match[1];
    const trade = getTrade(tradeId);
    if (!trade) {
      await ctx.answerCbQuery("Trade not found.");
      return;
    }
    if (trade.adminId !== adminId) {
      await ctx.answerCbQuery("This trade is assigned to a different admin.");
      return;
    }
    if (["RELEASED", "REFUNDED", "CANCELLED"].includes(trade.status)) {
      await ctx.answerCbQuery(`Trade already ${trade.status}.`);
      return;
    }

    updateTradeStatus(tradeId, newStatus);
    await ctx.answerCbQuery("Done");
    await ctx.editMessageText(`${confirmationText}\n\nTrade ${tradeId}`);

    const updated = getTrade(tradeId)!;
    const notify = async (userId: number | null) => {
      if (!userId) return;
      try {
        await ctx.telegram.sendMessage(userId, `${confirmationText}\n\n${tradeStatusTemplate(updated)}`);
      } catch {
        // user may have blocked the bot -- non-fatal
      }
    };
    await notify(updated.buyerId);
    await notify(updated.sellerId);
  });
}
