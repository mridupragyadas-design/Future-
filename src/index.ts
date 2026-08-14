import { bot } from "./bot";

bot
  .launch()
  .then(() => console.log("MRIXDU escrow bot is running (polling mode)."))
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
