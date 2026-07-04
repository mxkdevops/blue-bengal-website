// Use the local backend when the site is served from localhost, otherwise the production API
const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? window.location.origin
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

    try {
        const response = await fetch(`${API_BASE_URL}/booking-settings`);
        const result = await response.json();
        if (result.success) {
            ({ openingTime, closingTime, minGuestsPerBooking: minGuests, maxGuestsPerBooking: maxGuests, slotIntervalMinutes, closedWeekdays } = result.settings);
        }
    } catch (error) {
        console.error("Could not load booking settings, using defaults.", error);
    }

    // Populate time slots between opening and closing time
    const [openHour, openMinute] = openingTime.split(":").map(Number);
    const [closeHour, closeMinute] = closingTime.split(":").map(Number);
    let minutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;

    while (minutes <= closeMinutes) {
        let hour = Math.floor(minutes / 60);
        let mins = minutes % 60;
        let ampm = hour >= 12 ? "PM" : "AM";
        let displayHour = hour % 12 === 0 ? 12 : hour % 12;

        let option = document.createElement("option");
        option.value = `${String(hour).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
        option.textContent = `${displayHour}:${String(mins).padStart(2, "0")} ${ampm}`;
        timeSelect.appendChild(option);

        minutes += slotIntervalMinutes;
    }

    // Populate guests dropdown
    for (let i = minGuests; i <= maxGuests; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        guestsSelect.appendChild(option);
    }

    // Warn if the chosen date falls on a day we're closed
    dateInput.addEventListener("change", () => {
        if (!dateInput.value) return;
        const [y, m, d] = dateInput.value.split("-").map(Number);
        const weekday = new Date(y, m - 1, d).getDay();
        const isClosed = closedWeekdays.includes(weekday);

        dateError.hidden = !isClosed;
        dateError.textContent = isClosed ? `We're closed on ${WEEKDAY_NAMES[weekday]}s. Please choose another date.` : "";
        timeSelect.disabled = isClosed;
        submitBtn.disabled = isClosed;
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

    if (!name || !email || !phone || !date || !time || !guests) {
        alert("Please fill in all fields.");
        return;
    }

    try {
        let response = await fetch(`${API_BASE_URL}/create-booking`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone, date, time, guests, status: "Pending" })
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
