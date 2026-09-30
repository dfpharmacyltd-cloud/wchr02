# West-Coast Recruitment Mailer

Candidate Excel → change detection → status template → Outlook → email status and log.

## Files

| File | Purpose |
|---|---|
| `index.html` | The complete app (single file) |
| `redirect.html` | Blank page Microsoft sign-in returns to. Keep it next to `index.html` |
| `Sample_1_start.xlsx` | Three test candidates in the bio-data list format |
| `Sample_2_update.xlsx` | Same people with status and interview changes, plus one new applicant |

## 1. Deploy (Vercel, 2 minutes)

1. Put `index.html` and `redirect.html` in a new folder (or GitHub repo).
2. In Vercel: **Add New → Project**, import the folder/repo, framework preset **Other**, no build command. Deploy.
3. Note the URL, for example `https://westcoast-recruitment.vercel.app`.

Any static host works (Netlify, IIS, an internal web server). It must be served over **https** (or `http://localhost` for testing); Microsoft sign-in does not work from a file opened directly from disk.

## 2. Register the app with Microsoft (one time, needs an M365 admin)

1. Go to **entra.microsoft.com → Applications → App registrations → New registration**.
2. Name: `West-Coast Recruitment Mailer`. Supported accounts: **Accounts in this organizational directory only**.
3. Redirect URI: platform **Single-page application (SPA)**, value `https://<your-site>/redirect.html` (the app's Settings page shows the exact value to copy).
4. Register. Copy the **Application (client) ID** and **Directory (tenant) ID**.
5. **API permissions → Add → Microsoft Graph → Delegated**: `User.Read` and `Mail.Send`. Click **Grant admin consent**.

No client secret is created or needed. The app uses the OAuth 2.0 authorization-code flow with PKCE; the HR user signs in on Microsoft's own page, and the app only ever receives a short-lived token limited to reading the profile and sending mail as that user. Passwords are never seen or stored.

## 3. First run

1. Open the site → **Settings** → paste the client ID and tenant ID → untick **Simulation mode** → **Save connection settings**.
2. Click **Connect Outlook** in the sidebar and sign in with the HR mailbox.
3. **Settings → Users & roles**: add yourself as Admin, then add colleagues (HR Manager, HR Executive, Viewer).
4. Fill in HR name, email, mobile and signature.
5. **Upload Excel**: upload the full bio-data list with **Import as starting point** ticked (the default for the first upload), so the existing ~2,250 people are not emailed. From then on only new applicants and status changes send emails.
6. **Statuses & automation → Send test email** to your own address. After it succeeds you can switch to **Auto mode**.

Tip: leave Simulation mode on first and run the two sample files through the full flow. Addresses containing `fail` simulate a failed send so you can see the retry path.

## Your file format (bio-data list)

The export works exactly as it comes, .csv or .xlsx:
`Post, Qualification, Candidate Name, Mobile No, Email Id, City, Experience, Remark, Entry By, Entry Date`

- Only **Candidate Name** and **Email Id** are required.
- **Candidate ID** is created automatically (WC00001, WC00002…) and is tied to the email address (or mobile if there is no email), so the next export matches the same people.
- **No status column?** New people get the default status (Application Received) and its email. Change the default under Statuses & automation.
- **Moving candidates forward:** Candidates page → tick people → **Change status of selected** (with interview date and time if needed). Or add `Candidate Status`, `Interview Date`, `Interview Time` columns to the file.
- **Clean-up on upload:** extra text around emails is removed (`: name@gmail.com`, two emails in one cell, `gmail;.com`, stray spaces); +91 / leading 0 is removed from mobiles; a person listed more than once is kept once, using the latest Entry Date. Addresses that still can't be fixed are listed under the **Invalid or missing email** filter.
- **Download updated Excel** uses the same headings (Post, Mobile No, Email Id, Remark…) plus the ID, status and email columns.
- {{Position}} is the Post (several posts are joined with commas). {{Qualification}}, {{Experience}}, {{City}}, {{Entry_Date}} work in templates. {{Location}} uses the interview venue from settings when the file has no Location column.

## How change detection works

- Candidates are matched by **Candidate ID**. A new ID, or a changed **Candidate Status**, triggers an email; nothing else does.
- Duplicate protection key: `Candidate ID + Status + Template` (reminders also include the interview date). Re-uploading the same file sends nothing. **Resend** in the Email log sends again on purpose.
- Optional **Email Template** column: a template name here overrides the status template for that row. Leave it blank normally.
- Columns not in the standard list are added automatically and usable as `{{Column_Name}}` variables.
- After processing, **Download updated Excel** gives the file back with Email Sent, Email Sent Date/Time and Email Status filled in.

## Things to know

- **Data lives in the browser** (IndexedDB) on the computer where the app is used. Use one HR computer and one browser profile, and use **Settings → Download backup** weekly. Other computers see their own separate data.
- **Interview reminders** are sent by the open page. Keep the app open in a browser tab on the HR computer; if it was closed at the due time, overdue reminders go out when it next opens (if the interview hasn't happened).
- **Roles** are enforced in the app for whoever is signed in to Outlook in that browser. They stop accidental changes; they are not a server-side security boundary.
- **Attachments**: up to 3 MB total per email (Microsoft Graph limit for this sending method). Share larger files via a link.
- **Sender name**: candidates see the mailbox's own display name from Microsoft 365. Ask your M365 admin to set it (for example "West-Coast HR") or use a shared HR mailbox account.
- **Sending in batches** (Statuses & automation → Sending speed): default 200 emails every 5 minutes, with a daily stop limit. Emails wait in the sending queue (status *Queued*) and go out batch by batch; you can pause, resume or send the next batch now from the Queue page. Keep the page open while it sends; if it is closed, sending continues from where it stopped when you open it again.
- **Outlook's limit**: Exchange Online accepts about 30 messages per minute per mailbox, so emails are spaced at least 2 seconds apart. 200 per batch therefore takes about 7 minutes; the next batch starts right after. For an exact 5-minute rhythm use 140 per batch. If Outlook still asks the app to slow down, the email stays queued and is retried automatically. Daily limit: 10,000 recipients per mailbox (your IT team may set it lower).
