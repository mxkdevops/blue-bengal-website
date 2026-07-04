const express = require("express");
const pool = require("../db/pool");
const { validateBooking } = require("../utils/validateBooking");
const { generateBookingCode } = require("../utils/bookingCode");
const { checkAvailability } = require("../utils/checkAvailability");

const router = express.Router();

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
                    slot_interval_minutes, closed_weekdays
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
            },
        });
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
                    confirmation_message, closed_weekdays
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

        const availabilityError = await checkAvailability(client, settings, data.date, data.time);
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
            `INSERT INTO customers (name, email, phone)
             VALUES ($1, $2, $3)
             ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, updated_at = now()
             RETURNING id`,
            [data.name, data.email, data.phone]
        );
        const customerId = customerResult.rows[0].id;

        const status = settings.auto_accept_bookings ? "confirmed" : "pending";
        let bookingCode = generateBookingCode();

        let bookingResult;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                bookingResult = await client.query(
                    `INSERT INTO bookings (booking_code, customer_id, booking_date, booking_time, guests, status)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING id, booking_code, booking_date, booking_time, guests, status`,
                    [bookingCode, customerId, data.date, data.time, data.guests, status]
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
    } catch (err) {
        await client.query("ROLLBACK");
        next(err);
    } finally {
        client.release();
    }
});

module.exports = router;
