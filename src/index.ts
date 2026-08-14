import http from "http";
import { bot } from "./bot";

// Render web services require binding to a port and answering HTTP requests,
// or the service is marked unhealthy and spun down. The bot itself talks to
// Telegram via polling and doesn't need this -- it's just a health check.
const PORT = process.env.PORT || 3000;
const server = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("MRIXDU escrow bot is running.");
});
server.listen(PORT, () => console.log(`Health check server listening on port ${PORT}`));

bot
  .launch()
  .then(() => console.log("MRIXDU escrow bot is running (polling mode)."))
  .catch((err) => {
    console.error("Failed to launch bot:", err);
    process.exit(1);
  });

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  server.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  server.close();
});
