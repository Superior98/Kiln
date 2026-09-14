CREATE TABLE IF NOT EXISTS kiln_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'inactive',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kiln_subscriptions_user_id_unique ON kiln_subscriptions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS kiln_subscriptions_stripe_subscription_id_unique ON kiln_subscriptions (stripe_subscription_id);

CREATE TABLE IF NOT EXISTS kiln_model_usage_daily (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  usage_date text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kiln_model_usage_daily_user_date_unique ON kiln_model_usage_daily (user_id, usage_date);
