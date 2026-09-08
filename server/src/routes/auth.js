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

router.post('/login', async (req, res) => {
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
            return res.status(401).json({ error: 'Invalid administrative credentials.' });
        }

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
