const express = require('express');
const router = express.Router();

// Placeholder route imports
const productsRoutes = require('./products');
const ordersRoutes = require('./orders');
const partnersRoutes = require('./partners');
// const customersRoutes = require('./customers');
const webhookRoutes = require('./webhook');

router.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date() });
});

router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/partners', partnersRoutes);
// router.use('/customers', customersRoutes);
router.use('/webhook', webhookRoutes);

module.exports = router;
