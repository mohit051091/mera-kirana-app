const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/coupons - List all coupons and their stats
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM coupons ORDER BY start_date DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching coupons:', err);
        res.status(500).json({ error: 'Failed to fetch coupons' });
    }
});

// POST /api/coupons - Create a new coupon campaign
router.post('/', async (req, res) => {
    try {
        const {
            code,
            discount_type,
            discount_value,
            min_order_value,
            start_date,
            end_date,
            max_uses,
            is_active
        } = req.body;

        if (!code || !discount_type || !discount_value) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const insertRes = await pool.query(`
            INSERT INTO coupons (
                code, 
                discount_type, 
                discount_value, 
                min_order_value, 
                start_date, 
                end_date, 
                max_uses, 
                is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            code.toUpperCase().trim(),
            discount_type,
            discount_value,
            min_order_value || 0,
            start_date || new Date(),
            end_date || null,
            max_uses || null,
            is_active !== undefined ? is_active : true
        ]);

        res.status(201).json(insertRes.rows[0]);
    } catch (err) {
        console.error('Error creating coupon:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Coupon code already exists' });
        }
        res.status(500).json({ error: 'Failed to create coupon' });
    }
});

// PUT /api/coupons/:id - Toggle status or update coupon details
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        
        await pool.query('UPDATE coupons SET is_active = $1 WHERE coupon_id = $2', [is_active, id]);
        res.json({ message: 'Coupon status updated successfully' });
    } catch (err) {
        console.error('Error updating coupon:', err);
        res.status(500).json({ error: 'Failed to update coupon status' });
    }
});

// DELETE /api/coupons/:id - Hard delete a coupon campaign
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM coupons WHERE coupon_id = $1', [id]);
        res.json({ message: 'Coupon deleted successfully' });
    } catch (err) {
        console.error('Error deleting coupon:', err);
        res.status(500).json({ error: 'Failed to delete coupon' });
    }
});

module.exports = router;
