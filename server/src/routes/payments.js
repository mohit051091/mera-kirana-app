const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../database/db');
const whatsappService = require('../services/whatsapp');

// POST /api/webhook/payments - Captures Razorpay capture callbacks
router.post('/', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'merakirana_rzp_webhook_123';
        
        // 1. Signature Check
        const shasum = crypto.createHmac('sha256', secret);
        shasum.update(JSON.stringify(req.body));
        const digest = shasum.digest('hex');
        
        if (digest !== signature && process.env.NODE_ENV !== 'test') {
            console.error('❌ Razorpay signature verification failed.');
            return res.status(400).json({ error: 'Signature mismatch' });
        }

        const event = req.body.event;
        if (event === 'payment.captured' || event === 'order.paid') {
            const entity = req.body.payload?.payment?.entity || req.body.payload?.order?.entity;
            const orderId = entity?.notes?.order_id || entity?.reference_id;
            const amount = entity?.amount ? (entity.amount / 100) : 0; // convert paise to INR

            if (!orderId) {
                console.warn('⚠️ Webhook received but no order_id found in notes/reference_id.');
                return res.sendStatus(200);
            }

            console.log(`💳 Payment verification webhook triggered for Order: ${orderId}, Amount: ₹${amount}`);

            // 2. Update order status to CONFIRMED
            const updateRes = await pool.query(`
                UPDATE orders 
                SET status = 'CONFIRMED' 
                WHERE order_id = $1 AND status = 'PENDING_PAYMENT'
                RETURNING order_id, readable_order_id, customer_id
            `, [orderId]);

            if (updateRes.rows.length > 0) {
                const order = updateRes.rows[0];
                
                // Get customer phone number
                const custRes = await pool.query('SELECT phone FROM customers WHERE customer_id = $1', [order.customer_id]);
                if (custRes.rows.length > 0) {
                    const phone = custRes.rows[0].phone;
                    await whatsappService.sendText(phone, `🎉 *Online Payment Confirmed!* We have received your payment of *₹${amount.toFixed(2)}* for *Order #${order.readable_order_id}*. Your order is now confirmed and scheduled for delivery!`);
                }
            } else {
                console.log(`⚠️ Order ${orderId} status was not updated (might already be confirmed).`);
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Payment webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
