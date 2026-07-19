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
            const upiTxnId = entity?.acquirer_data?.rrn || entity?.id;

            if (!orderId) {
                console.warn('⚠️ Webhook received but no order_id found in notes/reference_id.');
                return res.sendStatus(200);
            }

            console.log(`💳 Payment verification webhook triggered for Order: ${orderId}, Amount: ₹${amount}`);

            // 1. Idempotency Check: check if payment log already exists
            const existingLog = await pool.query('SELECT 1 FROM payment_logs WHERE upi_transaction_id = $1 LIMIT 1', [upiTxnId]);
            if (existingLog.rows.length > 0) {
                console.log(`⚠️ Duplicate payment webhook detected for txn: ${upiTxnId}. Skipping duplicate processing.`);
                return res.sendStatus(200);
            }

            // 2. Fetch order to verify total amount matches
            const orderCheck = await pool.query('SELECT total_amount, status, customer_id, readable_order_id FROM orders WHERE order_id = $1', [orderId]);
            if (orderCheck.rows.length === 0) {
                console.error(`❌ Order ${orderId} not found in database.`);
                return res.status(404).json({ error: 'Order not found' });
            }

            const dbOrder = orderCheck.rows[0];
            const orderTotal = parseFloat(dbOrder.total_amount);

            // Validate amount (allow minor rounding differences)
            if (Math.abs(orderTotal - amount) > 0.05) {
                console.error(`❌ Payment amount mismatch! Paid: ₹${amount}, Expected: ₹${orderTotal}`);
                await pool.query(
                    'INSERT INTO payment_logs (order_id, upi_transaction_id, amount, status, raw_response) VALUES ($1, $2, $3, $4, $5)',
                    [orderId, upiTxnId, amount, 'AMOUNT_MISMATCH', JSON.stringify(req.body)]
                );
                return res.status(400).json({ error: 'Amount mismatch' });
            }

            // 3. Update order status to CONFIRMED
            const updateRes = await pool.query(`
                UPDATE orders 
                SET status = 'CONFIRMED' 
                WHERE order_id = $1 AND status = 'PENDING_PAYMENT'
                RETURNING order_id, readable_order_id, customer_id
            `, [orderId]);

            // 4. Log the transaction details
            await pool.query(
                'INSERT INTO payment_logs (order_id, upi_transaction_id, amount, status, raw_response) VALUES ($1, $2, $3, $4, $5)',
                [orderId, upiTxnId, amount, 'SUCCESS', JSON.stringify(req.body)]
            );

            if (updateRes.rows.length > 0) {
                // Get customer phone number
                const custRes = await pool.query('SELECT phone FROM customers WHERE customer_id = $1', [dbOrder.customer_id]);
                if (custRes.rows.length > 0) {
                    const phone = custRes.rows[0].phone;
                    try {
                        await whatsappService.sendText(phone, `🎉 *Online Payment Confirmed!* We have received your payment of *₹${amount.toFixed(2)}* for *Order #${dbOrder.readable_order_id}*. Your order is now confirmed and scheduled for delivery!`);
                    } catch (whatsappErr) {
                        console.warn('⚠️ WhatsApp payment notification failed to send:', whatsappErr.message);
                    }
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
