# Kiln billing setup

Kiln now has a Stripe-backed Ember model tier system.

## Ember tiers

- **Free** — `openai/gpt-oss-20b` — 10 project-agent requests/day
- **Premium** — `openai/gpt-oss-120b` — 100 project-agent requests/day
- **Premium+** — `qwen/qwen3.6-27b` — 250 project-agent requests/day

The backend, not the browser, decides which model a billing session can use.

## Stripe Dashboard

Create two recurring Prices in Stripe:

1. Premium → put its Price ID in `STRIPE_PREMIUM_PRICE_ID`.
2. Premium+ → put its Price ID in `STRIPE_PREMIUM_PLUS_PRICE_ID`.

Create a webhook endpoint pointing to:

`https://YOUR-KILN-DOMAIN/api/billing/webhook`

Enable these events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Put the webhook signing secret in `STRIPE_WEBHOOK_SECRET`.

## Server environment

Required for billing:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PREMIUM_PRICE_ID`
- `STRIPE_PREMIUM_PLUS_PRICE_ID`
- `KILN_PUBLIC_URL`
- `KILN_BILLING_COOKIE_SECRET`
- `DATABASE_URL`

Generate a long random value for `KILN_BILLING_COOKIE_SECRET`. Never commit any of these values to Git.

## Database

Run the existing database push command after deploying the new schema:

`pnpm --filter @workspace/db push`

The schema creates `kiln_subscriptions` and `kiln_model_usage_daily`.

## API

- `GET /api/billing/plans` — public plan/model catalog
- `GET /api/billing/me` — current billing entitlement
- `POST /api/billing/checkout` with `{ "plan": "premium" | "premium_plus" }` — creates Stripe Checkout
- `POST /api/billing/portal` — creates a Stripe customer portal session
- `POST /api/billing/webhook` — verified Stripe subscription events

## Important architecture note

The current billing identity is a signed browser billing-session cookie so the Stripe flow can work before Kiln has a full account/authentication system. It is intentionally isolated from the model authorization logic: once Kiln authentication is added, the billing-session identity should be replaced with the authenticated Kiln user ID so subscriptions follow users across devices.

Do not treat the browser session as a substitute for full account authentication.
