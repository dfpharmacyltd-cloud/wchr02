# WESTCOAST AI Procurement Agent — v2

Type an API name once → get one clean list of manufacturers with **email, phone and WhatsApp number** → test the message on yourself → send to everyone by **Outlook email** and **WhatsApp (WATI)** in one click.

---

## What's new in v2

| | |
|---|---|
| **Find suppliers (home page)** | One form: API, quantity, pharmacopoeia, country, how many. Runs Apollo + web search, reads each company's own website (home + contact/about pages) for emails, phones and WhatsApp links, then shows a numbered list. |
| **Country lock** | "Only companies in the chosen country" (default India) keeps a company only with proof: `.in` domain, `+91` phone, an Indian address/state on its website, or Apollo's country. Others are listed separately with the reason. |
| **Missing emails** | First from the company website (incl. Cloudflare-protected emails), then optionally Apollo (uses credits, asks first). Emails are never guessed. |
| **Free Google option** | Google Gemini (free tier, Google Search grounding) and Serper (Google results). **Auto** mode tries Claude → Gemini → Serper, so if one API fails the next one works. AI extraction also falls back Claude → Gemini. |
| **Outlook** | Each user connects their own Outlook (Microsoft Graph). Drafts are created in Outlook, or sent directly; supplier replies sync back automatically. |
| **WhatsApp** | WATI approved templates, smart field mapping, test on your own number first, then one-click send. |
| **Test first** | "Send all" stays locked until the test email / WhatsApp has gone to you and you tick "the text is correct". |
| **Users** | Login for everyone. Admin adds users (admin / procurement / viewer). All users see the same data from anywhere. |
| **Backups** | Every result is saved in the database instantly; plus "Excel (all data)", JSON backup, server snapshots (last 14) and a daily automatic snapshot. |
| **Light UI** | New light design (dark mode in Settings). |

---

## Purchase inquiries with vendor quotation links (v2.3)

* **Item master** — products / materials with code, make, quantity, UOM, specification, packing, artwork files (Google Drive) and approved vendors.
* **Vendor master** — upload your vendor Excel (or add one by one).
* **New inquiry** (3 steps) — choose RM / PM → add items (picked from Item master, files attached automatically, more items with *+ Add another item*, or copy a previous inquiry) → delivery time/location, common attachments, vendors (item vendors pre-selected) → review, test email to yourself → **Create inquiry & send**. Code format `INQ-2026-10-15`.
* Every vendor receives an email (from your Outlook, CC kcp@ / parth@) with the item table and a **personal link**. On that page the vendor fills Rate, Discount, Final/Net rate, Tax, MRP, Delivery, Packing, Freight, Insurance, Payment terms, Validity, Remarks and submits **once**. They get a "Quotation Received" email automatically.
* **Inquiry management** — per item, all vendor quotes side by side. The **lowest rate row is highlighted in light green** with a "Lowest rate" badge; others show how much higher (%). Toggle *Compare including tax*. **Finalize** sends the "Quotation Finalized" email with your remarks (e.g. FINAL PRICE MAKE RS.70). Copy link / resend reminder for vendors who have not replied. Excel export of the comparison.
* Net rate = Final/Net rate if the vendor filled it, otherwise Rate − Discount %. "With tax" = net × (1 + Tax %).

## Google Drive (cloud copy of everything)

1. console.cloud.google.com → create a project → **APIs & Services → Library → Google Drive API → Enable**.
2. **OAuth consent screen** → User type *External* (or *Internal* for Google Workspace) → app name "WESTCOAST Procurement" → add scope `.../auth/drive.file` → **Publish app** (status *In production*). `drive.file` is a non-sensitive scope, so no Google review is needed; in *Testing* status Google expires the connection every 7 days.
3. **Credentials → Create credentials → OAuth client ID → Web application** → Authorized redirect URI: `https://purchasea1.vercel.app/api/gdrive/callback`.
4. Vercel variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and `APP_URL`) → Redeploy.
5. App (admin) → **Integrations → Connect Google Drive** → choose the company Google account → Allow.
   The app creates **WESTCOAST Procurement / Backups** and **/ Inquiry files** and can only see files it created.
* Attachments uploaded in Item master / New inquiry go to *Inquiry files*; vendors get a view link.
* **Backups → Back up to Google Drive now** saves JSON + Excel. Automatic: when the app is opened and after every important action (import, inquiry sent, finalize…) — at most every 2 hours — plus twice a day by Vercel Cron (about 1:00 PM and 2:00 AM India time, needs `CRON_SECRET`).

## Gmail (send from Gmail)
Uses the same Google Cloud project as Drive:
1. Google Cloud → **Clients** → your Web client → add redirect URI `https://purchasea1.vercel.app/api/gmail/callback` → Save.
2. **Data access → Add or remove scopes** → add `.../auth/gmail.send`, `.../auth/userinfo.email`, `openid` → Update → Save. `gmail.send` is a *sensitive* scope: until Google verifies the app, users see "Google hasn't verified this app" → **Advanced → Go to WESTCOAST Procurement** (fine for internal use, max 100 users).
3. App → **Integrations → Connect Gmail** (each user connects their own Gmail).
The tool can only **send** from Gmail; it cannot read Gmail, so replies to Gmail are not counted automatically (log them in Supplier replies, or send via Outlook).

## Sending options
* Outlook or Gmail per send; **BCC** field; mode **Separate email to each vendor** or **One email, all vendors in BCC** (max 50 per email).
* Attachments up to **100 MB per file** (uploaded 3 at a time in 4 MB chunks). Files that would push an email over ~20 MB (Outlook) / ~24 MB (Gmail) are sent as Google Drive download links automatically.
* **Sent so far** panel: per template — sent, failed (with reason, *Select failed* to retry), replied, waiting, reply rate. Same table across all requests in RFQ drafts → Templates.

## Local backup on your PC
**Backups → Choose backup folder** (Chrome / Edge on a PC) → pick e.g. `D:\Westcoast Backup`. A JSON + Excel copy is written there immediately, and again automatically once a day when you open the app on that PC. **Download** buttons still work everywhere.

## Miscellaneous and Logistics (v2.8)
* Departments are now **RM, PM, MISC, LOG** (Users → Department; "All departments" can switch at the top).
* New inquiry types: Raw materials, Packing materials, **Miscellaneous**, **Logistics – Sea Freight**, **Logistics – Air Freight**.
* Logistics: enter shipment details (buyer, destination, ports, cartons, gross / volume weight, dimensions, CBM…), choose INR or USD, pick forwarders (tag them "Air freight" / "Sea freight" in the Vendor master Material column so they are suggested). Forwarders get the short link; their form adds up the **Total** live (air: total freight or rate × chargeable weight + charges; sea: ocean freight + charges). The lowest total is highlighted; Finalize / Excel work as for materials.

## PM / RM departments (v2.2)

* Every user has a **Department**: **PM** (Packing Material), **RM** (Raw Material) or **Both**. Set it in *Users*.
* PM users only ever see and change PM data; RM users only RM. The server enforces this — not just the screen.
* Users with "Both" (e.g. the admin) switch with the **RM | PM** buttons at the top right.
* Request numbers: `PM-2026-0001`, `RM-2026-0001`. Existing older data counts as RM.
* **My suppliers (upload)**: upload your company's supplier Excel/CSV (any column names — the tool detects them, you can correct the mapping). Filter by material, state, city → select → **Send one inquiry** → test on yourself → send to all. Replies appear on the same page (*Check Outlook for replies*).
* PM gets its own email template ("Standard PM RFQ" with item, quantity, specification); RM keeps the API template. Placeholders `{{MATERIAL}}` and `{{SPECIFICATION}}` are available.

## Store everything in your own MySQL (phpMyAdmin)

`php-bridge/wc-bridge.php` is a single PHP file you upload to your existing PHP hosting (cPanel, Hostinger, etc.). The app saves every record through it into MySQL, so you see all data in phpMyAdmin. Works with any shared hosting — no "Remote MySQL" needed.

1. Hosting panel → **MySQL Databases**: create a database + user, give the user ALL PRIVILEGES.
2. Open `wc-bridge.php`, fill in the 5 lines at the top (DB name, user, password, a 40+ character `$BRIDGE_KEY`).
3. Upload it with File Manager to `public_html/` — give it a hard-to-guess name, e.g. `wc-bridge-x7k2.php`. The site must use **https**.
4. Vercel variables: `PHP_BRIDGE_URL=https://yourdomain.com/wc-bridge-x7k2.php`, `PHP_BRIDGE_KEY=` same key. Remove `SUPABASE_URL` (or leave it — the bridge wins). Redeploy.
5. phpMyAdmin → your database: table `wc_records` holds everything; easy views `v_suppliers`, `v_contacts`, `v_purchase_requests`, `v_messages`, `v_replies`, `v_audit`.
Moving from Supabase: Backups → JSON backup first, switch, then Backups → Restore.
Free hosts with bot protection (e.g. InfinityFree) block server-to-server calls — use real hosting.

## Deploy on Vercel (step by step)

### 1. Supabase table (one time)
Supabase → SQL Editor → run:
```sql
create table if not exists public.wc_records (
  coll text not null, id text not null, doc jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (coll, id)
);
alter table public.wc_records enable row level security;
```
(Already created it for v1? Nothing to do — v2 uses the same table.)

### 2. Environment variables
Vercel → Project → **Settings → Environment Variables**. Minimum:

| Name | Value |
|---|---|
| `SESSION_SECRET` | 32+ random characters |
| `ADMIN_SETUP_KEY` | any secret word (used once to create the admin) |
| `APP_URL` | `https://your-site.vercel.app` (no `/` at the end) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Project Settings → API |
| `GEMINI_API_KEY` | free from **aistudio.google.com → Get API key** |

Add the others from `.env.example` as you need them (Claude, Serper, Apollo, Outlook, WATI, `CRON_SECRET`).

### 3. Deploy
Push this folder to GitHub (replace the old files) → Vercel deploys. `server.js` is the entry Vercel uses.
Settings → Functions → raise **Max Duration** if your plan allows (search + website reading can take 30–90 s).

### 4. First login
Open the site → **Create the administrator** (enter the setup key) → **Users → Add user** for the team.

---

## Connect Outlook (Microsoft Entra, 10 minutes)

1. portal.azure.com → **Microsoft Entra ID → App registrations → New registration**.
   Name: `WESTCOAST Procurement`. Supported accounts: *this organization only* (or multi-tenant).
   Redirect URI → **Web** → `https://your-site.vercel.app/api/outlook/callback`
2. **Certificates & secrets → New client secret** → copy the **Value**.
3. **API permissions → Add → Microsoft Graph → Delegated**: `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access` → **Grant admin consent**.
4. Vercel variables: `MS_CLIENT_ID` (Application ID), `MS_CLIENT_SECRET`, `MS_TENANT_ID` (Directory ID, or `common`), `APP_URL`. Redeploy.
5. In the app: **Integrations → Connect Outlook** (each user connects their own mailbox).

## Connect WhatsApp (WATI)
1. WATI dashboard → **API Docs** → copy the **API Endpoint** (contains your tenant ID) and **Access Token**.
2. Vercel variables: `WATI_API_ENDPOINT`, `WATI_ACCESS_TOKEN`. Redeploy.
3. WATI → **Templates** → create an inquiry template (Utility or Marketing), e.g.
   `Hello {{name}}, WESTCOAST PHARMACEUTICAL WORKS LTD. requires {{api}} ({{qty}}). Please share your best offer, COA and DMF status.`
   Wait until WhatsApp approves it — only approved templates can be sent.
4. In **Send inquiry** choose the template; fields are mapped automatically (change if needed).

> WhatsApp rules: business-started messages must use an approved template, and recipients should have agreed to be contacted. Bulk messages to people who did not opt in can get the number restricted by WhatsApp. A "WhatsApp" number in the list is a mobile number found on the company's site — not proof it uses WhatsApp.

## Other keys
* **Claude**: `ANTHROPIC_API_KEY` (+ `ANTHROPIC_WORKSPACE_ID` if the key isn't workspace-scoped).
* **Serper**: serper.dev → API key → `SERPER_API_KEY` (2,500 free searches).
* **Apollo**: `APOLLO_API_KEY` (needs organization search, people search, bulk enrichment).
* **Daily backup**: `CRON_SECRET` (vercel.json already schedules `/api/cron/snapshot` every night).

## Run on a PC instead
Node.js 20 → `start-windows.bat` (or `npm install && npm start`) → http://localhost:3000. Data is saved in `data/`; login secret is created automatically.

## Security
Passwords hashed (scrypt) · signed HttpOnly session cookies · roles enforced on the server · Outlook tokens encrypted (AES-256-GCM) · API keys only on the server · CSRF header check · strict CSP · SSRF-guarded website reader · audit log append-only and stamped by the server with the signed-in user · website/email text treated as untrusted (cannot approve suppliers or send mail).

## Tests
`npm test` — 13 server tests against **mock** providers (`test/mock-providers.js`): login/setup, roles, CSRF, Claude→Gemini fallback, invented-URL dropping, Serper marketplace filter, website email/phone/WhatsApp extraction (incl. Cloudflare emails, no fax/CAS false positives), India check, Outlook OAuth→draft→send→inbox, encrypted tokens, WATI templates/send, Apollo, snapshots/cron. A full browser run (find → send → reply sync → users → backups) was also done against the mocks. **Mocks are not proof the live APIs work** — use *Integrations → Run test* with real keys.

## Feature status
| Feature | Status |
|---|---|
| Login, users, roles | Implemented, tested |
| Find suppliers (Apollo + web + website reader + country lock) | Implemented, tested with mocks |
| Gemini / Serper / Claude search with automatic fallback | Implemented, tested with mocks — live needs keys |
| Outlook connect, drafts, send, reply sync | Implemented, tested with mocks — live needs Entra app |
| WhatsApp via WATI | Implemented, tested with mocks — live needs WATI + approved template |
| Backups (Excel, JSON, snapshots, daily cron) | Implemented, tested |
| Item master, multi-item inquiries, vendor quotation links, lowest-rate highlight, finalize emails | Implemented, tested (server + browser) |
| Google Drive attachments + cloud backup, local folder backup | Implemented, tested with mocks — live needs Google OAuth client |
| PM / RM departments, supplier-list upload, bulk inquiry, replies per inquiry | Implemented, tested (server + browser) |
| MySQL / phpMyAdmin storage via PHP bridge | Implemented — full test suite + browser flow passed on MariaDB 10.11 / PHP 8.3 |
| Delivery/read receipts for WhatsApp (WATI webhooks) | Not yet — status shows "accepted by WATI" |
