function formatDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
}

function formatTime(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:${String(m).padStart(2, "0")} ${ampm}`;
}

// Today's date as the restaurant (Europe/London) sees it. The server itself
// runs in UTC, so a plain `new Date().toISOString()` can be a day off from
// what a UK guest/admin considers "today" for part of the day.
function todayInLondon() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

module.exports = { formatDate, formatTime, todayInLondon };
