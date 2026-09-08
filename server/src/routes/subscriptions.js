const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/subscriptions - Retrieve subscriptions (mounted behind verifyAdminAuth in index.js)
router.get('/', async (req, res) => {
    try {
        const { status } = req.query; // Optional filter: ACTIVE, PAUSED, CANCELLED
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        let query = `
            SELECT 
                s.subscription_id,
                s.customer_id,
                s.variant_id,
                s.quantity,
                s.frequency,
                s.status,
                s.next_delivery_date,
                s.created_at,
                c.phone as customer_phone,
                c.name as customer_name,
                pv.weight_label as weight_label,
                pv.price as price,
                p.base_name as product_name
            FROM subscriptions s
            JOIN customers c ON s.customer_id = c.customer_id
            JOIN product_variants pv ON s.variant_id = pv.variant_id
            JOIN products p ON pv.product_id = p.product_id
        `;
        const params = [];
        if (status) {
            const s = String(status).toUpperCase();
            if (!['ACTIVE', 'PAUSED', 'CANCELLED'].includes(s)) {
                return res.status(400).json({ error: 'Invalid status filter' });
            }
            query += ` WHERE s.status = $1`;
            params.push(s);
        }
        query += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching subscriptions:', err);
        res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
});

// PUT /api/subscriptions/:id/status - Update subscription status or details
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-fA-F-]{36}$/.test(String(id))) {
            return res.status(400).json({ error: 'Invalid subscription id' });
        }
        const { status, frequency, quantity, next_delivery_date } = req.body;

        const VALID_STATUS = ['ACTIVE', 'PAUSED', 'CANCELLED'];
        const VALID_FREQ = ['DAILY', 'WEEKLY', 'MONTHLY', 'ALTERNATE'];
        const updates = [];
        const params = [id];
        let paramIndex = 2;

        if (status !== undefined) {
            const s = String(status).toUpperCase();
            if (!VALID_STATUS.includes(s)) return res.status(400).json({ error: 'Invalid status' });
            updates.push(`status = $${paramIndex++}`);
            params.push(s);
        }
        if (frequency !== undefined) {
            const f = String(frequency).toUpperCase();
            if (!VALID_FREQ.includes(f)) return res.status(400).json({ error: 'Invalid frequency' });
            updates.push(`frequency = $${paramIndex++}`);
            params.push(f);
        }
        if (quantity !== undefined) {
            const q = Number(quantity);
            if (!Number.isInteger(q) || q < 1 || q > 50) return res.status(400).json({ error: 'Quantity must be 1-50' });
            updates.push(`quantity = $${paramIndex++}`);
            params.push(q);
        }
        if (next_delivery_date !== undefined) {
            const d = new Date(next_delivery_date);
            if (Number.isNaN(d.getTime()) || d < new Date(new Date().toDateString())) {
                return res.status(400).json({ error: 'next_delivery_date must be a valid today-or-future date' });
            }
            updates.push(`next_delivery_date = $${paramIndex++}`);
            params.push(next_delivery_date);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const query = `
            UPDATE subscriptions 
            SET ${updates.join(', ')} 
            WHERE subscription_id = $1 
            RETURNING *
        `;

        const result = await pool.query(query, params);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found' });
        }

        res.json({ message: 'Subscription updated successfully', subscription: result.rows[0] });
    } catch (err) {
        console.error('Error updating subscription status:', err);
        res.status(500).json({ error: 'Failed to update subscription' });
    }
});

// DELETE /api/subscriptions/:id - Soft-cancel a subscription (history preserved)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!/^[0-9a-fA-F-]{36}$/.test(String(id))) {
            return res.status(400).json({ error: 'Invalid subscription id' });
        }
        const result = await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE subscription_id = $1 RETURNING *", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subscription not found' });
        }
        res.json({ message: 'Subscription deleted successfully' });
    } catch (err) {
        console.error('Error deleting subscription:', err);
        res.status(500).json({ error: 'Failed to delete subscription' });
    }
});

module.exports = router;
