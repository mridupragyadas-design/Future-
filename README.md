# Telegram Escrow Bot

TypeScript Telegram bot for coordinating crypto/INR escrow trades. A trusted
admin manually verifies payment and releases, refunds, or cancels each trade.
This bot **tracks and coordinates trades** — it does not hold funds itself.
Actual crypto/INR still moves manually (e.g. to your admin's wallet/UPI); the
bot just gives you trade IDs, status tracking, and an audit trail.

## Commands

**Everyone**
- `/newtrade` — guided flow to create a trade (counterparty, role, amount, currency)
- `/trade <id>` — check a trade's status
- `/mytrades` — list your recent trades
- `/cancel` — abort the trade draft you're currently building

**Admins only** (set via `ADMIN_IDS` in `.env`)
- `/release <id>` — mark funds released to seller
- `/refund <id>` — mark funds refunded to buyer
- `/canceltrade <id>` — cancel an unresolved trade
- `/dispute <id>` — flag a trade for review
- `/opentrades` — list all pending/funded/disputed trades

Fee is set once via `FEE_PERCENT` (default 3%) and snapshotted per trade, so
changing it later doesn't retroactively affect existing trades.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env: BOT_TOKEN from @BotFather, ADMIN_IDS = your numeric Telegram ID(s)
npm run dev
```

Get your numeric Telegram ID by messaging **@userinfobot**.

## Deploying on Render

1. Push this project to a GitHub repo.
2. In Render: **New → Web Service**, connect the repo.
3. **Build command:** `npm install && npm run build`
4. **Start command:** `npm start`
5. Add environment variables in the Render dashboard (`BOT_TOKEN`, `ADMIN_IDS`,
   `FEE_PERCENT`, `DB_PATH`) — don't commit `.env`.

### Important: persistent storage

Render's web services have an **ephemeral filesystem** — anything written to
disk (including the SQLite file) is wiped on every deploy or restart. To keep
trade history:

- Add a **Render Disk** (Dashboard → your service → Disks → Add Disk), mount
  it at e.g. `/data`, and set `DB_PATH=/data/escrow.db` in your env vars.
- Disks aren't available on the free instance type — you'll need a paid plan.
- Alternatively, swap SQLite for a managed **Render PostgreSQL** instance if
  you want to stay on free/autoscaling instances — that would mean changing
  `db.ts` to use `pg` instead of `better-sqlite3`. Happy to help with that
  swap if you go that route.

### Also worth knowing
- Web Services on Render expect an HTTP port bound for health checks on some
  plans; this bot uses long-polling (`bot.launch()`) so no port is opened. If
  Render's health check fails your deploy, switch the service type to
  **Background Worker** instead of Web Service — that's really the correct
  fit for a polling bot.
- Free instances spin down after inactivity, which will drop your Telegram
  connection until a request wakes it — fine for testing, not for a bot your
  group depends on being always-online for.

## Known limitations / things to harden before real use

- **Username → ID resolution:** Telegram bots can only message a user who has
  already started a chat with the bot. If you name a counterparty who's never
  messaged the bot, their numeric ID is stored as a placeholder (`0`) and
  they won't get notifications until you add a proper lookup table populated
  on every incoming message (noted as a TODO in `bot.ts`).
- **No real fund custody:** this bot does not touch a wallet or payment API.
  Admins verify payment manually and press release/refund. If you want actual
  on-chain custody, that's a much bigger (and higher-stakes) build — let me
  know if you want to go there.
- **Single admin action, no multi-sig/approval:** any one admin ID can
  release or refund a trade unilaterally. Add a confirmation step or require
  2 admins if that's a risk for your group.
