# Sofia's Money

A simple, mobile-first personal finance tracker. Built with React, Vite, Supabase Auth, and a private per-user JSON record protected by RLS.

## Features
- Payday entry with exact cent-level allocation across Checking, Spending, Savings, and Reserves
- Editable allocation percentages that must total 100%
- Add more destination accounts and set their tracked balance and APY
- Paycheck plans remain **pending** until manually marked as transferred
- Savings projections with a user-editable monthly contribution and effective APY math
- 1-, 2-, and 3-year forecasts, monthly end-of-period contributions
- Weekly paycheck history, savings milestone, mobile bottom navigation
- Supabase email/password sign-in and per-user data isolation

## First-time setup
1. Use the dedicated SQL from `supabase/migrations/20261110_create_sofia_financial_state.sql`. It has already been applied to the chosen Supabase instance.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel settings for the project. Do **not** publish a service-role or secret key.
3. In Supabase Authentication URL Configuration, allow the deployed Vercel domain under **Redirect URLs** so email confirmation and password reset can return to the site.
4. Go to the site, create an account, confirm email if required, and sign in.
5. Update checking/spending/savings/reserves balances and the paycheck split to match actual needs before first payday.

## Run
`npm install`
`npm test`
`npm run dev`

## Financial model
The savings model uses `monthlyRate = (1 + APY/100) ** (1/12) - 1`, compounds the currently tracked balance monthly, and credits each chosen monthly contribution at the end of the month. This is an estimate, not a guaranteed account return. Actual bank posting schedules, rate changes, taxes, fees, and withdrawals can change the result.

The application **does not connect to bank accounts or transfer money**. Paychecks generate suggested allocations. Tapping “I've moved this money” marks the plan complete and updates manually tracked balances. This avoids counting a planned deposit as though it had happened.

Default starting percentages are 50% Checking, 15% Spending, 25% Savings, 10% Reserves. These are examples, not individual financial advice.

## Data isolation
The `sofia_financial_state` table uses `user_id` as its primary key and RLS policies for SELECT, INSERT, UPDATE, DELETE to enforce `auth.uid() = user_id`. No anonymous access. It currently uses the existing Ignite Client Hub Supabase instance, with a separate namespaced table. For longer-term separation, provision a dedicated Supabase project and reconfigure the Vite environment variables after applying the migration.
