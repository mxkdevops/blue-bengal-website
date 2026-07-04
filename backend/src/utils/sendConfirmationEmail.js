const pool = require("../db/pool");
const { sendEmail } = require("./emailSender");
const { formatDate, formatTime } = require("./formatters");
const { emailLayout, detailsTable, button, frontendUrl } = require("./emailTemplate");

// Sent once, whenever a booking becomes "confirmed" — either immediately via
// auto-accept, or later when staff manually confirm a pending booking.
async function sendBookingConfirmationEmail(bookingId) {
    const bookingResult = await pool.query(
        `SELECT b.booking_code, b.booking_date, b.booking_time, b.guests, c.name, c.email
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.id = $1`,
        [bookingId]
    );
    if (bookingResult.rows.length === 0) return;
    const b = bookingResult.rows[0];

    const settingsResult = await pool.query("SELECT confirmation_message FROM settings WHERE id = 1");
    const confirmationMessage = settingsResult.rows[0].confirmation_message;

    const manageUrl = frontendUrl(`/manage-booking.html?code=${encodeURIComponent(b.booking_code)}`);
    const subject = `Your table at Blue Bengal is confirmed — ${formatDate(b.booking_date)}`;

    const body = `Hi ${b.name},\n\n${confirmationMessage}\n\n` +
        `Booking Code: ${b.booking_code}\n` +
        `Date: ${formatDate(b.booking_date)}\n` +
        `Time: ${formatTime(b.booking_time.slice(0, 5))}\n` +
        `Guests: ${b.guests}\n\n` +
        `Need to change or cancel? ${manageUrl}\n\n` +
        `We look forward to welcoming you!`;

    const html = emailLayout({
        heading: "Your table is confirmed! 🎉",
        bodyHtml: `
            <p style="margin:0 0 6px;">Hi ${b.name},</p>
            <p style="margin:0 0 6px; line-height:1.6;">${confirmationMessage}</p>
            ${detailsTable([
                ["Booking Code", b.booking_code],
                ["Date", formatDate(b.booking_date)],
                ["Time", formatTime(b.booking_time.slice(0, 5))],
                ["Guests", b.guests],
            ])}
            ${button("Manage Your Booking", manageUrl)}
            <p style="margin:20px 0 0; font-size:13px; color:#6b5a4e; text-align:center;">Need to change the date, time or party size, or cancel? Use the button above.</p>
        `,
    });

    const { status } = await sendEmail({ to: b.email, subject, body, html });
    await pool.query(
        `INSERT INTO email_log (booking_id, email_type, recipient, subject, body, status)
         VALUES ($1, 'confirmation', $2, $3, $4, $5)`,
        [bookingId, b.email, subject, body, status]
    );
}

module.exports = { sendBookingConfirmationEmail };
