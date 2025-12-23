const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');

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

    // Log the entire body for debugging
    console.log('Incoming Webhook:', JSON.stringify(body, null, 2));

    // IMPORTANT: Respond to Meta immediately to prevent duplicate calls
    res.sendStatus(200);

    // Check if this is an event from a WhatsApp API
    if (body.object) {
        if (body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0] &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            const msg = body.entry[0].changes[0].value.messages[0];
            const from = msg.from;
            const type = msg.type;
            const messageId = msg.id;

            // Extract data correctly
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
                const db = require('../database/db');

                // 1. ATOMIC DEDUPLICATION
                // Using the UNIQUE constraint we added to message_id
                const logResult = await db.query(
                    'INSERT INTO conversation_logs (customer_phone, message_type, content, message_id) VALUES ($1, $2, $3, $4) ON CONFLICT (message_id) DO NOTHING',
                    [from, 'incoming', text, messageId]
                );

                if (logResult.rowCount === 0) {
                    console.log(`Duplicate message detected: ${messageId} - Skipping`);
                    return;
                }

                // 2. SESSION & CUSTOMER MANAGEMENT
                // Check if there are ANY other active logs for this user in the main table
                // If the archive job has moved them, this will return 0, triggering a "New Session"
                const sessionResult = await db.query(
                    'SELECT 1 FROM conversation_logs WHERE customer_phone = $1 AND message_id != $2 LIMIT 1',
                    [from, messageId]
                );

                let isNewSession = sessionResult.rows.length === 0;

                // Ensure customer exists in DB (for profile/metadata)
                const customerResult = await db.query('SELECT 1 FROM customers WHERE phone = $1', [from]);
                if (customerResult.rows.length === 0) {
                    await db.query('INSERT INTO customers (phone, name) VALUES ($1, $2)', [from, 'WhatsApp User']);
                } else {
                    await db.query('UPDATE customers SET last_active = NOW() WHERE phone = $1', [from]);
                }

                if (isNewSession) {
                    console.log(`New Session or Archived Session detected for ${from}`);
                }

                // 3. BOT RESPONSE LOGIC
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
                    // Possible Address Capture Logic
                    // 1. Check if user has an active cart
                    const cartCheck = await db.query(`
                        SELECT c.cart_id, cust.customer_id 
                        FROM carts c 
                        JOIN customers cust ON c.customer_id = cust.customer_id 
                        WHERE cust.phone = $1 AND c.status = 'ACTIVE' LIMIT 1
                    `, [from]);

                    if (cartCheck.rows.length > 0) {
                        const customerId = cartCheck.rows[0].customer_id;
                        // 2. Check if they ALREADY have a default address
                        const addrCheck = await db.query('SELECT 1 FROM addresses WHERE customer_id = $1 AND is_default = true', [customerId]);

                        if (addrCheck.rows.length === 0) {
                            // This looks like an address submission!
                            await db.query('INSERT INTO addresses (customer_id, address_text, is_default, pincode) VALUES ($1, $2, true, $3)', [customerId, text, '000000']);

                            const buttons = [
                                { id: 'btn_confirm_addr', title: '💳 Choose Payment' }
                            ];
                            await whatsappService.sendButtons(from, "✅ *Address Saved!*\nNow, let's settle the payment.", buttons);
                            await whatsappService.markAsRead(messageId);
                        }
                    }
                } else if (type === 'interactive') {
                    if (msg.interactive.button_reply) {
                        const buttonId = msg.interactive.button_reply.id;

                        if (buttonId === 'btn_products') {
                            // Full Catalog Mode: No SKUs needed in code.
                            // thumbnail_product_retailer_id is optional but shows a nice preview.
                            await whatsappService.sendCatalog(from, "Browse our full fresh catalog! 🏪", "BR_PR_1KG");
                            await whatsappService.markAsRead(messageId);
                        } else if (buttonId === 'btn_view_cart') {
                            // 1. Fetch Cart Items with Joins
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
                                await whatsappService.sendText(from, "Your cart is currently empty! 🛒");
                            } else {
                                let total = 0;
                                let summaryText = "🛒 *Your Current Cart:*\n\n";

                                cartSummary.rows.forEach(row => {
                                    const subtotal = row.price * row.quantity;
                                    total += subtotal;
                                    summaryText += `• ${row.base_name} (${row.weight_label})\n   ${row.quantity} x ₹${row.price} = *₹${subtotal.toFixed(2)}*\n`;
                                });

                                summaryText += `\n*Grand Total: ₹${total.toFixed(2)}*`;

                                const buttons = [
                                    { id: 'btn_products', title: '🛍️ Add More' },
                                    { id: 'btn_checkout', title: '💳 Checkout' }
                                ];

                                await whatsappService.sendButtons(from, summaryText, buttons);
                            }
                            await whatsappService.markAsRead(messageId);
                        } else if (buttonId === 'btn_checkout') {
                            // 1. Check for Active Cart
                            const cartResult = await db.query(`
                                SELECT c.cart_id 
                                FROM carts c 
                                JOIN customers cust ON c.customer_id = cust.customer_id 
                                WHERE cust.phone = $1 AND c.status = 'ACTIVE' LIMIT 1
                            `, [from]);

                            if (cartResult.rows.length === 0) {
                                await whatsappService.sendText(from, "Your cart is empty! 🛒\nPlease add some items before checking out.");
                            } else {
                                // 2. Check for Saved Address
                                const addressResult = await db.query(`
                                    SELECT address_text FROM addresses a
                                    JOIN customers cust ON a.customer_id = cust.customer_id
                                    WHERE cust.phone = $1 AND a.is_default = true LIMIT 1
                                `, [from]);

                                if (addressResult.rows.length === 0) {
                                    // No address - Send Native Address Message
                                    await whatsappService.sendAddressMessage(from, "🏠 *Delivery Address Required*\n\nPlease fill in your address details using the form below:");
                                } else {
                                    // Address exists - Ask to confirm
                                    const savedAddress = addressResult.rows[0].address_text;
                                    const buttons = [
                                        { id: 'btn_confirm_addr', title: '✅ Deliver Here' },
                                        { id: 'btn_change_addr', title: '📍 Change Address' }
                                    ];
                                    await whatsappService.sendButtons(from, `📍 *Confirm Delivery Address:*\n\n${savedAddress}\n\nShould we deliver here?`, buttons);
                                }
                            }
                            await whatsappService.markAsRead(messageId);
                        } else if (buttonId === 'btn_confirm_addr') {
                            // Show Payment Options
                            const buttons = [
                                { id: 'pay_upi', title: '💳 UPI (Online)' },
                                { id: 'pay_cod', title: '💵 Cash on Delivery' }
                            ];
                            await whatsappService.sendButtons(from, "💳 *Select Payment Method:*\n\nChoose how you want to pay for your order:", buttons);
                            await whatsappService.markAsRead(messageId);
                        } else if (buttonId === 'btn_change_addr') {
                            // Send Native Address Message for updates
                            await whatsappService.sendAddressMessage(from, "🏠 *Enter New Address*\n\nPlease update your delivery details below:");
                            await whatsappService.markAsRead(messageId);
                        } else if (buttonId === 'pay_upi' || buttonId === 'pay_cod') {
                            const method = buttonId === 'pay_upi' ? 'UPI' : 'COD';

                            // 1. Fetch Cart, Total & Address for Summary
                            const cartItems = await db.query(`
                                SELECT ci.variant_id, ci.quantity, v.price, p.base_name, v.weight_label
                                FROM carts c
                                JOIN customers cust ON c.customer_id = cust.customer_id
                                JOIN cart_items ci ON c.cart_id = ci.cart_id
                                JOIN product_variants v ON ci.variant_id = v.variant_id
                                JOIN products p ON v.product_id = p.product_id
                                WHERE cust.phone = $1 AND c.status = 'ACTIVE'
                            `, [from]);

                            const addressResult = await db.query(`
                                SELECT address_text FROM addresses a
                                JOIN customers cust ON a.customer_id = cust.customer_id
                                WHERE cust.phone = $1 AND a.is_default = true LIMIT 1
                            `, [from]);

                            if (cartItems.rows.length === 0) {
                                await whatsappService.sendText(from, "Your cart is empty! 🛒");
                            } else {
                                let total = 0;
                                let itemsText = "";
                                cartItems.rows.forEach(item => {
                                    const subtotal = item.price * item.quantity;
                                    total += subtotal;
                                    itemsText += `• ${item.base_name} (${item.weight_label}) x ${item.quantity}: *₹${subtotal}*\n`;
                                });

                                const address = addressResult.rows[0]?.address_text || "N/A";

                                const summaryBody = `📦 *Order Review:*\n\n` +
                                    `*Items:*\n${itemsText}\n` +
                                    `*Total Amount:* ₹${total.toFixed(2)}\n` +
                                    `*Payment:* ${method}\n` +
                                    `*Delivery to:* ${address}\n\n` +
                                    `Ready to place your order?`;

                                const buttons = [
                                    { id: `place_${method.toLowerCase()}`, title: '✅ Place Order' },
                                    { id: 'btn_view_cart', title: '🛒 Edit Cart' }
                                ];

                                await whatsappService.sendButtons(from, summaryBody, buttons);
                            }
                            await whatsappService.markAsRead(messageId);
                        } else if (buttonId.startsWith('place_')) {
                            const method = buttonId.includes('upi') ? 'UPI' : 'COD';
                            await whatsappService.sendText(from, `⏳ *Processing your ${method} order...*\n\nPlease wait a moment.`);

                            // 1. Fetch Cart & Total
                            const cartItems = await db.query(`
                                SELECT ci.variant_id, ci.quantity, v.price, p.base_name, v.weight_label
                                FROM carts c
                                JOIN customers cust ON c.customer_id = cust.customer_id
                                JOIN cart_items ci ON c.cart_id = ci.cart_id
                                JOIN product_variants v ON ci.variant_id = v.variant_id
                                JOIN products p ON v.product_id = p.product_id
                                WHERE cust.phone = $1 AND c.status = 'ACTIVE'
                            `, [from]);

                            if (cartItems.rows.length > 0) {
                                let total = 0;
                                cartItems.rows.forEach(item => total += (item.price * item.quantity));

                                // 2. Create Order
                                const orderResult = await db.query(`
                                    INSERT INTO orders (customer_id, total_amount, payment_method, status)
                                    VALUES ((SELECT customer_id FROM customers WHERE phone = $1), $2, $3, $4)
                                    RETURNING order_id, readable_order_id
                                `, [from, total, method, method === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT']);

                                const orderId = orderResult.rows[0].order_id;
                                const shortId = orderResult.rows[0].readable_order_id;

                                // 3. Move items to order_items
                                for (const item of cartItems.rows) {
                                    await db.query(`
                                        INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price)
                                        VALUES ($1, $2, $3, $4, $5)
                                    `, [orderId, item.variant_id, item.quantity, item.price, item.price * item.quantity]);
                                }

                                // 4. Close Cart
                                await db.query("UPDATE carts SET status = 'CONVERTED' WHERE customer_id = (SELECT customer_id FROM customers WHERE phone = $1) AND status = 'ACTIVE'", [from]);

                                if (method === 'COD') {
                                    await whatsappService.sendText(from, `🎉 *Order Confirmed!*\n\nOrder ID: #${shortId}\nTotal: ₹${total.toFixed(2)}\n\nWe will deliver your items soon to your saved address. Thank you! 🙏`);
                                } else {
                                    // UPI flow (Placeholder for dynamic QR)
                                    await whatsappService.sendText(from, `🔗 *Complete Payment*\n\nOrder ID: #${shortId}\nTotal: ₹${total.toFixed(2)}\n\nPlease pay using this UPI ID: *shop@upi*\n\nOnce paid, please send a screenshot of the receipt here. We will confirm your order immediately! ✅`);
                                }
                            }
                            await whatsappService.markAsRead(messageId);
                        }
                    } else if (msg.interactive.list_reply) {
                        const listId = msg.interactive.list_reply.id;

                        if (listId.startsWith('cat_')) {
                            const categoryId = listId.replace('cat_', '');

                            // 1. Fetch products for this category
                            const productsResult = await db.query(
                                'SELECT product_id, base_name, description FROM products WHERE category_id = $1 AND is_active = true',
                                [categoryId]
                            );

                            if (productsResult.rows.length === 0) {
                                await whatsappService.sendText(from, "No products available in this category yet. 🛍️");
                            } else {
                                // 2. Show products in a list
                                const rows = productsResult.rows.map(p => ({
                                    id: `prod_${p.product_id}`,
                                    title: p.base_name.substring(0, 24),
                                    description: p.description ? p.description.substring(0, 72) : 'View options'
                                }));

                                await whatsappService.sendList(
                                    from,
                                    "🛒 Products",
                                    "Select an item to see weights and prices:",
                                    "View Items",
                                    [{ title: 'Products', rows: rows }]
                                );
                            }
                            await whatsappService.markAsRead(messageId);
                        } else if (listId.startsWith('prod_')) {
                            const productId = listId.replace('prod_', '');

                            // 1. Fetch variants (weights/prices) for this product
                            const variantsResult = await db.query(
                                'SELECT variant_id, weight_label, price FROM product_variants WHERE product_id = $1 AND is_active = true ORDER BY price ASC',
                                [productId]
                            );

                            if (variantsResult.rows.length === 0) {
                                await whatsappService.sendText(from, "Sorry, this product is temporarily out of stock. 📦");
                            } else {
                                // 2. Show weights/prices in a list
                                const rows = variantsResult.rows.map(v => ({
                                    id: `var_${v.variant_id}`,
                                    title: `${v.weight_label} - ₹${v.price}`,
                                    description: 'Click to add to cart'
                                }));

                                await whatsappService.sendList(
                                    from,
                                    "⚖️ Select Weight",
                                    "Choose your preferred size:",
                                    "Select Weight",
                                    [{ title: 'Available Options', rows: rows }]
                                );
                            }
                            await whatsappService.markAsRead(messageId);
                        } else if (listId.startsWith('var_')) {
                            const variantId = listId.replace('var_', '');

                            // 1. Get Customer ID
                            const custResult = await db.query('SELECT customer_id FROM customers WHERE phone = $1', [from]);
                            const customerId = custResult.rows[0].customer_id;

                            // 2. Find or Create Active Cart
                            let cartResult = await db.query(
                                "SELECT cart_id FROM carts WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1",
                                [customerId]
                            );

                            let cartId;
                            if (cartResult.rows.length === 0) {
                                const newCart = await db.query(
                                    'INSERT INTO carts (customer_id) VALUES ($1) RETURNING cart_id',
                                    [customerId]
                                );
                                cartId = newCart.rows[0].cart_id;
                            } else {
                                cartId = cartResult.rows[0].cart_id;
                            }

                            // 3. Add to Cart Items (Increment if exists, else insert)
                            await db.query(`
                                INSERT INTO cart_items (cart_id, variant_id, quantity)
                                VALUES ($1, $2, 1)
                                ON CONFLICT (cart_id, variant_id) DO UPDATE 
                                SET quantity = cart_items.quantity + 1
                            `, [cartId, variantId]);

                            // 4. Respond with options
                            const buttons = [
                                { id: 'btn_products', title: '🛍️ Add More' },
                                { id: 'btn_view_cart', title: '🛒 View Cart' },
                                { id: 'btn_checkout', title: '💳 Checkout' }
                            ];

                            await whatsappService.sendButtons(
                                from,
                                "✅ Added to your basket!\nWould you like to keep shopping or checkout?",
                                buttons
                            );
                            await whatsappService.markAsRead(messageId);
                        }
                    } else if (interactive.type === 'address_message') {
                        // HANDLE INCOMING ADDRESS FORM SUBMISSION
                        const addrData = interactive.address_message;
                        // Format: { name, phone_number, in_pin_code, house_number, floor_number, building_name, address, landmark_area, city, state }

                        const fullAddress = [
                            addrData.house_number,
                            addrData.floor_number ? `Floor ${addrData.floor_number}` : null,
                            addrData.tower_number ? `Tower ${addrData.tower_number}` : null,
                            addrData.building_name,
                            addrData.address,
                            `Near ${addrData.landmark_area}`,
                            addrData.city,
                            addrData.state,
                            addrData.in_pin_code
                        ].filter(Boolean).join(', ');

                        // Save to DB
                        const custResult = await db.query('SELECT customer_id FROM customers WHERE phone = $1', [from]);
                        const customerId = custResult.rows[0].customer_id;

                        // Set all others to false, then insert new default
                        await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [customerId]);
                        await db.query(
                            'INSERT INTO addresses (customer_id, address_text, pincode, is_default) VALUES ($1, $2, $3, true)',
                            [customerId, fullAddress, addrData.in_pin_code]
                        );

                        const buttons = [
                            { id: 'btn_confirm_addr', title: '💳 Choose Payment' }
                        ];
                        await whatsappService.sendButtons(from, `✅ *Address Saved!*\n\n${fullAddress}\n\nNow, let's settle the payment.`, buttons);
                        await whatsappService.markAsRead(messageId);
                    }
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        }

        // Ignore status updates (delivered, read, etc.)
        if (body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0] &&
            body.entry[0].changes[0].value.statuses
        ) {
            console.log('Status update received - Ignoring');
            return;
        }
    }
});

module.exports = router;
