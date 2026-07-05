# Blue Bengal Booking Backend

Node/Express + Postgres API for the Blue Bengal Carshalton booking system.

## Stack

- Express (raw `pg`, no ORM)
- Postgres 16 (via Docker Compose for local dev)
- Guest API: create bookings
- Admin API: manage bookings + auto-accept/manual toggle, protected by an API key

## Local setup

1. Copy the env file and adjust if needed:
   ```bash
   cp .env.example .env
   ```
2. Start Postgres:
   ```bash
   docker compose up -d
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the migration (creates `customers`, `bookings`, `settings` tables):
   ```bash
   npm run migrate
   ```
5. Start the server:
   ```bash
   npm start
   ```
   The API (and the static frontend) is served at http://localhost:3000. Open
   http://localhost:3000/booking.html to use the booking form against the local backend.

## Guest API

### `POST /create-booking`

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "07123456789",
  "date": "2026-07-10",
  "time": "18:30",
  "guests": 4
}
```

Creates (or updates) the customer, then creates a booking. Status is `confirmed` if
auto-accept is on, otherwise `pending`.

## Admin API

All admin routes require an `x-admin-key` header matching `ADMIN_API_KEY` from `.env`.

- `GET /api/admin/bookings?status=&date=` — list bookings (with customer info)
- `GET /api/admin/bookings/:id` — booking detail
- `PATCH /api/admin/bookings/:id/status` `{ "status": "confirmed" | "rejected" | "cancelled" | "pending" }`
- `GET /api/admin/settings` — current settings (auto-accept, max guests)
- `PATCH /api/admin/settings` `{ "autoAcceptBookings": true }` — toggle auto-accept or update max guests

Example:

```bash
curl -X PATCH http://localhost:3000/api/admin/settings \
  -H "x-admin-key: change-me-locally" \
  -H "Content-Type: application/json" \
  -d '{"autoAcceptBookings": true}'
```
