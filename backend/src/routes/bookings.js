const express = require("express");
const pool = require("../db/pool");
const { validateBooking } = require("../utils/validateBooking");
const { generateBookingCode } = require("../utils/bookingCode");
const { checkAvailability } = require("../utils/checkAvailability");
const { sendBookingConfirmationEmail } = require("../utils/sendConfirmationEmail");
const { sendBookingUpdatedEmail } = require("../utils/sendBookingUpdatedEmail");
const { sendAdminNotificationEmail, generateActionToken } = require("../utils/sendAdminNotificationEmail");
const { sendEmail } = require("../utils/emailSender");
const { formatDate, formatTime } = require("../utils/formatters");
const { emailLayout, detailsTable, button, frontendUrl } = require("../utils/emailTemplate");

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const NOT_FOUND_MESSAGE = "We couldn't find a booking with that code and email. Please check and try again.";

// POST /track-pageview { path } - anonymous pageview counter for the admin
// Analytics tab. No visitor identifier is stored, just the path and time,
// so this never fails the request if it errors and never blocks rendering.
router.post("/track-pageview", async (req, res) => {
    const path = typeof req.body.path === "string" ? req.body.path.slice(0, 255) : null;
    if (path) {
        pool.query("INSERT INTO page_views (path) VALUES ($1)", [path]).catch(() => {});
    }
    res.status(204).end();
});

async function findBookingByCodeAndEmail(client, code, email) {
    const result = await client.query(
        `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, b.guests, b.status,
                c.name, c.email
         FROM bookings b
         JOIN customers c ON c.id = b.customer_id
         WHERE b.booking_code = $1`,
        [(code || "").toString().trim().toUpperCase()]
    );
    if (result.rows.length === 0) return null;
    const booking = result.rows[0];
    if (booking.email.toLowerCase() !== (email || "").toString().trim().toLowerCase()) return null;
    return booking;
}

function formatMinutes(minutes) {
    if (minutes % 1440 === 0) {
        const days = minutes / 1440;
        return `${days} day${days > 1 ? "s" : ""}`;
    }
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `${hours} hour${hours > 1 ? "s" : ""}`;
    }
    return `${minutes} minutes`;
}

// GET /booking-settings - public info the guest booking form needs to render itself
router.get("/booking-settings", async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT opening_time, closing_time, min_guests_per_booking, max_guests_per_booking,
                    slot_interval_minutes, closed_weekdays, min_advance_notice_minutes
             FROM settings WHERE id = 1`
        );
        const s = result.rows[0];
        res.json({
            success: true,
            settings: {
                openingTime: s.opening_time.slice(0, 5),
                closingTime: s.closing_time.slice(0, 5),
                minGuestsPerBooking: s.min_guests_per_booking,
                maxGuestsPerBooking: s.max_guests_per_booking,
                slotIntervalMinutes: s.slot_interval_minutes,
                closedWeekdays: s.closed_weekdays,
                minAdvanceNoticeMinutes: s.min_advance_notice_minutes,
            },
        });
    } catch (err) {
        next(err);
    }
});

// GET /availability?date=YYYY-MM-DD - public info on which times are blocked for a given
// date, so the guest booking form can grey out unavailable slots before they even try to
// submit, instead of only finding out after pressing "Book Now".
router.get("/availability", async (req, res, next) => {
    try {
        const date = (req.query.date || "").toString();
        if (!DATE_RE.test(date)) {
            return res.status(400).json({ success: false, message: "A valid date (YYYY-MM-DD) is required." });
        }

        const result = await pool.query(
            "SELECT start_time, end_time FROM blocked_slots WHERE block_date = $1",
            [date]
        );

        const wholeDayBlocked = result.rows.some((r) => r.start_time === null);
        const blockedRanges = wholeDayBlocked
            ? []
            : result.rows.map((r) => ({ startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5) }));

        res.json({ success: true, wholeDayBlocked, blockedRanges });
    } catch (err) {
        next(err);
    }
});

// POST /create-booking - guest-facing booking creation
router.post("/create-booking", async (req, res, next) => {
    const { valid, errors, data } = validateBooking(req.body);
    if (!valid) {
        return res.status(400).json({ success: false, message: errors.join(" ") });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const settingsResult = await client.query(
            `SELECT auto_accept_bookings, max_guests_per_booking, min_guests_per_booking,
                    opening_time, closing_time, min_advance_notice_minutes, slot_interval_minutes,
                    confirmation_message, closed_weekdays, max_covers_per_slot
             FROM settings WHERE id = 1`
        );
        const settings = settingsResult.rows[0];

        if (data.guests < settings.min_guests_per_booking || data.guests > settings.max_guests_per_booking) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: `Bookings must be between ${settings.min_guests_per_booking} and ${settings.max_guests_per_booking} guests. Please call us for other party sizes.`,
            });
        }

        const availabilityError = await checkAvailability(client, settings, data.date, data.time, data.guests);
        if (availabilityError) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: availabilityError });
        }

        if (settings.min_advance_notice_minutes > 0) {
            const [y, mo, d] = data.date.split("-").map(Number);
            const [hh, mm] = data.time.split(":").map(Number);
            const bookingDateTime = new Date(y, mo - 1, d, hh, mm);
            const minutesUntilBooking = (bookingDateTime.getTime() - Date.now()) / 60000;
            if (minutesUntilBooking < settings.min_advance_notice_minutes) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: `Bookings must be made at least ${formatMinutes(settings.min_advance_notice_minutes)} in advance.`,
                });
            }
        }

        const customerResult = await client.query(
            `INSERT INTO customers (name, email, phone, marketing_consent)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (email) DO UPDATE SET
                name = EXCLUDED.name,
                phone = EXCLUDED.phone,
                -- Ticking the box grants consent; leaving it unticked on a later booking
                -- never silently withdraws consent already on file (only /unsubscribe does).
                marketing_consent = customers.marketing_consent OR EXCLUDED.marketing_consent,
                updated_at = now()
             RETURNING id`,
            [data.name, data.email, data.phone, data.marketingConsent]
        );
        const customerId = customerResult.rows[0].id;

        const status = settings.auto_accept_bookings ? "confirmed" : "pending";
        let bookingCode = generateBookingCode();
        const adminActionToken = generateActionToken();

        let bookingResult;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                bookingResult = await client.query(
                    `INSERT INTO bookings (booking_code, customer_id, booking_date, booking_time, guests, status, notes, admin_action_token)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING id, booking_code, booking_date, booking_time, guests, status`,
                    [bookingCode, customerId, data.date, data.time, data.guests, status, data.notes || null, adminActionToken]
                );
                break;
            } catch (err) {
                if (err.code === "23505" && attempt < 4) {
                    bookingCode = generateBookingCode();
                    continue;
                }
                throw err;
            }
        }

        await client.query("COMMIT");

        const booking = bookingResult.rows[0];
        res.status(201).json({
            success: true,
            booking: {
                bookingId: booking.booking_code,
                date: booking.booking_date,
                time: booking.booking_time,
                guests: booking.guests,
                status: booking.status,
                confirmationMessage: settings.confirmation_message,
            },
        });

        if (booking.status === "confirmed") {
            sendBookingConfirmationEmail(booking.id).catch((err) =>
                console.error("Failed to send booking confirmation email:", err)
            );
        }

        sendAdminNotificationEmail(booking.id).catch((err) =>
            console.error("Failed to send admin notification email:", err)
        );
    } catch (err) {
        await client.query("ROLLBACK");
        next(err);
    } finally {
        client.release();
    }
});

// GET /booking/:code?email=... - guest looks up their own booking
router.get("/booking/:code", async (req, res, next) => {
    try {
        const booking = await findBookingByCodeAndEmail(pool, req.params.code, req.query.email);
        if (!booking) {
            return res.status(404).json({ success: false, message: NOT_FOUND_MESSAGE });
        }
        res.json({
            success: true,
            booking: {
                bookingCode: booking.booking_code,
                name: booking.name,
                date: booking.booking_date,
                time: booking.booking_time,
                guests: booking.guests,
                status: booking.status,
            },
        });
    } catch (err) {
        next(err);
    }
});

// PATCH /booking/:code - guest modifies their own booking's date/time/guests
router.patch("/booking/:code", async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const booking = await findBookingByCodeAndEmail(client, req.params.code, req.body.email);
        if (!booking) {
            await client.query("ROLLBACK");
            return res.status(404).json({ success: false, message: NOT_FOUND_MESSAGE });
        }
        if (booking.status === "cancelled" || booking.status === "rejected") {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: "This booking can no longer be changed online. Please call us on 020 8647 0286.",
            });
        }

        const date = DATE_RE.test(req.body.date || "") ? req.body.date : booking.booking_date;
        const time = TIME_RE.test(req.body.time || "") ? req.body.time : booking.booking_time.slice(0, 5);
        const guests = Number.isInteger(req.body.guests) && req.body.guests > 0 ? req.body.guests : booking.guests;

        const settingsResult = await client.query(
            `SELECT max_guests_per_booking, min_guests_per_booking, opening_time, closing_time,
                    min_advance_notice_minutes, slot_interval_minutes, closed_weekdays, max_covers_per_slot
             FROM settings WHERE id = 1`
        );
        const settings = settingsResult.rows[0];

        if (guests < settings.min_guests_per_booking || guests > settings.max_guests_per_booking) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                success: false,
                message: `Bookings must be between ${settings.min_guests_per_booking} and ${settings.max_guests_per_booking} guests. Please call us for other party sizes.`,
            });
        }

        const availabilityError = await checkAvailability(client, settings, date, time, guests, booking.id);
        if (availabilityError) {
            await client.query("ROLLBACK");
            return res.status(400).json({ success: false, message: availabilityError });
        }

        if (settings.min_advance_notice_minutes > 0) {
            const [y, mo, d] = date.split("-").map(Number);
            const [hh, mm] = time.split(":").map(Number);
            const bookingDateTime = new Date(y, mo - 1, d, hh, mm);
            const minutesUntilBooking = (bookingDateTime.getTime() - Date.now()) / 60000;
            if (minutesUntilBooking < settings.min_advance_notice_minutes) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    success: false,
                    message: `Changes must be made at least ${formatMinutes(settings.min_advance_notice_minutes)} before the booking time.`,
                });
            }
        }

        const result = await client.query(
            `UPDATE bookings SET booking_date = $1, booking_time = $2, guests = $3, updated_at = now()
             WHERE id = $4
             RETURNING id, booking_code, booking_date, booking_time, guests, status`,
            [date, time, guests, booking.id]
        );

        await client.query("COMMIT");

        const updated = result.rows[0];
        res.json({
            success: true,
            booking: {
                bookingCode: updated.booking_code,
                date: updated.booking_date,
                time: updated.booking_time,
                guests: updated.guests,
                status: updated.status,
            },
        });

        sendBookingUpdatedEmail(updated.id).catch((err) =>
            console.error("Failed to send booking-updated email:", err)
        );
    } catch (err) {
        await client.query("ROLLBACK");
        next(err);
    } finally {
        client.release();
    }
});

// POST /booking/:code/cancel - guest cancels their own booking
router.post("/booking/:code/cancel", async (req, res, next) => {
    try {
        const booking = await findBookingByCodeAndEmail(pool, req.params.code, req.body.email);
        if (!booking) {
            return res.status(404).json({ success: false, message: NOT_FOUND_MESSAGE });
        }
        if (booking.status === "cancelled") {
            return res.json({ success: true, booking: { bookingCode: booking.booking_code, status: "cancelled" } });
        }

        const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : null;

        const result = await pool.query(
            `UPDATE bookings SET status = 'cancelled', cancellation_reason = $2, updated_at = now() WHERE id = $1
             RETURNING id, booking_code, booking_date, booking_time, guests, status`,
            [booking.id, reason || null]
        );
        const updated = result.rows[0];
        res.json({
            success: true,
            booking: { bookingCode: updated.booking_code, status: updated.status },
        });

        const subject = "Your booking has been cancelled — Blue Bengal";
        const body = `Hi ${booking.name},\n\nYour booking ${updated.booking_code} for ` +
            `${formatDate(updated.booking_date)} at ${formatTime(updated.booking_time.slice(0, 5))} has been cancelled. ` +
            `We hope to welcome you another time.`;
        const html = emailLayout({
            heading: "Booking Cancelled",
            bodyHtml: `
                <p style="margin:0 0 6px;">Hi ${booking.name},</p>
                <p style="margin:0 0 16px; line-height:1.6;">Your booking has been cancelled as requested.</p>
                ${detailsTable([
                    ["Booking Code", updated.booking_code],
                    ["Date", formatDate(updated.booking_date)],
                    ["Time", formatTime(updated.booking_time.slice(0, 5))],
                ])}
                ${button("Book Again", frontendUrl("/booking.html"))}
                <p style="margin:20px 0 0; font-size:13px; color:#6b5a4e; text-align:center;">We hope to welcome you another time!</p>
            `,
        });
        sendEmail({ to: booking.email, subject, body, html })
            .then(({ status }) =>
                pool.query(
                    `INSERT INTO email_log (booking_id, email_type, recipient, subject, body, status)
                     VALUES ($1, 'cancellation', $2, $3, $4, $5)`,
                    [updated.id, booking.email, subject, body, status]
                )
            )
            .catch((err) => console.error("Failed to send booking-cancelled email:", err));
    } catch (err) {
        next(err);
    }
});

// POST /unsubscribe - opts an email out of promotional/voucher emails.
// Deliberately unauthenticated: it only ever reduces contact, so there's no
// abuse risk in letting anyone trigger it for a given address (standard
// pattern for unsubscribe links, and required by PECR for marketing email).
router.post("/unsubscribe", async (req, res, next) => {
    try {
        const email = (req.body.email || "").toString().trim();
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required." });
        }
        await pool.query(
            "UPDATE customers SET marketing_consent = false, updated_at = now() WHERE lower(email) = lower($1)",
            [email]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
