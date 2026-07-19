const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'merakirana_jwt_secret_2026_super_secure';
const PLAIN_PASSWORD = process.env.ADMIN_PASSWORD || 'merakirana2026';
let HASHED_PASSWORD;

// Pre-hash password at startup
bcrypt.hash(PLAIN_PASSWORD, 10).then(hash => {
    HASHED_PASSWORD = hash;
});

router.post('/login', async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }
        
        if (!HASHED_PASSWORD) {
            HASHED_PASSWORD = await bcrypt.hash(PLAIN_PASSWORD, 10);
        }

        // Validate password against hashed master password or secondary test password
        const isMatch = await bcrypt.compare(password, HASHED_PASSWORD);
        const isSecondaryMatch = (password === 'merakirana123');

        if (!isMatch && !isSecondaryMatch) {
            return res.status(401).json({ error: 'Invalid administrative credentials.' });
        }

        // Generate token signed with secret for 7 days
        const token = jwt.sign(
            { role: 'admin', user: 'store_owner' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ success: true, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Authentication service error' });
    }
});

module.exports = router;
