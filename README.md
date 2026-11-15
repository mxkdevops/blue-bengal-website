# Blue Bengal Carshalton — Website & Booking System

Website, online booking system and staff admin panel for **Blue Bengal**, a Bangladeshi restaurant in Carshalton.

- Website: https://bluebengal-carshalton.co.uk
- Booking API (live): https://api.bluebengal-carshalton.co.uk
- Booking API (test): https://api-test.bluebengal-carshalton.co.uk

## How it fits together

```
Customer browser
   │
   ├── bluebengal-carshalton.co.uk ──► CloudFront ──► S3 bucket (HTML / CSS / JS)
   │
   └── api.bluebengal-carshalton.co.uk ──► AWS Lightsail server
                                             Nginx (HTTPS) ──► Node app :3000 ──► Postgres (Docker)
                                                                    │
                                                                    └──► Resend (emails)
```

There are three parts:

| Part | What it is | Where it runs |
|---|---|---|
| Public website | Static HTML/CSS/JS + Bootstrap | S3 + CloudFront |
| Booking backend & admin API | Node.js / Express | Lightsail (Ubuntu 22.04) |
| Database | Postgres 16 | Docker container on the same Lightsail server |

## 1. Public website

Files in the repo root: [index.html](index.html), [booking.html](booking.html), [manage-booking.html](manage-booking.html), [admin.html](admin.html), [style.css](style.css), [script.js](script.js), plus images in [img/](img/).

- Hosted on **S3** behind **CloudFront**. DNS is in **Route 53** and the HTTPS certificate comes from **AWS Certificate Manager**.
- **Deploys automatically:** every push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It uploads the site to S3 and refreshes the CloudFront cache. `backend/`, `.github/`, `.claude/`, `.vscode/` and Markdown files are left out of the upload.
- AWS credentials, bucket name and CloudFront ID are stored as **GitHub Actions secrets**.

## 2. Booking system

The booking system went live on **5 July 2026**, replacing Resmio.

### Guest features
- Online booking with live slot availability (unavailable times are shown up front).
- Branded confirmation email, with an "Add to Google Calendar" link and the guest's booking note.
- Guests can cancel (and give a reason) or modify their own booking via [manage-booking.html](manage-booking.html).
- Automatic reminder emails before the visit and feedback emails after it (feedback goes to Google reviews).
- Marketing consent checkbox, a [Privacy Policy](privacy-policy.html) page and an [unsubscribe](unsubscribe.html) page.

### Admin panel ([admin.html](admin.html), [admin.js](admin.js))
Staff sign in with the admin API key. Tabs:
- **Overview:** bookings that need attention, upcoming bookings.
- **Bookings:** filter by date (Today / Tomorrow / Week), accept, decline, edit or cancel. When admin edits a booking, the customer gets an updated-booking email.
- **Vouchers:** create vouchers and send them to customers.
- **Analytics:** page views and bookings for the last 30 days (self-hosted, cookie-free, via [analytics.js](analytics.js)).
- **Settings:** auto-accept or manual review, slot capacity, blocked days or slots (emergency close), new-booking notification emails (with one-click accept or decline), reminder and feedback emails.

### Backend ([backend/](backend/))
- Node.js + Express, raw `pg` (no ORM). Entry point: [backend/src/server.js](backend/src/server.js).
- Routes: [bookings.js](backend/src/routes/bookings.js) (guest), [admin.js](backend/src/routes/admin.js) and [adminReview.js](backend/src/routes/adminReview.js) (admin), [vouchers.js](backend/src/routes/vouchers.js).
- Scheduled reminders and feedback: [reminderScheduler.js](backend/src/jobs/reminderScheduler.js).
- Emails are sent through **Resend**: [emailSender.js](backend/src/utils/emailSender.js) and the `send*Email.js` helpers.
- Health check: `GET /health` returns `{"success":true,"status":"ok"}`.
- API reference and local setup: [backend/README.md](backend/README.md).

### Database
Postgres 16. Schema: [backend/src/db/schema.sql](backend/src/db/schema.sql). Tables: `customers`, `bookings`, `settings`, `blocked_slots`, `email_log`, `vouchers`, `page_views`.

## 3. Lightsail server

The instance is `blue-bengal-backend` in the London region (eu-west-2). Its IP and SSH key are in the Lightsail console. They're kept out of this README because the repo is public.

| Component | Details |
|---|---|
| OS | Ubuntu 22.04 LTS |
| Web server | Nginx reverse proxy → `localhost:3000`. Sites: `blue-bengal-api-prod` (api.) and `blue-bengal-api` (api-test.) in `/etc/nginx/sites-enabled/` |
| HTTPS | Let's Encrypt via Certbot (auto-renews) |
| App | systemd service `blue-bengal`, runs `node src/server.js` from `/home/ubuntu/blue-bengal-website/backend` |
| Database | Docker container `bluebengal-postgres` (restart policy `unless-stopped`), only reachable from the server itself |
| Secrets | `/home/ubuntu/blue-bengal-website/backend/.env`, **never committed**: `PORT`, `DATABASE_URL`, `ADMIN_API_KEY`, `CORS_ORIGIN`, `AUTO_ACCEPT_DEFAULT`, `RESEND_API_KEY`, `EMAIL_FROM`, `API_PUBLIC_URL` |
| Backups | Cron at 03:00 daily runs `~/backup-db.sh`: `pg_dump` → gzip → upload to an S3 backup bucket. Log: `~/backup.log` |
| Firewall | Lightsail firewall: ports 22, 80, 443 only |
| Node.js | v22 LTS from the NodeSource apt repo (`/etc/apt/sources.list.d/nodesource.sources`) |
| Monitoring | Route 53 health check `blue-bengal-api` hits `/health` every 30s from 3 regions. CloudWatch alarm `blue-bengal-api-down` (us-east-1) emails via SNS topic `blue-bengal-alerts` when it fails for ~2 min, and again when it recovers |
| Spam protection | Per-IP rate limits ([rateLimit.js](backend/src/middleware/rateLimit.js), wired in [app.js](backend/src/app.js)) and a hidden honeypot field on the booking form |

## Making changes

**Website (HTML/CSS/JS):** edit, commit, push to `main`. It goes live in a minute or two.

**Backend:** not deployed automatically. After pushing to `main`:
```bash
ssh ubuntu@<server-ip>          # key from the Lightsail console
cd ~/blue-bengal-website && git pull
cd backend && npm install       # only if dependencies changed
npm run migrate                 # only if schema.sql changed
sudo systemctl restart blue-bengal
curl -s http://localhost:3000/health
```

**Server maintenance:**
1. Take a Lightsail snapshot first (console → instance → Snapshots).
2. Run `sudo apt update && sudo apt upgrade -y`, then `sudo reboot` if `/var/run/reboot-required` exists.
3. Check `https://api.bluebengal-carshalton.co.uk/health` afterwards.

The server has **no PHP**, so Lightsail's PHP vulnerability notices don't apply to it.

**Useful commands on the server:**
```bash
sudo systemctl status blue-bengal      # app status
sudo journalctl -u blue-bengal -n 100  # app logs
docker ps                              # database container
sudo certbot certificates              # SSL expiry
tail ~/backup.log                      # last backups
```

## Local development

See [backend/README.md](backend/README.md). In short: `docker compose up -d`, `npm install`, `npm run migrate`, `npm start`, then open http://localhost:3000/booking.html.

## History

- **2023:** original static site on S3 + CloudFront, bookings via Resmio.
- **2025:** menu and allergen updates, new booking UI, deploy workflow fixes.
- **July 2026:** full redesign and the custom booking system, admin panel, emails, vouchers, analytics and SEO. Resmio retired.

Longer-term roadmap (multi-restaurant, SaaS): [blue-bengal-build-plan.md](blue-bengal-build-plan.md).
