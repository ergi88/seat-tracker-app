# Seat Tracker app

The phone side of the Seat Tracker Chrome extension. It is an installable web app that reads and writes
the same Supabase database as the extension. There is no server of its own; it is hosted on GitHub Pages.

**The extension still does the scanning.** A web page cannot read eBileta, eFinity or Posttick, because
those sites don't allow it and eBileta needs your login. So the app shows what the PCs last scanned, and
says so loudly when no PC is online. Phone alerts keep coming through **ntfy**, even with the app closed.

| Tab | What it shows |
|---|---|
| **Now** | the requests that need you (LOW, SPLIT, SHORT), your events, "No PC online" |
| **Events** | every tracked event; open one for its requests, its sectors and their free seats |
| **Money** | your viagogo listings and sales with profit in lek, worked out exactly as in the extension |
| **Inbox** | the alerts sent to you this week, and team messages; send one with ✈ |
| **Settings** (👤 on Now) | name, theme, ntfy topic + test, which alerts, quiet hours, defaults, PCs |

How it behaves:
- Swipe a request right to mark it done, or left to delete it (5 s to Undo).
- Tap a request for its sheet. Drag the sheet down, or use Back, to close it.
- Pull down on any list to sync.
- The home-screen icon shows how many requests need you.

## What the app writes, and what it never writes

It writes your requests, your settings and profile, mute, buy prices on your listings, and team
messages. It **never** writes scans, leases, event health, event lists or devices: those belong to the
PCs that scan. The only write to `request_state` is the extension's own reset of a request's baseline
after you change it, so your own edit never alerts you. `tests/boundary.test.js` holds the code to
this.

A request added from the phone is judged at the next scan any PC makes (its event's auto-check). Until
then its card shows a **preview** from the team's last scan of that sector.

## Shared code

`src/shared/sk/` holds copies of the extension's pure modules (`core/*.js`, `sites/*.js`): request
statuses, blocks, prices, profit and settings come from the same code as the extension. **Never edit
them here.** Change the extension, then run:

```
npm run sync-core          # copies from ../seat-tracker (or SK_EXTENSION=/path)
```

`npm test` and every deploy fail if a copy was edited by hand, or if the extension next door has
changed since the last copy.

## Develop

```
npm install
npm run dev                # http://localhost:5173
                           # http://localhost:5173/?demo  a made-up team, no sign-in, nothing sent
npm test                   # view model, sync, the write boundary
npm run build              # production build in dist/
npm run icons              # redraws public/icons (needs Chrome)
```

Demo mode exists only in `npm run dev`; the production build does not contain it.

## Publish on GitHub Pages (free account: the repo must be public)

1. Create a **public** repository on GitHub, e.g. `seat-tracker-app`, and push this folder to `main`.
   Only this folder: never the extension, `supabase/schema.sql` (it lists the team's emails) or capture
   files. `.gitignore` already keeps `*.sql`, `*.zip` and `*capture*` out.
2. Repository **Settings → Pages → Source: GitHub Actions**.
3. Every push to `main` tests, builds and publishes to `https://<you>.github.io/<repo>/`.
4. In Supabase: **Authentication → URL Configuration → Site URL** = that address.
   "Allow new users to sign up" stays **off**.

The site is public; the data is not. Without a team member's login the page opens nothing. The
publishable key it ships is the extension's, public by design (see the extension's README).

## Install on the phone

- **iPhone (Safari):** open the address → Share → **Add to Home Screen**.
- **Android (Chrome):** open the address → ⋮ → **Install app**.

A new version shows "A new version of Seat Tracker is ready" with **Reload**. It never switches in the
middle of something you're doing.
