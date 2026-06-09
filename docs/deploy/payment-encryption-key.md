# PAYMENT_ENCRYPTION_KEY (production)

Withdrawal payout binding encrypts account details with AES-256-GCM. Production **requires** this variable or every `POST /api/v1/payments/methods/bind` fails with `PAYMENT_ENCRYPTION_KEY is not set`.

**You do not need shell/SSH on Render.** Render web services have no interactive shell. Everything below is: generate a secret on your laptop, paste it in the Render Dashboard, wait for redeploy.

## Generate (once, on your machine)

Any of these — run locally, not on Render:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```bash
openssl rand -hex 32
```

Copy the **64-character** hex output. Store it in a password manager. **Do not commit it to git.**

## Set on Render (Dashboard only)

1. [dashboard.render.com](https://dashboard.render.com) → your **Backend API** web service
2. **Environment** (left sidebar)
3. **Add Environment Variable**
   - Key: `PAYMENT_ENCRYPTION_KEY`
   - Value: paste the 64-char hex
4. **Save Changes** — Render redeploys automatically (watch **Logs** tab; no shell required)

Use the **same value** on all API replicas if they share one env group. The worker service does not need this key today.

After deploy, the service should **start successfully**. If `NODE_ENV=production` and the key is missing or not 64 hex chars, the container exits on boot with an env validation error in **Logs**.

## Verify after deploy

| methodType      | country | provider     |
|-----------------|---------|--------------|
| mobile_wallet   | PH      | gcash        |
| bank_account    | PH      | bank_php     |
| upi             | IN      | upi          |
| epay            | US      | epay         |
| usdt_trc20      | US      | usdt_trc20   |
| binance_bep20   | US      | usdt_bep20   |

Test from your phone (Expo app) or from your laptop with curl/Postman against your public API URL — not from a Render shell:

- Bind GCash (PH) in the app, or
- `GET https://<your-api>/api/v1/payments/withdrawal-methods?countryCode=PH` then `POST .../methods/bind` with a valid JWT

Expect **200** and `masked_account` in the response.

## Key rotation

Changing the key invalidates existing encrypted payout rows. Plan a decrypt-with-old / encrypt-with-new migration before rotating.
