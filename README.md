# Seat Tracker app

The phone side of the Seat Tracker Chrome extension. It is an installable web app that reads and writes
the same Supabase database as the extension. There is no server of its own; it is hosted on GitHub Pages.

**The extension still does the scanning.** A web page cannot read eBileta, eFinity or Posttick, because
those sites don't allow it and eBileta needs your login. So the app shows what the PCs last scanned, and
says so loudly when no PC is online. Phone alerts keep coming through **ntfy**, even with the app closed.

| Tab | What it shows |
|---|---|
| **Now** | the requests that need you (LOW, SPLIT, SHORT), your events, "Just sold on viagogo" (the last 48 h), "No PC online" |
| **Events** | every tracked event, nearest date first; open one for its requests, buying, sectors and last sales. At the bottom: **viagogo scans** |
| **Inventory** | the lots you bought, across all events: sold, listed, not listed yet, and the money. See [Inventory](#inventory) |
| **Money** | your viagogo listings and sales with profit in lek, worked out exactly as in the extension, and the price calculator |
| **Inbox** | the alerts sent to you this week, and team messages; send one with ✈ |
| **Settings** (👤 on Now) | name, theme, ntfy topic + test, which alerts, quiet hours, defaults, buying accounts and limits, PCs, version |

How it behaves:
- Swipe a request right to mark it done, or left to delete it (5 s to Undo).
- Tap a request or a listing for its sheet. Drag the sheet down, or use Back, to close it.
- A link out (viagogo, the ticket site) opens the phone's browser view. If the phone reloads the app
  when you close it, the sheet you had open comes back, on the same tab (within an hour, on the same
  page).
- Pull down on any list to sync.
- The home-screen icon shows how many requests need you.
- Every top bar has an **Online | N** pill: tap it for which PCs are online and when the others were
  last seen.

## Events

An event's page starts with its date, time and venue (split from the site's title), a **viagogo
event** chip (the event's page on viagogo) and a **Sell on viagogo** chip (viagogo's own sell page
for the event), both once a listing, sale or saved scan tells the app the viagogo event, when it was last scanned and by whom, and its
auto-check.

- **The stadium map** (Air Albania, Pallati i Kongreseve, the Senidah arena). Every section is coloured
  by its free seats, with your requests and listings on it; tap one for its sheet (blocks row by row,
  the site's price, your requests and listings there, and what teammates list there). **Together**
  fades the sections whose longest block is too short for the group. On Posttick, price chips recount
  the free seats for the prices you pick; when an open request here watches other prices,
  **Watch these prices** saves the picked ones to it, and **Request here** starts a new request with
  them (and the ticket count). The map has a second mode, **Sales**: viagogo's last sales,
  tickets sold per section; tap a section to see only its sales, with All / Today / 7 days.
- **viagogo listings**: shown when you have saved a scan of the event's viagogo page. See
  [viagogo scans](#viagogo-scans).
- **Requests**: your open requests with status chips to filter them, then the done ones.
- **Buy**: the stock card, your lots per account, and the price list. See [Buying](#buying).
- **Sectors**: every sector with its free seats.
- **Sold**: what viagogo's "just sold" toast showed for this event (saved by the extension, for the
  whole team), grouped by day, with All / Today / 7 days and a small map that opens the map's Sales
  mode.

**A request and its listing are one sheet.** Tapping either opens the deal: the head shows who, where
to go (viagogo, the section on the ticket site, Tell team) and Seats / Listed / Profit, with four tabs:

- **Seats**: tickets wanted, **Prices** (Posttick: the sector's prices; tap to pick which ones the
  request watches, none picked = every price), side by side, block and options warn, and **Bought** (violet BOUGHT
  replaces the scan's status: no alerts, no badge; only "tickets wanted" stays).
- **Listing**: the viagogo listing, or **Link listing** when there is none yet. Under it, **Lots**:
  which lots its tickets come from (tap one to open it), how many of its sold and listed tickets no
  lot covers yet (still to buy), and **Add lot**.
- **Money**: spent, you'll get, profit per ticket with the win rate (**+ Buy price** in the head
  jumps here when there is none), one buy price (written to both
  the request and the listing), the calculator and the asks for x1.5 to x3.
- **Details**.

A listing nobody tracks gets **Track**, which makes a request for it.

## Inventory

Only what you bought counts. A **lot** is one purchase: so many tickets for one event, with the
account, the price and the date. No lots means **0 tickets** and nothing at risk, whatever you have
listed or sold. You often sell first and buy after: those tickets are on **To buy**, not in stock.

- **Add lot** (on the page, or on an event's Buy tab) asks for the event: a tracked one, or a viagogo
  event you list or sold on that nobody tracks (then the section is typed).
- **Opening a lot** shows it read-only: the event (tap to open it), section and tickets, seats, a bar
  of sold / listed / not listed, the request (tap to open it), account, price, date and order number,
  Spent / From its sales / Covered or At risk, its listings (tap to open each), its sales with a seats
  box each (saves when you leave it), and what was sold outside viagogo (trash to remove one). Three
  separate actions:
  - **Add sale**: put a viagogo sale of the event that no lot covers on this lot in one tap, or record
    tickets sold outside viagogo. Tickets still on a listing come off it (take them off viagogo too).
  - **Change** (next to On viagogo): which listings the lot's tickets are on.
  - **Edit**: the lot's own data only (tickets, request, sector, seats, price, account, date, order
    number, notes). **Cancel** goes back. Delete is here.
  Add sale and Change open in place, scrolled into view with a short glow; a sale you just saved
  scrolls into view and glows the same way. A new lot opens on the form, with On viagogo under it.
- **Where the tickets went** (Change, or the new-lot form, under **On viagogo**): a stepper for each of the
  event's listings (your section first). A lot of 10 can sit on one listing or be split over several.
  When a listing sells, the tickets come off its lots by themselves, oldest lot first. A sale with no
  listing the app knows is put on a lot by hand (sales of other sections are behind a link).
- **Each lot** shows sold, listed (still on an active listing) and not listed (in your hands). A
  listing that ends unsold gives its tickets back to the lot.
- **Seats:** a lot has a Seats note (e.g. `row 5, 10-20`). Under **Sold from this lot** each sale that
  came off it is listed (Sale 1, 2… oldest first) with a box for the seats it took (e.g. `16-20`).
  The row on the Inventory page shows the lot's seats and the seats sold.
- **Sold outside viagogo** (cash, a friend, another site): add it on the lot with tickets, what you got
  a ticket (optional), where, seats and the date. Those tickets count as sold and the money counts in
  the lot's.
- **Once the event is over**, a lot's tickets not counted as sold are **unsold**: no longer in hand or
  at risk, and their cost is **lost**. If you did sell them, open the lot and put them on their sale
  or under Sold outside viagogo.
- **On top:** a bar of sold, listed, not listed and unsold, then In hand, Spent, From their sales (with
  what is not paid yet) and Covered or **At risk** (with what each ticket left must bring; what finished
  events lost is shown apart, not spread over the tickets left). **Filters:** In hand (the default), Not
  listed, Unsold (only when there are), All lots. Open an event for its lots and **Add lot here**.
- **Uploaded on viagogo, no lot:** a listing whose tickets viagogo says are uploaded (`PreDelivered`,
  read by the extension's Scan all listings) with no lot behind it. **Add lot** opens the lot filled
  in from the listing (event, section, tickets, buy price, on that listing); check the account and
  price, then save. Nothing is made without you. × hides it on this phone.
- **To buy** (folded, at the bottom): the tickets you listed or sold with no lot, event by event, each
  with **Add lot**. An event drops off the list once its day has passed.

Needs `schema.sql` run again (new columns on `purchases` and `listings`); until then saving a lot says so.

## Money

- **Listings**: profit if all sell, tickets listed, and how many are priced below break-even; then
  every listing by event, with its profit and win rate. Deactivated and sold are hidden until **Show
  deactivated and sold**. A listing with no buy price says **+ buy price**: tap it to type one (any
  listing, also of an event nobody tracks), and its profit and multiplier show from then on.
- **Sales**: the same as the extension's sales sidebar. Four tiles (profit with the win rate, sold,
  spent, you get), then each event with **By section** or **All sales**. Every sale shows its date,
  section, tickets, sale number, buy price, what it sold for, and its profit with its own win rate
  (`+4,504 L (x1.6)`), then `spent + profit = you get`; tap it for the details. Sales are numbered per
  event, oldest = 1, so the numbers stay put when new ones arrive. **Select** ticks sales (or a whole
  event or section) and a bar adds them up. A sale whose tickets came off a lot costs what the lot
  paid (see [Buy price from your lots](#buy-price-from-your-lots)). Buy prices for other sales without
  one are typed in the extension's sales sidebar.

### Buy price from your lots

A lot is what you really paid, so for the tickets that came from a lot, the lot's price is the buy
price: on its listing, on that listing's request, and on every sale that took them. It wins over a
price typed on the listing and over the site's price. Tickets no lot covers keep the old buy price
("your lot for 4, section price for 2"); with none, the lot's price stands for them too. Lots with
no paid price are left out. The extension does not know your lots, so its numbers keep the typed or
site price.
- **Calculator**: what the tickets cost and what you would ask, in any two currencies, give viagogo's
  payout, the profit, the win rate and the break-even; a buy price alone gives the asks for x1.5, x2,
  x2.5 and x3. It uses the same code as the extension, so it always agrees with a real listing.

The search box finds a section, a listing or sale number, or an event; the totals then count only
what matches.

## viagogo scans

Scans of a viagogo event page are made **on a PC**, in the drawer at the bottom of the event page:
press **Scan**, then **Save scan**. viagogo cannot be read from a phone. The app shows them:

- **Events → viagogo scans** lists every event you saved a scan of; an event's page links its own as
  **viagogo listings**.
- **Only the newest 2 are kept per event.** A third save deletes the oldest, in the app and on every
  PC. Pick the newer or the older one at the top.
- **Listings** shows the scan with the drawer's filters: By section or By price, search, **My listings
  only**, **Instant download**, the sort, stand chips (N, E, S, V, W, Corners), and in By price the
  ticket chips (Any, Single, 1 to 10, 10+) and the sector price. Tap a section for every listing in it;
  on a tracked event it also shows eBileta's free seats there.
- **Changes** compares the older scan with the newer one: new and removed listings, prices that went
  down or up, ticket counts that changed, per section and in total, with chips per kind and **Only
  sections that changed**. It warns when one scan was signed in and the other signed out (their prices
  are not comparable) or when one was only partly read.
- **Reset saved scans** (at the bottom) deletes the event's saved scans, here and on every PC.

Saved scans are yours alone: a signed-in scan marks your listings and shows prices as viagogo shows
them to you. The drawer's Face value tab and its "No price" panel are PC-only.

## Buying

The **Buy** tab of an event:

- **Stock**: the event's lots (see [Inventory](#inventory)) and what happened to their tickets: a bar
  of sold, listed and not listed yet. Then the money, in lek: **Spent**, **From their sales** (with
  what is not paid yet), **Still holding**, and **Covered** or **At risk**, with the price to list the
  rest at to get your money back, and what you end at if the listed tickets sell at today's price.
  Tickets listed or sold here with no lot are counted apart, as still to buy. **Lots** lists them.
- **Lots per account**: tickets bought with each email against the site's limit per account (or
  the event's own), which account to use next, and **Add lot**. A lot linked to a request that
  covers its tickets marks it Bought.
- **Price list**: what a ticket costs in each sector, shared with the team. A price typed here beats
  the site's; Add lot fills its price from it.

**Settings → Buying** holds your buying accounts (email, names, birthday, notes: yours alone) and the
limit of tickets per account for each site (the whole team's). The extension's eBileta checkout drawer
fills the ticket holders from these accounts and adds the order as purchases.

## What the app writes, and what it never writes

It writes your requests, your settings and profile, mute, buy prices on your listings, team messages,
your buying accounts and lots (purchases, with where their tickets went), the price list, buy limits (team settings), and it can delete your
saved viagogo scans and Seat Tracker's copy of a listing (never the listing on viagogo). It **never** writes scans, leases, event health, event lists, devices, exchange
rates or members: those belong to the PCs that scan. The only write to `request_state` is the
extension's own reset of a request's baseline after you change it, so your own edit never alerts you.
`tests/boundary.test.js` holds the code to this.

A request added from the phone is judged at the next scan any PC makes (its event's auto-check). Until
then its card shows a **preview** from the team's last scan of that sector.

After a change to the database (`supabase/schema.sql` in the extension), run that file again in
Supabase before publishing the app: a page whose table is missing stays empty until then.

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
npm test                   # view model, sync, the write boundary, stock, viagogo scans
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
