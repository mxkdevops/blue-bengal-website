const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9]{10,15}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Format/shape validation only. Business rules that depend on restaurant
// settings (opening hours, guest limits, advance notice, blocked slots) are
// checked against the live `settings` row in the /create-booking route.
function validateBooking(body) {
    const errors = [];
    const name = (body.name || "").toString().trim();
    const email = (body.email || "").toString().trim();
    const phone = (body.phone || "").toString().trim();
    const date = (body.date || "").toString().trim();
    const time = (body.time || "").toString().trim();
    const guests = Number(body.guests);
    const notes = (body.notes || "").toString().trim().slice(0, 500);
    const marketingConsent = body.marketingConsent === true;

    if (!name) errors.push("Name is required.");
    if (!EMAIL_RE.test(email)) errors.push("A valid email is required.");
    if (!PHONE_RE.test(phone)) errors.push("A valid phone number is required.");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push("A valid date (YYYY-MM-DD) is required.");
    } else {
        const today = new Date().toISOString().split("T")[0];
        if (date < today) errors.push("Date cannot be in the past.");
    }

    const normalizedTime = TIME_RE.test(time) ? time : null;
    if (!normalizedTime) {
        errors.push("A valid time is required.");
    }

    if (!Number.isInteger(guests) || guests < 1) {
        errors.push("Guests must be a whole number of at least 1.");
    }

    return {
        valid: errors.length === 0,
        errors,
        data: { name, email, phone, date, time: normalizedTime, guests, notes, marketingConsent },
    };
}

module.exports = { validateBooking };
