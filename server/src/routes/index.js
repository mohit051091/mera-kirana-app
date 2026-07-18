const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Placeholder route imports
const productsRoutes = require('./products');
const ordersRoutes = require('./orders');
const partnersRoutes = require('./partners');
const settingsRoutes = require('./settings');
const couponsRoutes = require('./coupons');
const salespeopleRoutes = require('./salespeople');
const webhookRoutes = require('./webhook');
const analyticsRoutes = require('./analytics');
const paymentsRoutes = require('./payments');
const campaignsRoutes = require('./campaigns');

router.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'OK', database: 'CONNECTED', timestamp: new Date() });
    } catch (err) {
        res.status(500).json({ status: 'ERROR', error: err.message });
    }
});

router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/partners', partnersRoutes);
router.use('/settings', settingsRoutes);
router.use('/coupons', couponsRoutes);
router.use('/salespeople', salespeopleRoutes);
router.use('/webhook', webhookRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/webhook/payments', paymentsRoutes);
router.use('/campaigns', campaignsRoutes);

module.exports = router;
