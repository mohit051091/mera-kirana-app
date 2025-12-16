const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/partners - List all partners
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM delivery_partners ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch partners' });
    }
});

// POST /api/partners - Register new partner
router.post('/', async (req, res) => {
    try {
        const { name, phone, pin } = req.body;

        const result = await pool.query(
            `INSERT INTO delivery_partners (name, phone, pin) 
       VALUES ($1, $2, $3) 
       RETURNING partner_id, name, is_active`,
            [name, phone, pin]
        );

        res.status(201).json({ message: 'Partner registered', partner: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(400).json({ error: 'Phone number already registered' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to register partner' });
    }
});

// PUT /api/partners/:id/status - Update availability
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { current_status } = req.body; // AVAILABLE, BUSY, OFFLINE

        await pool.query(
            'UPDATE delivery_partners SET current_status = $1 WHERE partner_id = $2',
            [current_status, id]
        );

        // Log availability change (Basic)
        await pool.query(
            `INSERT INTO partner_availability_logs (partner_id, status_change, changed_by)
       VALUES ($1, $2, 'System')`,
            [id, current_status]
        );

        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

module.exports = router;
