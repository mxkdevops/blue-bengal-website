const express = require("express");
const pool = require("../db/pool");
const adminAuth = require("../middleware/adminAuth");
const { sendEmail } = require("../utils/emailSender");
const { emailLayout, button, frontendUrl } = require("../utils/emailTemplate");
const { todayInLondon } = require("../utils/formatters");

const router = express.Router();
router.use(adminAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CODE_RE = /^[A-Z0-9-]{3,30}$/;

function voucherLabel(v) {
    const value = Number(v.discount_value);
    return v.discount_type === "percentage" ? `${value}% off` : `£${value} off`;
}

// GET /api/admin/vouchers
router.get("/", async (req, res, next) => {
    try {
        const result = await pool.query("SELECT * FROM vouchers ORDER BY created_at DESC");
        res.json({ success: true, vouchers: result.rows });
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/vouchers  { code, description, discountType, discountValue, maxRedemptions?, expiresAt? }
router.post("/", async (req, res, next) => {
    try {
        const { code, description, discountType, discountValue, maxRedemptions, expiresAt } = req.body;

        const normalizedCode = (code || "").toString().trim().toUpperCase();
        if (!CODE_RE.test(normalizedCode)) {
            return res.status(400).json({ success: false, message: "Code must be 3-30 letters, numbers or hyphens." });
        }
        if (!description || !description.toString().trim()) {
            return res.status(400).json({ success: false, message: "A description is required." });
        }
        if (!["percentage", "fixed"].includes(discountType)) {
            return res.status(400).json({ success: false, message: "Discount type must be percentage or fixed." });
        }
        if (typeof discountValue !== "number" || discountValue <= 0) {
            return res.status(400).json({ success: false, message: "Discount value must be a positive number." });
        }
        if (maxRedemptions !== undefined && maxRedemptions !== null && (!Number.isInteger(maxRedemptions) || maxRedemptions < 1)) {
            return res.status(400).json({ success: false, message: "Max redemptions must be a positive whole number, or left blank for unlimited." });
        }
        if (expiresAt && !DATE_RE.test(expiresAt)) {
            return res.status(400).json({ success: false, message: "Expiry date must be in YYYY-MM-DD format." });
        }

        const result = await pool.query(
            `INSERT INTO vouchers (code, description, discount_type, discount_value, max_redemptions, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [normalizedCode, description.toString().trim(), discountType, discountValue, maxRedemptions || null, expiresAt || null]
        );

        res.status(201).json({ success: true, voucher: result.rows[0] });
    } catch (err) {
        if (err.code === "23505") {
            return res.status(400).json({ success: false, message: "That code is already in use." });
        }
        next(err);
    }
});

// PATCH /api/admin/vouchers/:id  { active?, description?, maxRedemptions?, expiresAt? }
router.patch("/:id", async (req, res, next) => {
    try {
        const { active, description, maxRedemptions, expiresAt } = req.body;
        const updates = [];
        const params = [];

        if (typeof active === "boolean") {
            params.push(active);
            updates.push(`active = $${params.length}`);
        }
        if (typeof description === "string" && description.trim()) {
            params.push(description.trim());
            updates.push(`description = $${params.length}`);
        }
        if (maxRedemptions === null) {
            updates.push("max_redemptions = NULL");
        } else if (Number.isInteger(maxRedemptions) && maxRedemptions >= 1) {
            params.push(maxRedemptions);
            updates.push(`max_redemptions = $${params.length}`);
        }
        if (expiresAt === null) {
            updates.push("expires_at = NULL");
        } else if (typeof expiresAt === "string" && DATE_RE.test(expiresAt)) {
            params.push(expiresAt);
            updates.push(`expires_at = $${params.length}`);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields provided." });
        }

        params.push(req.params.id);
        const result = await pool.query(
            `UPDATE vouchers SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *`,
            params
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Voucher not found." });
        }
        res.json({ success: true, voucher: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/vouchers/:id
router.delete("/:id", async (req, res, next) => {
    try {
        const result = await pool.query("DELETE FROM vouchers WHERE id = $1 RETURNING id", [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Voucher not found." });
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/vouchers/:id/redeem - staff marks one use of the code at the till
router.post("/:id/redeem", async (req, res, next) => {
    try {
        const voucherResult = await pool.query("SELECT * FROM vouchers WHERE id = $1", [req.params.id]);
        if (voucherResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Voucher not found." });
        }
        const voucher = voucherResult.rows[0];

        if (!voucher.active) {
            return res.status(400).json({ success: false, message: "This voucher is inactive." });
        }
        if (voucher.expires_at && voucher.expires_at < todayInLondon()) {
            return res.status(400).json({ success: false, message: "This voucher has expired." });
        }
        if (voucher.max_redemptions !== null && voucher.times_redeemed >= voucher.max_redemptions) {
            return res.status(400).json({ success: false, message: "This voucher has already reached its redemption limit." });
        }

        const result = await pool.query(
            "UPDATE vouchers SET times_redeemed = times_redeemed + 1 WHERE id = $1 RETURNING *",
            [req.params.id]
        );
        res.json({ success: true, voucher: result.rows[0] });
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/vouchers/:id/send  { customerIds: [1, 2, 3] }
router.post("/:id/send", async (req, res, next) => {
    try {
        const { customerIds } = req.body;
        if (!Array.isArray(customerIds) || customerIds.length === 0) {
            return res.status(400).json({ success: false, message: "Select at least one customer to send to." });
        }

        const voucherResult = await pool.query("SELECT * FROM vouchers WHERE id = $1", [req.params.id]);
        if (voucherResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Voucher not found." });
        }
        const voucher = voucherResult.rows[0];

        // Only customers who've actually opted in to marketing emails — enforced
        // here too, not just in the admin UI, since this sends promotional content.
        const customersResult = await pool.query(
            "SELECT id, name, email FROM customers WHERE id = ANY($1::int[]) AND marketing_consent = true",
            [customerIds]
        );
        const skippedCount = customerIds.length - customersResult.rows.length;

        const subject = `A little something from Blue Bengal — ${voucherLabel(voucher)}`;
        let sentCount = 0;

        for (const customer of customersResult.rows) {
            const expiryNote = voucher.expires_at ? ` (valid until ${voucher.expires_at})` : "";
            const body = `Hi ${customer.name},\n\n${voucher.description}\n\n` +
                `Use code ${voucher.code} on your next visit${expiryNote}.\n\n` +
                `We hope to see you again soon!\n\n` +
                `Don't want emails like this? Unsubscribe: ${frontendUrl(`/unsubscribe.html?email=${encodeURIComponent(customer.email)}`)}`;
            const html = emailLayout({
                heading: "A little something for you 🎁",
                bodyHtml: `
                    <p style="margin:0 0 6px;">Hi ${customer.name},</p>
                    <p style="margin:0 0 16px; line-height:1.6;">${voucher.description}</p>
                    <div style="text-align:center; margin:20px 0; padding:16px; background:#f6ead9; border-radius:8px; border:2px dashed #c9a227;">
                        <div style="font-size:22px; font-weight:bold; letter-spacing:2px; color:#7a1f30;">${voucher.code}</div>
                        ${voucher.expires_at ? `<div style="font-size:12px; color:#6b5a4e; margin-top:6px;">Valid until ${voucher.expires_at}</div>` : ""}
                    </div>
                    ${button("Book a Table", frontendUrl("/booking.html"))}
                    <p style="margin:20px 0 0; font-size:13px; color:#6b5a4e; text-align:center;">We hope to see you again soon!</p>
                    <p style="margin:14px 0 0; font-size:11px; color:#a89b8f; text-align:center;">
                        <a href="${frontendUrl(`/unsubscribe.html?email=${encodeURIComponent(customer.email)}`)}" style="color:#a89b8f;">Unsubscribe from these emails</a>
                    </p>
                `,
            });

            const { status } = await sendEmail({ to: customer.email, subject, body, html });
            await pool.query(
                `INSERT INTO email_log (voucher_id, email_type, recipient, subject, body, status)
                 VALUES ($1, 'voucher', $2, $3, $4, $5)`,
                [voucher.id, customer.email, subject, body, status]
            );
            sentCount += 1;
        }

        res.json({ success: true, sentCount, skippedCount });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
