# MRIXDU Escrow Bot (Telegram, TypeScript)

A Telegram bot that walks two parties through setting up an escrow deal (INR or crypto), then hands off payment verification and release/refund/cancel to a human admin. The bot itself never holds funds -- it only tracks deal status and shows the admin's own payment details (crypto address or UPI QR). Admins manually confirm they've received payment before releasing.

## How it works

1. User sends `/form`, `form`, `dd`, or `deal` in a DM with the bot.
2. Bot shows the deal form template, then asks for the other party's `@username` (they must have messaged the bot at least once already -- typing `me` resolves to your own username).
3. Bot asks if you're the buyer or seller, then collects deal info, amount, duration, and an optional release condition.
4. You pick INR or Crypto. For crypto you can optionally add an address.
5. You pick a verified admin from the list -- bot shows that admin's crypto address or UPI QR.
6. Bot creates the trade (`ESC-XXXXXX`), calculates the 3% fee, and DMs the assigned admin with Release / Refund / Cancel buttons.
7. Once the admin confirms payment was received, they tap Release (or Refund/Cancel) and both parties get notified automatically.

## Admin setup

Anyone whose numeric Telegram ID is in `ADMIN_IDS` becomes an admin automatically the first time they message the bot. They should then run:

- `/setcrypto <address>` -- set their crypto receiving address
- Send a photo with caption `/setqr` -- register their UPI/INR QR code

Users can run `/adminlist` any time to see who the verified admins are, matching the "Verify via /adminlist" notice in the form.

## Local setup

```bash
npm install
cp .env.example .env
# edit .env: add your BOT_TOKEN (from @BotFather) and ADMIN_IDS (numeric Telegram user IDs)
npm run dev
```

## Deploying on Render (via GitHub)

1. Push this project to a GitHub repo.
2. In Render, choose **New > Blueprint** and point it at the repo -- it'll read `render.yaml` automatically and create a Background Worker (no web port needed since the bot runs in polling mode).
   - Alternatively: **New > Background Worker**, connect the repo, build command `npm install && npm run build`, start command `npm start`.
3. Set the environment variables `BOT_TOKEN` and `ADMIN_IDS` in the Render dashboard (marked `sync: false` in render.yaml so you enter them manually, not commit them).
4. Render will attach a small persistent disk (see `render.yaml`) at `/opt/render/project/src/data` so the SQLite DB survives redeploys. Without a persistent disk, Render's filesystem is ephemeral and you'd lose trade history on every deploy.

## Notes and honest caveats

- **Conversation state (the multi-step form) is in-memory**, keyed by user ID. It resets if the bot process restarts mid-form -- someone would just need to send `/form` again. Trade records themselves are safe in SQLite once created.
- **This bot never custodies INR or crypto itself** -- it only displays the chosen admin's own payment details and tracks status. The actual holding of funds happens off-bot (in the admin's wallet/UPI), which is the design you described. Worth knowing: in India, regularly acting as a middleman for other people's payments (even without directly holding funds) can attract scrutiny under RBI/payment-intermediary rules depending on volume and how it's marketed -- that's a legal/compliance question for you, not something code can resolve.
- Fee is hardcoded at 3% (`FEE_PERCENT` in `src/config.ts`) -- change it there if needed.
