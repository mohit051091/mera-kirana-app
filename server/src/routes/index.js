const express = require('express');
const router = express.Router();
const db = require('../database/db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'merakirana_jwt_secret_2026_super_secure';

// Placeholder route imports
const authRoutes = require('./auth');
const crmRoutes = require('./crm');
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

// 1. Mount Public Webhooks (signatures/verify tokens handled internally) and Auth
router.use('/auth', authRoutes);
router.use('/webhook', webhookRoutes);
router.use('/webhook/payments', paymentsRoutes);

// 2. Administrative Authentication Middleware
const verifyAdminAuth = (req, res, next) => {
    // Treat test environment requests as bypassable or mockable
    if (process.env.NODE_ENV === 'test') {
        return next();
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing administrative authorization token.' });
    }
    
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired administrative session.' });
    }
};

router.use(verifyAdminAuth);

// 3. Mount Private Dashboard APIs (require auth headers)
router.use('/crm', crmRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/partners', partnersRoutes);
router.use('/settings', settingsRoutes);
router.use('/coupons', couponsRoutes);
router.use('/salespeople', salespeopleRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/campaigns', campaignsRoutes);

module.exports = router;
