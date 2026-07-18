const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const db = require('../database/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// RAM Cache for active users to skip DB lookups for 24 hours.
const sessionCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Helper: load config settings from DB with fallbacks
async function getSetting(key, defaultValue) {
    try {
        const res = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);
        return res.rows.length ? res.rows[0].value : defaultValue;
    } catch (e) {
        console.error(`Error loading setting ${key}:`, e);
        return defaultValue;
    }
}

// Helper: log customer funnel dropoffs
async function logDropoff(customerId, stage, reason, notes = '') {
    try {
        await db.query(
            'INSERT INTO dropoffs (customer_id, stage, reason, notes) VALUES ($1, $2, $3, $4)',
            [customerId, stage, reason, notes]
        );
    } catch (e) {
        console.error('Error logging dropoff:', e);
    }
}

// GET /webhook/whatsapp - Verification Challenge
router.get('/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'merakirana123';

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Helper to generate and send Delivery Slots List Message (including change address action)
async function sendSlotList(from, addrId, metadata, cartId) {
    metadata.address_id = addrId;
    metadata.stage = 'DELIVERY_SLOT_SELECTION';
    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

    // Query active address text
    const addrRes = await db.query('SELECT address_text FROM addresses WHERE address_id = $1', [addrId]);
    const addrText = addrRes.rows[0]?.address_text || 'Saved Address';

    const slots = [
        { key: 'morning', label: '🌅 Morning (6-8 AM)' },
        { key: 'noon', label: '☀️ Noon (12-2 PM)' },
        { key: 'evening', label: '🌇 Evening (5-7 PM)' }
    ];
    
    const limit = await getSetting('rider_slot_limit', 10);
    const slotRows = [];

    for (const slot of slots) {
        const countRes = await db.query(
            "SELECT COUNT(1) FROM orders WHERE delivery_slot = $1 AND status != 'CANCELLED' AND created_at::date = CURRENT_DATE",
            [slot.label]
        );
        if (parseInt(countRes.rows[0].count) < limit) {
            slotRows.push({ id: `btn_slot_select_${slot.key}`, title: slot.label.substring(0, 24) });
        }
    }

    if (slotRows.length === 0) {
        slotRows.push(
            { id: 'btn_slot_select_tomorrow_morning', title: '🌅 Tomorrow Morning' },
            { id: 'btn_slot_select_tomorrow_evening', title: '🌇 Tomorrow Evening' }
        );
    }

    const listBody = `🏠 *Delivering to:* ${addrText}\n\nPlease select your preferred delivery timing slot:`;
    
    const sections = [
        {
            title: "Available Timing",
            rows: slotRows
        },
        {
            title: "Fulfillment Location",
            rows: [
                { id: 'btn_change_addr', title: '✍️ Change Delivery Address' }
            ]
        }
    ];

    await whatsappService.sendList(from, "Select Delivery Slot", listBody, "Choose Slot", sections);
}

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
        let audioId = null;

        if (type === 'text') {
            text = msg.text ? msg.text.body : '';
        } else if (type === 'interactive') {
            interactive = msg.interactive;
            if (interactive.button_reply) {
                text = interactive.button_reply.title;
            } else if (interactive.list_reply) {
                text = interactive.list_reply.title;
            }
        } else if (type === 'audio') {
            audioId = msg.audio ? msg.audio.id : null;
        }

        console.log(`Message from ${from}: "${text || (audioId ? 'Voice Note' : 'Media')}" [${type}] ID: ${messageId}`);

        try {
            // Get active stage and conversation_id
            const lastCartRes = await db.query(`
                SELECT c.session_metadata 
                FROM carts c
                JOIN customers cust ON c.customer_id = cust.customer_id
                WHERE cust.phone = $1 AND c.status = 'ACTIVE' 
                LIMIT 1
            `, [from]);
            const stage = (lastCartRes.rows.length > 0 && lastCartRes.rows[0].session_metadata?.stage) || 'GREETING';

            const lastLogRes = await db.query(`
                SELECT conversation_id, 
                       (EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000) as age_ms
                FROM conversation_logs 
                WHERE customer_phone = $1 AND conversation_id IS NOT NULL 
                ORDER BY created_at DESC 
                LIMIT 1
            `, [from]);
            
            let conversationId;
            const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
            if (lastLogRes.rows.length > 0 && parseFloat(lastLogRes.rows[0].age_ms) < TWO_HOURS_IN_MS) {
                conversationId = lastLogRes.rows[0].conversation_id;
            } else {
                conversationId = require('crypto').randomUUID();
            }

            // 1. DEDUPLICATION (MUST BE SYNC TO PREVENT DUPLICATE RESPONSES)
            const logResult = await db.query(`
                INSERT INTO conversation_logs (customer_phone, message_type, content, message_id, conversation_id, session_stage, metadata, processing_type) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                ON CONFLICT (message_id) DO NOTHING
            `, [from, 'incoming', text || (audioId ? '[Voice Note]' : '[Media]'), messageId, conversationId, stage, JSON.stringify(msg), audioId ? 'voice' : 'manual']);

            if (logResult.rowCount === 0) {
                console.log(`Duplicate msg detected, skipping: ${messageId}`);
                return;
            }

            // 2. CHECK DND STATUS (Block message if active, unless they send opt-in)
            let customerId = null;
            let dndActive = false;

            const upsertCust = await db.query(`
                INSERT INTO customers (phone, name) 
                VALUES ($1, $2) 
                ON CONFLICT (phone) DO UPDATE SET last_active = NOW() 
                RETURNING customer_id, dnd_active
            `, [from, 'WhatsApp User']);
            
            customerId = upsertCust.rows[0].customer_id;
            dndActive = upsertCust.rows[0].dnd_active;

            // Trigger stop command if button clicked
            if (interactive && interactive.button_reply && interactive.button_reply.id === 'btn_dnd_stop') {
                await db.query('UPDATE customers SET dnd_active = true WHERE customer_id = $1', [customerId]);
                await whatsappService.sendText(from, "🔕 *Opt-out Confirmed!*\nYou have been unsubscribed from all marketing messages and recovery campaigns. To opt back in, send 'START'.");
                await whatsappService.markAsRead(messageId);
                return;
            }

            if (text.toLowerCase() === 'start' && dndActive) {
                await db.query('UPDATE customers SET dnd_active = false WHERE customer_id = $1', [customerId]);
                dndActive = false;
                await whatsappService.sendText(from, "🔔 *Opt-in Confirmed!* You will now receive order updates and messages.");
            }

            // 3. CHECK VACATION MODE (Shop closed)
            const vacationConfig = await getSetting('vacation_mode', { is_closed: false });
            if (vacationConfig.is_closed) {
                await whatsappService.sendText(from, "We are temporarily closed today. We look forward to serving you fresh dairy products soon! 🏪");
                await whatsappService.markAsRead(messageId);
                return;
            }

            // 4. PARSE REFERRAL CODES (Attributing salesperson)
            if (type === 'text') {
                const refMatch = text.match(/Hi_REF_([a-zA-Z0-9]+)/i);
                if (refMatch) {
                    const code = refMatch[1];
                    const salesCheck = await db.query('SELECT salesperson_id, name FROM salespeople WHERE referral_code = $1 AND is_active = true', [code]);
                    if (salesCheck.rows.length > 0) {
                        const repId = salesCheck.rows[0].salesperson_id;
                        await db.query('UPDATE customers SET referred_by_salesperson_id = $1 WHERE customer_id = $2', [repId, customerId]);
                        console.log(`Customer ${from} mapped to salesperson ${salesCheck.rows[0].name}`);
                    }
                }
            }

            // 5. SESSION CHECK (CACHE FIRST)
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

            await db.query('UPDATE customers SET last_active = NOW() WHERE customer_id = $1', [customerId]);

            // 6. PROCESS VOICE ORDER (STT parser)
            let voiceParsed = null;
            if (type === 'audio' && audioId) {
                const apiKey = process.env.GEMINI_API_KEY;
                if (!apiKey) {
                    await whatsappService.sendText(from, "Voice ordering is currently offline. Please use text checkout.");
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                try {
                    console.log(`Downloading voice note media ID: ${audioId}`);
                    const { buffer, mimeType } = await whatsappService.downloadMedia(audioId);
                    
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({
                        model: "gemini-1.5-flash",
                        generationConfig: { responseMimeType: "application/json" }
                    });

                    const systemPrompt = `
You are a structured parser for a dairy shop. You extract order items, addresses, and delivery slot details from customer voice messages.
You MUST output a raw JSON object matching this schema ONLY.

{
  "items": [{"name": "string", "quantity": "number"}],
  "address": {"street": "string", "pincode": "string"},
  "delivery_slot": {"date": "string", "slot": "string"},
  "detected_language": "string"
}

Catalog Products & Synonyms:
- Cow Milk (doodh, milk, cow milk)
- Curd (dahi, yogurt, curd packet)
- Mawa (khoya, khoa, mava, dry milk solids)
- Paneer (cottage cheese, paneer block)
- Clarified Butter (ghee, cow ghee, pure ghee)

Quantity mapping:
- "aadha kilo" / "half kg" = 500g or 0.5 kg
- "pao kilo" / "quarter kg" = 250g
- "ek packet" = 1 unit

Rules:
1. Map items to catalog names. If empty/unclear, set items to [].
2. Extract address and 6-digit postal pincode.
3. Extract slots. Date should be "today" or "tomorrow". Slot must be "morning", "noon", or "evening".
4. If a field is not mentioned, set it to null.
5. Set detected_language to the spoken vernacular language code (e.g. "hi-IN", "mr-IN", "en-US").
`;

                    const response = await model.generateContent([
                        {
                            inlineData: {
                                data: buffer.toString("base64"),
                                mimeType: mimeType
                            }
                        },
                        { text: systemPrompt }
                    ]);

                    voiceParsed = JSON.parse(response.response.text());
                    console.log('Gemini voice extraction results:', voiceParsed);

                } catch (err) {
                    console.error('Gemini processing failed:', err);
                    await whatsappService.sendText(from, "Sorry, I couldn't catch that. Could you please specify your dairy order?");
                    await whatsappService.markAsRead(messageId);
                    return;
                }
            }

            // 7. LOAD CART & METADATA
            let cartRes = await db.query("SELECT cart_id, session_metadata FROM carts WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1", [customerId]);
            let cartId = null;
            let metadata = {};

            if (cartRes.rows.length > 0) {
                cartId = cartRes.rows[0].cart_id;
                metadata = cartRes.rows[0].session_metadata || {};
            } else {
                const newCart = await db.query('INSERT INTO carts (customer_id) VALUES ($1) RETURNING cart_id', [customerId]);
                cartId = newCart.rows[0].cart_id;
            }

            // If voice parsed successfully: apply updates
            if (voiceParsed) {
                // Parse items
                if (voiceParsed.items && voiceParsed.items.length > 0) {
                    for (const item of voiceParsed.items) {
                        // Resolve variant in database
                        const query = `
                            SELECT pv.variant_id 
                            FROM product_variants pv
                            JOIN products p ON pv.product_id = p.product_id
                            WHERE p.base_name ILIKE $1 AND pv.is_active = true
                            LIMIT 1
                        `;
                        const resVar = await db.query(query, [item.name]);
                        if (resVar.rows.length > 0) {
                            await db.query(
                                'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + $3',
                                [cartId, resVar.rows[0].variant_id, item.quantity || 1]
                            );
                        }
                    }
                }

                // Parse address
                if (voiceParsed.address && voiceParsed.address.pincode) {
                    const pin = voiceParsed.address.pincode;
                    // check serviceability
                    const pinMaster = await db.query('SELECT 1 FROM pincode_master WHERE pincode = $1 AND is_allowed = true LIMIT 1', [pin]);
                    if (pinMaster.rows.length === 0) {
                        await logDropoff(customerId, 'ADDRESS', 'UNSERVICEABLE', `Unserviceable pincode ${pin} via voice`);
                        await whatsappService.sendText(from, `Uh oh! We are not delivering to pincode *${pin}* yet. Please specify another address.`);
                        await whatsappService.markAsRead(messageId);
                        return;
                    }

                    const fullAddr = `${voiceParsed.address.street || ''}, ${pin}`;
                    await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [customerId]);
                    const newAddr = await db.query('INSERT INTO addresses (customer_id, address_text, pincode, is_default) VALUES ($1, $2, $3, true) RETURNING address_id', [customerId, fullAddr, pin]);
                    metadata.address_id = newAddr.rows[0].address_id;
                } else {
                    // Check if they already have a default address saved
                    const defaultAddr = await db.query('SELECT address_id FROM addresses WHERE customer_id = $1 AND is_default = true LIMIT 1', [customerId]);
                    if (defaultAddr.rows.length > 0) {
                        metadata.address_id = defaultAddr.rows[0].address_id;
                    }
                }

                // Parse slot
                if (voiceParsed.delivery_slot && voiceParsed.delivery_slot.slot) {
                    metadata.slot = voiceParsed.delivery_slot.slot;
                    metadata.slot_date = voiceParsed.delivery_slot.date || 'today';
                }

                // Save metadata updates back to DB
                await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                // Check for One-Shot complete order conditions
                const cartItemsCheck = await db.query('SELECT 1 FROM cart_items WHERE cart_id = $1', [cartId]);
                if (cartItemsCheck.rows.length > 0 && metadata.address_id && metadata.slot) {
                    // Bypass stages and skip to payment select
                    metadata.stage = 'CHOOSE_PAYMENT';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    const totalRes = await db.query(`
                        SELECT SUM(v.price * ci.quantity) as subtotal
                        FROM cart_items ci
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        WHERE ci.cart_id = $1
                    `, [cartId]);
                    const subtotal = parseFloat(totalRes.rows[0].subtotal || 0);

                    // Dynamic bill details
                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;
                    
                    const summaryText = `🛒 *One-Shot Order Parsed!*\n\n` +
                        `*Subtotal:* ₹${subtotal.toFixed(2)}\n` +
                        `*Delivery Fee:* ₹${deliveryFee.toFixed(2)}\n` +
                        `*Final Total:* ₹${(subtotal + deliveryFee).toFixed(2)}\n\n` +
                        `Choose payment mode to book order:`;
                    
                    const buttons = [
                        { id: 'pay_upi', title: '💳 Pay Online' },
                        { id: 'pay_cod', title: '💵 Cash on Delivery' }
                    ];
                    await whatsappService.sendButtons(from, summaryText, buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                } else {
                    // Send cart summary and request next details
                    const totalRes = await db.query(`
                        SELECT SUM(v.price * ci.quantity) as subtotal
                        FROM cart_items ci
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        WHERE ci.cart_id = $1
                    `, [cartId]);
                    const sub = parseFloat(totalRes.rows[0].subtotal || 0);

                    let updateMsg = "";
                    if (voiceParsed.items && voiceParsed.items.length > 0) {
                        updateMsg = `✅ *Items Added to Cart!* (Subtotal: ₹${sub.toFixed(2)})`;
                    } else if (voiceParsed.address && voiceParsed.address.pincode) {
                        updateMsg = `📍 *Delivery Address Saved!* (Pincode: ${voiceParsed.address.pincode})`;
                    } else if (voiceParsed.delivery_slot && voiceParsed.delivery_slot.slot) {
                        updateMsg = `📅 *Delivery Slot Saved!* (${voiceParsed.delivery_slot.slot} on ${voiceParsed.delivery_slot.date})`;
                    } else {
                        updateMsg = `👍 *Voice instructions parsed successfully!*`;
                    }

                    await whatsappService.sendText(from, `${updateMsg}\nTo proceed with checkout, please select:`);
                    const buttons = [
                        { id: 'btn_checkout', title: '💳 Checkout Now' },
                        { id: 'btn_products', title: '🛍️ Add More' }
                    ];
                    await whatsappService.sendButtons(from, "What would you like to do next?", buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                }
            }

            // 8. BOT CHAT ROUTING (STANDARD STATE MACHINE)
            const welcomeMessages = ['hi', 'hello', 'hey', 'start', 'menu'];
            const isWelcomeIntent = type === 'text' && welcomeMessages.includes(text.toLowerCase());

            if (isNewSession || isWelcomeIntent) {
                // Clear metadata sessions
                metadata = { stage: 'START' };
                await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                const addrCheck = await db.query('SELECT 1 FROM addresses WHERE customer_id = $1 LIMIT 1', [customerId]);
                const hasAddress = addrCheck.rows.length > 0;

                let tipText = "";
                if (hasAddress) {
                    tipText = `💡 *Tip:* Since you've ordered with us before, you can place a new order by sending a voice note containing only products & timing! (e.g. "1 kg Curd kal subah 9 baje bhej do"). We'll automatically deliver to your saved address!`;
                } else {
                    tipText = `💡 *Tip:* You can place orders instantly by sending a 10-second voice note! (e.g. "Curd 500g aur 1 kg Paneer kal subah 9 baje bhandup west pin 400078 par bhej do"). Since this is your first order, please mention your delivery address & pincode in the voice note!`;
                }

                const buttons = [
                    { id: 'btn_products', title: '🛍️ View Products' },
                    { id: 'btn_orders', title: '📦 My Orders' },
                    { id: 'btn_support', title: '📞 Call Shop' }
                ];
                await whatsappService.sendButtons(from, `Welcome to *Mera Kirana*! 🏪\n\n${tipText}\n\nChoose an option to start:`, buttons);
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Button Click triggers
            if (interactive && interactive.button_reply) {
                const buttonId = interactive.button_reply.id;

                if (buttonId === 'btn_products') {
                    try {
                        const catalogId = process.env.WHATSAPP_CATALOG_ID || "5h0o9zetew";
                        await whatsappService.sendCatalog(from, "Browse our fresh catalog! 🏪", catalogId);
                    } catch (e) {
                        const phoneNumber = process.env.WHATSAPP_PHONE_ID.replace(/\D/g, '');
                        await whatsappService.sendText(from, "Browse catalog here: https://wa.me/c/" + phoneNumber);
                    }
                } else if (buttonId === 'btn_view_cart') {
                    const cartSummary = await db.query(`
                        SELECT p.base_name, v.weight_label, v.price, ci.quantity
                        FROM carts c
                        JOIN cart_items ci ON c.cart_id = ci.cart_id
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        JOIN products p ON v.product_id = p.product_id
                        WHERE c.cart_id = $1
                    `, [cartId]);

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
                        const buttons = [{ id: 'btn_products', title: '🛍️ Add More' }, { id: 'btn_view_cart', title: '🛒 Cart' }, { id: 'btn_checkout', title: '💳 Checkout' }];
                        await whatsappService.sendButtons(from, summaryText, buttons);
                    }
                } else if (buttonId === 'btn_checkout' || buttonId === 'btn_resume_checkout') {
                    // Check Minimum order values
                    const totalRes = await db.query(`
                        SELECT SUM(v.price * ci.quantity) as subtotal
                        FROM cart_items ci
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        WHERE ci.cart_id = $1
                    `, [cartId]);
                    const subtotal = parseFloat(totalRes.rows[0].subtotal || 0);

                    if (subtotal === 0) {
                        await whatsappService.sendText(from, "Your cart is empty! 🛒");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }

                    const mov = await getSetting('minimum_order_value', 150);
                    if (subtotal < mov) {
                        await whatsappService.sendText(from, `⚠️ Minimum order value is *₹${mov}*. Please add items worth *₹${(mov - subtotal).toFixed(2)}* more to checkout.`);
                        await whatsappService.markAsRead(messageId);
                        return;
                    }

                    // Prompt Order type (One-time vs Subscription)
                    metadata.stage = 'CHOOSE_ORDER_TYPE';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    const buttons = [
                        { id: 'btn_choose_one_time', title: '🛍️ One-Time Delivery' },
                        { id: 'btn_choose_subscribe', title: '🔄 Subscribe (Daily)' }
                    ];
                    await whatsappService.sendButtons(from, "Would you like this order as a one-time delivery or set up a recurring subscription?", buttons);

                } else if (buttonId === 'btn_choose_one_time') {
                    metadata.order_type = 'ONE_TIME';
                    metadata.stage = 'ADDRESS_SELECTION';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    // Check Saved addresses
                    const addressesRes = await db.query('SELECT address_id, address_text FROM addresses WHERE customer_id = $1 LIMIT 3', [customerId]);
                    if (addressesRes.rows.length === 1) {
                        const addrId = addressesRes.rows[0].address_id;
                        await sendSlotList(from, addrId, metadata, cartId);
                    } else if (addressesRes.rows.length > 1) {
                        const buttons = addressesRes.rows.map((addr) => ({
                            id: `btn_addr_select_${addr.address_id}`,
                            title: addr.address_text.substring(0, 20)
                        }));
                        buttons.push({ id: 'btn_change_addr', title: '📍 Add New Address' });
                        await whatsappService.sendButtons(from, "🏠 *Deliver to saved address?*", buttons);
                    } else {
                        const buttons = [
                            { id: 'btn_change_addr', title: '📝 Enter Address' }
                        ];
                        await whatsappService.sendButtons(from, "🏠 *Address Required* to complete delivery:", buttons);
                    }

                } else if (buttonId === 'btn_choose_subscribe') {
                    metadata.order_type = 'SUBSCRIPTION';
                    metadata.stage = 'CHOOSE_SUB_FREQUENCY';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    const buttons = [
                        { id: 'btn_freq_daily', title: 'Everyday' },
                        { id: 'btn_freq_alternate', title: 'Alternate Days' },
                        { id: 'btn_freq_weekly', title: 'Once a Week' }
                    ];
                    await whatsappService.sendButtons(from, "Select subscription frequency:", buttons);

                } else if (buttonId.startsWith('btn_freq_')) {
                    const freq = buttonId.replace('btn_freq_', '').toUpperCase();
                    metadata.frequency = freq;
                    metadata.stage = 'ADDRESS_SELECTION';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    const addressesRes = await db.query('SELECT address_id, address_text FROM addresses WHERE customer_id = $1 LIMIT 3', [customerId]);
                    if (addressesRes.rows.length === 1) {
                        const addrId = addressesRes.rows[0].address_id;
                        await sendSlotList(from, addrId, metadata, cartId);
                    } else if (addressesRes.rows.length > 1) {
                        const buttons = addressesRes.rows.map((addr) => ({
                            id: `btn_addr_select_${addr.address_id}`,
                            title: addr.address_text.substring(0, 20)
                        }));
                        buttons.push({ id: 'btn_change_addr', title: '📍 Add New' });
                        await whatsappService.sendButtons(from, "🏠 *Deliver to saved address?*", buttons);
                    } else {
                        await whatsappService.sendAddressMessage(from, "🏠 *Address Required*");
                    }

                } else if (buttonId.startsWith('btn_addr_select_')) {
                    const addrId = buttonId.replace('btn_addr_select_', '');
                    await sendSlotList(from, addrId, metadata, cartId);

                } else if (buttonId === 'btn_change_addr') {
                    await whatsappService.sendAddressMessage(from, "🏠 *Enter Delivery Address*");

                } else if (buttonId.startsWith('btn_slot_select_')) {
                    const slotName = buttonId.replace('btn_slot_select_', '');
                    metadata.slot = slotName;
                    metadata.stage = 'CHOOSE_PAYMENT';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    // Calc Order totals & fees
                    const totalRes = await db.query(`
                        SELECT SUM(v.price * ci.quantity) as subtotal
                        FROM cart_items ci
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        WHERE ci.cart_id = $1
                    `, [cartId]);
                    const subtotal = parseFloat(totalRes.rows[0].subtotal || 0);

                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;

                    const paymentText = `📋 *Order Bill Summary:*\n\n` +
                        `*Subtotal:* ₹${subtotal.toFixed(2)}\n` +
                        `*Delivery Fee:* ₹${deliveryFee.toFixed(2)}\n` +
                        `*Total:* ₹${(subtotal + deliveryFee).toFixed(2)}\n\n` +
                        `Select Payment Method:`;
                    
                    const buttons = [
                        { id: 'pay_upi', title: '💳 Pay Online' },
                        { id: 'pay_cod', title: '💵 Cash on Delivery' }
                    ];
                    await whatsappService.sendButtons(from, paymentText, buttons);

                } else if (buttonId === 'pay_upi' || buttonId === 'pay_cod') {
                    const method = buttonId === 'pay_upi' ? 'UPI' : 'COD';
                    const summary = await db.query(`
                        SELECT p.base_name, v.weight_label, v.price, ci.quantity, a.address_text
                        FROM cart_items ci
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        JOIN products p ON v.product_id = p.product_id
                        JOIN addresses a ON a.address_id = $2
                        WHERE ci.cart_id = $1
                    `, [cartId, metadata.address_id]);

                    let subtotal = 0, itemsText = "";
                    summary.rows.forEach(row => {
                        subtotal += row.price * row.quantity;
                        itemsText += `• ${row.base_name} (${row.weight_label}) x ${row.quantity}\n`;
                    });

                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    let deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;
                    
                    let finalTotal = subtotal + deliveryFee;

                    // Apply COD premium
                    if (method === 'COD') {
                        const premium = await getSetting('cod_premium', 10);
                        finalTotal += premium;
                        itemsText += `• COD Premium Fee: +₹${premium}\n`;
                    }
                    
                    // Apply online payment discount
                    if (method === 'UPI') {
                        const discountRate = await getSetting('online_discount', 5); // 5%
                        const discount = (subtotal * discountRate) / 100;
                        finalTotal -= discount;
                        itemsText += `• Online UPI Discount: -₹${discount.toFixed(2)}\n`;
                    }

                    const text = `📦 *Confirm Order Details:*\n\n` +
                        `${itemsText}` +
                        `*Final Total: ₹${finalTotal.toFixed(2)}*\n` +
                        `*Payment Mode: ${method}*\n` +
                        `*Delivery To:* ${summary.rows[0].address_text}`;

                    const buttons = [{ id: `place_${method.toLowerCase()}`, title: '✅ Place Order' }];
                    await whatsappService.sendButtons(from, text, buttons);

                } else if (buttonId.startsWith('place_')) {
                    const method = buttonId.includes('upi') ? 'UPI' : 'COD';
                    const client = await db.pool.connect();
                    
                    try {
                        await client.query('BEGIN');
                        const cartItems = await client.query(`
                            SELECT ci.variant_id, ci.quantity, v.price 
                            FROM cart_items ci 
                            JOIN product_variants v ON ci.variant_id = v.variant_id 
                            WHERE ci.cart_id = $1
                        `, [cartId]);

                        if (cartItems.rows.length === 0) {
                            await client.query('ROLLBACK');
                            await whatsappService.sendText(from, "Cart is empty! 🛒");
                            client.release();
                            return;
                        }

                        let subtotal = 0;
                        cartItems.rows.forEach(i => subtotal += (i.price * i.quantity));

                        const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                        let deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;
                        
                        let finalTotal = subtotal + deliveryFee;

                        if (method === 'COD') {
                            const premium = await getSetting('cod_premium', 10);
                            finalTotal += premium;
                        }
                        if (method === 'UPI') {
                            const discountRate = await getSetting('online_discount', 5);
                            const discount = (subtotal * discountRate) / 100;
                            finalTotal -= discount;
                        }

                        const addrRes = await client.query('SELECT address_text FROM addresses WHERE address_id = $1', [metadata.address_id]);
                        const addrText = addrRes.rows.length ? addrRes.rows[0].address_text : 'Unknown Address';

                        // 1. Create order
                        const order = await client.query(`
                            INSERT INTO orders (customer_id, total_amount, payment_method, status, delivery_slot, delivery_address_snapshot) 
                            VALUES ($1, $2, $3, $4, $5, $6) 
                            RETURNING order_id, readable_order_id
                        `, [customerId, finalTotal, method, method === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT', metadata.slot, addrText]);
                        
                        const orderId = order.rows[0].order_id;

                        // 2. Add order items
                        for (const i of cartItems.rows) {
                            await client.query(`
                                INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) 
                                VALUES ($1, $2, $3, $4, $5)
                            `, [orderId, i.variant_id, i.quantity, i.price, i.price * i.quantity]);
                        }

                        // 3. Mark salesperson commission if referred
                        const customerProfile = await client.query('SELECT referred_by_salesperson_id FROM customers WHERE customer_id = $1', [customerId]);
                        const repId = customerProfile.rows[0].referred_by_salesperson_id;
                        if (repId) {
                            const repProfile = await client.query('SELECT incentive_type, incentive_value FROM salespeople WHERE salesperson_id = $1', [repId]);
                            if (repProfile.rows.length > 0) {
                                const rep = repProfile.rows[0];
                                const commission = rep.incentive_type === 'PERCENT' ? (subtotal * rep.incentive_value) / 100 : rep.incentive_value;
                                await client.query(`
                                    INSERT INTO sales_commissions (salesperson_id, order_id, commission_amount) 
                                    VALUES ($1, $2, $3)
                                `, [repId, orderId, commission]);
                            }
                        }

                        // 4. Convert active cart
                        await client.query("UPDATE carts SET status = 'CONVERTED' WHERE cart_id = $1", [cartId]);

                        // 5. If subscription, set up subscriptions table records
                        if (metadata.order_type === 'SUBSCRIPTION') {
                            for (const i of cartItems.rows) {
                                await client.query(`
                                    INSERT INTO subscriptions (customer_id, variant_id, quantity, frequency, next_delivery_date)
                                    VALUES ($1, $2, $3, $4, CURRENT_DATE + INTERVAL '1 day')
                                `, [customerId, i.variant_id, i.quantity, metadata.frequency || 'DAILY']);
                            }
                        }

                        await client.query('COMMIT');
                        client.release();

                        // 6. Deliver confirmations
                        if (method === 'COD') {
                            await whatsappService.sendText(from, `🎉 *Order #${order.rows[0].readable_order_id} Confirmed!*\nCOD Premium applied. No returns, refunds, or cancellations are permitted on COD orders once hand-off is complete. We will deliver to: ${addrText}`);
                        } else {
                            const host = process.env.PUBLIC_URL || 'https://whatsappbot-production.up.railway.app';
                            let qrUrl = `${host}/api/orders/qr/${orderId}.png`;
                            let intentLink = `upi://pay?pa=owner@bank&am=${finalTotal.toFixed(2)}&tr=${orderId}`;
                            
                            const rzpKeyId = process.env.RAZORPAY_KEY_ID;
                            const rzpKeySecret = process.env.RAZORPAY_KEY_SECRET;
                            
                            if (rzpKeyId && rzpKeySecret) {
                                try {
                                    const axios = require('axios');
                                    const auth = Buffer.from(`${rzpKeyId}:${rzpKeySecret}`).toString('base64');
                                    const rzpResponse = await axios.post('https://api.razorpay.com/v1/payment_links', {
                                        amount: Math.round(finalTotal * 100), // amount in paise
                                        currency: "INR",
                                        accept_partial: false,
                                        reference_id: orderId,
                                        description: `Order #${order.rows[0].readable_order_id}`,
                                        customer: {
                                            contact: from
                                        },
                                        notify: {
                                            sms: false,
                                            email: false
                                        },
                                        notes: {
                                            order_id: orderId
                                        }
                                    }, {
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': `Basic ${auth}`
                                        }
                                    });
                                    
                                    if (rzpResponse.data && rzpResponse.data.short_url) {
                                        intentLink = rzpResponse.data.short_url;
                                        const qrText = encodeURIComponent(intentLink);
                                        qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${qrText}`;
                                    }
                                } catch (rzpErr) {
                                    console.error('Failed to create Razorpay payment link:', rzpErr.response?.data || rzpErr.message);
                                }
                            }
                            
                            await whatsappService.sendText(from, `⏳ *Order #${order.rows[0].readable_order_id} is Pending Payment!*`);
                            await whatsappService.sendImage(from, qrUrl, `Scan this dynamic QR Code to pay ₹${finalTotal.toFixed(2)} directly from GPay/PhonePe.`);
                            await whatsappService.sendText(from, `Or tap this direct link to pay now: ${intentLink}`);
                        }

                    } catch (error) {
                        await client.query('ROLLBACK');
                        client.release();
                        console.error('Order transaction failed:', error);
                        await whatsappService.sendText(from, "Something went wrong placing your order. Please try again.");
                    }
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Interactive list response triggers
            if (interactive && interactive.list_reply) {
                const listId = interactive.list_reply.id;
                
                if (listId === 'btn_change_addr') {
                    await whatsappService.sendAddressMessage(from, "🏠 *Enter Delivery Address*");
                    await whatsappService.markAsRead(messageId);
                    return;
                } else if (listId.startsWith('btn_slot_select_')) {
                    const slotName = listId.replace('btn_slot_select_', '');
                    metadata.slot = slotName;
                    metadata.stage = 'CHOOSE_PAYMENT';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    // Calc Order totals & fees
                    const totalRes = await db.query(`
                        SELECT SUM(v.price * ci.quantity) as subtotal
                        FROM cart_items ci
                        JOIN product_variants v ON ci.variant_id = v.variant_id
                        WHERE ci.cart_id = $1
                    `, [cartId]);
                    const subtotal = parseFloat(totalRes.rows[0].subtotal || 0);

                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;

                    const paymentText = `📋 *Order Bill Summary:*\n\n` +
                        `*Subtotal:* ₹${subtotal.toFixed(2)}\n` +
                        `*Delivery Fee:* ₹${deliveryFee.toFixed(2)}\n` +
                        `*Total:* ₹${(subtotal + deliveryFee).toFixed(2)}\n\n` +
                        `Select Payment Method:`;
                    
                    const buttons = [
                        { id: 'pay_upi', title: '💳 Pay Online' },
                        { id: 'pay_cod', title: '💵 Cash on Delivery' }
                    ];
                    await whatsappService.sendButtons(from, paymentText, buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                }
                
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
                    await db.query(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, 1) ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + 1`, [cartId, variantId]);
                    const buttons = [{ id: 'btn_products', title: '🛍️ Add More' }, { id: 'btn_view_cart', title: '🛒 Cart' }, { id: 'btn_checkout', title: '💳 Checkout' }];
                    await whatsappService.sendButtons(from, "✅ Added to Cart!", buttons);
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Interactive address message responses
            if (interactive && interactive.type === 'address_message') {
                const a = interactive.address_message;
                const pin = a.in_pin_code;

                // Validate serviceability
                const pinMaster = await db.query('SELECT 1 FROM pincode_master WHERE pincode = $1 AND is_allowed = true LIMIT 1', [pin]);
                if (pinMaster.rows.length === 0) {
                    await logDropoff(customerId, 'ADDRESS', 'UNSERVICEABLE', `Unserviceable pincode ${pin} via form`);
                    await whatsappService.sendText(from, `Uh oh! We are not delivering to pincode *${pin}* yet. Please specify another address.`);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                const addr = [a.house_number, a.building_name, a.address, a.city, pin].filter(Boolean).join(', ');
                await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [customerId]);
                const newAddr = await db.query('INSERT INTO addresses (customer_id, address_text, pincode, is_default) VALUES ($1, $2, $3, true) RETURNING address_id', [customerId, addr, pin]);
                
                metadata.address_id = newAddr.rows[0].address_id;
                metadata.stage = 'DELIVERY_SLOT_SELECTION';
                await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                // Prompt delivery slot select
                const buttons = [
                    { id: 'btn_addr_select_' + newAddr.rows[0].address_id, title: '🚚 Process Delivery Slot' }
                ];
                await whatsappService.sendButtons(from, "✅ *Address Saved!* Tap button below to choose delivery slot:", buttons);
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Normal text fallback state capture (e.g. entering address via text instead of location pin)
            if (type === 'text' && metadata.stage === 'ADDRESS_SELECTION') {
                const pinMatch = text.match(/\b\d{6}\b/);
                if (pinMatch) {
                    const pin = pinMatch[0];
                    const pinMaster = await db.query('SELECT 1 FROM pincode_master WHERE pincode = $1 AND is_allowed = true LIMIT 1', [pin]);
                    if (pinMaster.rows.length === 0) {
                        await logDropoff(customerId, 'ADDRESS', 'UNSERVICEABLE', `Unserviceable text pincode ${pin}`);
                        await whatsappService.sendText(from, `Uh oh! We are not delivering to pincode *${pin}* yet. Please type another address containing a serviceable pincode.`);
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                    
                    await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [customerId]);
                    const newAddr = await db.query('INSERT INTO addresses (customer_id, address_text, pincode, is_default) VALUES ($1, $2, $3, true) RETURNING address_id', [customerId, text, pin]);
                    
                    metadata.address_id = newAddr.rows[0].address_id;
                    metadata.stage = 'DELIVERY_SLOT_SELECTION';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    const buttons = [
                        { id: 'btn_addr_select_' + newAddr.rows[0].address_id, title: '🚚 Process Delivery Slot' }
                    ];
                    await whatsappService.sendButtons(from, "✅ *Address Saved!* Tap button below to select delivery slots:", buttons);
                } else {
                    await whatsappService.sendText(from, "Please type a full delivery address including a valid 6-digit postal pincode (e.g., 400078) so we can check serviceability.");
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Normal fallback for unrecognized text inputs
            if (type === 'text') {
                const ageMs = parseFloat(lastLogRes.rows[0]?.age_ms || 99999999);
                const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
                
                if (metadata.stage && metadata.stage !== 'START' && ageMs < ONE_DAY_IN_MS) {
                    const buttons = [
                        { id: 'btn_resume_checkout', title: '🚀 Resume Checkout' },
                        { id: 'btn_products', title: '🛍️ Browse Products' }
                    ];
                    await whatsappService.sendButtons(from, `👋 We noticed you have an active order draft in progress!\n\nWould you like to resume checkout or browse the catalog to add more items?`, buttons);
                } else {
                    metadata = { stage: 'START' };
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    const buttons = [
                        { id: 'btn_products', title: '🛍️ Browse Products' },
                        { id: 'btn_orders', title: '📦 My Orders' }
                    ];
                    await whatsappService.sendButtons(from, `Welcome to *Mera Kirana*! 🏪\n\nI couldn't quite catch that. Tap below to browse products or view orders:`, buttons);
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

        } catch (error) {
            console.error('Error processing message:', error);
        }
    } else if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.statuses) {
        console.log('Status update received - Ignoring');
    }
});

module.exports = router;
