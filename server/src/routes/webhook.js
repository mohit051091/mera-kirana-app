const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const db = require('../database/db');

// --- PERFORMANCE OPTIMIZATIONS (FREE) ---
// RAM Cache for active users to skip DB lookups for 24 hours.
const sessionCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// GET /webhook/whatsapp - Verification Challenge
router.get('/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Use a simple hardcoded token for the standard setup
    // In production, this should match your Meta App configuration
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'merakirana123';

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400); // Bad Request if parameters are missing
    }
});

// POST /webhook/whatsapp - Incoming Messages
router.post('/whatsapp', async (req, res) => {
    const body = req.body;
    console.log('Incoming Webhook:', JSON.stringify(body, null, 2));
    res.sendStatus(200);

    if (!body.object) return;

    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const type = msg.type;
        const messageId = msg.id;

        let text = '';
        let interactive = null;

        if (type === 'text') {
            text = msg.text ? msg.text.body : '';
        } else if (type === 'interactive') {
            interactive = msg.interactive;
            if (interactive.button_reply) {
                text = interactive.button_reply.title;
            } else if (interactive.list_reply) {
                text = interactive.list_reply.title;
            }
        }

        console.log(`Message from ${from}: "${text}" [${type}] ID: ${messageId}`);

        try {
            // 1. ASYNC LOGGING (FIRE AND FORGET)
            db.query(
                'INSERT INTO conversation_logs (customer_phone, message_type, content, message_id) VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING',
                [from, 'incoming', text, messageId]
            ).then(result => {
                if (result.rowCount === 0) console.log(`Duplicate msg detected: ${messageId}`);
            }).catch(err => console.error("Async Logging Error:", err));

            // 2. SESSION CHECK (CACHE FIRST)
            let isNewSession = true;
            const now = Date.now();
            const cached = sessionCache.get(from);

            if (cached && (now - cached.lastChecked < CACHE_TTL)) {
                isNewSession = false;
            } else {
                const sessionResult = await db.query(
                    'SELECT 1 FROM conversation_logs WHERE customer_phone = $1 AND created_at > NOW() - INTERVAL \'24 hours\' AND message_id != $2 LIMIT 1',
                    [from, messageId]
                );
                isNewSession = sessionResult.rows.length === 0;
                sessionCache.set(from, { isNewSession: false, lastChecked: now });
            }

            // 3. ASYNC CUSTOMER UPDATE
            db.query('INSERT INTO customers (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET last_active = NOW()', [from, 'WhatsApp User'])
                .catch(err => console.error("Async Customer Update Error:", err));

            // 4. BOT LOGIC
            const welcomeMessages = ['hi', 'hello', 'hey', 'start', 'menu'];
            const isWelcomeIntent = type === 'text' && welcomeMessages.includes(text.toLowerCase());

            if (isNewSession || isWelcomeIntent) {
                const buttons = [
                    { id: 'btn_products', title: '🛍️ View Products' },
                    { id: 'btn_orders', title: '📦 My Orders' },
                    { id: 'btn_support', title: '📞 Call Shop' }
                ];
                await whatsappService.sendButtons(from, "Welcome to *Mera Kirana*! 🏪\nChoose an option to start:", buttons);
                await whatsappService.markAsRead(messageId);
            } else if (type === 'text') {
                const cartCheck = await db.query(`
                    SELECT c.cart_id, cust.customer_id 
                    FROM carts c 
                    JOIN customers cust ON c.customer_id = cust.customer_id 
                    WHERE cust.phone = $1 AND c.status = 'ACTIVE' LIMIT 1
                `, [from]);

                if (cartCheck.rows.length > 0) {
                    const customerId = cartCheck.rows[0].customer_id;
                    const addrCheck = await db.query('SELECT 1 FROM addresses WHERE customer_id = $1 AND is_default = true', [customerId]);
                    if (addrCheck.rows.length === 0) {
                        await db.query('INSERT INTO addresses (customer_id, address_text, is_default, pincode) VALUES ($1, $2, true, $3)', [customerId, text, '000000']);
                        const buttons = [{ id: 'btn_confirm_addr', title: '💳 Choose Payment' }];
                        await whatsappService.sendButtons(from, "✅ *Address Saved!*\nNow, let's settle the payment.", buttons);
                        await whatsappService.markAsRead(messageId);
                    }
                }
            } else if (type === 'interactive') {
                if (interactive.button_reply) {
                    const buttonId = interactive.button_reply.id;
                    if (buttonId === 'btn_products') {
                        try {
                            await whatsappService.sendCatalog(from, "Browse our full fresh catalog! 🏪", "5h0o9zetew");
                        } catch (e) {
                            const phoneNumber = process.env.WHATSAPP_PHONE_ID.replace(/\D/g, '');
                            await whatsappService.sendText(from, "Browse catalog: https://wa.me/c/" + phoneNumber);
                        }
                    } else if (buttonId === 'btn_view_cart') {
                        const cartSummary = await db.query(`
                            SELECT p.base_name, v.weight_label, v.price, ci.quantity
                            FROM carts c
                            JOIN customers cust ON c.customer_id = cust.customer_id
                            JOIN cart_items ci ON c.cart_id = ci.cart_id
                            JOIN product_variants v ON ci.variant_id = v.variant_id
                            JOIN products p ON v.product_id = p.product_id
                            WHERE cust.phone = $1 AND c.status = 'ACTIVE'
                        `, [from]);

                        if (cartSummary.rows.length === 0) {
                            await whatsappService.sendText(from, "Your cart is empty! 🛒");
                        } else {
                            let total = 0, summaryText = "🛒 *Your Cart:*\n\n";
                            cartSummary.rows.forEach(row => {
                                const sub = row.price * row.quantity;
                                total += sub;
                                summaryText += `• ${row.base_name} (${row.weight_label}) x ${row.quantity} = *₹${sub}*\n`;
                            });
                            summaryText += `\n*Total: ₹${total.toFixed(2)}*`;
                            const buttons = [{ id: 'btn_products', title: '🛍️ Add More' }, { id: 'btn_checkout', title: '💳 Checkout' }];
                            await whatsappService.sendButtons(from, summaryText, buttons);
                        }
                    } else if (buttonId === 'btn_checkout') {
                        const cartResult = await db.query(`SELECT 1 FROM carts c JOIN customers cust ON c.customer_id = cust.customer_id WHERE cust.phone = $1 AND c.status = 'ACTIVE'`, [from]);
                        if (cartResult.rows.length === 0) {
                            await whatsappService.sendText(from, "Cart is empty! 🛒");
                        } else {
                            const addressResult = await db.query(`SELECT address_text FROM addresses a JOIN customers cust ON a.customer_id = cust.customer_id WHERE cust.phone = $1 AND a.is_default = true`, [from]);
                            if (addressResult.rows.length === 0) {
                                await whatsappService.sendAddressMessage(from, "🏠 *Address Required*");
                            } else {
                                const savedAddress = addressResult.rows[0].address_text;
                                const buttons = [{ id: 'btn_confirm_addr', title: '✅ Deliver Here' }, { id: 'btn_change_addr', title: '📍 Change Address' }];
                                await whatsappService.sendButtons(from, `📍 *Deliver to:*\n\n${savedAddress}`, buttons);
                            }
                        }
                    } else if (buttonId === 'btn_confirm_addr') {
                        const buttons = [{ id: 'pay_upi', title: '💳 UPI' }, { id: 'pay_cod', title: '💵 COD' }];
                        await whatsappService.sendButtons(from, "💳 *Select Payment:*", buttons);
                    } else if (buttonId === 'btn_change_addr') {
                        await whatsappService.sendAddressMessage(from, "🏠 *Enter Address*");
                    } else if (buttonId === 'pay_upi' || buttonId === 'pay_cod') {
                        const method = buttonId === 'pay_upi' ? 'UPI' : 'COD';
                        const summary = await db.query(`
                            SELECT p.base_name, v.weight_label, v.price, ci.quantity, a.address_text
                            FROM carts c
                            JOIN customers cust ON c.customer_id = cust.customer_id
                            JOIN cart_items ci ON c.cart_id = ci.cart_id
                            JOIN product_variants v ON ci.variant_id = v.variant_id
                            JOIN products p ON v.product_id = p.product_id
                            JOIN addresses a ON cust.customer_id = a.customer_id AND a.is_default = true
                            WHERE cust.phone = $1 AND c.status = 'ACTIVE'
                        `, [from]);

                        if (summary.rows.length === 0) {
                            await whatsappService.sendText(from, "Cart is empty! 🛒");
                        } else {
                            let total = 0, items = "";
                            summary.rows.forEach(row => {
                                total += row.price * row.quantity;
                                items += `• ${row.base_name} x ${row.quantity}\n`;
                            });
                            const text = `📦 *Order:* \n${items}\n*Total: ₹${total}*\n*Payment: ${method}*\n*To:* ${summary.rows[0].address_text}`;
                            const buttons = [{ id: `place_${method.toLowerCase()}`, title: '✅ Place Order' }];
                            await whatsappService.sendButtons(from, text, buttons);
                        }
                    } else if (buttonId.startsWith('place_')) {
                        const method = buttonId.includes('upi') ? 'UPI' : 'COD';
                        const cartItems = await db.query(`SELECT ci.variant_id, ci.quantity, v.price FROM carts c JOIN customers cust ON c.customer_id = cust.customer_id JOIN cart_items ci ON c.cart_id = ci.cart_id JOIN product_variants v ON ci.variant_id = v.variant_id WHERE cust.phone = $1 AND c.status = 'ACTIVE'`, [from]);
                        if (cartItems.rows.length > 0) {
                            let total = 0; cartItems.rows.forEach(i => total += (i.price * i.quantity));
                            const order = await db.query(`INSERT INTO orders (customer_id, total_amount, payment_method, status) VALUES ((SELECT customer_id FROM customers WHERE phone = $1), $2, $3, $4) RETURNING order_id, readable_order_id`, [from, total, method, method === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT']);
                            const orderId = order.rows[0].order_id;
                            for (const i of cartItems.rows) {
                                await db.query(`INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) VALUES ($1, $2, $3, $4, $5)`, [orderId, i.variant_id, i.quantity, i.price, i.price * i.quantity]);
                            }
                            await db.query("UPDATE carts SET status = 'CONVERTED' WHERE customer_id = (SELECT customer_id FROM customers WHERE phone = $1) AND status = 'ACTIVE'", [from]);
                            await whatsappService.sendText(from, `🎉 *Order #${order.rows[0].readable_order_id} Confirmed!*`);
                        }
                    }
                    await whatsappService.markAsRead(messageId);
                } else if (interactive.list_reply) {
                    const listId = interactive.list_reply.id;
                    if (listId.startsWith('cat_')) {
                        const catId = listId.replace('cat_', '');
                        const products = await db.query('SELECT product_id, base_name FROM products WHERE category_id = $1 AND is_active = true', [catId]);
                        const rows = products.rows.map(p => ({ id: `prod_${p.product_id}`, title: p.base_name.substring(0, 24) }));
                        await whatsappService.sendList(from, "🛒 Products", "Select an item:", "View Items", [{ title: 'Products', rows }]);
                    } else if (listId.startsWith('prod_')) {
                        const prodId = listId.replace('prod_', '');
                        const variants = await db.query('SELECT variant_id, weight_label, price FROM product_variants WHERE product_id = $1 AND is_active = true ORDER BY price ASC', [prodId]);
                        const rows = variants.rows.map(v => ({ id: `var_${v.variant_id}`, title: `${v.weight_label} - ₹${v.price}` }));
                        await whatsappService.sendList(from, "⚖️ Weight", "Choose size:", "Select", [{ title: 'Options', rows }]);
                    } else if (listId.startsWith('var_')) {
                        const variantId = listId.replace('var_', '');
                        const cust = await db.query('SELECT customer_id FROM customers WHERE phone = $1', [from]);
                        const customerId = cust.rows[0].customer_id;
                        let cart = await db.query("SELECT cart_id FROM carts WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1", [customerId]);
                        let cartId = cart.rows.length ? cart.rows[0].cart_id : (await db.query('INSERT INTO carts (customer_id) VALUES ($1) RETURNING cart_id', [customerId])).rows[0].cart_id;
                        await db.query(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + 1`, [cartId, variantId]);
                        const buttons = [{ id: 'btn_products', title: '🛍️ Add More' }, { id: 'btn_view_cart', title: '🛒 Cart' }, { id: 'btn_checkout', title: '💳 Checkout' }];
                        await whatsappService.sendButtons(from, "✅ Added!", buttons);
                    }
                    await whatsappService.markAsRead(messageId);
                } else if (interactive.type === 'address_message') {
                    const a = interactive.address_message;
                    const addr = [a.house_number, a.building_name, a.address, a.city, a.in_pin_code].filter(Boolean).join(', ');
                    const cust = await db.query('SELECT customer_id FROM customers WHERE phone = $1', [from]);
                    const cid = cust.rows[0].customer_id;
                    await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [cid]);
                    await db.query('INSERT INTO addresses (customer_id, address_text, pincode, is_default) VALUES ($1, $2, $3, true)', [cid, addr, a.in_pin_code]);
                    await whatsappService.sendButtons(from, "✅ Address Saved!", [{ id: 'btn_confirm_addr', title: '💳 Payment' }]);
                    await whatsappService.markAsRead(messageId);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    } else if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.statuses) {
        console.log('Status update received - Ignoring');
    }
});

module.exports = router;
