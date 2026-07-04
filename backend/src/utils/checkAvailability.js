const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeToMinutes(time) {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

function weekdayOf(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
}

// Checks a date/time against opening hours, slot alignment, weekly closed days
// and one-off blocked slots. Returns null if bookable, or an error message string.
// Shared by the guest create-booking route and the admin booking-edit route so
// the two can't silently drift apart.
async function checkAvailability(client, settings, date, time) {
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

    return null;
}

module.exports = { checkAvailability, weekdayOf, WEEKDAY_NAMES, timeToMinutes };
