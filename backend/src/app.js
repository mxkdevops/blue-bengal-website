const path = require("path");
const express = require("express");
const cors = require("cors");

const bookingsRouter = require("./routes/bookings");
const adminRouter = require("./routes/admin");
const vouchersRouter = require("./routes/vouchers");
const adminReviewRouter = require("./routes/adminReview");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ success: true, status: "ok" }));

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
