# curve-zenmoney-sync

Automatically syncs [Curve](https://www.curve.com/) card transactions to [ZenMoney](https://zenmoney.ru/) by receiving forwarded transaction emails via webhook.

## How it works

When Curve charges your card, it sends you a receipt email. You forward that email to [Cloudmailin](https://www.cloudmailin.com/), which delivers it to this service as an HTTP POST. The service parses the transaction details from the email HTML and creates a matching transaction in ZenMoney via its API. Errors are reported to a Telegram chat.

```
Curve receipt email
        │
        ▼ (email forwarding rule)
   Cloudmailin
        │
        ▼ HTTP POST /webhook?token=...
 curve-zenmoney-sync
        │
        ▼ ZenMoney diff API
    ZenMoney
```

If a transaction can't be created (missing account, API error, etc.), the service sends a Telegram alert and still returns HTTP 200 to Cloudmailin to prevent retries.

## Prerequisites

- **Curve card** — the service parses Curve receipt emails from `support@imaginecurve.com`
- **ZenMoney account** — and an OAuth2 access token (get one at [zerro.app](https://zerro.app/))
- **ZenMoney account ID** — the UUID of the account to sync transactions into (visible in ZenMoney settings)
- **Cloudmailin account** — free tier covers ~200 emails/month ([cloudmailin.com](https://www.cloudmailin.com/))
- **Telegram bot** — for error notifications; create one via [@BotFather](https://t.me/BotFather) and find your chat ID via [@userinfobot](https://t.me/userinfobot)

## Setup

### Docker Compose

Suitable for any Linux server or VPS with Docker installed.

```bash
git clone https://github.com/your-username/curve-zenmoney-sync.git
cd curve-zenmoney-sync
cp .env.example .env
# Edit .env and fill in all required values (see Configuration below)
docker-compose up -d
```

The service listens on port 3000 by default. Set `PORT` in `.env` to change it.

### Systemd / Podman Quadlet (Fedora)

Requires Podman and Fedora 40+.

```bash
git clone https://github.com/your-username/curve-zenmoney-sync.git
cd curve-zenmoney-sync
cp .env.example .env
# Edit .env and fill in all required values (see Configuration below)

# Build the container image
podman build -t localhost/curve-zenmoney-sync:latest .

# Install and start the systemd service
sudo ./quadlet/setup.sh
```

The setup script is idempotent — safe to re-run after updating `.env` or rebuilding the image. To rebuild and restart:

```bash
podman build -t localhost/curve-zenmoney-sync:latest .
podman auto-update
# or: sudo systemctl restart curve-zenmoney-sync.service
```

## Configuration

Copy `.env.example` to `.env` and fill in the values below. The service will refuse to start if any required variable is missing.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ZENMONEY_ACCESS_TOKEN` | Yes | — | OAuth2 access token — get from [zerro.app](https://zerro.app/) |
| `ZENMONEY_DEFAULT_ACCOUNT_ID` | Yes | — | UUID of the ZenMoney account to sync into |
| `CLOUDMAILIN_TOKEN` | Yes | — | Shared secret used to authenticate incoming webhooks |
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Yes | — | Chat ID to receive error alerts — get from [@userinfobot](https://t.me/userinfobot) |
| `PORT` | No | `3000` | HTTP server port |
| `CURVE_SENDER_EMAIL` | No | `support@imaginecurve.com` | Expected sender address for Curve receipts |

## Cloudmailin wiring

1. Create a new address in Cloudmailin and set the **target URL** to:
   ```
   http://your-server:3000/webhook?token=YOUR_CLOUDMAILIN_TOKEN
   ```
   Use the same value for `token` as `CLOUDMAILIN_TOKEN` in `.env`.

2. Set the **POST format** to `HTML + plain text (multipart)`.

3. In your email client, create a forwarding rule: forward all emails from `support@imaginecurve.com` to your Cloudmailin address.

The service validates the `token` query parameter on every incoming request and returns HTTP 400 for mismatches.

## Development

```bash
npm install
cp .env.example .env  # fill in values
npm run dev           # starts server with hot reload on http://localhost:3000
```

```bash
npm test              # run all tests
npm run test:watch    # watch mode
```

The `/health` endpoint returns `200 OK` and can be used to verify the service is up.

Project structure and module responsibilities are documented in [`docs/structure.md`](docs/structure.md). Architecture decisions are in [`docs/adr/`](docs/adr/).
