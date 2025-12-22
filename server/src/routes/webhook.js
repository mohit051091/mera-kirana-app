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

            // Extract text content correctly (handle text and buttons)
            let text = '';
            if (type === 'text') {
                text = msg.text ? msg.text.body : '';
            } else if (type === 'interactive' && msg.interactive.button_reply) {
                text = msg.interactive.button_reply.title;
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
                // Check if customer exists and when they were last active
                const customerResult = await db.query(
                    'SELECT customer_id, last_active FROM customers WHERE phone = $1',
                    [from]
                );

                let isNewSession = false;
                if (customerResult.rows.length === 0) {
                    // New Customer
                    await db.query('INSERT INTO customers (phone, name) VALUES ($1, $2)', [from, 'WhatsApp User']);
                    isNewSession = true;
                } else {
                    const lastActive = customerResult.rows[0].last_active;
                    // If no activity in 24 hours, treat as new session
                    if (!lastActive || (Date.now() - new Date(lastActive).getTime()) > 24 * 60 * 60 * 1000) {
                        isNewSession = true;
                        console.log(`Session Reset for ${from} (Last active: ${lastActive})`);
                    }
                }

                // Update last_active for the customer
                await db.query('UPDATE customers SET last_active = NOW() WHERE phone = $1', [from]);

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
                } else if (type === 'interactive') {
                    // Handle button clicks specifically
                    const buttonId = msg.interactive.button_reply.id;
                    if (buttonId === 'btn_products') {
                        // Placeholder for product flow
                        await whatsappService.sendMessage(from, "Fetching our product categories... 📋\n(Feature coming in Phase 5)");
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
