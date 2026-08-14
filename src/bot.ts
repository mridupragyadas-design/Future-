import { Telegraf } from "telegraf";
import { BOT_TOKEN } from "./config";
import { upsertUser } from "./db";
import { registerDealFlow } from "./handlers/dealFlow";
import { registerAdminHandlers } from "./handlers/adminHandlers";

export const bot = new Telegraf(BOT_TOKEN);

// Track every user who has ever messaged the bot -- needed so "the other party
// must have messaged this bot at least once" can be checked by username lookup.
bot.use(async (ctx, next) => {
  if (ctx.from) {
    upsertUser(ctx.from.id, ctx.from.username);
  }
  return next();
});

bot.start(async (ctx) => {
  await ctx.reply(
    "👋 Welcome! Send /form (or 'deal', 'dd') to start a new escrow trade, or /adminlist to verify who the trusted admins are."
  );
});

bot.help(async (ctx) => {
  await ctx.reply(
    [
      "/form or 'deal' or 'dd' -- start a new trade",
      "/cancel -- cancel a trade currently being set up",
      "/trade ESC-XXXXXX -- check a trade's status",
      "/adminlist -- see verified escrow admins",
    ].join("\n")
  );
});

registerAdminHandlers(bot);
registerDealFlow(bot);
