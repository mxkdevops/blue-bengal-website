const crypto = require("crypto");
const pool = require("../db/pool");
const { sendEmail } = require("./emailSender");
const { formatDate, formatTime } = require("./formatters");
const { emailLayout, detailsTable, button, apiUrl, escapeHtml } = require("./emailTemplate");

function generateActionToken() {
    return crypto.randomBytes(24).toString("hex");
}

// Notifies the restaurant by email whenever a new booking comes in (both
// auto-confirmed and pending-review ones), with a link to a one-click
// confirm/reject page — no admin login needed. Only sends if enabled and an
// address is configured; silently skipped otherwise.
async function sendAdminNotificationEmail(bookingId) {
    const settingsResult = await pool.query(
        "SELECT admin_notification_enabled, admin_notification_email FROM settings WHERE id = 1"
    );
    const settings = settingsResult.rows[0];
    if (!settings.admin_notification_enabled || !settings.admin_notification_email) return;

    const bookingResult = await pool.query(
        `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, b.guests, b.status, b.notes,
                b.admin_action_token, c.name, c.email, c.phone
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.id = $1`,
        [bookingId]
    );
    if (bookingResult.rows.length === 0) return;
    const b = bookingResult.rows[0];

    const reviewUrl = apiUrl(`/admin-review/${b.id}?token=${b.admin_action_token}`);
    const statusLabel = b.status === "pending" ? "Needs your review" : "Auto-confirmed";
    const subject = `${b.status === "pending" ? "New booking to review" : "New booking"}: ${b.name}, ${formatDate(b.booking_date)}`;

    const body = `A new booking just came in.\n\n` +
        `Name: ${b.name}\nEmail: ${b.email}\nPhone: ${b.phone}\n` +
        `Date: ${formatDate(b.booking_date)}\nTime: ${formatTime(b.booking_time.slice(0, 5))}\nGuests: ${b.guests}\n` +
        `${b.notes ? `Notes: ${b.notes}\n` : ""}` +
        `Status: ${statusLabel}\n\n` +
        `Review/confirm/reject: ${reviewUrl}`;

    const html = emailLayout({
        heading: b.status === "pending" ? "New booking to review 📋" : "New booking (auto-confirmed) 📋",
        bodyHtml: `
            ${detailsTable([
                ["Name", b.name],
                ["Email", b.email],
                ["Phone", b.phone],
                ["Date", formatDate(b.booking_date)],
                ["Time", formatTime(b.booking_time.slice(0, 5))],
                ["Guests", b.guests],
                ...(b.notes ? [["Notes", escapeHtml(b.notes)]] : []),
                ["Status", statusLabel],
            ])}
            ${button("Review This Booking", reviewUrl)}
        `,
    });

    const { status } = await sendEmail({ to: settings.admin_notification_email, subject, body, html });
    await pool.query(
        `INSERT INTO email_log (booking_id, email_type, recipient, subject, body, status)
         VALUES ($1, 'admin_notification', $2, $3, $4, $5)`,
        [bookingId, settings.admin_notification_email, subject, body, status]
    );
}

module.exports = { sendAdminNotificationEmail, generateActionToken };
