const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/crm/customers - Fetch customer directory and buying patterns
router.get('/customers', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.customer_id,
                c.phone,
                c.name,
                c.created_at,
                c.last_active,
                COALESCE(count(o.order_id), 0) as order_count,
                COALESCE(sum(o.total_amount), 0.00) as ltv,
                CASE 
                    WHEN count(o.order_id) > 0 THEN COALESCE(sum(o.total_amount) / count(o.order_id), 0.00)
                    ELSE 0.00
                END as aov,
                (SELECT address_text FROM addresses WHERE customer_id = c.customer_id ORDER BY is_default DESC, created_at DESC LIMIT 1) as address,
                (SELECT pincode FROM addresses WHERE customer_id = c.customer_id ORDER BY is_default DESC, created_at DESC LIMIT 1) as pincode
            FROM customers c
            LEFT JOIN orders o ON c.customer_id = o.customer_id AND o.status != 'CANCELLED'
            GROUP BY c.customer_id
            ORDER BY ltv DESC
        `;
        const result = await pool.query(query);
        
        // Dynamically compute frequency tags
        const customersWithTags = result.rows.map(row => {
            let tag = 'New Lead';
            if (parseInt(row.order_count) > 0) {
                const daysSinceActive = row.last_active 
                    ? (new Date() - new Date(row.last_active)) / (1000 * 60 * 60 * 24)
                    : 999;
                
                if (daysSinceActive <= 7 && parseInt(row.order_count) >= 4) {
                    tag = 'Daily Buyer';
                } else if (daysSinceActive <= 14 && parseInt(row.order_count) >= 2) {
                    tag = 'Regular';
                } else if (daysSinceActive > 30) {
                    tag = 'Inactive';
                } else if (daysSinceActive > 14) {
                    tag = 'Churning';
                } else {
                    tag = 'Regular';
                }
            }
            return { ...row, frequency_tag: tag };
        });

        res.json(customersWithTags);
    } catch (err) {
        console.error('CRM Customers Fetch Error:', err);
        res.status(500).json({ error: 'Failed to fetch customer directories' });
    }
});

// GET /api/crm/abandoned-carts - Fetch carts left inactive for over 2 hours
router.get('/abandoned-carts', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.cart_id,
                c.customer_id,
                cust.phone,
                cust.name,
                c.session_metadata,
                c.updated_at,
                (SELECT COALESCE(SUM(ci.quantity * pv.price), 0.00) 
                 FROM cart_items ci 
                 JOIN product_variants pv ON ci.variant_id = pv.variant_id 
                 WHERE ci.cart_id = c.cart_id) as cart_value
            FROM carts c
            JOIN customers cust ON c.customer_id = cust.customer_id
            WHERE c.updated_at < NOW() - INTERVAL '2 hours'
              AND c.updated_at > NOW() - INTERVAL '7 days'
              AND NOT EXISTS (
                  SELECT 1 FROM orders ord 
                  WHERE ord.customer_id = c.customer_id 
                    AND ord.created_at >= c.updated_at - INTERVAL '5 minutes'
              )
            ORDER BY c.updated_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('CRM Carts Fetch Error:', err);
        res.status(500).json({ error: 'Failed to fetch abandoned carts queue' });
    }
});

// POST /api/crm/abandoned-carts/:id/recover - Send recovery WhatsApp alert
router.post('/abandoned-carts/:id/recover', async (req, res) => {
    try {
        const { id } = req.params;
        const cartQuery = await pool.query(`
            SELECT c.cart_id, cust.phone, cust.name,
              (SELECT COALESCE(SUM(ci.quantity * pv.price), 0.00) 
               FROM cart_items ci 
               JOIN product_variants pv ON ci.variant_id = pv.variant_id 
               WHERE ci.cart_id = c.cart_id) as cart_value
            FROM carts c
            JOIN customers cust ON c.customer_id = cust.customer_id
            WHERE c.cart_id = $1 LIMIT 1
        `, [id]);
        
        if (cartQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Cart not found' });
        }
        
        const cart = cartQuery.rows[0];
        const whatsappService = require('../services/whatsapp');
        const message = `🛒 *Hey${cart.name ? ' ' + cart.name : ''}!* We noticed you left some delicious dairy items in your cart (Total: *₹${parseFloat(cart.cart_value).toFixed(0)}*). 

Don't miss out on fresh daily delivery! Click the link below to complete your order in just a few taps:
🔗 https://wa.me/shop?text=Cart`;
        
        try {
            await whatsappService.sendText(cart.phone, message);
        } catch (whatsappErr) {
            console.warn('⚠️ WhatsApp cart recovery notification failed to send:', whatsappErr.message);
        }
        
        // Log in conversation logs as campaign recovery event
        await pool.query(`
            INSERT INTO conversation_logs (customer_phone, message_type, content, session_stage)
            VALUES ($1, 'outgoing', $2, 'RECOVERY')
        `, [cart.phone, message]);
        
        res.json({ message: 'Recovery notification sent successfully' });
    } catch (err) {
        console.error('CRM Cart Recovery Error:', err);
        res.status(500).json({ error: 'Failed to dispatch recovery text' });
    }
});

// GET /api/crm/neighborhoods - Get pincode metrics
router.get('/neighborhoods', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.pincode,
                COUNT(DISTINCT o.order_id) as total_orders,
                COALESCE(SUM(o.total_amount), 0.00) as total_revenue
            FROM orders o
            JOIN customers c ON o.customer_id = c.customer_id
            JOIN addresses a ON c.customer_id = a.customer_id
            WHERE o.status != 'CANCELLED'
            GROUP BY a.pincode
            ORDER BY total_orders DESC
            LIMIT 10
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('CRM Neighborhoods Fetch Error:', err);
        res.status(500).json({ error: 'Failed to fetch neighborhood statistics' });
    }
});

module.exports = router;
