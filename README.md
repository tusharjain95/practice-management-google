# 📊 CA Practice Manager

> The modern operating system for Chartered Accountant firms — Leads, Tasks, Clients, Invoices, Payments, Quotations, and PDF generation, all in one place.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CA Practice Manager replaces the spreadsheets, WhatsApp groups, and manual filing that small-to-medium CA firms use today. It is built as a single full-stack Next.js app with MongoDB — fast, self-hostable, and free of third-party SaaS lock-in.

---

## ✨ Features

### 🔐 Authentication & Roles
- Secure JWT-based login (no third-party auth dependency)
- Three roles with distinct dashboards:
  - **Admin** — full access, can manage staff, branding, deletes
  - **Manager** — can manage leads, tasks, clients, invoices, payments
  - **Staff** — sees only their own assigned tasks and leads
- Self-service password change for every user
- Admin-driven password reset with random password generator

### 🎯 Lead Management
- Full CRUD with status pipeline (New → In Progress → Converted / Cancelled)
- Filters by status, service type, assigned staff
- Dynamic column-based sorting (by Name, Contact, Service, Source, Status, Assigned, and Follow-up date)
- Per-lead follow-up notes with timestamp + author
- Follow-up dates with calendar integration
- One-click **Convert Lead → Task** workflow (preserves lead linkage)

### 🧑‍💼 Task Management
- Two creation flows: **from a Lead** OR **direct** (for internal/recurring work)
- Categories (Tax, Audit, GST, Filing, Internal, Other)
- Priorities (Low, Medium, High, Urgent) with color coding
- Comments per task with author + timestamp
- Filter by status, priority, category, assignee
- Dynamic column-based sorting (by Title, Category, Priority, Status, Due Date, and Assigned Staff)
- Automatic **overdue** detection and visual flagging
- 🔁 Recurring tasks — Monthly / Quarterly / Yearly. On completion, the next occurrence auto-spawns with shifted due date (idempotency-protected)

### 🏢 Client Management
- Full client master with GSTIN, PAN, address, contact details
- **Opening balance with "as on" date** (mandatory) — essential for accurate carry-forward and aging
- Per-client computed dashboard: Billed, Received, Net Due, Invoice Count
- Linkable to leads (when converting)

### 🧾 Invoice Generation
- Auto-numbered invoices in `INV-YYYY-NNNN` format
- Multi-line items with qty × rate
- Optional 18% GST toggle
- Auto-calculated subtotal, tax, total
- **Branded PDF** with your logo, firm details, bank/UPI info, and footer text
- Status auto-managed: Unpaid → Partial → Paid

### 💰 Payment Tracking
- Record payments by mode: Cash / Bank / UPI / Cheque / Card / NEFT-RTGS
- Reference field for UTR / cheque number
- **Auto-syncs invoice status** when payment is recorded or deleted
- "On-account" payments (no specific invoice) reduce opening balance
- Per-client **running-balance ledger** view

### 📊 Receivables (Aging Report)
- Industry-standard buckets: **Current / 1-30 / 31-60 / 61-90 / 90+ days**
- 🍩 Donut chart of aging distribution
- 📊 Stacked bar chart of top 10 outstanding clients
- 📋 Full client-wise table with bucket breakdown
- 📤 Excel export with all buckets and aging metadata
- Smart bucketing: opening balance is aged from its "as on" date; each invoice is aged from its due date

### 📄 PDF Quotations
- Professional branded quotation with auto-number `QT-YYYY-NNNN`
- Multi-line services with quantity, rate, description
- GST toggle (18%)
- Validity date + custom terms
- Custom firm branding (logo, address, GSTIN, contact)
- Instant download on save

### 🎨 Custom Branding
- Upload firm logo (PNG/JPG)
- Set firm name, address, contact, GSTIN, email, phone
- Bank account, IFSC, UPI ID — auto-embedded in invoice PDFs
- Custom PDF footer text
- Applied automatically to all quotation and invoice PDFs

### 📅 Calendar View
- Monthly grid showing tasks (blue) and lead follow-ups (amber)
- "Today" highlighted, navigation with prev/next/today buttons
- Click any event to jump to detail

### 🔔 Reminders
- Top-bar bell with unread badge count
- Auto-refreshes every 60 seconds
- Categorizes: Overdue tasks, Due today, Upcoming 7 days, Follow-ups (overdue/today/upcoming)
- Staff sees only their own; managers/admins see everything

### 🔍 Global Search
- Top-bar live search across **Leads, Tasks, Clients, Invoices, Quotations**
- Case-insensitive partial match
- Click any result to navigate

### 🟢 WhatsApp Notifications & Daily PDF Roster
- **Instant Alerts**: Automated WhatsApp notifications triggered on Task Assignment and Task Reassignment to keep staff informed in real-time.
- **Daily 9:30 AM Roster**: Scheduled cron job that automatically generates a customized, high-quality PDF roster containing task summaries (Completed Yesterday, Assigned Yesterday, Pending, Overdue, and Due Today) and delivers it directly to opted-in users via WhatsApp.
- **Dynamic JWT Security**: Automated PDF access secured using dynamic JSON Web Tokens (JWT) expiring in 24 hours, ensuring WhatsApp Meta API can safely fetch the compiled PDFs.
- **Delivery Logging & Administration**: Comprehensive logs tracking every notification's status (Sent/Failed) with full recipient details, templates used, and response message IDs.

### ⚡ Performance & Scalability
- **Cursor-based Pagination**: Infinite scroll / paginated APIs across Leads, Tasks, Clients, Invoices, Payments, and Activity Logs.
- **Database Optimizations**: Optimized database index structures on MongoDB for rapid compound lookups and complex relational aggregations.
- **Background Throttling**: Auto-reload of reminders and real-time polling automatically paused when the application tab is hidden or minimized, preserving resources.

### 📤 Excel Export
- Filter-aware exports on every table (Leads, Tasks, Clients, Invoices, Receivables, Ledger)
- Generated client-side using SheetJS — no server load
- Standard `.xlsx` format opens in Excel, LibreOffice, Google Sheets

### 📈 Dashboards
- **Admin/Manager**: Leads funnel (5 statuses), Tasks breakdown (5 states), Staff performance leaderboard, Recent activity (leads + tasks)
- **Staff**: My tasks, Pending, Due today, Overdue, In Progress, Completed, Recent items

### 📝 Activity Log
- Every create/update/delete logged with user, entity, action, timestamp
- Accessible via `GET /api/activity` for audit trail

### 🧹 Administrative Data Clearing
- One-click dynamic data clearing utility for Administrators
- Purge selective data categories (Tasks, Leads, Invoices & Payments, Quotations, Compliances, Activity Logs) on or before a chosen "As On" date
- Safe and secure design with multi-step confirmation, warning flags, and explicit typing keyword verification
- Detailed action outcome summary and automatic system-audit logging of the operation

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router) · React 18 · Tailwind CSS · shadcn/ui |
| Backend | Next.js API routes (catch-all) · Node.js runtime |
| Database | MongoDB (collections: users, leads, tasks, clients, invoices, payments, quotations, settings, activity_logs) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| PDF | jsPDF + jspdf-autotable (client-side) |
| Excel | SheetJS / xlsx (client-side) |
| Charts | Recharts |
| Icons | lucide-react |
| Notifications | sonner (toast) |

No external SaaS dependencies. No vendor lock-in. Everything runs on your infrastructure.

---

## 🚀 Quick Start (Local)

### Prerequisites
- **Node.js** 18+ (recommended 20 LTS)
- **Yarn** 1.x (or npm/pnpm)
- **MongoDB** 6+ — local install OR a MongoDB Atlas connection string

### 1. Clone & install
```bash
git clone https://github.com/<your-username>/ca-practice-manager.git
cd ca-practice-manager
yarn install
```

### 2. Configure environment
Create `.env` in the project root:
```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=ca_practice
APP_BASE_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
JWT_SECRET=<run: openssl rand -base64 32>
CORS_ORIGINS=*

# WhatsApp Cloud API Configuration
WHATSAPP_PROVIDER=mock
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_LANGUAGE_CODE=en
WHATSAPP_TASK_TEMPLATE=task_assigned_notification
WHATSAPP_REASSIGNED_TEMPLATE=task_reassigned_notification
WHATSAPP_ROSTER_TEMPLATE=daily_staff_roster_pdf

# Cron Job Protection Secret (Optional for local)
CRON_SECRET=your_custom_cron_secret
```

> **🔐 Important**: Replace `JWT_SECRET` with a strong random string. For live WhatsApp routing, set `WHATSAPP_PROVIDER=meta` and supply verified values from the Facebook Developer Portal. Never commit `.env` to git.

### 3. Start MongoDB
```bash
# Option A: Docker (recommended)
docker run -d -p 27017:27017 --name ca-mongo mongo:7

# Option B: Local install
sudo systemctl start mongod
```

### 4. Run the app
```bash
yarn dev
```
Open [http://localhost:3000](http://localhost:3000)

### 5. First login
Admin/manager/staff users are **auto-seeded** on first DB hit. Use:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@ca.com` | `admin123` |
| Manager | `manager@ca.com` | `manager123` |
| Staff | `staff@ca.com` | `staff123` |

> ⚠️ **Change these passwords immediately in production** via Sidebar → Change Password.

---

## 🌐 Deployment Options

### Option 1 — Vercel (Easiest, recommended for solo CA / small firm)
Best when you don't want to manage servers.

1. Push the repo to GitHub
2. Sign in to [vercel.com](https://vercel.com) → "New Project" → import your repo
3. **Environment Variables** — add the same keys as your `.env`:
   - `MONGO_URL` — use [MongoDB Atlas](https://www.mongodb.com/atlas/database) free tier connection string
   - `DB_NAME` — e.g., `ca_practice`
   - `JWT_SECRET` — generate a strong random string
   - `APP_BASE_URL` — your public deployment URL, e.g., `https://your-app.vercel.app` (required for Meta/WhatsApp Cloud API to fetch compiled PDF rosters securely)
   - `NEXT_PUBLIC_BASE_URL` — your Vercel URL, e.g., `https://your-app.vercel.app`
   - `WHATSAPP_PROVIDER` — set to `meta` for production, or `mock` for log-based testing
   - `WHATSAPP_ACCESS_TOKEN` — permanent access token from your Facebook Developer Account
   - `WHATSAPP_PHONE_NUMBER_ID` — Phone number ID associated with your business account
   - `WHATSAPP_LANGUAGE_CODE` — default is `en`
   - `WHATSAPP_TASK_TEMPLATE` — approved template name (e.g., `task_assigned_notification`)
   - `WHATSAPP_REASSIGNED_TEMPLATE` — approved template name (e.g., `task_reassigned_notification`)
   - `WHATSAPP_ROSTER_TEMPLATE` — approved template name with Document header support (e.g., `daily_staff_roster_pdf`)
   - `CRON_SECRET` — Vercel Crons automatically inject this, but you can configure it explicitly to secure your `/api/cron/daily-whatsapp-roster` endpoint.
4. **Vercel Cron Job Configuration**:
   - The project comes pre-configured with a `vercel.json` specifying the `/api/cron/daily-whatsapp-roster` path to run daily.
   - On Vercel, navigate to **Project Settings** -> **Cron Jobs** to verify or customize the schedule. Ensure the environment variable `CRON_SECRET` is configured to automatically restrict unauthorized access to the cron routes.
5. Deploy. Vercel auto-builds on every git push.

**Pros**: zero infra, free tier suitable for small firms, automatic HTTPS.
**Cons**: MongoDB must be hosted externally (Atlas).

---

### Option 2 — Docker (Self-hosted on any VPS / on-premise)
Best for full data ownership.

Create `Dockerfile`:
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["yarn", "start"]
```

Create `docker-compose.yml`:
```yaml
version: '3.9'
services:
  mongo:
    image: mongo:7
    restart: always
    volumes:
      - mongo-data:/data/db
    ports:
      - "127.0.0.1:27017:27017"

  app:
    build: .
    restart: always
    ports:
      - "3000:3000"
    environment:
      MONGO_URL: mongodb://mongo:27017
      DB_NAME: ca_practice
      JWT_SECRET: ${JWT_SECRET}
      NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL}
    depends_on:
      - mongo

volumes:
  mongo-data:
```

Run:
```bash
export JWT_SECRET=$(openssl rand -base64 32)
export NEXT_PUBLIC_BASE_URL=https://ca.yourdomain.com
docker compose up -d
```

Put a reverse proxy (Caddy / Nginx) in front for HTTPS.

---

### Option 3 — Railway / Render / Fly.io
Push to GitHub → connect repo → add env vars → deploy. Same env keys as above. MongoDB add-on is available on most platforms.

**Railway**: one-click MongoDB plugin.
**Render**: pair with MongoDB Atlas.
**Fly.io**: use the `fly mongodb` add-on or Atlas.

---

### Option 4 — VPS (Ubuntu/Debian) — full DIY
```bash
# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs mongodb

# Clone and build
git clone https://github.com/<you>/ca-practice-manager.git
cd ca-practice-manager
yarn install
yarn build

# Run via PM2
sudo npm i -g pm2
pm2 start "yarn start" --name ca-app
pm2 save && pm2 startup
```

Reverse-proxy with Nginx + Let's Encrypt:
```nginx
server {
    server_name ca.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
```bash
sudo certbot --nginx -d ca.yourdomain.com
```

---

### Option 5 — Kubernetes
Use the included `Dockerfile`. Apply a standard Deployment + Service + Ingress + MongoDB StatefulSet (or external Atlas). Set env vars via a `Secret`.

---

## 📖 How to Use — Daily Workflow Guide

### 🚪 First-time setup (Admin)
1. **Login** as `admin@ca.com` / `admin123`
2. **Change Password** (sidebar) — immediately
3. **Branding** (sidebar) — upload logo, set firm name, GSTIN, address, bank/UPI details
4. **Staff** (sidebar) — create user accounts for each team member, assign roles

### 📞 Daily lead flow
1. New enquiry comes in → **Leads** → New Lead → fill details, set status = New, assign to a staff member
2. Staff calls client → adds follow-up notes via the lead detail dialog
3. When client signs up → click ➡️ icon → **Convert Lead → Task** — fills due date, priority, assignee; lead auto-flips to `Converted`
4. Optionally create a Client record from the same data

### ✅ Task lifecycle
1. **Tasks** module shows all tasks (admin/manager) or own tasks (staff)
2. Mark recurring tasks (monthly GSTR-3B, quarterly advance tax, annual audit) with the **Recurrence** field — next occurrence auto-spawns on completion
3. Use the **Calendar** view for a visual month-at-a-glance
4. Use the **Reminders bell** in top-bar to never miss overdue items

### 💰 Billing flow
1. **Clients** → New Client → **mandatory opening balance with "as on" date**
2. **Invoices** → New Invoice → select client (auto-fills GSTIN/address) → add line items → toggle GST → Save → **branded PDF auto-downloads**
3. When client pays → in Invoices list click the 💰 wallet icon → record payment (mode, amount, reference). Invoice flips to Partial/Paid automatically
4. **Clients** → click name → view **full ledger** with running balance + record on-account payments

### 📊 Reporting
- **Receivables** → see aging buckets, donut chart, top debtors, full client table
- Click 📤 **Export** on any table to download a filtered Excel file
- **Dashboard** → daily snapshot of leads + tasks + staff performance

### 🎨 Quotations to win new clients
1. **Quotations** → New Quotation → enter client details (or copy from Lead)
2. Add multiple services with descriptions and prices
3. GST toggle, validity date, custom terms
4. Save → **professional branded PDF downloads instantly** — send to client via email/WhatsApp

---

## 📚 API Reference

All endpoints prefixed with `/api/` and require `Authorization: Bearer <JWT>` except `/api/auth/login`.

### Auth
| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/api/auth/login` | `{email, password}` | Returns `{token, user}` |
| GET | `/api/auth/me` | – | Returns current user |
| POST | `/api/auth/change-password` | `{currentPassword, newPassword}` | Self-service password change |

### Users (admin only for mutations)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users` | List all users |
| POST | `/api/users` | Create user |
| PUT | `/api/users/:id` | Update (also accepts `{password}` for admin reset) |
| DELETE | `/api/users/:id` | Delete |

### Leads
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/leads?status=&serviceType=&assignedTo=` | List with filters |
| POST | `/api/leads` | Create |
| PUT | `/api/leads/:id` | Update |
| PUT | `/api/leads/:id/notes` | Append follow-up note `{note}` |
| DELETE | `/api/leads/:id` | Delete |
| POST | `/api/leads/convert` | Convert to task — body `{leadId, title, category, priority, dueDate, assignedTo}` |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/tasks?status=&priority=&category=&assignedTo=` | List with filters |
| POST | `/api/tasks` | Create — body includes `recurrence: none\|monthly\|quarterly\|yearly` |
| PUT | `/api/tasks/:id` | Update — staff can only set `status` |
| PUT | `/api/tasks/:id/comments` | Add comment `{comment}` |
| DELETE | `/api/tasks/:id` | Delete |

### Clients
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/clients` | Enriched list with `billed`, `received`, `netDue` per client |
| POST | `/api/clients` | Create (admin/manager) |
| GET | `/api/clients/:id/ledger` | Full ledger with running balance |
| PUT | `/api/clients/:id` | Update |
| DELETE | `/api/clients/:id` | Delete (admin only) |

### Invoices & Payments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/invoices?status=&clientId=` | List with `paidAmount`, `dueAmount` |
| POST | `/api/invoices` | Auto-numbers `INV-YYYY-NNNN`, calculates GST + total |
| GET | `/api/invoices/:id` | Single with attached payments |
| DELETE | `/api/invoices/:id` | Delete (admin only) |
| POST | `/api/payments` | Records payment; auto-updates invoice status |
| GET | `/api/payments?clientId=&invoiceId=` | List |
| DELETE | `/api/payments/:id` | Delete and recompute invoice status |

### Quotations
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/quotations` | List |
| POST | `/api/quotations` | Auto-numbers `QT-YYYY-NNNN` |
| GET | `/api/quotations/:id` | Single |
| DELETE | `/api/quotations/:id` | Delete |

### Reports & Misc
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard` | Role-aware dashboard stats |
| GET | `/api/reports/aging` | Receivables aging buckets |
| GET | `/api/reminders` | `{dueToday, upcoming, overdue, followUps*}` |
| GET | `/api/calendar?from=&to=` | Tasks + leads in date range |
| GET | `/api/search?q=` | Global search across all entities |
| GET | `/api/branding` | Get branding settings |
| PUT | `/api/branding` | Update branding (admin only) |
| GET | `/api/activity` | Activity log (last 100) |
| GET | `/api/backup/export` | Export all collections as JSON file (admin only) |
| POST | `/api/backup/import` | Restore database collections from a JSON backup file (admin only) |
| POST | `/api/backup/clear-old-data` | Purge historical data on/before a selected date for specific categories (admin only) |

### WhatsApp & Automation
| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/cron/daily-whatsapp-roster` | Scheduled cron job to deliver Daily PDF task rosters (secured via CRON_SECRET) |
| GET | `/api/whatsapp/pdf-roster?token=<JWT>` | Secured dynamic PDF task roster endpoint (expires in 24 hours) |
| POST | `/api/whatsapp/test` | Trigger a test WhatsApp notification to a selected or manual recipient (admin only) |
| GET | `/api/whatsapp/logs` | List WhatsApp logs with pagination, status, and message IDs (admin/manager only) |

---

## 🗂️ Data Model

```
users                  { id, email, passwordHash, name, role, active, whatsappNumber, whatsappOptIn, whatsappNotificationsEnabled, dailyRosterEnabled, createdAt }
whatsapp_notifications  { id, type, recipientName, recipientNumber, templateName, status, messageId, error, createdAt }
leads                  { id, name, phone, email, company, serviceType, source, status, assignedTo, followUpDate, notes[], createdAt }
tasks          { id, title, description, category, priority, dueDate, assignedTo, status, leadId, clientName, recurrence, recurrenceSpawned, comments[], createdAt }
clients        { id, name, company, phone, email, gstin, pan, address, openingBalance, openingBalanceAsOn, notes, createdAt }
invoices       { id, invoiceNumber, clientId, clientName, items[], gstApplicable, subtotal, gstAmount, total, dueDate, status, createdAt }
payments       { id, clientId, invoiceId, amount, mode, reference, date, notes, createdAt }
quotations     { id, quotationNumber, clientName, services[], gstApplicable, subtotal, gstAmount, total, validUntil, terms, firmName, firmAddress, ..., createdAt }
settings       { id:'branding', firmName, firmAddress, firmGstin, bankName, bankAccount, bankIfsc, upiId, logoBase64, footerText, ... }
activity_logs  { id, userId, userName, action, entity, entityId, details, createdAt }
```

All IDs are **UUIDs** (no MongoDB `ObjectId` exposed in any response).

---

## 🔒 Security Notes

- ✅ Passwords are hashed with **bcrypt** (10 rounds), never stored in plain text
- ✅ All API routes (except login) require JWT in `Authorization: Bearer <token>`
- ✅ Role-based authorization on every mutating endpoint
- ✅ Staff cannot see leads/tasks not assigned to them
- ✅ No third-party API keys required in MVP — everything self-contained
- ⚠️ **For production**:
  - Set a strong `JWT_SECRET` (32+ random bytes)
  - Use HTTPS (Cloudflare / Caddy / Nginx + Let's Encrypt)
  - Restrict `CORS_ORIGINS` to your domain instead of `*`
  - Enable MongoDB auth (replace `mongodb://localhost:27017` with `mongodb://user:pass@host:27017?authSource=admin`)
  - Take regular database backups (`mongodump` cron job)
  - Rotate `JWT_SECRET` periodically (invalidates all existing tokens)

---

## 🤝 Contributing

We welcome contributions! Here's the suggested workflow:

1. **Fork** the repo on GitHub
2. **Create a feature branch**: `git checkout -b feat/your-feature`
3. **Code** following existing patterns (Tailwind + shadcn, no custom CSS unless necessary)
4. **Test** locally — run `yarn lint` and verify endpoints with curl or the UI
5. **Commit** with Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`
6. **Push** and open a Pull Request with description + screenshots if UI changed

### Code style
- Functional React components with hooks (no class components)
- Use `'use client'` only when needed (state, effects, event handlers)
- API routes in single catch-all `app/api/[[...path]]/route.js`
- UUIDs for all entity IDs (no `ObjectId`)
- Async/await everywhere, never raw promises

### Reporting bugs
Open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Screenshots / curl output / browser console errors
- Environment (Node version, OS, browser)

---

## 🗺️ Roadmap

- [ ] Email integration — send invoices/quotations to clients (SendGrid/Resend)
- [x] WhatsApp Business API integration for task alerts & daily rosters
- [ ] WhatsApp Business API integration for invoice send
- [ ] Payment receipts (PDF) on payment record
- [ ] Multi-firm support (multiple branding profiles)
- [ ] Bulk import (CSV/Excel) of clients and leads
- [ ] Revenue trend chart on dashboard
- [ ] Forgot-password email flow
- [ ] 2FA for admin accounts
- [ ] Mobile apps (React Native wrapper)
- [ ] Multi-language support
- [ ] Recurring invoices (auto-generate monthly retainer invoices)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details. You are free to use, modify, and distribute, including for commercial use. Attribution is appreciated but not required.

---

## 💬 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/<your-username>/ca-practice-manager/issues)
- 💡 **Discussions**: [GitHub Discussions](https://github.com/<your-username>/ca-practice-manager/discussions)
- ✉️ **Email**: your-email@example.com

---

## 🙏 Acknowledgments

Built with the amazing open-source ecosystem:
- [Next.js](https://nextjs.org/) by Vercel
- [shadcn/ui](https://ui.shadcn.com/) — component library
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [Recharts](https://recharts.org/) — composable charts
- [jsPDF](https://github.com/parallax/jsPDF) — client-side PDFs
- [SheetJS](https://sheetjs.com/) — Excel exports
- [Lucide](https://lucide.dev/) — icons

---

<div align="center">

**⭐ If this project helps your CA firm, please star it on GitHub! ⭐**

Made with ❤️ for the Chartered Accountant community.

</div>
