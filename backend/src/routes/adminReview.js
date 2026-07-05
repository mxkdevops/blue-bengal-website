const express = require("express");
const pool = require("../db/pool");
const { formatDate, formatTime } = require("../utils/formatters");
const { BRAND } = require("../utils/emailTemplate");
const { sendBookingConfirmationEmail } = require("../utils/sendConfirmationEmail");

const router = express.Router();

// Simple, self-contained HTML page (no dependency on the separately-hosted
// frontend) so this works even if the static site is ever down.
function page({ title, bodyHtml }) {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — Blue Bengal Admin</title>
    <style>
        body { font-family: Georgia, 'Times New Roman', serif; background: ${BRAND.creamAlt}; margin: 0; padding: 40px 16px; color: ${BRAND.text}; }
        .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; border-top: 5px solid ${BRAND.gold}; box-shadow: 0 10px 30px rgba(43,24,16,0.12); }
        h1 { font-size: 20px; color: ${BRAND.maroonDark}; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin: 18px 0; font-family: Arial, sans-serif; font-size: 14px; }
        td { padding: 8px 0; border-bottom: 1px solid ${BRAND.creamAlt}; }
        td:first-child { color: #6b5a4e; font-weight: bold; width: 40%; }
        .actions { display: flex; gap: 12px; margin-top: 20px; }
        button { flex: 1; padding: 12px; border-radius: 8px; border: none; font-weight: bold; font-family: Arial, sans-serif; font-size: 14px; cursor: pointer; }
        .confirm { background: ${BRAND.gold}; color: ${BRAND.maroonDark}; }
        .reject { background: #a3242f; color: #fff; }
        form { display: contents; }
    </style>
</head>
<body>
    <div class="card">
        <h1>${title}</h1>
        ${bodyHtml}
    </div>
</body>
</html>`;
}

async function findBookingByToken(id, token) {
    if (!token) return null;
    const result = await pool.query(
        `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, b.guests, b.status, b.notes,
                b.admin_action_token, c.name, c.email, c.phone
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.id = $1`,
        [id]
    );
    if (result.rows.length === 0) return null;
    const booking = result.rows[0];
    if (!booking.admin_action_token || booking.admin_action_token !== token) return null;
    return booking;
}

// GET /admin-review/:id?token=... - shows booking details with Confirm/Reject
// buttons. Deliberately does nothing on GET (only displays) so that email
// clients/security scanners pre-fetching this link can't accidentally
// trigger a state change — the actual action requires a button click (POST).
router.get("/admin-review/:id", async (req, res, next) => {
    try {
        const booking = await findBookingByToken(req.params.id, req.query.token);
        if (!booking) {
            return res.status(404).send(page({ title: "Not Found", bodyHtml: "<p>This link is invalid or has expired.</p>" }));
        }

        const detailsRows = `
            <tr><td>Name</td><td>${booking.name}</td></tr>
            <tr><td>Email</td><td>${booking.email}</td></tr>
            <tr><td>Phone</td><td>${booking.phone}</td></tr>
            <tr><td>Date</td><td>${formatDate(booking.booking_date)}</td></tr>
            <tr><td>Time</td><td>${formatTime(booking.booking_time.slice(0, 5))}</td></tr>
            <tr><td>Guests</td><td>${booking.guests}</td></tr>
            ${booking.notes ? `<tr><td>Notes</td><td>${booking.notes}</td></tr>` : ""}
            <tr><td>Status</td><td>${booking.status}</td></tr>
        `;

        let actionsHtml = "";
        if (booking.status === "pending") {
            actionsHtml = `
                <div class="actions">
                    <form method="POST" action="/admin-review/${booking.id}/confirm?token=${req.query.token}">
                        <button class="confirm" type="submit">Confirm Booking</button>
                    </form>
                    <form method="POST" action="/admin-review/${booking.id}/reject?token=${req.query.token}">
                        <button class="reject" type="submit">Reject Booking</button>
                    </form>
                </div>`;
        } else if (booking.status === "confirmed") {
            actionsHtml = `
                <div class="actions">
                    <form method="POST" action="/admin-review/${booking.id}/cancel?token=${req.query.token}">
                        <button class="reject" type="submit">Cancel Booking</button>
                    </form>
                </div>`;
        } else {
            actionsHtml = `<p style="color:#6b5a4e;">This booking is already ${booking.status} — no further action needed here. Use the admin panel for more options.</p>`;
        }

        res.send(page({ title: `Booking: ${booking.booking_code}`, bodyHtml: `<table>${detailsRows}</table>${actionsHtml}` }));
    } catch (err) {
        next(err);
    }
});

async function handleAction(req, res, newStatus, successMessage) {
    const booking = await findBookingByToken(req.params.id, req.query.token);
    if (!booking) {
        return res.status(404).send(page({ title: "Not Found", bodyHtml: "<p>This link is invalid or has expired.</p>" }));
    }

    await pool.query("UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2", [newStatus, booking.id]);

    if (newStatus === "confirmed") {
        sendBookingConfirmationEmail(booking.id).catch((err) =>
            console.error("Failed to send booking confirmation email:", err)
        );
    }

    res.send(page({ title: "Done", bodyHtml: `<p>${successMessage}</p>` }));
}

router.post("/admin-review/:id/confirm", async (req, res, next) => {
    try {
        await handleAction(req, res, "confirmed", "Booking confirmed. The guest has been emailed their confirmation.");
    } catch (err) {
        next(err);
    }
});

router.post("/admin-review/:id/reject", async (req, res, next) => {
    try {
        await handleAction(req, res, "rejected", "Booking rejected.");
    } catch (err) {
        next(err);
    }
});

router.post("/admin-review/:id/cancel", async (req, res, next) => {
    try {
        await handleAction(req, res, "cancelled", "Booking cancelled.");
    } catch (err) {
        next(err);
    }
});

module.exports = router;
