const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? window.location.origin
    : window.location.hostname.startsWith("test.")
    ? "https://api-test.bluebengal-carshalton.co.uk"
    : "https://api.bluebengal-carshalton.co.uk";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const els = {
    lookupCard: document.getElementById("lookupCard"),
    lookupForm: document.getElementById("lookupForm"),
    lookupCode: document.getElementById("lookupCode"),
    lookupEmail: document.getElementById("lookupEmail"),
    lookupError: document.getElementById("lookupError"),

    detailsCard: document.getElementById("detailsCard"),
    statusBanner: document.getElementById("statusBanner"),
    editForm: document.getElementById("editForm"),
    editDate: document.getElementById("editDate"),
    editTime: document.getElementById("editTime"),
    editGuests: document.getElementById("editGuests"),
    editError: document.getElementById("editError"),
    saveChangesBtn: document.getElementById("saveChangesBtn"),
    cancelBookingBtn: document.getElementById("cancelBookingBtn"),
    cancelReasonPanel: document.getElementById("cancelReasonPanel"),
    cancelReason: document.getElementById("cancelReason"),
    confirmCancelBtn: document.getElementById("confirmCancelBtn"),
    backFromCancelBtn: document.getElementById("backFromCancelBtn"),
    searchAgainBtn: document.getElementById("searchAgainBtn"),
    addToCalendarLink: document.getElementById("addToCalendarLink"),
};

let currentEmail = "";
let bookingSettings = null;

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
}

// Avoid toISOString() for "today" — it converts to UTC, which can shift the
// calendar date during BST. Read back the local date components instead.
function todayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function loadBookingSettings() {
    if (bookingSettings) return bookingSettings;
    const res = await fetch(`${API_BASE_URL}/booking-settings`);
    const data = await res.json();
    bookingSettings = data.settings;
    return bookingSettings;
}

function populateEditOptions(settings, currentTime, currentGuests) {
    els.editTime.innerHTML = "";
    const [openHour, openMinute] = settings.openingTime.split(":").map(Number);
    const [closeHour, closeMinute] = settings.closingTime.split(":").map(Number);
    let minutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    while (minutes <= closeMinutes) {
        const hour = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const ampm = hour >= 12 ? "PM" : "AM";
        const displayHour = hour % 12 === 0 ? 12 : hour % 12;
        const value = `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${displayHour}:${String(mins).padStart(2, "0")} ${ampm}`;
        if (value === currentTime) option.selected = true;
        els.editTime.appendChild(option);

        minutes += settings.slotIntervalMinutes;
    }

    els.editGuests.innerHTML = "";
    for (let i = settings.minGuestsPerBooking; i <= settings.maxGuestsPerBooking; i++) {
        const option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        if (i === currentGuests) option.selected = true;
        els.editGuests.appendChild(option);
    }
}

function showDetails(booking) {
    els.lookupCard.hidden = true;
    els.detailsCard.hidden = false;

    const readOnly = booking.status === "cancelled" || booking.status === "rejected";
    const statusLabel = { pending: "Pending Review", confirmed: "Confirmed", cancelled: "Cancelled", rejected: "Declined" }[booking.status];

    els.statusBanner.innerHTML = `
        <p><strong>Booking Code:</strong> ${booking.bookingCode}</p>
        <p><strong>Status:</strong> ${statusLabel}</p>
        <p><strong>Date:</strong> ${formatDate(booking.date)}</p>
        <p><strong>Time:</strong> ${booking.time.slice(0, 5)}</p>
        <p><strong>Guests:</strong> ${booking.guests}</p>
        ${readOnly ? `<p style="margin-top:10px;">This booking can no longer be changed online. Please call us on <a href="tel:02086470286">020 8647 0286</a> if you have questions.</p>` : ""}
    `;

    els.editForm.hidden = readOnly;
    els.cancelBookingBtn.hidden = readOnly;
    els.addToCalendarLink.hidden = readOnly;

    if (!readOnly) {
        els.addToCalendarLink.href = buildGoogleCalendarUrl({
            date: booking.date,
            time: booking.time.slice(0, 5),
            guests: booking.guests,
            bookingCode: booking.bookingCode,
        });
        els.editDate.value = booking.date;
        els.editDate.setAttribute("min", todayStr());
        loadBookingSettings().then((settings) => {
            populateEditOptions(settings, booking.time.slice(0, 5), booking.guests);
        });
    }
}

els.lookupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.lookupError.hidden = true;
    const code = els.lookupCode.value.trim();
    const email = els.lookupEmail.value.trim();

    try {
        const res = await fetch(`${API_BASE_URL}/booking/${encodeURIComponent(code)}?email=${encodeURIComponent(email)}`);
        const data = await res.json();
        if (!data.success) {
            els.lookupError.textContent = data.message;
            els.lookupError.hidden = false;
            return;
        }
        currentEmail = email;
        showDetails(data.booking);
    } catch (err) {
        els.lookupError.textContent = "Something went wrong. Please try again.";
        els.lookupError.hidden = false;
    }
});

els.editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.editError.hidden = true;

    const code = els.lookupCode.value.trim();
    try {
        const res = await fetch(`${API_BASE_URL}/booking/${encodeURIComponent(code)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: currentEmail,
                date: els.editDate.value,
                time: els.editTime.value,
                guests: Number(els.editGuests.value),
            }),
        });
        const data = await res.json();
        if (!data.success) {
            els.editError.textContent = data.message;
            els.editError.hidden = false;
            return;
        }
        showDetails({ ...data.booking, status: data.booking.status });
        alert("Your booking has been updated. A confirmation email is on its way.");
    } catch (err) {
        els.editError.textContent = "Something went wrong. Please try again.";
        els.editError.hidden = false;
    }
});

els.cancelBookingBtn.addEventListener("click", () => {
    els.cancelBookingBtn.hidden = true;
    els.cancelReasonPanel.hidden = false;
    els.cancelReason.focus();
});

els.backFromCancelBtn.addEventListener("click", () => {
    els.cancelReasonPanel.hidden = true;
    els.cancelBookingBtn.hidden = false;
    els.cancelReason.value = "";
});

els.confirmCancelBtn.addEventListener("click", async () => {
    const code = els.lookupCode.value.trim();
    const reason = els.cancelReason.value.trim();

    try {
        const res = await fetch(`${API_BASE_URL}/booking/${encodeURIComponent(code)}/cancel`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: currentEmail, reason }),
        });
        const data = await res.json();
        if (!data.success) {
            alert(data.message);
            return;
        }
        alert("Your booking has been cancelled.");
        window.location.reload();
    } catch (err) {
        alert("Something went wrong. Please try again.");
    }
});

els.searchAgainBtn.addEventListener("click", () => {
    els.detailsCard.hidden = true;
    els.lookupCard.hidden = false;
});

// Pre-fill the booking code if arriving from an email link (?code=BB-XXXXXX)
document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) els.lookupCode.value = code;
});
