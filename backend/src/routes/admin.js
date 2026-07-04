const express = require("express");
const pool = require("../db/pool");
const adminAuth = require("../middleware/adminAuth");
const { checkAvailability } = require("../utils/checkAvailability");
const { sendBookingConfirmationEmail } = require("../utils/sendConfirmationEmail");

const router = express.Router();
router.use(adminAuth);

const VALID_STATUSES = ["pending", "confirmed", "rejected", "cancelled"];

// GET /api/admin/bookings?status=&date=
router.get("/bookings", async (req, res, next) => {
    try {
        const { status, date } = req.query;
        const conditions = [];
        const params = [];

        if (status) {
            if (!VALID_STATUSES.includes(status)) {
                return res.status(400).json({ success: false, message: "Invalid status filter." });
            }
            params.push(status);
            conditions.push(`b.status = $${params.length}`);
        }
        if (date) {
            params.push(date);
            conditions.push(`b.booking_date = $${params.length}`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const result = await pool.query(
            `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, b.guests, b.status,
                    b.notes, b.created_at,
                    c.id AS customer_id, c.name, c.email, c.phone, c.marketing_consent,
                    (SELECT COUNT(*) FROM bookings b2 WHERE b2.customer_id = c.id)::int AS customer_booking_count
             FROM bookings b
             JOIN customers c ON c.id = b.customer_id
             ${where}
             ORDER BY b.booking_date ASC, b.booking_time ASC`,
            params
        );

        res.json({ success: true, bookings: result.rows });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/bookings/:id
router.get("/bookings/:id", async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT b.id, b.booking_code, b.booking_date, b.booking_time, b.guests, b.status,
                    b.notes, b.created_at,
                    c.id AS customer_id, c.name, c.email, c.phone, c.marketing_consent,
                    (SELECT COUNT(*) FROM bookings b2 WHERE b2.customer_id = c.id)::int AS customer_booking_count
             FROM bookings b
             JOIN customers c ON c.id = b.customer_id
             WHERE b.id = $1`,
            [req.params.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }
        res.json({ success: true, booking: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/admin/bookings/:id/status  { status: "confirmed" | "rejected" | "cancelled" | "pending" }
router.patch("/bookings/:id/status", async (req, res, next) => {
    try {
        const { status } = req.body;
        if (!VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status." });
        }

        const existing = await pool.query("SELECT status FROM bookings WHERE id = $1", [req.params.id]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }
        const wasConfirmed = existing.rows[0].status === "confirmed";

        const result = await pool.query(
            `UPDATE bookings SET status = $1, updated_at = now() WHERE id = $2
             RETURNING id, booking_code, booking_date, booking_time, guests, status`,
            [status, req.params.id]
        );
        res.json({ success: true, booking: result.rows[0] });

        if (status === "confirmed" && !wasConfirmed) {
            sendBookingConfirmationEmail(req.params.id).catch((err) =>
                console.error("Failed to send booking confirmation email:", err)
            );
        }
    } catch (err) {
        next(err);
    }
});

// PATCH /api/admin/bookings/:id  { date?, time?, guests? }
// Lets staff amend an existing booking (e.g. party size changing from 4 to 6).
// Re-checks the same availability rules guests are held to, but not the
// minimum-advance-notice window, since staff are knowingly rescheduling.
router.patch("/bookings/:id", async (req, res, next) => {
    const client = await pool.connect();
    try {
        const existingResult = await client.query(
            "SELECT booking_date, booking_time, guests FROM bookings WHERE id = $1",
            [req.params.id]
        );
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Booking not found." });
        }
        const existing = existingResult.rows[0];

        const date = DATE_RE.test(req.body.date || "") ? req.body.date : existing.booking_date;
        const time = TIME_RE.test(req.body.time || "") ? req.body.time : existing.booking_time.slice(0, 5);
        const guests = Number.isInteger(req.body.guests) && req.body.guests > 0 ? req.body.guests : existing.guests;

        const settingsResult = await client.query(
            `SELECT max_guests_per_booking, min_guests_per_booking, opening_time, closing_time,
                    slot_interval_minutes, closed_weekdays
             FROM settings WHERE id = 1`
        );
        const settings = settingsResult.rows[0];

        if (guests < settings.min_guests_per_booking || guests > settings.max_guests_per_booking) {
            return res.status(400).json({
                success: false,
                message: `Guests must be between ${settings.min_guests_per_booking} and ${settings.max_guests_per_booking}.`,
            });
        }

        const availabilityError = await checkAvailability(client, settings, date, time);
        if (availabilityError) {
            return res.status(400).json({ success: false, message: availabilityError });
        }

        const result = await client.query(
            `UPDATE bookings SET booking_date = $1, booking_time = $2, guests = $3, updated_at = now()
             WHERE id = $4
             RETURNING id, booking_code, booking_date, booking_time, guests, status`,
            [date, time, guests, req.params.id]
        );

        res.json({ success: true, booking: result.rows[0] });
    } catch (err) {
        next(err);
    } finally {
        client.release();
    }
});

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SLOT_INTERVALS = [15, 30, 45, 60];

const VALID_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

const SETTINGS_COLUMNS = `auto_accept_bookings, max_guests_per_booking, min_guests_per_booking,
    opening_time, closing_time, min_advance_notice_minutes, slot_interval_minutes,
    confirmation_message, closed_weekdays,
    reminder_enabled, reminder_hours_before, feedback_enabled, feedback_hours_after, feedback_link,
    updated_at`;

// GET /api/admin/settings
router.get("/settings", async (req, res, next) => {
    try {
        const result = await pool.query(`SELECT ${SETTINGS_COLUMNS} FROM settings WHERE id = 1`);
        res.json({ success: true, settings: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// PATCH /api/admin/settings
router.patch("/settings", async (req, res, next) => {
    try {
        const {
            autoAcceptBookings,
            maxGuestsPerBooking,
            minGuestsPerBooking,
            openingTime,
            closingTime,
            minAdvanceNoticeMinutes,
            slotIntervalMinutes,
            confirmationMessage,
            closedWeekdays,
            reminderEnabled,
            reminderHoursBefore,
            feedbackEnabled,
            feedbackHoursAfter,
            feedbackLink,
        } = req.body;
        const updates = [];
        const params = [];

        if (typeof autoAcceptBookings === "boolean") {
            params.push(autoAcceptBookings);
            updates.push(`auto_accept_bookings = $${params.length}`);
        }
        if (Number.isInteger(maxGuestsPerBooking) && maxGuestsPerBooking > 0) {
            params.push(maxGuestsPerBooking);
            updates.push(`max_guests_per_booking = $${params.length}`);
        }
        if (Number.isInteger(minGuestsPerBooking) && minGuestsPerBooking > 0) {
            params.push(minGuestsPerBooking);
            updates.push(`min_guests_per_booking = $${params.length}`);
        }
        if (typeof openingTime === "string" && TIME_RE.test(openingTime)) {
            params.push(openingTime);
            updates.push(`opening_time = $${params.length}`);
        }
        if (typeof closingTime === "string" && TIME_RE.test(closingTime)) {
            params.push(closingTime);
            updates.push(`closing_time = $${params.length}`);
        }
        if (Number.isInteger(minAdvanceNoticeMinutes) && minAdvanceNoticeMinutes >= 0) {
            params.push(minAdvanceNoticeMinutes);
            updates.push(`min_advance_notice_minutes = $${params.length}`);
        }
        if (VALID_SLOT_INTERVALS.includes(slotIntervalMinutes)) {
            params.push(slotIntervalMinutes);
            updates.push(`slot_interval_minutes = $${params.length}`);
        }
        if (typeof confirmationMessage === "string" && confirmationMessage.trim()) {
            params.push(confirmationMessage.trim());
            updates.push(`confirmation_message = $${params.length}`);
        }
        if (Array.isArray(closedWeekdays) && closedWeekdays.every((d) => VALID_WEEKDAYS.includes(d))) {
            params.push(closedWeekdays);
            updates.push(`closed_weekdays = $${params.length}`);
        }
        if (typeof reminderEnabled === "boolean") {
            params.push(reminderEnabled);
            updates.push(`reminder_enabled = $${params.length}`);
        }
        if (Number.isInteger(reminderHoursBefore) && reminderHoursBefore > 0) {
            params.push(reminderHoursBefore);
            updates.push(`reminder_hours_before = $${params.length}`);
        }
        if (typeof feedbackEnabled === "boolean") {
            params.push(feedbackEnabled);
            updates.push(`feedback_enabled = $${params.length}`);
        }
        if (Number.isInteger(feedbackHoursAfter) && feedbackHoursAfter > 0) {
            params.push(feedbackHoursAfter);
            updates.push(`feedback_hours_after = $${params.length}`);
        }
        if (typeof feedbackLink === "string" && feedbackLink.trim()) {
            params.push(feedbackLink.trim());
            updates.push(`feedback_link = $${params.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No valid settings provided." });
        }

        const current = await pool.query(
            "SELECT opening_time, closing_time, min_guests_per_booking, max_guests_per_booking FROM settings WHERE id = 1"
        );
        const nextOpening = openingTime && TIME_RE.test(openingTime) ? openingTime : current.rows[0].opening_time;
        const nextClosing = closingTime && TIME_RE.test(closingTime) ? closingTime : current.rows[0].closing_time;
        if (nextOpening >= nextClosing) {
            return res.status(400).json({ success: false, message: "Opening time must be before closing time." });
        }
        const nextMin = Number.isInteger(minGuestsPerBooking) && minGuestsPerBooking > 0
            ? minGuestsPerBooking : current.rows[0].min_guests_per_booking;
        const nextMax = Number.isInteger(maxGuestsPerBooking) && maxGuestsPerBooking > 0
            ? maxGuestsPerBooking : current.rows[0].max_guests_per_booking;
        if (nextMin > nextMax) {
            return res.status(400).json({ success: false, message: "Minimum guests cannot be greater than maximum guests." });
        }

        updates.push("updated_at = now()");
        const result = await pool.query(
            `UPDATE settings SET ${updates.join(", ")} WHERE id = 1 RETURNING ${SETTINGS_COLUMNS}`,
            params
        );

        res.json({ success: true, settings: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/blocked-slots
router.get("/blocked-slots", async (req, res, next) => {
    try {
        const result = await pool.query(
            "SELECT id, block_date, start_time, end_time, reason, created_at FROM blocked_slots ORDER BY block_date ASC, start_time ASC"
        );
        res.json({ success: true, blockedSlots: result.rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/blocked-slots  { date, wholeDay?: boolean, startTime?, endTime?, reason? }
// Omit startTime/endTime (or set wholeDay: true) to block the entire date, e.g. Christmas Day.
router.post("/blocked-slots", async (req, res, next) => {
    try {
        const { date, wholeDay, startTime, endTime, reason } = req.body;

        if (!DATE_RE.test(date || "")) {
            return res.status(400).json({ success: false, message: "A valid date (YYYY-MM-DD) is required." });
        }

        let start = null;
        let end = null;
        if (!wholeDay) {
            if (!TIME_RE.test(startTime || "") || !TIME_RE.test(endTime || "")) {
                return res.status(400).json({ success: false, message: "Valid start and end times are required, or mark this as a whole-day closure." });
            }
            if (startTime >= endTime) {
                return res.status(400).json({ success: false, message: "End time must be after start time." });
            }
            start = startTime;
            end = endTime;
        }

        const result = await pool.query(
            `INSERT INTO blocked_slots (block_date, start_time, end_time, reason)
             VALUES ($1, $2, $3, $4)
             RETURNING id, block_date, start_time, end_time, reason, created_at`,
            [date, start, end, (reason || "").toString().trim() || null]
        );

        res.status(201).json({ success: true, blockedSlot: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/blocked-slots/:id
router.delete("/blocked-slots/:id", async (req, res, next) => {
    try {
        const result = await pool.query("DELETE FROM blocked_slots WHERE id = $1 RETURNING id", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Blocked slot not found." });
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/email-log - recent reminder/feedback emails the scheduler has triggered
router.get("/email-log", async (req, res, next) => {
    try {
        const result = await pool.query(
            `SELECT e.id, e.email_type, e.recipient, e.subject, e.status, e.created_at, e.booking_id,
                    b.booking_code
             FROM email_log e
             LEFT JOIN bookings b ON b.id = e.booking_id
             ORDER BY e.created_at DESC
             LIMIT 100`
        );
        res.json({ success: true, emailLog: result.rows });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
