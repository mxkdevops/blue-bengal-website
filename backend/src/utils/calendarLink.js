// Builds a Google Calendar "quick add" URL for a booking. Booking date/time
// are stored as plain Europe/London wall-clock values (see checkAvailability.js),
// but this server runs in UTC — so we can't just do `new Date(y, m, d, h, min)`,
// which would interpret the numbers as UTC and be off by an hour during BST.
// Intl.DateTimeFormat gives us the real Europe/London offset for that date
// (correctly handling the BST/GMT transition) without any external dependency.
function getTimeZoneOffsetMs(date, timeZone) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
        .formatToParts(date)
        .reduce((acc, p) => {
            acc[p.type] = p.value;
            return acc;
        }, {});

    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - date.getTime();
}

function londonWallClockToUtc(y, month, d, hh, mm) {
    const naiveUtc = Date.UTC(y, month - 1, d, hh, mm);
    const offset = getTimeZoneOffsetMs(new Date(naiveUtc), "Europe/London");
    return new Date(naiveUtc - offset);
}

function toGCalFormat(date) {
    return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildGoogleCalendarUrl({ date, time, guests, bookingCode, durationHours = 2 }) {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const start = londonWallClockToUtc(y, m, d, hh, mm);
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: "Table booking at Blue Bengal Carshalton",
        dates: `${toGCalFormat(start)}/${toGCalFormat(end)}`,
        details: `Booking code: ${bookingCode}\nGuests: ${guests}\nPhone: 020 8647 0286`,
        location: "140-142 High Street, Carshalton SM5 3AE",
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

module.exports = { buildGoogleCalendarUrl };
