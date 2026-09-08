const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { pool } = require('../database/db');
const whatsappService = require('../services/whatsapp');

// POST /api/webhook/payments - Captures Razorpay capture callbacks
router.post('/', async (req, res) => {
    try {
        const signature = req.headers['x-razorpay-signature'];
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) {
            console.error('FATAL: RAZORPAY_WEBHOOK_SECRET env var is required.');
            return res.status(500).json({ error: 'Payment webhook not configured' });
        }
        if (!signature) {
            return res.status(400).json({ error: 'Missing signature' });
        }

        // HMAC over the RAW request body (exact bytes Razorpay signed).
        const shasum = crypto.createHmac('sha256', secret);
        shasum.update(req.rawBody && Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body)));
        const digest = shasum.digest('hex');

        const a = Buffer.from(digest, 'utf8');
        const b = Buffer.from(String(signature), 'utf8');
        const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
        if (!valid) {
            console.error('❌ Razorpay signature verification failed.');
            return res.status(400).json({ error: 'Signature mismatch' });
        }

        const event = req.body.event;
        if (event === 'payment.captured' || event === 'order.paid') {
            const entity = req.body.payload?.payment?.entity || req.body.payload?.order?.entity;
            const orderId = entity?.notes?.order_id || entity?.reference_id;
            const amount = entity?.amount ? (entity.amount / 100) : 0; // convert paise to INR
            const upiTxnId = entity?.acquirer_data?.rrn || entity?.id;
            if (!upiTxnId) {
                console.warn('⚠️ Webhook missing txn/payment id; rejecting to preserve idempotency.');
                return res.status(400).json({ error: 'Missing transaction id' });
            }

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

            // Validate amount with exact paise comparison (no float tolerance abuse)
            const expectedPaise = Math.round(orderTotal * 100);
            const paidPaise = entity?.amount;
            if (!Number.isInteger(paidPaise) || paidPaise !== expectedPaise) {
                console.error(`❌ Payment amount mismatch! Paid paise: ${paidPaise}, Expected: ${expectedPaise}`);
                await pool.query(
                    'INSERT INTO payment_logs (order_id, upi_transaction_id, amount, status, raw_response) VALUES ($1, $2, $3, $4, $5)',
                    [orderId, upiTxnId, amount, 'AMOUNT_MISMATCH', JSON.stringify(req.body).slice(0, 10000)]
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

            // 4. Log the transaction details (atomic idempotency: UNIQUE(upi_transaction_id) required; ON CONFLICT = dupe)
            await pool.query(
                'INSERT INTO payment_logs (order_id, upi_transaction_id, amount, status, raw_response) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (upi_transaction_id) DO NOTHING',
                [orderId, upiTxnId, amount, 'SUCCESS', JSON.stringify(req.body).slice(0, 10000)]
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
        } else if (event === 'payment.failed' || event === 'refund.processed' || event === 'refund.created') {
            const entity = req.body.payload?.payment?.entity || req.body.payload?.refund?.entity || {};
            const orderId = entity?.notes?.order_id || entity?.reference_id;
            console.warn(`⚠️ Payment failure/refund event ${event} for order ${orderId}; leaving status for manual review.`);
            if (orderId) {
                await pool.query(
                    'INSERT INTO payment_logs (order_id, upi_transaction_id, amount, status, raw_response) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (upi_transaction_id) DO NOTHING',
                    [orderId, String(entity?.id || `evt-${Date.now()}`), entity?.amount ? entity.amount / 100 : 0, String(event).toUpperCase().slice(0, 50), JSON.stringify(req.body).slice(0, 10000)]
                );
            }
        }

        res.sendStatus(200);
    } catch (err) {
        console.error('Payment webhook error:', err);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

module.exports = router;
