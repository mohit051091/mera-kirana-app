const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/subscriptions - Retrieve all active subscriptions
router.get('/', async (req, res) => {
    try {
        const { status } = req.query; // Optional filter: ACTIVE, PAUSED, CANCELLED
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
            query += ` WHERE s.status = $1`;
            params.push(status.toUpperCase());
        }
        query += ` ORDER BY s.created_at DESC`;
        
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
        const { status, frequency, quantity, next_delivery_date } = req.body;

        const updates = [];
        const params = [id];
        let paramIndex = 2;

        if (status !== undefined) {
            updates.push(`status = $${paramIndex++}`);
            params.push(status.toUpperCase());
        }
        if (frequency !== undefined) {
            updates.push(`frequency = $${paramIndex++}`);
            params.push(frequency.toUpperCase());
        }
        if (quantity !== undefined) {
            updates.push(`quantity = $${paramIndex++}`);
            params.push(Number(quantity));
        }
        if (next_delivery_date !== undefined) {
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

// DELETE /api/subscriptions/:id - Cancel/Delete a subscription
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM subscriptions WHERE subscription_id = $1 RETURNING *', [id]);
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
