# Blue Bengal Booking System — Build Plan

**Goal:** Replace Resmio with a custom booking system for Blue Bengal, then (if it works well) roll out to your other 4 restaurants, then (only if you choose) open it as a self-serve SaaS product.

**Golden rule:** Don't skip ahead. Each phase only starts once the one before it is proven in real use.

---

## Phase 0 — Design (done)
- [x] Guest booking flow prototype (date → time → party → details → confirm)
- [x] Admin dashboard prototype (bookings, customers, settings)
- [x] Visual design system (colors, type, layout)

Files from this chat: `blue-bengal-booking.jsx`, `blue-bengal-platform-plan.jsx`

---

## Phase 1 — One working system for Blue Bengal

**No multi-tenant, no billing, no other restaurants yet. Just get this one working end to end.**

1. **Install Claude Code**
   - VS Code extension or CLI, signed in with your Claude account
   - Open a project folder

2. **Build the backend**
   - Node/Express (or similar) + Postgres
   - Tables: `bookings`, `customers`, `settings`
   - Guest-facing API: create booking, check slot availability
   - Admin API: list/accept/decline/edit/cancel bookings
   - Auto-accept vs manual-review logic (from settings)
   - Give Claude Code the existing frontend prototype as the design reference

3. **Test locally first**
   - Run it on your own machine before touching AWS
   - Create fake bookings, test edge cases (full slots, cancellations)

4. **Connect real notifications**
   - Email: SendGrid or Postmark (free tier to start)
   - SMS: Twilio (free tier to start)
   - Wire up: booking confirmation, reminder (X hours before), feedback request (X hours after)

5. **Deploy to Lightsail**
   - Nginx reverse proxy
   - SSL via Let's Encrypt
   - Point your domain/subdomain at it
   - Take a snapshot before going live, in case you need to roll back

6. **Run it for real**
   - Switch Blue Bengal off Resmio, onto the new system
   - Use it for a few weeks of actual bookings
   - Fix what breaks — this is the real test

**Don't move to Phase 2 until Phase 1 has run smoothly for a few weeks.**

---

## Phase 2 — Roll out to your other 4 restaurants

1. Rebuild the database as multi-tenant: add a `restaurants` table, link `bookings`/`customers`/`settings` to `restaurant_id`
2. Each restaurant gets its own subdomain (e.g. `book.restaurant2.com`) — Nginx routes by domain to the same backend
3. Staff logins scoped to their own restaurant's data only
4. Add a super-admin view for you, across all 5
5. Migrate/onboard restaurants one at a time, not all at once

---

## Phase 3 — Open it as a SaaS product (optional, only if you want to grow)

Only worth doing once Phase 2 has been stable for a while, and only if you actually want the business of selling to restaurants you don't own.

1. Self-serve signup form → auto-creates restaurant profile + subdomain
2. Stripe integration: plans, free trial, billing, invoices, failed-payment handling
3. Feature gating by plan (e.g. Starter / Growth / Pro — SMS, multi-staff, branding, analytics as paid tiers)
4. Public marketing site + pricing page
5. Super-admin dashboard across all customers, not just your own

---

## Reference notes

**Infrastructure**
- Lightsail Small plan (2 vCPU/2GB) or above once running 3+ sites
- One Postgres database, shared, isolated by `restaurant_id` — cheaper than separate DBs at this scale
- Split a restaurant onto its own instance later only if its traffic outgrows the rest

**Security basics for Claude Code + Lightsail**
- Non-root deploy user, SSH key auth (not passwords)
- Never paste private key contents into chat — reference the file path
- Snapshot before infrastructure changes
- Review any destructive command before approving

**What top booking widgets (OpenTable, Resy, Tock, SevenRooms, Zenchef) do that's worth keeping**
- Party size → date → time, minimal fields
- Real-time slot availability, not static lists
- Confirmation by email *and* SMS, immediately
- Mobile-first, no login required to book
- (Tock-specific) optional deposit/card-hold step to cut no-shows — worth adding later

---

## Next concrete step
Write the full Phase 1 build brief for Claude Code (backend structure, API endpoints, database schema) — ask for this when ready to start building.
