// Thin email-sending wrapper. With no provider configured, it just logs and
// records a "stub" entry — this lets the reminder/feedback scheduler be built
// and verified end-to-end before real credentials exist. Once RESEND_API_KEY
// is set in .env, it sends for real via Resend and records "sent" instead.
async function sendEmail({ to, subject, body, html }) {
    if (!process.env.RESEND_API_KEY) {
        console.log(`[email:stub] to=${to} subject="${subject}"`);
        return { status: "stub" };
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: process.env.EMAIL_FROM || "Blue Bengal <onboarding@resend.dev>",
            to,
            subject,
            text: body,
            ...(html ? { html } : {}),
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[email:failed] to=${to} subject="${subject}" — ${errorText}`);
        return { status: "failed" };
    }

    return { status: "sent" };
}

module.exports = { sendEmail };
