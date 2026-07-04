// localhost -> local backend, the test subdomain -> the test backend, anything else -> production
const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? window.location.origin
    : window.location.hostname.startsWith("test.")
    ? "https://api-test.bluebengal-carshalton.co.uk"
    : "https://api.bluebengal-carshalton.co.uk";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

document.addEventListener("DOMContentLoaded", async function () {
    let dateInput = document.getElementById("date");
    let timeSelect = document.getElementById("time");
    let guestsSelect = document.getElementById("guests");
    let dateError = document.getElementById("dateError");
    let submitBtn = document.querySelector("#bookingForm button[type='submit']");

    // Restrict past dates in date picker
    let today = new Date().toISOString().split("T")[0];
    dateInput.setAttribute("min", today);

    // Sensible fallback in case the settings request fails
    let openingTime = "17:30";
    let closingTime = "21:00";
    let minGuests = 1;
    let maxGuests = 20;
    let slotIntervalMinutes = 30;
    let closedWeekdays = [];
    let minAdvanceNoticeMinutes = 0;

    try {
        const response = await fetch(`${API_BASE_URL}/booking-settings`);
        const result = await response.json();
        if (result.success) {
            ({
                openingTime, closingTime,
                minGuestsPerBooking: minGuests, maxGuestsPerBooking: maxGuests,
                slotIntervalMinutes, closedWeekdays, minAdvanceNoticeMinutes,
            } = result.settings);
        }
    } catch (error) {
        console.error("Could not load booking settings, using defaults.", error);
    }

    // Populate guests dropdown (this doesn't depend on the chosen date)
    for (let i = minGuests; i <= maxGuests; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        guestsSelect.appendChild(option);
    }

    // Rebuilds the time dropdown for a given date, marking times that are
    // blocked by the restaurant or too soon (minimum advance notice) as
    // disabled with a "(Not available)" label, instead of only finding out
    // after the guest tries to submit.
    async function populateTimeOptions(selectedDate) {
        const previousValue = timeSelect.value;
        timeSelect.innerHTML = "";

        let blockedRanges = [];
        let wholeDayBlocked = false;
        if (selectedDate) {
            try {
                const res = await fetch(`${API_BASE_URL}/availability?date=${encodeURIComponent(selectedDate)}`);
                const data = await res.json();
                if (data.success) {
                    blockedRanges = data.blockedRanges;
                    wholeDayBlocked = data.wholeDayBlocked;
                }
            } catch (error) {
                console.error("Could not load availability for this date.", error);
            }
        }

        const [openHour, openMinute] = openingTime.split(":").map(Number);
        const [closeHour, closeMinute] = closingTime.split(":").map(Number);
        let minutes = openHour * 60 + openMinute;
        const closeMinutes = closeHour * 60 + closeMinute;

        const nowPlusNotice = selectedDate ? new Date(Date.now() + minAdvanceNoticeMinutes * 60000) : null;

        while (minutes <= closeMinutes) {
            let hour = Math.floor(minutes / 60);
            let mins = minutes % 60;
            let ampm = hour >= 12 ? "PM" : "AM";
            let displayHour = hour % 12 === 0 ? 12 : hour % 12;
            let value = `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

            let isUnavailable = false;
            if (selectedDate) {
                if (wholeDayBlocked) {
                    isUnavailable = true;
                } else if (blockedRanges.some((r) => value >= r.startTime && value < r.endTime)) {
                    isUnavailable = true;
                } else if (minAdvanceNoticeMinutes > 0) {
                    const [y, m, d] = selectedDate.split("-").map(Number);
                    const slotDateTime = new Date(y, m - 1, d, hour, mins);
                    if (slotDateTime < nowPlusNotice) isUnavailable = true;
                }
            }

            let option = document.createElement("option");
            option.value = value;
            option.textContent = isUnavailable
                ? `${displayHour}:${String(mins).padStart(2, "0")} ${ampm} (Not available)`
                : `${displayHour}:${String(mins).padStart(2, "0")} ${ampm}`;
            option.disabled = isUnavailable;
            timeSelect.appendChild(option);

            minutes += slotIntervalMinutes;
        }

        // Keep the previously chosen time selected if it's still on the list and available
        if (previousValue) {
            const stillValid = [...timeSelect.options].find((o) => o.value === previousValue && !o.disabled);
            if (stillValid) timeSelect.value = previousValue;
        }
    }

    await populateTimeOptions(null);

    // Warn if the chosen date falls on a day we're closed, and refresh time
    // availability for the newly selected date either way.
    dateInput.addEventListener("change", async () => {
        if (!dateInput.value) return;
        const [y, m, d] = dateInput.value.split("-").map(Number);
        const weekday = new Date(y, m - 1, d).getDay();
        const isClosed = closedWeekdays.includes(weekday);

        dateError.hidden = !isClosed;
        dateError.textContent = isClosed ? `We're closed on ${WEEKDAY_NAMES[weekday]}s. Please choose another date.` : "";
        timeSelect.disabled = isClosed;
        submitBtn.disabled = isClosed;

        if (!isClosed) {
            await populateTimeOptions(dateInput.value);
        }
    });
});

// Handle Booking Form Submission
document.getElementById("bookingForm").addEventListener("submit", async function (event) {
    event.preventDefault(); // Prevent default form submission

    let name = document.getElementById("name").value.trim();
    let email = document.getElementById("email").value.trim();
    let phone = document.getElementById("phone").value.trim();
    let date = document.getElementById("date").value;
    let time = document.getElementById("time").value;
    let guests = document.getElementById("guests").value;
    let notes = document.getElementById("notes").value.trim();
    let marketingConsent = document.getElementById("marketingConsent").checked;

    if (!name || !email || !phone || !date || !time || !guests) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        let response = await fetch(`${API_BASE_URL}/create-booking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone, date, time, guests, notes, marketingConsent })
        });

        let result = await response.json();
        if (result.success) {
            // Store booking details for the Thank You page
            sessionStorage.setItem("bookingDetails", JSON.stringify({
                bookingId: result.booking.bookingId,
                date: date,
                time: time,
                guests: guests,
                phone: phone,
                confirmationMessage: result.booking.confirmationMessage
            }));

            // Redirect to Thank You page
            window.location.href = "thank-you.html";
        } else {
            alert("Error: " + result.message);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Something went wrong. Please try again.");
    }
});
