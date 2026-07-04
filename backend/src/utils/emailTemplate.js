// Shared HTML email shell matching the site's warm maroon/gold theme.
// Email clients strip external stylesheets, so styles are inlined throughout.

const BRAND = {
    maroon: "#7a1f30",
    maroonDark: "#56111f",
    gold: "#c9a227",
    goldLight: "#e6c866",
    cream: "#fdf8f0",
    creamAlt: "#f6ead9",
    text: "#2b1810",
};

const CONTACT = {
    address: "140-142 High Street, Carshalton SM5 3AE",
    phone: "020 8647 0286",
    phoneHref: "02086470286",
    email: "info@bluebengal-carshalton.co.uk",
};

function frontendUrl(path) {
    const base = process.env.CORS_ORIGIN || "http://localhost:3000";
    return `${base}${path}`;
}

// For links to pages the backend itself renders (like the one-click admin
// booking review page) — different from frontendUrl(), which points at the
// separately-hosted static site (S3/CloudFront), not this API server.
function apiUrl(path) {
    const base = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
    return `${base}${path}`;
}

function emailLayout({ heading, bodyHtml }) {
    return `<!DOCTYPE html>
<html>
<body style="margin:0; padding:0; background:${BRAND.creamAlt}; font-family: Georgia, 'Times New Roman', serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.creamAlt}; padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:12px; overflow:hidden; border-top:5px solid ${BRAND.gold};">
        <tr>
          <td style="background:${BRAND.maroon}; padding:28px; text-align:center;">
            <div style="color:#ffffff; font-size:24px; font-weight:bold; letter-spacing:0.5px;">Blue Bengal</div>
            <div style="color:${BRAND.goldLight}; font-size:12px; letter-spacing:3px; text-transform:uppercase; margin-top:6px;">Carshalton</div>
          </td>
        </tr>
        <tr>
          <td style="padding:34px 32px; color:${BRAND.text}; font-family: Georgia, 'Times New Roman', serif;">
            <h1 style="margin:0 0 18px; font-size:20px; color:${BRAND.maroonDark};">${heading}</h1>
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:${BRAND.maroonDark}; padding:24px 32px; text-align:center; color:rgba(255,255,255,0.85); font-size:13px; font-family: Arial, sans-serif;">
            <div style="margin-bottom:8px;">📍 ${CONTACT.address}</div>
            <div style="margin-bottom:8px;">📞 <a href="tel:${CONTACT.phoneHref}" style="color:${BRAND.goldLight}; text-decoration:none;">${CONTACT.phone}</a></div>
            <div>✉️ <a href="mailto:${CONTACT.email}" style="color:${BRAND.goldLight}; text-decoration:none;">${CONTACT.email}</a></div>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function detailsTable(rows) {
    return `<table cellpadding="0" cellspacing="0" style="width:100%; background:${BRAND.creamAlt}; border-radius:8px; margin:20px 0; font-family: Arial, sans-serif;">
        ${rows
            .map(
                ([label, value]) => `
        <tr>
            <td style="padding:10px 16px; color:#6b5a4e; font-size:13px; font-weight:bold;">${label}</td>
            <td style="padding:10px 16px; color:${BRAND.text}; font-size:14px; text-align:right;">${value}</td>
        </tr>`
            )
            .join("")}
    </table>`;
}

function button(label, href, variant = "primary") {
    const style = variant === "secondary"
        ? `background:transparent; color:${BRAND.maroon}; border:2px solid ${BRAND.gold};`
        : `background:${BRAND.gold}; color:${BRAND.maroonDark}; border:2px solid ${BRAND.gold};`;
    return `<div style="text-align:center; margin:10px 0;">
        <a href="${href}" style="${style} text-decoration:none; font-family: Arial, sans-serif; font-weight:bold; font-size:14px; padding:12px 28px; border-radius:999px; display:inline-block;">${label}</a>
    </div>`;
}

module.exports = { BRAND, CONTACT, frontendUrl, apiUrl, emailLayout, detailsTable, button };
