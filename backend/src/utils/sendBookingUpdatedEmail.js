const pool = require("../db/pool");
const { sendEmail } = require("./emailSender");
const { formatDate, formatTime } = require("./formatters");
const { emailLayout, detailsTable, button, frontendUrl } = require("./emailTemplate");

// Sent whenever a booking's date, time, or guest count changes — whether the
// guest changed it themselves or staff amended it on their behalf.
async function sendBookingUpdatedEmail(bookingId) {
    const bookingResult = await pool.query(
        `SELECT b.booking_code, b.booking_date, b.booking_time, b.guests, c.name, c.email
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.id = $1`,
        [bookingId]
    );
    if (bookingResult.rows.length === 0) return;
    const b = bookingResult.rows[0];

    const manageUrl = frontendUrl(`/manage-booking.html?code=${encodeURIComponent(b.booking_code)}`);
    const subject = "Your booking has been updated — Blue Bengal";
    const body = `Hi ${b.name},\n\nYour booking has been updated:\n` +
        `${formatDate(b.booking_date)} at ${formatTime(b.booking_time.slice(0, 5))}, ${b.guests} guests (${b.booking_code}).`;

    const html = emailLayout({
        heading: "Your booking has been updated",
        bodyHtml: `
            <p style="margin:0 0 6px;">Hi ${b.name},</p>
            <p style="margin:0 0 16px; line-height:1.6;">Here are your updated booking details:</p>
            ${detailsTable([
                ["Booking Code", b.booking_code],
                ["Date", formatDate(b.booking_date)],
                ["Time", formatTime(b.booking_time.slice(0, 5))],
                ["Guests", b.guests],
            ])}
            ${button("Manage Your Booking", manageUrl)}
        `,
    });

    const { status } = await sendEmail({ to: b.email, subject, body, html });
    await pool.query(
        `INSERT INTO email_log (booking_id, email_type, recipient, subject, body, status)
         VALUES ($1, 'booking_update', $2, $3, $4, $5)`,
        [bookingId, b.email, subject, body, status]
    );
}

module.exports = { sendBookingUpdatedEmail };
