# Commission Downline Splitter

Standalone React + Supabase app for tracking insurance/annuity sales, calculating commissions, splitting downline/upline overrides, and marking payouts as paid.

## Features

- Email/password login through Supabase Auth
- Agent/downline management
- Sale entry with premium, commission rate, agent split, and optional upline override
- Automatic calculations for gross commission, writing agent pay, upline pay, and house pay
- Commission ledger with paid/unpaid statuses
- Payout batch tracking
- Row Level Security by user account

## Setup

1. Create the Supabase tables using `supabase/migrations/20260823101000_create_commission_downline_splitter.sql`.
2. In Supabase Auth, enable Email provider.
3. Copy `.env.example` to `.env`.
4. Install and run:

```bash
npm install
npm run dev
```

## Deploy

Deploy to Vercel or Netlify. Add these environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Do not expose any Supabase service role key in the frontend.
