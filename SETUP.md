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

## 4. Supabase Edge Function for AI (free, no payment method)

The AI features call a Supabase Edge Function (`ai-music`) that proxies **Groq** (free tier — 14,400 requests/day, available globally, no credit card). Function source is already in this repo at [`supabase/functions/ai-music/index.ts`](supabase/functions/ai-music/index.ts).

> *Why Groq instead of Gemini?* Google's "free" tier is geo-restricted — many countries get `limit: 0` quotas. Groq's free tier works worldwide.

**Everything below is web-UI only — no terminal needed.**

### 4a. Get a free Groq API key
1. Go to https://console.groq.com/keys
2. Sign up (email or Google) — no credit card asked.
3. Click **Create API Key** → name it `klabmusic` → copy the `gsk_...` key.

### 4b. Deploy the Edge Function from the Supabase dashboard
1. https://supabase.com/dashboard → your KLabMusic project.
2. Left sidebar → **⚡ Edge Functions** → **Deploy a new function**.
3. **Function name:** `ai-music` (must be exact — the frontend calls this URL).
4. In the in-browser code editor, **delete everything and paste** the full contents of [`supabase/functions/ai-music/index.ts`](supabase/functions/ai-music/index.ts).
5. **Deploy function**. Wait ~10 sec until status is green.

### 4c. Add the Groq key as a secret
1. Project Settings (gear, bottom-left) → **Edge Functions** → **Secrets**.
   *(Or: Edge Functions page → click `ai-music` → "Manage Secrets".)*
2. **Add new secret**.
   - Name: `GROQ_API_KEY`
   - Value: paste your `gsk_...` key
3. Save.

### 4d. Test it
1. Open your Vercel URL → click **🤖 AI** in the top nav (or press **Ctrl+A**).
2. Chat tab → ask "give me a sad chord progression in A minor" → Enter.
3. Reply streams in token-by-token.

Errors and what they mean:
- `GROQ_API_KEY not set...` → secret didn't save, redo step 4c.
- `Groq API 401` → key is wrong or got rotated; create a fresh one and re-save the secret.
- `Groq API 429` → you hit the free 14,400/day quota; resets in 24h.

### Want to swap providers later?
Edit the function source, change the upstream URL + body (Groq, OpenRouter, Anthropic, OpenAI all work), redeploy via the web UI. The frontend doesn't change — it consumes a generic `{text}` SSE shape that the function normalizes.

---

## Troubleshooting

- **Page is blank locally** → Open DevTools → Console. Most likely you forgot to fill `.env` or pasted the wrong key.
- **"Multiplayer needs Supabase env vars set"** → Same fix; restart `npm run dev` after editing `.env`.
- **Vercel deploy succeeds but the live site is blank** → Settings → Environment Variables: make sure both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, and **Redeploy**. Vite bakes env vars in at build time, so you must redeploy after adding them.
- **Refreshing `/app` or `/room/KLB-1234` shows a 404 on Vercel** → Check `vercel.json` is committed and redeploy. The rewrite rule sends every path to `index.html`.
- **Mic recording silently fails** → Browsers only allow `getUserMedia` on `https://` or `http://localhost`. Vercel's HTTPS handles this; for LAN testing use `npm run dev -- --host` and accept the warning, or test on localhost.
