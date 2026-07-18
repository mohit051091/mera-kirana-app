const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/salespeople - List all salesperson details and aggregate commissions
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT 
                s.*,
                COALESCE(count(o.order_id), 0) as total_referrals,
                COALESCE(sum(sc.commission_amount), 0.00) as total_commissions
            FROM salespeople s
            LEFT JOIN sales_commissions sc ON s.salesperson_id = sc.salesperson_id
            LEFT JOIN orders o ON sc.order_id = o.order_id AND o.status != 'CANCELLED'
            GROUP BY s.salesperson_id
            ORDER BY s.created_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching salespeople:', err);
        res.status(500).json({ error: 'Failed to fetch salespeople' });
    }
});

// POST /api/salespeople - Register a new salesperson agent
router.post('/', async (req, res) => {
    try {
        const { name, phone, incentive_type, incentive_value } = req.body;
        
        if (!name || !phone || !incentive_type || incentive_value === undefined) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Auto-generate unique referral code format: Name(3) + Phone(last 3) + creationDate(DDMMYY)
        const namePart = name.replace(/\s+/g, '').substring(0, 3).toUpperCase();
        const phonePart = phone.replace(/\D/g, '');
        const phoneLast3 = phonePart.substring(phonePart.length - 3);
        
        const now = new Date();
        const dateStr = String(now.getDate()).padStart(2, '0') +
                        String(now.getMonth() + 1).padStart(2, '0') +
                        String(now.getFullYear()).substring(2);
        
        const referralCode = `${namePart}${phoneLast3}${dateStr}`;

        const insertRes = await pool.query(`
            INSERT INTO salespeople (
                name, 
                phone, 
                referral_code, 
                incentive_type, 
                incentive_value
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [name.trim(), phone.trim(), referralCode, incentive_type, incentive_value]);

        res.status(201).json(insertRes.rows[0]);
    } catch (err) {
        console.error('Error creating salesperson:', err);
        if (err.code === '23505') {
            return res.status(400).json({ error: 'Salesperson phone or code already registered' });
        }
        res.status(500).json({ error: 'Failed to register salesperson' });
    }
});

// GET /api/salespeople/:id/commissions - Fetch detailed commissions logs for an agent
router.get('/:id/commissions', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                sc.commission_id,
                sc.commission_amount,
                sc.created_at,
                o.readable_order_id,
                o.total_amount,
                o.status as order_status,
                cust.name as customer_name
            FROM sales_commissions sc
            JOIN orders o ON sc.order_id = o.order_id
            JOIN customers cust ON o.customer_id = cust.customer_id
            WHERE sc.salesperson_id = $1
            ORDER BY sc.created_at DESC
        `, [id]);
        
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching commission details:', err);
        res.status(500).json({ error: 'Failed to fetch commissions details' });
    }
});

// PUT /api/salespeople/:id - Toggle status (Active / Inactive)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        
        await pool.query('UPDATE salespeople SET is_active = $1 WHERE salesperson_id = $2', [is_active, id]);
        res.json({ message: 'Salesperson status updated successfully' });
    } catch (err) {
        console.error('Error updating salesperson:', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

module.exports = router;
