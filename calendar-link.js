// Builds a Google Calendar "quick add" URL — no API or auth needed, just a
// specially-formatted link that pre-fills an event for the user to confirm.
function buildGoogleCalendarUrl({ date, time, guests, bookingCode, durationHours = 2 }) {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date(y, m - 1, d, hh, mm);
    const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);

    const toGCalFormat = (dt) => dt.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: "Table booking at Blue Bengal Carshalton",
        dates: `${toGCalFormat(start)}/${toGCalFormat(end)}`,
        details: `Booking code: ${bookingCode}\nGuests: ${guests}\nPhone: 020 8647 0286`,
        location: "140-142 High Street, Carshalton SM5 3AE",
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
