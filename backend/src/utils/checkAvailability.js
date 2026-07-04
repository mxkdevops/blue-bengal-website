const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
}

// Checks a date/time against opening hours, slot alignment, weekly closed days,
// one-off blocked slots, and total-covers capacity for that slot. Returns null
// if bookable, or an error message string. Shared by the guest create-booking
// route, the guest self-modify route, and the admin booking-edit route so
// they can't silently drift apart.
//
// `guests` and `excludeBookingId` are optional — omit them to skip the
// capacity check (e.g. when only validating a date/time in isolation).
// `excludeBookingId` lets an edit exclude the booking's own existing guests
// from the capacity total, since it's about to be replaced by the new value.
async function checkAvailability(client, settings, date, time, guests = null, excludeBookingId = null) {
    const openingTime = settings.opening_time.slice(0, 5);
    const closingTime = settings.closing_time.slice(0, 5);
    const weekday = weekdayOf(date);

    if (settings.closed_weekdays.includes(weekday)) {
        return `We're closed on ${WEEKDAY_NAMES[weekday]}s. Please choose another date.`;
    }

    if (time < openingTime || time > closingTime) {
        return `Time must be between ${openingTime} and ${closingTime}.`;
    }

    const minutesFromOpening = timeToMinutes(time) - timeToMinutes(openingTime);
    if (minutesFromOpening % settings.slot_interval_minutes !== 0) {
        return "Please choose one of the available booking times.";
    }

    const blockedResult = await client.query(
        `SELECT id FROM blocked_slots
         WHERE block_date = $1 AND (start_time IS NULL OR (start_time <= $2 AND end_time > $2))
         LIMIT 1`,
        [date, time]
    );
    if (blockedResult.rows.length > 0) {
        return "This time is not available for booking. Please choose another time.";
    }

    if (guests !== null && settings.max_covers_per_slot) {
        const params = [date, time];
        let excludeClause = "";
        if (excludeBookingId) {
            params.push(excludeBookingId);
            excludeClause = ` AND id != $${params.length}`;
        }
        const coversResult = await client.query(
            `SELECT COALESCE(SUM(guests), 0)::int AS total FROM bookings
             WHERE booking_date = $1 AND booking_time = $2
               AND status IN ('pending', 'confirmed')${excludeClause}`,
            params
        );
        const existingCovers = coversResult.rows[0].total;
        if (existingCovers + guests > settings.max_covers_per_slot) {
            const remaining = Math.max(settings.max_covers_per_slot - existingCovers, 0);
            return remaining > 0
                ? `Only ${remaining} more guest${remaining === 1 ? "" : "s"} can be seated at this time. Please choose another time or call us for larger parties.`
                : "This time is fully booked. Please choose another time.";
        }
    }

    return null;
}

module.exports = { checkAvailability, weekdayOf, WEEKDAY_NAMES, timeToMinutes };
