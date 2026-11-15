const path = require("path");
const express = require("express");
const cors = require("cors");

const bookingsRouter = require("./routes/bookings");
const adminRouter = require("./routes/admin");
const vouchersRouter = require("./routes/vouchers");
const adminReviewRouter = require("./routes/adminReview");

const { rateLimit } = require("./middleware/rateLimit");

const app = express();

// Nginx on the same machine proxies requests and sets X-Forwarded-For, so
// trust it (and only it) to get the real visitor IP for rate limiting.
app.set("trust proxy", "loopback");

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ success: true, status: "ok" }));

// --- Rate limits (per visitor IP) ---
// Stops bots flooding the booking form, guessing booking codes, or
// brute-forcing the admin key. Limits are well above normal use.
app.post(
    "/create-booking",
    rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 8,
        message: "Too many booking attempts. Please try again later or call us to book.",
    })
);
app.use(
    "/booking",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 30,
        message: "Too many requests. Please wait a few minutes and try again.",
    })
);
app.use(
    ["/availability", "/booking-settings", "/track-pageview", "/unsubscribe"],
    rateLimit({ windowMs: 60 * 1000, max: 120, message: "Too many requests. Please slow down." })
);
app.use(
    ["/api/admin", "/admin-review"],
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
        onlyFailures: true,
        message: "Too many failed sign-in attempts. Please wait 15 minutes and try again.",
    })
);

app.use(bookingsRouter);
app.use(adminReviewRouter);
app.use("/api/admin/vouchers", vouchersRouter);
app.use("/api/admin", adminRouter);

// Serve the static frontend only for local development — in production the
// frontend is hosted separately (S3/CloudFront), and this API server should
// only ever answer API requests, never accidentally serve the site itself.
if (process.env.NODE_ENV !== "production") {
    app.use(express.static(path.join(__dirname, "..", "..")));
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error." });
});

module.exports = app;
