const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/settings - Fetch all key-value configs
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT key, value FROM system_settings');
        const settings = {};
        result.rows.forEach(row => {
            settings[row.key] = row.value;
        });
        res.json(settings);
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

// POST /api/settings - Update one or multiple config values
router.post('/', async (req, res) => {
    try {
        const updates = req.body; // e.g. { "vacation_mode": { "is_closed": true }, "minimum_order_value": 150 }
        for (const [key, value] of Object.entries(updates)) {
            await pool.query(`
                INSERT INTO system_settings (key, value, updated_at) 
                VALUES ($1, $2, NOW()) 
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            `, [key, JSON.stringify(value)]);
        }
        res.json({ message: 'Settings updated successfully' });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// GET /api/settings/pincodes/allowed - Fetch all serviceable pincodes (allowed pill list)
router.get('/pincodes/allowed', async (req, res) => {
    try {
        const result = await pool.query('SELECT pincode, office_name, taluk, district_name, state_name FROM pincode_master WHERE is_allowed = true ORDER BY pincode ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching allowed pincodes:', err);
        res.status(500).json({ error: 'Failed to fetch allowed pincodes' });
    }
});

// POST /api/settings/pincodes/toggle - Toggle serviceability status for a single pincode
router.post('/pincodes/toggle', async (req, res) => {
    try {
        const { pincode, is_allowed } = req.body;
        await pool.query('UPDATE pincode_master SET is_allowed = $1 WHERE pincode = $2', [is_allowed, pincode]);
        res.json({ message: `Pincode ${pincode} serviceability set to ${is_allowed}` });
    } catch (err) {
        console.error('Error toggling pincode:', err);
        res.status(500).json({ error: 'Failed to toggle pincode serviceability' });
    }
});

// GET /api/settings/pincodes/search - Smart search pincode master (district, taluk, or pincode)
router.get('/pincodes/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json([]);

        // Look up by pincode prefix or district/taluk name match
        const searchRes = await pool.query(`
            SELECT pincode, office_name, taluk, district_name, state_name, is_allowed 
            FROM pincode_master 
            WHERE pincode LIKE $1 
               OR district_name ILIKE $2 
               OR taluk ILIKE $2 
               OR office_name ILIKE $2
            LIMIT 50
        `, [`${query}%`, `%${query}%`]);
        
        res.json(searchRes.rows);
    } catch (err) {
        console.error('Error searching pincodes:', err);
        res.status(500).json({ error: 'Failed to search pincodes' });
    }
});

// POST /api/settings/pincodes/bulk-upload - Allow bulk CSV upload (array of pincode strings)
router.post('/pincodes/bulk-upload', async (req, res) => {
    try {
        const { pincodes } = req.body; // Array of strings e.g. ["400078", "400080"]
        if (!Array.isArray(pincodes) || pincodes.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty pincodes list' });
        }

        // Clean up inputs and update in batch
        await pool.query('UPDATE pincode_master SET is_allowed = true WHERE pincode = ANY($1)', [pincodes]);
        res.json({ message: `Successfully marked ${pincodes.length} pincodes as serviceable.` });
    } catch (err) {
        console.error('Error bulk uploading pincodes:', err);
        res.status(500).json({ error: 'Failed to bulk allow pincodes' });
    }
});

module.exports = router;
