# Finance Tracker V2

V2 is the cross-device version of Finance Tracker. It uses Google sign-in and Supabase to sync a user's finance records. The standalone V1 app remains in the repository root.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the Supabase project.
3. Install packages with `npm install`, then start the app with `npm run dev`.

The Supabase migration is in `supabase/migrations/001_initial_schema.sql`. Google must be enabled as an auth provider, and the Supabase OAuth callback must be registered in the Google Cloud OAuth client.

## Deploy on Vercel

Import this repository in Vercel and set the project Root Directory to `v2`. Vite is detected automatically; the build command is `npm run build` and the output directory is `dist`.

Add these Production environment variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

After the first deployment, copy its production URL into Supabase Authentication → URL Configuration as the Site URL. Add the exact production URL to the Redirect URLs allow list. The Google OAuth client's authorized redirect URI remains the Supabase callback URL.

Never add a Supabase service-role key to this browser app. Supabase row-level security protects each user's records.

## Data

- New accounts start with default categories and an empty ledger; users add their own accounts.
- Existing V1 backups can be imported during setup or from Account & Settings.
- Account & Settings supports JSON backup import/export and light/dark themes.
