const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET;
const PLAIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET env var is required (no fallback allowed).');
}
if (!PLAIN_PASSWORD) {
    throw new Error('FATAL: ADMIN_PASSWORD env var is required (no fallback allowed).');
}
let HASHED_PASSWORD = bcrypt.hashSync(PLAIN_PASSWORD, 10);

// In-memory login rate limit: max 10 attempts per IP per 10 min, then 429 lockout.
// (Single-instance safe; for multi-replica add Redis later.)
const loginAttempts = new Map(); // ip -> { count, firstTs, lockedUntil }
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX = 10;

function loginRateLimit(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    let rec = loginAttempts.get(ip);
    if (!rec || now - rec.firstTs > LOGIN_WINDOW_MS) rec = { count: 0, firstTs: now, lockedUntil: 0 };
    if (rec.lockedUntil > now) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    req._rlRec = rec;
    req._rlIp = ip;
    next();
}

router.post('/login', loginRateLimit, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        
        if (!HASHED_PASSWORD) {
            return res.status(500).json({ error: 'Auth not initialized' });
        }

        // Validate password against hashed master password only (no backdoors)
        const isMatch = await bcrypt.compare(password, HASHED_PASSWORD);

        if (!isMatch) {
            const rec = req._rlRec;
            rec.count++;
            if (rec.count >= LOGIN_MAX) rec.lockedUntil = Date.now() + LOGIN_WINDOW_MS;
            loginAttempts.set(req._rlIp, rec);
            // Same latency-ish response; never reveal whether user exists.
            return res.status(401).json({ error: 'Invalid administrative credentials.' });
        }
        loginAttempts.delete(req._rlIp);

        // Generate token signed with secret for 12h with issuer + jti
        const token = jwt.sign(
            { role: 'admin', user: 'store_owner' },
            JWT_SECRET,
            { expiresIn: '12h', issuer: 'mera-kirana', jwtid: require('crypto').randomUUID() }
        );

        res.json({ success: true, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Authentication service error' });
    }
});

module.exports = router;
