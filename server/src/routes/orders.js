const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// POST /api/orders - Create a new order
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {
      customer_id,
      items, // Array of { variant_id, quantity, unit_price }
      total_amount,
      payment_method,
      delivery_slot,
      address_snapshot
    } = req.body;

    // 1. Create Order
    const orderQuery = `
      INSERT INTO orders (
        customer_id, 
        total_amount, 
        payment_method, 
        delivery_slot, 
        delivery_address_snapshot
      ) VALUES ($1, $2, $3, $4, $5) 
      RETURNING order_id, readable_order_id, status
    `;
    const orderRes = await client.query(orderQuery, [
      customer_id, total_amount, payment_method, delivery_slot, address_snapshot
    ]);
    const { order_id, readable_order_id, status } = orderRes.rows[0];

    // 2. Add Items
    if (items && items.length > 0) {
      for (const item of items) {
        const itemTotal = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [order_id, item.variant_id, item.quantity, item.unit_price, itemTotal]
        );
      }
    }

    // 3. Log Initial Status
    await client.query(
      `INSERT INTO order_status_logs (order_id, old_status, new_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [order_id, null, status, 'System']
    );

    await client.query('COMMIT');
    res.status(201).json({
      message: 'Order created successfully',
      orderId: order_id,
      readableId: readable_order_id
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create Order Error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  } finally {
    client.release();
  }
});

// GET /api/orders - List all orders (Recent first, supports date filter)
router.get('/', async (req, res) => {
  try {
    // Auto-expire PENDING_PAYMENT orders older than 30 minutes
    await pool.query(`
      UPDATE orders 
      SET status = 'CANCELLED', updated_at = NOW() 
      WHERE status = 'PENDING_PAYMENT' AND created_at < NOW() - INTERVAL '30 minutes'
    `);

    const { startDate, endDate } = req.query;
    let query = 'SELECT * FROM orders';
    const params = [];
    
    if (startDate && endDate) {
      query += ' WHERE created_at >= $1 AND created_at <= $2';
      params.push(startDate, endDate);
    } else if (startDate) {
      query += ' WHERE created_at >= $1';
      params.push(startDate);
    } else if (endDate) {
      query += ' WHERE created_at <= $1';
      params.push(endDate);
    }
    
    query += ' ORDER BY created_at DESC LIMIT 100';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id - Get Order Details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch Order Info
    const orderRes = await pool.query('SELECT * FROM orders WHERE order_id = $1', [id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];

    // Fetch Items
    const itemsRes = await pool.query(`
      SELECT oi.*, pv.weight_label, p.base_name 
      FROM order_items oi
      JOIN product_variants pv ON oi.variant_id = pv.variant_id
      JOIN products p ON pv.product_id = p.product_id
      WHERE oi.order_id = $1
    `, [id]);

    order.items = itemsRes.rows;
    res.json(order);

  } catch (err) {
    console.error('Get Order Error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// PUT /api/orders/:id/status - Update Status
router.put('/:id/status', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { status, changed_by } = req.body;

    // Get old status
    const oldOrderRes = await client.query('SELECT status, customer_id, readable_order_id FROM orders WHERE order_id = $1', [id]);
    if (oldOrderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const oldStatus = oldOrderRes.rows[0].status;

    // Update Status
    await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE order_id = $2', [status, id]);

    // Log Change
    await client.query(
      `INSERT INTO order_status_logs (order_id, old_status, new_status, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [id, oldStatus, status, changed_by || 'Admin']
    );

    // If status updated to OUT_FOR_DELIVERY, generate and notify Delivery OTP
    if (status === 'OUT_FOR_DELIVERY') {
        const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
        
        // Fetch customer phone
        const custRes = await client.query('SELECT phone FROM customers WHERE customer_id = $1', [oldOrderRes.rows[0].customer_id]);
        if (custRes.rows.length > 0) {
            const phone = custRes.rows[0].phone;
            
            // Insert OTP to DB
            await client.query(
                `INSERT INTO otps (phone, otp_code, context, order_id, expires_at) 
                 VALUES ($1, $2, 'DELIVERY_VERIFICATION', $3, NOW() + INTERVAL '24 hours')`,
                [phone, otpCode, id]
            );
            
            const whatsappService = require('../services/whatsapp');
            await whatsappService.sendText(phone, `🚚 *Your order #${oldOrderRes.rows[0].readable_order_id} is Out for Delivery!* Please share this Delivery Verification OTP with the rider when they arrive: *${otpCode}*`);
        }
    }

    await client.query('COMMIT');
    res.json({ message: 'Status updated', newStatus: status });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update Status Error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/verify-delivery - Verify OTP and complete delivery
router.post('/:id/verify-delivery', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { otp_code } = req.body;

    // Find active OTP
    const otpRes = await client.query(
      `SELECT * FROM otps 
       WHERE order_id = $1 AND otp_code = $2 AND context = 'DELIVERY_VERIFICATION' 
         AND expires_at > NOW() AND is_used = false 
       LIMIT 1`,
      [id, otp_code]
    );

    if (otpRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired OTP code' });
    }

    // Update OTP status
    await client.query('UPDATE otps SET is_used = true WHERE otp_id = $1', [otpRes.rows[0].otp_id]);

    // Update Order status
    await client.query("UPDATE orders SET status = 'DELIVERED', updated_at = NOW() WHERE order_id = $1", [id]);

    // Log Change
    await client.query(
      `INSERT INTO order_status_logs (order_id, old_status, new_status, changed_by)
       VALUES ($1, 'OUT_FOR_DELIVERY', 'DELIVERED', 'Rider')`,
      [id]
    );

    // Fetch customer details
    const orderRes = await client.query('SELECT customer_id, readable_order_id FROM orders WHERE order_id = $1', [id]);
    const custRes = await client.query('SELECT phone FROM customers WHERE customer_id = $1', [orderRes.rows[0].customer_id]);
    
    if (custRes.rows.length > 0) {
      const phone = custRes.rows[0].phone;
      const whatsappService = require('../services/whatsapp');
      await whatsappService.sendText(phone, `🎉 *Order #${orderRes.rows[0].readable_order_id} Delivered!* Thank you for shopping with *Mera Kirana*! We hope to serve you again soon.`);
    }

    await client.query('COMMIT');
    res.json({ message: 'Delivery verified and order completed successfully' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Verify Delivery OTP Error:', err);
    res.status(500).json({ error: 'Failed to verify delivery OTP' });
  } finally {
    client.release();
  }
});

// GET /api/orders/qr/:id.png - Serves UPI payment QR image dynamically
const QRCode = require('qrcode');
router.get('/qr/:id.png', async (req, res) => {
  try {
    const { id } = req.params;
    // Retrieve order details to extract VPA and amount
    const orderRes = await pool.query('SELECT total_amount, readable_order_id FROM orders WHERE order_id = $1', [id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).send('Order not found');
    }
    const order = orderRes.rows[0];
    
    // Query system VPA from settings or fallback to default
    const settingsRes = await pool.query("SELECT value FROM system_settings WHERE key = 'payment_vpa' LIMIT 1");
    const vpa = settingsRes.rows.length ? settingsRes.rows[0].value : 'merakirana@okaxis';
    
    const orderTotal = order.total_amount;
    const note = encodeURIComponent(`Order #${order.readable_order_id}`);
    const upiUri = `upi://pay?pa=${vpa}&am=${orderTotal}&tn=${note}&tr=${id}`;
    
    res.setHeader('Content-Type', 'image/png');
    // Generate and stream directly to client
    await QRCode.toFileStream(res, upiUri, {
      type: 'png',
      width: 300,
      errorCorrectionLevel: 'M'
    });
  } catch (e) {
    console.error('Error generating QR image:', e);
    res.status(500).send('Internal Server Error');
  }
});

// PUT /api/orders/:id/cancel - Cancel order
router.put('/:id/cancel', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const { changed_by } = req.body;
    
    const oldOrderRes = await client.query('SELECT status FROM orders WHERE order_id = $1', [id]);
    if (oldOrderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const oldStatus = oldOrderRes.rows[0].status;
    
    await client.query("UPDATE orders SET status = 'CANCELLED', updated_at = NOW() WHERE order_id = $1", [id]);
    
    await client.query(
      `INSERT INTO order_status_logs (order_id, old_status, new_status, changed_by)
       VALUES ($1, $2, 'CANCELLED', $3)`,
      [id, oldStatus, changed_by || 'Admin']
    );
    
    await client.query('COMMIT');
    res.json({ message: 'Order cancelled successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cancel Order Error:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

module.exports = router;
