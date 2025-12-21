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
            const text = msg.text ? msg.text.body : '';
            const type = msg.type;
            const messageId = msg.id;

            console.log(`Message from ${from}: ${text} [${type}] ID: ${messageId}`);

            try {
                // Deduplication: Check if we've already processed this message
                const db = require('../database/db');
                const checkDuplicate = await db.query(
                    'SELECT message_id FROM conversation_logs WHERE message_id = $1 LIMIT 1',
                    [messageId]
                );

                if (checkDuplicate.rows.length > 0) {
                    console.log(`Duplicate message detected: ${messageId} - Skipping`);
                    return;
                }

                // Log incoming message to prevent duplicates
                await db.query(
                    'INSERT INTO conversation_logs (customer_phone, message_type, message_content, message_id) VALUES ($1, $2, $3, $4)',
                    [from, 'incoming', text, messageId]
                );

                // Handle "Hi" or "Hello" or "hi"
                if (type === 'text' && (text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello')) {
                    const buttons = [
                        { id: 'btn_products', title: '🛍️ View Products' },
                        { id: 'btn_orders', title: '📦 My Orders' },
                        { id: 'btn_support', title: '📞 Call Shop' }
                    ];
                    await whatsappService.sendButtons(from, "Welcome to *Mera Kirana*! 🏪\nChoose an option to start:", buttons);
                    await whatsappService.markAsRead(messageId);
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
