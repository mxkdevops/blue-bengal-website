const pool = require("../db/pool");
const { sendEmail } = require("../utils/emailSender");

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

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

async function sendAndLog({ bookingId, emailType, recipient, subject, body }) {
    const { status } = await sendEmail({ to: recipient, subject, body });
    await pool.query(
        `INSERT INTO email_log (booking_id, email_type, recipient, subject, body, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [bookingId, emailType, recipient, subject, body, status]
    );
}

async function processReminders(settings) {
    if (!settings.reminder_enabled) return;

    // booking_date/booking_time are stored as plain Europe/London wall-clock values
    // (no timezone attached), while now() is a true UTC instant — convert now()
    // into the equivalent naive Europe/London wall-clock time (handles BST/GMT
    // automatically) so both sides of the comparison are in the same frame.
    const due = await pool.query(
        `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, b.guests, c.name, c.email
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.status = 'confirmed'
           AND b.reminder_sent_at IS NULL
           AND (b.booking_date + b.booking_time) <= (now() AT TIME ZONE 'Europe/London') + ($1 || ' hours')::interval
           AND (b.booking_date + b.booking_time) > (now() AT TIME ZONE 'Europe/London')`,
        [settings.reminder_hours_before]
    );

    for (const b of due.rows) {
        const subject = `Reminder: your table at Blue Bengal — ${formatDate(b.booking_date)}`;
        const body = `Hi ${b.name},\n\nJust a reminder of your booking at Blue Bengal Carshalton:\n` +
            `${formatDate(b.booking_date)} at ${formatTime(b.booking_time.slice(0, 5))}, ${b.guests} guests (${b.booking_code}).\n\n` +
            `We look forward to seeing you!`;

        await sendAndLog({ bookingId: b.id, emailType: "reminder", recipient: b.email, subject, body });
        await pool.query("UPDATE bookings SET reminder_sent_at = now() WHERE id = $1", [b.id]);
    }
}

async function processFeedbackRequests(settings) {
    if (!settings.feedback_enabled) return;

    const due = await pool.query(
        `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, c.name, c.email
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.status = 'confirmed'
           AND b.feedback_sent_at IS NULL
           AND (b.booking_date + b.booking_time) + ($1 || ' hours')::interval <= (now() AT TIME ZONE 'Europe/London')`,
        [settings.feedback_hours_after]
    );

    for (const b of due.rows) {
        const subject = "How was your visit to Blue Bengal?";
        const body = `Hi ${b.name},\n\nThank you for dining with us on ${formatDate(b.booking_date)}. ` +
            `We'd love to hear how it went — please share your feedback here:\n${settings.feedback_link}\n\n` +
            `Thank you for your support!`;

        await sendAndLog({ bookingId: b.id, emailType: "feedback", recipient: b.email, subject, body });
        await pool.query("UPDATE bookings SET feedback_sent_at = now() WHERE id = $1", [b.id]);
    }
}

async function runCheck() {
    try {
        const settingsResult = await pool.query(
            `SELECT reminder_enabled, reminder_hours_before, feedback_enabled, feedback_hours_after, feedback_link
             FROM settings WHERE id = 1`
        );
        const settings = settingsResult.rows[0];
        await processReminders(settings);
        await processFeedbackRequests(settings);
    } catch (err) {
        console.error("Reminder/feedback scheduler error:", err);
    }
}

function startReminderScheduler() {
    runCheck();
    setInterval(runCheck, CHECK_INTERVAL_MS);
}

module.exports = { startReminderScheduler };
