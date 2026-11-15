// Minimal in-memory, per-IP fixed-window rate limiter. One Node process
// serves the API, so in-memory counters are enough — no Redis needed.
// Counters reset on restart, which is fine for spam/brute-force protection.

function rateLimit({ windowMs, max, message, onlyFailures = false }) {
    const hits = new Map(); // ip -> { count, resetAt }

    // Periodically drop expired entries so the map can't grow unbounded.
    setInterval(() => {
        const now = Date.now();
        for (const [ip, entry] of hits) {
            if (entry.resetAt <= now) hits.delete(ip);
        }
    }, windowMs).unref();

    function count(ip) {
        const now = Date.now();
        let entry = hits.get(ip);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(ip, entry);
        }
        entry.count += 1;
        return entry;
    }

    return function rateLimitMiddleware(req, res, next) {
        const ip = req.ip;
        const entry = hits.get(ip);
        if (entry && entry.resetAt > Date.now() && entry.count >= max) {
            res.set("Retry-After", String(Math.ceil((entry.resetAt - Date.now()) / 1000)));
            return res.status(429).json({ success: false, message });
        }

        if (onlyFailures) {
            // Only count requests that end in an auth failure (e.g. wrong admin key),
            // so normal admin use is never throttled.
            res.on("finish", () => {
                if (res.statusCode === 401 || res.statusCode === 403) count(ip);
            });
        } else {
            count(ip);
        }
        next();
    };
}

module.exports = { rateLimit };
