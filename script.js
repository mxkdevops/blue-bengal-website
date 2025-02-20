document.addEventListener("DOMContentLoaded", function () {
    // Populate time slots (5:30 PM - 9:00 PM, every 30 minutes)
    let timeSelect = document.getElementById("time");
    let startTime = 17.5; // 5:30 PM
    let endTime = 21.0; // 9:00 PM

    while (startTime <= endTime) {
        let hour = Math.floor(startTime);
        let minutes = startTime % 1 === 0 ? "00" : "30";
        let ampm = hour >= 12 ? "PM" : "AM";
        let displayHour = hour > 12 ? hour - 12 : hour;

        let option = document.createElement("option");
        option.value = `${hour}:${minutes}`;
        option.textContent = `${displayHour}:${minutes} ${ampm}`;
        timeSelect.appendChild(option);

        startTime += 0.5;
    }

    // Populate guests dropdown (1-20)
    let guestsSelect = document.getElementById("guests");
    for (let i = 1; i <= 20; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.textContent = i;
        guestsSelect.appendChild(option);
    }

    // Restrict past dates in date picker
    let today = new Date().toISOString().split("T")[0];
    document.getElementById("date").setAttribute("min", today);
});

// Handle Booking Form Submission
document.getElementById("bookingForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    let name = document.getElementById("name").value.trim();
    let email = document.getElementById("email").value.trim();
    let phone = document.getElementById("phone").value.trim();
    let date = document.getElementById("date").value;
    let time = document.getElementById("time").value;
    let guests = document.getElementById("guests").value;

    let response = await fetch("https://api.bluebengal-carshalton.co.uk/create-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, date, time, guests })
    });

    let result = await response.json();
    if (result.success) {
        // Store booking details in sessionStorage
        let bookingDetails = {
            bookingId: result.bookingId,
            name: name,
            email: email,
            phone: phone,
            date: date,
            time: time,
            guests: guests
        };
        sessionStorage.setItem("bookingDetails", JSON.stringify(bookingDetails));

        // Redirect to the thank you page
        window.location.href = "thank-you.html";
    } else {
        alert("Error: " + result.message);
    }
});
