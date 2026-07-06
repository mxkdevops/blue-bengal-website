// Anonymous pageview ping for the admin Analytics tab - no cookies, no
// visitor identifier, just "this path was viewed". Fails silently so it
// can never break the page it's included on.
(function () {
    const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
        ? window.location.origin
        : window.location.hostname.startsWith("test.")
        ? "https://api-test.bluebengal-carshalton.co.uk"
        : "https://api.bluebengal-carshalton.co.uk";

    fetch(`${API_BASE_URL}/track-pageview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: window.location.pathname }),
    }).catch(() => {});
})();
