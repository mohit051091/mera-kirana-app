const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/analytics/summary - Get drop-offs, top products, and core conversions
router.get('/summary', async (req, res) => {
    try {
        // 1. Funnel stats (drop-offs)
        const dropoffsQuery = await pool.query(`
            SELECT stage, reason, COUNT(*) as count 
            FROM dropoffs 
            GROUP BY stage, reason
            ORDER BY count DESC
        `);

        // 2. Top products sold
        const topProductsQuery = await pool.query(`
            SELECT p.base_name, v.weight_label, SUM(oi.quantity) as total_units, SUM(oi.total_price) as total_revenue
            FROM order_items oi
            JOIN product_variants v ON oi.variant_id = v.variant_id
            JOIN products p ON v.product_id = p.product_id
            GROUP BY p.product_id, p.base_name, v.variant_id, v.weight_label
            ORDER BY total_units DESC
            LIMIT 5
        `);

        // 3. Overall conversion metrics
        const ordersCountQuery = await pool.query("SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue FROM orders");
        const totalLogsQuery = await pool.query("SELECT COUNT(DISTINCT conversation_id) as count FROM conversation_logs");

        res.json({
            dropoffs: dropoffsQuery.rows,
            topProducts: topProductsQuery.rows,
            metrics: {
                totalOrders: parseInt(ordersCountQuery.rows[0].count),
                totalRevenue: parseFloat(ordersCountQuery.rows[0].revenue),
                totalSessions: parseInt(totalLogsQuery.rows[0].count)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
});

// GET /api/analytics/chats - List all unique conversation session summaries
router.get('/chats', async (req, res) => {
    try {
        const chatsQuery = await pool.query(`
            SELECT DISTINCT ON (conversation_id) 
                conversation_id, 
                customer_phone, 
                session_stage, 
                created_at, 
                content as last_message
            FROM conversation_logs
            WHERE conversation_id IS NOT NULL
            ORDER BY conversation_id, created_at DESC
        `);
        
        // Sort by created_at descending
        const sortedChats = chatsQuery.rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json(sortedChats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch chat logs list' });
    }
});

// GET /api/analytics/chats/:convId - Get chronologically ordered chat messages in a thread
router.get('/chats/:convId', async (req, res) => {
    try {
        const { convId } = req.params;
        const messagesQuery = await pool.query(`
            SELECT log_id, message_type, content, session_stage, created_at, metadata
            FROM conversation_logs
            WHERE conversation_id = $1
            ORDER BY created_at ASC
        `, [convId]);
        res.json(messagesQuery.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch chat thread messages' });
    }
});

// GET /api/analytics/kpis - Get real-time dashboard counts
router.get('/kpis', async (req, res) => {
    try {
        const todayOrdersQuery = await pool.query(`
            SELECT COUNT(*) as count 
            FROM orders 
            WHERE created_at >= CURRENT_DATE
        `);
        
        const pendingDeliveryQuery = await pool.query(`
            SELECT COUNT(*) as count 
            FROM orders 
            WHERE status IN ('CONFIRMED', 'PREPARING', 'DELIVERING', 'OUT_FOR_DELIVERY')
        `);
        
        const todayRevenueQuery = await pool.query(`
            SELECT COALESCE(SUM(total_amount), 0) as revenue 
            FROM orders 
            WHERE created_at >= CURRENT_DATE AND status != 'CANCELLED'
        `);
        
        const activePartnersQuery = await pool.query(`
            SELECT COUNT(*) as count 
            FROM delivery_partners 
            WHERE current_status = 'AVAILABLE'
        `);
        
        res.json({
            todayOrders: parseInt(todayOrdersQuery.rows[0].count),
            pendingDelivery: parseInt(pendingDeliveryQuery.rows[0].count),
            todayRevenue: parseFloat(todayRevenueQuery.rows[0].revenue),
            activePartners: parseInt(activePartnersQuery.rows[0].count)
        });
    } catch (err) {
        console.error('KPIs Fetch Error:', err);
        res.status(500).json({ error: 'Failed to fetch dashboard KPIs' });
    }
});

module.exports = router;
