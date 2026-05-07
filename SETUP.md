# KLabMusic — Setup & Deploy

A click-through for getting a fresh KLabMusic instance live on Supabase + Vercel.
Total time: ~10 minutes if you have accounts already.

---

## 1. Supabase project

1. Go to https://supabase.com → **New project**.
2. Pick any region close to you. Set a strong DB password (save it somewhere, you won't need it for this app but Supabase needs it).
3. Wait ~2 minutes for the project to provision.
4. In the project dashboard, open **Project Settings → API** and grab:
   - **Project URL** (looks like `https://xxxx.supabase.co`)
   - **anon public** key (long string under "Project API keys")
5. Open **SQL Editor → New query**, paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), and click **Run**. This creates:
   - tables: `projects`, `clips`, `key_bindings`, `user_themes`, `rooms`
   - storage buckets: `user-clips`, `project-exports`
   - row-level security + storage policies
   - safe to re-run; everything is `IF NOT EXISTS` / guarded.
6. Open **Authentication → Providers** and make sure **Email** is enabled (default). Phase 11 will use this.

That's it for Supabase — Realtime broadcast / presence work out of the box.

---

## 2. Local dev with the new keys

1. In the repo root, copy the example env:
   ```
   cp .env.example .env
   ```
2. Open `.env` and fill in your two Supabase values:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
3. Run:
   ```
   npm run dev
   ```
4. Smoke-test:
   - Open `localhost:5173` → click **Open the Studio**.
   - Click the 🎤 **Jam** button → enter a name → **Create new room**.
   - You should land at `localhost:5173/room/KLB-XXXX` with your chip in the player list.
   - Open the same URL in a second browser tab (or another device on the same network with `npm run dev -- --host`) and join — both clients should see each other and chat should work.

---

## 3. Vercel deploy

1. Go to https://vercel.com → **Add New → Project**.
2. Import `kelsaeed/KLabMusic` from GitHub.
3. **Framework preset:** Vercel should auto-detect Vite. If not, pick **Vite**.
4. **Build command:** `npm run build`. **Output directory:** `dist`. (Both already in `vercel.json`, you can leave the auto-filled values.)
5. Expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
6. Click **Deploy**. First build takes ~1 minute.
7. Visit the `*.vercel.app` URL Vercel gives you. The 🎤 Jam button should now generate share-able room links like `https://klabmusic.vercel.app/room/KLB-1234`.

### Custom domain (optional)
Project → **Domains → Add** → point your DNS at Vercel. They'll handle SSL.

---

## 4. Supabase Edge Function for AI

The AI features call a Supabase Edge Function (`ai-music`) so the Anthropic key never reaches the browser. The function source is already in this repo at [`supabase/functions/ai-music/index.ts`](supabase/functions/ai-music/index.ts) — you just need to deploy it.

**One-time setup:**
```
npm install -g supabase                              # or npx everything below
supabase login                                        # opens browser to auth
supabase link --project-ref <ref>                     # <ref> is the part of your project URL: https://<ref>.supabase.co
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...    # paste your Anthropic key
```

**Deploy (run after editing `index.ts`, or any time you want to redeploy):**
```
supabase functions deploy ai-music
```

You should see something like `Deployed Function ai-music` and a URL like `https://<ref>.supabase.co/functions/v1/ai-music`.

**Test it from the browser:** open the live site, click the **🤖 AI** button in the top nav (or press **Ctrl+A**), pick a tab, and run something. The Chat tab streams a response token-by-token; the other tabs return structured JSON.

If you see "AI service 401" → the Anthropic key is missing or invalid. Re-run `supabase secrets set ANTHROPIC_API_KEY=...`.

If you see CORS errors → the function CORS headers should already allow any origin; check that you actually deployed the latest version.

---

## Troubleshooting

- **Page is blank locally** → Open DevTools → Console. Most likely you forgot to fill `.env` or pasted the wrong key.
- **"Multiplayer needs Supabase env vars set"** → Same fix; restart `npm run dev` after editing `.env`.
- **Vercel deploy succeeds but the live site is blank** → Settings → Environment Variables: make sure both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and **Redeploy**. Vite bakes env vars in at build time, so you must redeploy after adding them.
- **Refreshing `/app` or `/room/KLB-1234` shows a 404 on Vercel** → Check `vercel.json` is committed and redeploy. The rewrite rule sends every path to `index.html`.
- **Mic recording silently fails** → Browsers only allow `getUserMedia` on `https://` or `http://localhost`. Vercel's HTTPS handles this; for LAN testing use `npm run dev -- --host` and accept the warning, or test on localhost.
