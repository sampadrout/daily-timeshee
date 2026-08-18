# ⏱️ Daily Timesheet (Secure)

A secure, password-protected web app for logging daily work hours. The frontend is a static site on **Cloudflare Pages**; the data lives in a **Cloudflare D1** database (SQLite) behind protected **Pages Functions** — no external backend service needed, everything stays in your Cloudflare account.

## Architecture

```
Browser ──► https://daily-timesheet.pages.dev
              ├── static site (index.html, styles.css, app.js)
              └── /api/*  (Protected by _middleware.js)
                          └── D1 database: entries + configured tasks
```

API:

| Route | Methods | Auth Required | Purpose |
|---|---|---|---|
| `/api/login` | `POST` | No | Submit password, get SHA-256 session token |
| `/api/entries` | `GET` | **Yes** | List entries (also enforces the 90-day purge) |
| `/api/entries` | `POST` | **Yes** | Create an entry |
| `/api/entries/:id`| `PUT` | **Yes** | Update an existing entry |
| `/api/entries/:id`| `DELETE`| **Yes** | Delete one entry |
| `/api/tasks` | `GET` / `POST`| **Yes** | List / add configured tasks |
| `/api/tasks?name=…`| `DELETE` | **Yes** | Remove a configured task |

## Setup & deploy

```sh
npx wrangler login

# 1. Create the database — note the "Database ID" it prints
npx wrangler d1 create daily-timesheet-db

# 2. Paste that ID into wrangler.toml  (database_id = "…")

# 3. Create the tables in the remote database
npx wrangler d1 execute daily-timesheet-db --remote --file schema.sql

# 4. Deploy (static site + functions)
npx wrangler pages deploy .
```

The site name comes from `name` in `wrangler.toml` (`daily-timesheet`), so it will be live at `https://daily-timesheet.pages.dev`.

### Adding the Login Password

To activate authentication, you must configure the `AUTH_PASSWORD` environment variable in Cloudflare:

1. Go to your **Cloudflare Dashboard** → **Workers & Pages** → **Pages** → Click on `daily-timesheet`.
2. Go to **Settings** (tab) → **Environment variables**.
3. Under **Production** click **Add variable**:
   - **Variable name**: `AUTH_PASSWORD`
   - **Value**: *Your secret master password*
4. Under **Preview** click **Add variable**:
   - **Variable name**: `AUTH_PASSWORD`
   - **Value**: *Your secret master password*
5. Click **Save**.
6. **Re-deploy** your pages branch or run `npx wrangler pages deploy .` again for the environment variable to take effect.

---

### Local development

To run and test locally, set the password in a `.dev.vars` file in the root folder:

1. Create a file named `.dev.vars`:
   ```env
   AUTH_PASSWORD=your_local_password
   ```
2. Start the local server:
   ```sh
   npx wrangler pages dev
   ```

This serves the site and the API locally using a local D1 emulator and your `.dev.vars` password.

## Features

- **Password protection** — a secure modal overlay blocks the app content until unlocked with the correct password. An active session uses a secure SHA-256 token stored in local storage and can be ended with the **Logout** button.
- **Log entries**: date (defaults to today), task, optional description, hours worked (entered as **HH:MM**, e.g. `07:30`).
- **Edit entries**: click the pencil (✎) on any entry to load it back into the form, make changes, and click **Update entry** — or **Cancel** to discard.
- **Intelligent autocomplete**:
  - The **Task** field suggests matching tasks from your configured list as you type (type a new name to create one on the fly).
  - The **Description** field suggests descriptions you've used before, prioritizing ones previously logged against the currently selected task, with the matched text highlighted. Use ↑/↓ + Enter or click to pick a suggestion.
- **Configured task list**: add/remove tasks in their own section, independent of the entry form.
- **90-day retention**: the server deletes entries older than 90 days (by work date) on every read.
- **Download**: export everything as **CSV** (Excel-friendly, hours as decimal) at any time.
- Per-day and overall hour totals shown as `Xh Ym`, dark mode (with manual toggle), works on mobile.

## Data & storage

- All data is in the D1 database in your Cloudflare account. It is accessible across any of your devices by logging in with your password.
- Because entries expire after 90 days, use the download buttons to keep a permanent record.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure + login overlay |
| `styles.css` | Theme (light + dark) + layout + modal styling |
| `app.js` | Frontend logic & session manager (vanilla JS, no deps) |
| `functions/api/_middleware.js` | Auth middleware to protect `/api/*` endpoints |
| `functions/api/login.js` | Login route (hashes password to token) |
| `functions/` | API endpoints (Pages Functions) |
| `schema.sql` | D1 database schema |
| `wrangler.toml` | Project name + D1 binding |
