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

// GET /api/orders - List all orders (Recent first)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 50');
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
    const oldOrderRes = await client.query('SELECT status FROM orders WHERE order_id = $1', [id]);
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

module.exports = router;
