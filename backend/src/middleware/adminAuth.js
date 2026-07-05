function adminAuth(req, res, next) {
    const key = req.header("x-admin-key");
    if (!key || key !== process.env.ADMIN_API_KEY) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
}

module.exports = adminAuth;
