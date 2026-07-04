const pool = require("../db/pool");
const { sendEmail } = require("./emailSender");

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${String(m).padStart(2, "0")} ${ampm}`;
}

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

    const subject = `Your table at Blue Bengal is confirmed — ${formatDate(b.booking_date)}`;
    const body = `Hi ${b.name},\n\n${confirmationMessage}\n\n` +
        `Booking Code: ${b.booking_code}\n` +
        `Date: ${formatDate(b.booking_date)}\n` +
        `Time: ${formatTime(b.booking_time.slice(0, 5))}\n` +
        `Guests: ${b.guests}\n\n` +
        `We look forward to welcoming you!`;

    const { status } = await sendEmail({ to: b.email, subject, body });
    await pool.query(
        `INSERT INTO email_log (booking_id, email_type, recipient, subject, body, status)
         VALUES ($1, 'confirmation', $2, $3, $4, $5)`,
        [bookingId, b.email, subject, body, status]
    );
}

module.exports = { sendBookingConfirmationEmail };
