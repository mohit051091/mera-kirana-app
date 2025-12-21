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

            console.log(`Message from ${from}: ${text} [${type}]`);

            // Handle "Hi" or "Hello" or "hi"
            if (type === 'text' && (text.toLowerCase() === 'hi' || text.toLowerCase() === 'hello')) {
                const buttons = [
                    { id: 'btn_products', title: '🛍️ View Products' },
                    { id: 'btn_orders', title: '📦 My Orders' },
                    { id: 'btn_support', title: '📞 Call Shop' }
                ];
                await whatsappService.sendButtons(from, "Welcome to *Mera Kirana*! 🏪\nChoose an option to start:", buttons);
                await whatsappService.markAsRead(msg.id);
            }
        }

        // Always return 200 OK to acknowledge receipt
        res.sendStatus(200);
    } else {
        // Return 404 if this is not a WhatsApp API event
        res.sendStatus(404);
    }
});

module.exports = router;
