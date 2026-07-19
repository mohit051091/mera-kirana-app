const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsapp');
const db = require('../database/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logError } = require('../services/logger');
const axios = require('axios');

// RAM Cache for active users to skip DB lookups for 24 hours.
const sessionCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;
const activeUserLocks = new Set();

// Helper: load config settings from DB with fallbacks
async function getSetting(key, defaultValue) {
    try {
        const res = await db.query('SELECT value FROM system_settings WHERE key = $1', [key]);
        return res.rows.length ? res.rows[0].value : defaultValue;
    } catch (e) {
        logError(e, `getSetting_${key}`);
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
        logError(e, 'logDropoff');
    }
}

// Helper: get Ogg Opus audio duration from buffer
function getOggOpusDuration(buffer) {
    const OGG_S = Buffer.from('OggS');
    let lastPageOffset = -1;
    for (let i = buffer.length - 4; i >= 0; i--) {
        if (buffer[i] === OGG_S[0] && 
            buffer[i+1] === OGG_S[1] && 
            buffer[i+2] === OGG_S[2] && 
            buffer[i+3] === OGG_S[3]) {
            lastPageOffset = i;
            break;
        }
    }
    if (lastPageOffset === -1) throw new Error("Invalid Ogg file: No OggS found");
    const granulePosition = buffer.readBigInt64LE(lastPageOffset + 6);
    const sampleRate = 48000n;
    return Number(granulePosition) / Number(sampleRate);
}

// Helper: calculate cart subtotal with voice cost markup
async function getCartSubtotal(cartId) {
    const totalRes = await db.query(`
        SELECT SUM(v.price * ci.quantity) as subtotal
        FROM cart_items ci
        JOIN product_variants v ON ci.variant_id = v.variant_id
        WHERE ci.cart_id = $1
    `, [cartId]);
    const raw = parseFloat(totalRes.rows[0].subtotal || 0);
    const markup = parseFloat(await getSetting('voice_cost_markup', 2));
    return parseFloat((raw * (1 + markup / 100)).toFixed(2));
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

    const TRANSLATIONS = {
        WELCOME: {
            EN: `Welcome to *Mera Kirana*! 🏪\n\nChoose an option to start:`,
            HI: `*मेरा किराना* में आपका स्वागत है! 🏪\n\nशुरू करने के लिए एक विकल्प चुनें:`,
            MR: `*मेरा किराना* मध्ये आपले स्वागत आहे! 🏪\n\nसुरू करण्यासाठी एक पर्याय निवडा:`
        },
        TIP_REPEAT: {
            EN: `💡 *Tip:* You can repeat your last order instantly! Tap below or send a voice note.`,
            HI: `💡 *सुझाव:* आप अपने पिछले ऑर्डर को तुरंत दोहरा सकते हैं! नीचे टैप करें या वॉइस नोट भेजें।`,
            MR: `💡 *टीप:* तुम्ही तुमची शेवटची ORDER त्वरित पुन्हा करू शकता! खाली टॅप करा किंवा व्हॉइस नोट पाठवा.`
        },
        TIP_NEW: {
            EN: `💡 *Tip:* You can place orders instantly by sending a voice note! (e.g. "Curd 500g and 1 kg Paneer tomorrow morning"). Since this is your first order, please mention your delivery address & pincode.`,
            HI: `💡 *सुझाव:* आप वॉइस नोट भेजकर तुरंत ऑर्डर कर सकते हैं! (जैसे "500 ग्राम दही और 1 किलो पनीर कल सुबह")। चूंकि यह आपका पहला ऑर्डर है, कृपया अपना पता और पिनकोड बताएं।`,
            MR: `💡 *टीप:* तुम्ही व्हॉइस नोट पाठवून त्वरित ऑर्डर करू शकता! (उदा. "500 ग्रॅम दही आणि 1 किलो पनीर उद्या सकाळी"). ही तुमची पहिली ORDER असल्याने, कृपया तुमचा पत्ता आणि पिनकोड सांगा.`
        },
        BTN_VIEW_PRODUCTS: {
            EN: "🛍️ View Products",
            HI: "🛍️ उत्पाद देखें",
            MR: "🛍️ उत्पादने पहा"
        },
        BTN_MY_ORDERS: {
            EN: "📦 My Orders",
            HI: "📦 मेरे ऑर्डर",
            MR: "📦 माझे ऑर्डर"
        },
        BTN_CALL_SHOP: {
            EN: "📞 Call Shop",
            HI: "📞 दुकान पर कॉल करें",
            MR: "📞 दुकानाला कॉल करा"
        },
        BTN_SUBSCRIPTIONS: {
            EN: "📅 Subscriptions",
            HI: "📅 सदस्यता",
            MR: "📅 वर्गणी"
        },
        CART_EMPTY: {
            EN: "Your cart is empty! 🛒",
            HI: "आपकी कार्ट खाली है! 🛒",
            MR: "तुमची कार्ट रिकामी आहे! 🛒"
        },
        MIN_ORDER_WARN: {
            EN: "⚠️ Minimum order value is *₹$MOV*. Please add items worth *₹$DIFF* more to checkout.",
            HI: "⚠️ न्यूनतम ऑर्डर मूल्य *₹$MOV* है। चेकआउट करने के लिए कृपया *₹$DIFF* मूल्य के आइटम और जोड़ें।",
            MR: "⚠️ किमान ऑर्डर मूल्य *₹$MOV* आहे. चेकआउट करण्यासाठी कृपया आणखी *₹$DIFF* किमतीच्या वस्तू जोडा."
        },
        BILL_SUMMARY: {
            EN: `📋 *Order Bill Summary:*\n\n` +
                `*Subtotal:* ₹$SUB\n` +
                `*Delivery Fee:* ₹$DEL\n` +
                `*Total:* ₹$TOT\n\n` +
                `Select Payment Method:`,
            HI: `📋 *ऑर्डर बिल सारांश:*\n\n` +
                `*उप-योग (Subtotal):* ₹$SUB\n` +
                `*डिलिवरी शुल्क:* ₹$DEL\n` +
                `*कुल योग (Total):* ₹$TOT\n\n` +
                `भुगतान विधि चुनें:`,
            MR: `📋 *ऑर्डर बिल सारांश:*\n\n` +
                `*उप-एकूण (Subtotal):* ₹$SUB\n` +
                `*डिलिवरी शुल्क:* ₹$DEL\n` +
                `*एकूण (Total):* ₹$TOT\n\n` +
                `पेमेंट पद्धत निवडा:`
        },
        BTN_PAY_ONLINE: {
            EN: "💳 Pay Online",
            HI: "💳 ऑनलाइन भुगतान",
            MR: "💳 ऑनलाईन पेमेंट"
        },
        BTN_PAY_COD: {
            EN: "💵 Cash on Delivery",
            HI: "💵 कैश ऑन डिलीवरी",
            MR: "💵 कॅश ऑन डिलिव्हरी"
        },
        FALLBACK: {
            EN: `Welcome to *Mera Kirana*! 🏪\n\nI couldn't quite catch that. Tap below to browse products or view orders:`,
            HI: `*मेरा किराना* में आपका स्वागत है! 🏪\n\nमुझे ठीक से समझ नहीं आया। उत्पादों को देखने या अपने ऑर्डर देखने के लिए नीचे टैप करें:`,
            MR: `*मेरा किराना* मध्ये आपले स्वागत आहे! 🏪\n\nमला नीट समजले नाही. उत्पादने पाहण्यासाठी किंवा तुमच्या ऑर्डर्स पाहण्यासाठी खाली टॅप करा:`
        },
        DRAFT_PROMPT: {
            EN: `👋 We noticed you have an active order draft in progress!\n\nWould you like to resume checkout or browse the catalog to add more items?`,
            HI: `👋 हमें लगा कि आपका एक ऑर्डर ड्राफ्ट अभी प्रगति पर है!\n\nक्या आप चेकआउट फिर से शुरू करना चाहेंगे या अधिक आइटम जोड़ने के लिए उत्पाद देखना चाहेंगे?`,
            MR: `👋 आमच्या लक्षात आले की तुमची एक ORDER मसुदा सध्या प्रगतीपथावर आहे!\n\nतुम्ही चेकआउट पुन्हा सुरू करू इच्छिता की अधिक वस्तू जोडण्यासाठी उत्पादने पाहू इच्छिता?`
        },
        BTN_RESUME: {
            EN: "🚀 Resume Checkout",
            HI: "🚀 चेकआउट जारी रखें",
            MR: "🚀 चेकआउट सुरू ठेवा"
        },
        WELCOME_BACK: {
            EN: `Welcome back to *Mera Kirana*! 🏪\n\n$SUMMARY\n\nOr choose an option below:`,
            HI: `*मेरा किराना* में आपका पुनः स्वागत है! 🏪\n\n$SUMMARY\n\nया नीचे एक विकल्प चुनें:`,
            MR: `*मेरा किराना* मध्ये आपले पुन्हा स्वागत आहे! 🏪\n\n$SUMMARY\n\nकिंवा खालील पर्याय निवडा:`
        },
        REPEAT_HEADER: {
            EN: `🔄 *Repeat Last Order?* (Order #$ID)\n`,
            HI: `🔄 *पिछला ऑर्डर दोहराएं?* (ऑर्डर #$ID)\n`,
            MR: `🔄 *शेवटची ऑर्डर पुन्हा करायची?* (ऑर्डर #$ID)\n`
        },
        BTN_REPEAT_TITLE: {
            EN: "🔄 Repeat Last Order",
            HI: "🔄 पिछला ऑर्डर",
            MR: "🔄 शेवटची ऑर्डर"
        }
    };

    if (!body.object) return;

    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        if (activeUserLocks.has(from)) {
            console.log(`[CONCURRENCY LOCK] Request for ${from} is already in progress. Skipping to prevent race conditions.`);
            return;
        }
        activeUserLocks.add(from);

        try {
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
            } else {
                // Unsupported message formats (location, image, sticker, document, contact)
                console.log(`Unsupported message type "${type}" from ${from}, sending voice note and button fallbacks.`);
                
                const fallbackAudioUrl = await getSetting('unsupported_format_audio_url', 'https://github.com/mohit051091/mera-kirana-app/raw/main/assets/unsupported_warning.ogg');
                try {
                    await whatsappService.sendAudio(from, fallbackAudioUrl);
                } catch (audioErr) {
                    logError(audioErr, 'send_fallback_audio_failed');
                }

                const buttons = [
                    { id: 'btn_products', title: '🛍️ Browse Products' },
                    { id: 'btn_orders', title: '📦 My Orders' },
                    { id: 'btn_talk_to_owner', title: '🤝 Talk to Owner' }
                ];
                await whatsappService.sendButtons(
                    from, 
                    "Choose an option below to continue:",
                    buttons
                );
                
                await whatsappService.markAsRead(messageId);
                return;
            }

            console.log(`Message from ${from}: "${text || (audioId ? 'Voice Note' : 'Media')}" [${type}] ID: ${messageId}`);

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
                RETURNING customer_id, dnd_active, language
            `, [from, 'WhatsApp User']);
            
            customerId = upsertCust.rows[0].customer_id;
            dndActive = upsertCust.rows[0].dnd_active;
            let userLang = upsertCust.rows[0].language || 'EN';

            // 2.1 Language Selection Trigger Check
            const cleanText = (text || '').trim().toUpperCase();
            if (type === 'text' && ['HINDI', 'MARATHI', 'ENGLISH'].includes(cleanText)) {
                userLang = cleanText === 'HINDI' ? 'HI' : (cleanText === 'MARATHI' ? 'MR' : 'EN');
                await db.query('UPDATE customers SET language = $1 WHERE customer_id = $2', [userLang, customerId]);
                
                const confirmations = {
                    EN: "Language updated to English. How can I help you today?",
                    HI: "भाषा बदलकर हिंदी कर दी गई है। आज मैं आपकी क्या सहायता कर सकता हूँ?",
                    MR: "भाषा बदलून मराठी करण्यात आली आहे. आज मी आपली काय मदत करू शकतो?"
                };
                await whatsappService.sendText(from, confirmations[userLang]);
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Human handoff stage check
            const cartResTemp = await db.query("SELECT cart_id, session_metadata FROM carts WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1", [customerId]);
            let isHandoff = false;
            let cartIdTemp = null;
            let metadataTemp = {};
            if (cartResTemp.rows.length > 0) {
                cartIdTemp = cartResTemp.rows[0].cart_id;
                metadataTemp = cartResTemp.rows[0].session_metadata || {};
                if (metadataTemp.stage === 'HUMAN_HANDOFF') {
                    isHandoff = true;
                }
            }

            if (isHandoff) {
                if (type === 'text' && text && text.trim().toUpperCase() === 'START') {
                    metadataTemp.stage = 'START';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadataTemp, cartIdTemp]);
                    await whatsappService.sendText(from, "🤖 *Automation Resumed!* You can now browse our catalog or send a voice note.");
                    await whatsappService.markAsRead(messageId);
                    return;
                } else {
                    console.log(`User ${from} is in HUMAN_HANDOFF. Ignoring bot response.`);
                    await whatsappService.markAsRead(messageId);
                    return;
                }
            }

            // Trigger stop command if button clicked or text is 'STOP'
            const isStopCmd = (type === 'text' && text.trim().toUpperCase() === 'STOP') || 
                              (interactive && interactive.button_reply && interactive.button_reply.id === 'btn_dnd_stop');
            if (isStopCmd) {
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

            // Human handoff text command trigger
            if (type === 'text' && text && (text.trim().toUpperCase() === 'TALK TO OWNER' || text.trim().toUpperCase() === 'TALK TO AGENT' || text.trim().toUpperCase() === 'SUPPORT')) {
                let tempCart = await db.query("SELECT cart_id, session_metadata FROM carts WHERE customer_id = $1 AND status = 'ACTIVE' LIMIT 1", [customerId]);
                let tempCartId = null;
                let tempMetadata = {};
                if (tempCart.rows.length > 0) {
                    tempCartId = tempCart.rows[0].cart_id;
                    tempMetadata = tempCart.rows[0].session_metadata || {};
                } else {
                    const newCart = await db.query('INSERT INTO carts (customer_id) VALUES ($1) RETURNING cart_id', [customerId]);
                    tempCartId = newCart.rows[0].cart_id;
                }
                
                tempMetadata.stage = 'HUMAN_HANDOFF';
                await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [tempMetadata, tempCartId]);
                await whatsappService.sendText(from, "🤝 *Human Handoff Active*\n\nI have paused automatic replies and alerted the store owner. An agent will reply to you directly here shortly.\n\n*To resume automatic bot ordering at any time, just type START.*");
                await whatsappService.markAsRead(messageId);
                return;
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
                // 6.1 Check Rate Limits
                const hourlyLimit = await getSetting('voice_rate_limit_hourly', 3);
                const dailyLimit = await getSetting('voice_rate_limit_daily', 10);
                
                const nowTime = new Date();
                const oneHourAgo = new Date(nowTime.getTime() - 60 * 60 * 1000);
                const oneDayAgo = new Date(nowTime.getTime() - 24 * 60 * 60 * 1000);
                
                const hourlyCountRes = await db.query(`
                    SELECT COUNT(*) as count 
                    FROM conversation_logs 
                    WHERE customer_phone = $1 
                      AND message_type = 'incoming' 
                      AND processing_type = 'voice'
                      AND created_at >= $2
                `, [from, oneHourAgo]);
                
                const dailyCountRes = await db.query(`
                    SELECT COUNT(*) as count 
                    FROM conversation_logs 
                    WHERE customer_phone = $1 
                      AND message_type = 'incoming' 
                      AND processing_type = 'voice'
                      AND created_at >= $2
                `, [from, oneDayAgo]);
                
                const hourlyCount = parseInt(hourlyCountRes.rows[0].count);
                const dailyCount = parseInt(dailyCountRes.rows[0].count);
                
                if (hourlyCount >= hourlyLimit) {
                    await whatsappService.sendText(from, `⚠️ *Limit Exceeded*\n\nYou have sent too many voice notes recently. Please type your message instead, or try again in an hour.`);
                    await whatsappService.markAsRead(messageId);
                    return;
                }
                
                if (dailyCount >= dailyLimit) {
                    await whatsappService.sendText(from, `⚠️ *Limit Exceeded*\n\nYou have hit your daily limit of ${dailyLimit} voice orders. Please use text messaging to place your order.`);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                // 6.2 Check duplicate hash de-duplication
                const sha256 = msg.audio ? msg.audio.sha256 : null;
                if (sha256) {
                    const recentDuplicateRes = await db.query(`
                        SELECT 1 
                        FROM conversation_logs 
                        WHERE customer_phone = $1 
                          AND created_at > NOW() - INTERVAL '1 minute'
                          AND metadata->'audio'->>'sha256' = $2
                        LIMIT 1
                    `, [from, sha256]);
                    
                    if (recentDuplicateRes.rowCount > 0) {
                        console.log(`Duplicate voice note hash detected from ${from}, skipping.`);
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                }

                // Download audio file
                console.log(`Downloading voice note media ID: ${audioId}`);
                const { buffer, mimeType } = await whatsappService.downloadMedia(audioId);

                // 6.3 Duration check
                let durationSecs = 0;
                try {
                    durationSecs = getOggOpusDuration(buffer);
                    console.log(`Audio file duration: ${durationSecs} seconds`);
                } catch (durErr) {
                    console.warn('Could not parse audio duration from buffer:', durErr.message);
                }

                const durationCap = await getSetting('voice_duration_cap', 30);
                if (durationSecs > durationCap) {
                    await whatsappService.sendText(from, `⚠️ *Voice Note Too Long*\n\nPlease keep your voice notes under ${durationCap} seconds.`);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                // Try Sarvam Saaras v3 STT first
                let rawTranscript = null;
                const sarvamKey = process.env.SARVAM_API_KEY;
                const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
                
                if (sarvamKey) {
                    try {
                        console.log('Sending audio to Sarvam Saaras v3 REST API...');
                        const formData = new FormData();
                        const blob = new Blob([buffer], { type: mimeType });
                        formData.append('file', blob, 'audio.ogg');
                        formData.append('model', 'saaras:v3');
                        formData.append('language_code', 'unknown'); // Auto-detect
                        formData.append('mode', 'translate'); // Translate to English text
                        
                        const sarvamRes = await axios.post('https://api.sarvam.ai/speech-to-text', formData, {
                            headers: {
                                'api-subscription-key': sarvamKey
                            }
                        });
                        rawTranscript = sarvamRes.data.transcript;
                        console.log('Sarvam transcription output:', rawTranscript);
                    } catch (sarvamErr) {
                        logError(sarvamErr, 'Sarvam_STT_API_failed');
                    }
                }

                // Fallback to Gemini if Sarvam is not configured or fails
                if (!rawTranscript && geminiKey) {
                    try {
                        console.log('Falling back to Gemini for direct speech transcription...');
                        const genAI = new GoogleGenerativeAI(geminiKey);
                        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
                        const prompt = "Transcribe this audio recording verbatim. Translate any Hindi or Marathi terms into standard English text.";
                        const geminiRes = await model.generateContent([
                            {
                                inlineData: {
                                    data: buffer.toString("base64"),
                                    mimeType: mimeType
                                }
                            },
                            { text: prompt }
                        ]);
                        rawTranscript = geminiRes.response.text();
                        console.log('Gemini transcription output:', rawTranscript);
                    } catch (geminiErr) {
                        logError(geminiErr, 'Gemini_STT_fallback_failed');
                    }
                }

                if (!rawTranscript) {
                    await whatsappService.sendText(from, "Sorry, I couldn't transcribe your voice note. Please try again or type your message.");
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                // Step 2: Use Gemini to parse rawTranscript into JSON schema
                if (geminiKey) {
                    try {
                        const genAI = new GoogleGenerativeAI(geminiKey);
                        const model = genAI.getGenerativeModel({
                            model: "gemini-2.5-flash",
                            generationConfig: { responseMimeType: "application/json" }
                        });
                        
                        const systemPrompt = `
You are a structured parser for a kirana dairy shop. You extract order items, addresses, and delivery slot details from customer voice messages.
You MUST output a raw JSON object matching this schema ONLY.

{
  "items": [{"name": "string", "quantity": "number"}],
  "address": {"street": "string", "pincode": "string"},
  "delivery_slot": {"date": "string", "slot": "string"}
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
`;
                        const response = await model.generateContent([
                            { text: rawTranscript },
                            { text: systemPrompt }
                        ]);
                        voiceParsed = JSON.parse(response.response.text());
                        console.log('Gemini voice structural extraction results:', voiceParsed);
                    } catch (structErr) {
                        logError(structErr, 'Gemini_structural_extraction_failed');
                    }
                }
                
                if (!voiceParsed) {
                    await whatsappService.sendText(from, "Sorry, I couldn't process your voice order. Please try again or type your message.");
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
                        // Resolve variant in database using fuzzy/wildcard match
                        const query = `
                            SELECT pv.variant_id 
                            FROM product_variants pv
                            JOIN products p ON pv.product_id = p.product_id
                            WHERE p.base_name ILIKE '%' || $1 || '%' AND pv.is_active = true
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
                
                const subtotal = await getCartSubtotal(cartId);
                const mov = await getSetting('minimum_order_value', 150);

                if (cartItemsCheck.rows.length > 0 && metadata.address_id && metadata.slot && subtotal >= mov) {
                    // Bypass stages and skip to payment select
                    metadata.stage = 'CHOOSE_PAYMENT';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
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
                } else if (cartItemsCheck.rows.length > 0 && subtotal < mov) {
                    // Below MOV threshold, alert customer and offer manual checkout flow helper
                    await whatsappService.sendText(from, `⚠️ Your voice order subtotal (₹${subtotal.toFixed(2)}) is below the Minimum Order Value of *₹${mov}*. Please add items worth *₹${(mov - subtotal).toFixed(2)}* more to checkout.`);
                    const buttons = [
                        { id: 'btn_products', title: '🛍️ Add More' },
                        { id: 'btn_view_cart', title: '🛒 View Cart' }
                    ];
                    await whatsappService.sendButtons(from, "What would you like to do next?", buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                } else {
                    // Send cart summary and request next details
                    let updateMsg = "";
                    if (voiceParsed.items && voiceParsed.items.length > 0) {
                        updateMsg = `✅ *Items Added to Cart!* (Subtotal: ₹${subtotal.toFixed(2)})`;
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

                const lastOrderQuery = await db.query(`
                    SELECT o.order_id, o.total_amount, o.readable_order_id,
                      COALESCE(
                        json_agg(
                          json_build_object(
                            'base_name', p.base_name,
                            'weight_label', pv.weight_label,
                            'quantity', oi.quantity
                          )
                        ) FILTER (WHERE oi.order_item_id IS NOT NULL),
                        '[]'
                      ) as items
                    FROM orders o
                    JOIN order_items oi ON o.order_id = oi.order_id
                    JOIN product_variants pv ON oi.variant_id = pv.variant_id
                    JOIN products p ON pv.product_id = p.product_id
                    WHERE o.customer_id = $1 AND o.status IN ('CONFIRMED', 'DELIVERED')
                    GROUP BY o.order_id, o.total_amount, o.readable_order_id, o.created_at
                    ORDER BY o.created_at DESC
                    LIMIT 1
                `, [customerId]);

                const hasLastOrder = lastOrderQuery.rows.length > 0;

                if (hasLastOrder) {
                    const lastOrder = lastOrderQuery.rows[0];
                    let repeatSummary = TRANSLATIONS.REPEAT_HEADER[userLang].replace('$ID', lastOrder.readable_order_id);
                    lastOrder.items.forEach(item => {
                        repeatSummary += `• ${item.base_name} (${item.weight_label}) x ${item.quantity}\n`;
                    });
                    const totalLabel = userLang === 'HI' ? 'कुल योग' : (userLang === 'MR' ? 'एकूण' : 'Total');
                    repeatSummary += `${totalLabel}: *₹${parseFloat(lastOrder.total_amount).toFixed(2)}*`;

                    const buttons = [
                        { id: `btn_repeat_last_${lastOrder.order_id}`, title: TRANSLATIONS.BTN_REPEAT_TITLE[userLang] },
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_view_subscriptions', title: TRANSLATIONS.BTN_SUBSCRIPTIONS[userLang] }
                    ];
                    const welcomeBackMsg = TRANSLATIONS.WELCOME_BACK[userLang].replace('$SUMMARY', repeatSummary);
                    await whatsappService.sendButtons(from, welcomeBackMsg, buttons);
                } else {
                    const addrCheck = await db.query('SELECT 1 FROM addresses WHERE customer_id = $1 LIMIT 1', [customerId]);
                    const hasAddress = addrCheck.rows.length > 0;
                    let tipText = "";
                    if (hasAddress) {
                        tipText = TRANSLATIONS.TIP_REPEAT[userLang];
                    } else {
                        tipText = TRANSLATIONS.TIP_NEW[userLang];
                    }

                    const buttons = [
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] },
                        { id: 'btn_view_subscriptions', title: TRANSLATIONS.BTN_SUBSCRIPTIONS[userLang] }
                    ];
                    
                    const welcomeMsg = userLang === 'EN' 
                        ? `Welcome to *Mera Kirana*! 🏪\n\n${tipText}\n\nChoose an option to start:`
                        : (userLang === 'HI' 
                            ? `*मेरा किराना* में आपका स्वागत है! 🏪\n\n${tipText}\n\nशुरू करने के लिए एक विकल्प चुनें:` 
                            : `*मेरा किराना* मध्ये आपले स्वागत आहे! 🏪\n\n${tipText}\n\nसुरू करण्यासाठी एक पर्याय निवडा:`);

                    await whatsappService.sendButtons(from, welcomeMsg, buttons);
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

            if (interactive && interactive.button_reply) {
                const buttonId = interactive.button_reply.id;

                if (buttonId === 'btn_view_subscriptions') {
                    const subsQuery = await db.query(`
                        SELECT s.subscription_id, s.quantity, s.frequency, s.status, pv.weight_label, p.base_name
                        FROM subscriptions s
                        JOIN product_variants pv ON s.variant_id = pv.variant_id
                        JOIN products p ON pv.product_id = p.product_id
                        WHERE s.customer_id = $1
                    `, [customerId]);

                    if (subsQuery.rows.length === 0) {
                        const welcomeText = userLang === 'HI' 
                            ? "📅 *आपकी कोई सक्रिय सदस्यता नहीं है।*\n\nक्या आप दूध या दही की दैनिक डिलीवरी शुरू करना चाहते हैं?"
                            : (userLang === 'MR' 
                                ? "📅 *तुमची कोणतीही सक्रिय वर्गणी नाही.*\n\nतुम्ही दूध किंवा दहीची दैनिक डिलिव्हरी सुरू करू इच्छिता?" 
                                : "📅 *You have no active subscription schedules.*\n\nWould you like to set up repeating daily deliveries of dairy items?");
                        
                        const newTitle = userLang === 'HI' ? '🆕 नई सदस्यता' : (userLang === 'MR' ? '🆕 नवीन वर्गणी' : '🆕 New Subscription');
                        const buttons = [
                            { id: 'btn_sub_new', title: newTitle },
                            { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] }
                        ];
                        await whatsappService.sendButtons(from, welcomeText, buttons);
                    } else {
                        let summary = userLang === 'HI' ? "📅 *आपकी सदस्यताएँ:*\n\n" : (userLang === 'MR' ? "📅 *तुमच्या वर्गणी:*\n\n" : "📅 *Your Subscriptions:*\n\n");
                        subsQuery.rows.forEach((sub, idx) => {
                            const statusStr = sub.status === 'ACTIVE' 
                                ? (userLang === 'HI' ? 'सक्रिय' : (userLang === 'MR' ? 'सक्रिय' : 'Active'))
                                : (userLang === 'HI' ? 'रुका हुआ' : (userLang === 'MR' ? 'थांबवले' : 'Paused'));
                            summary += `*${idx + 1}.* ${sub.base_name} (${sub.weight_label}) x ${sub.quantity} [${sub.frequency}] - Status: *${statusStr}*\n`;
                        });
                        summary += userLang === 'HI' ? "\nनीचे दी गई किसी सदस्यता को प्रबंधित करें:" : (userLang === 'MR' ? "\nखालीलपैकी कोणतीही वर्गणी व्यवस्थापित करा:" : "\nManage any of your subscriptions below:");

                        const sub = subsQuery.rows[0];
                        const buttons = [];
                        if (sub.status === 'ACTIVE') {
                            const pauseLabel = userLang === 'HI' ? '⏸️ रोकें' : (userLang === 'MR' ? '⏸️ थांबवा' : '⏸️ Pause');
                            buttons.push({ id: `btn_sub_pause_${sub.subscription_id}`, title: `${pauseLabel} (${sub.base_name.substring(0,6)})` });
                        } else {
                            const resumeLabel = userLang === 'HI' ? '▶️ शुरू करें' : (userLang === 'MR' ? '▶️ सुरू करा' : '▶️ Resume');
                            buttons.push({ id: `btn_sub_resume_${sub.subscription_id}`, title: `${resumeLabel} (${sub.base_name.substring(0,6)})` });
                        }
                        const cancelLabel = userLang === 'HI' ? '❌ रद्द करें' : (userLang === 'MR' ? '❌ रद्द करा' : '❌ Cancel');
                        buttons.push({ id: `btn_sub_cancel_${sub.subscription_id}`, title: `${cancelLabel} (${sub.base_name.substring(0,6)})` });
                        
                        const newTitle = userLang === 'HI' ? '🆕 नई जोड़ें' : (userLang === 'MR' ? '🆕 नवीन जोडा' : '🆕 Add New');
                        buttons.push({ id: 'btn_sub_new', title: newTitle });
                        
                        await whatsappService.sendButtons(from, summary, buttons);
                    }
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_sub_pause_')) {
                    const subId = buttonId.replace('btn_sub_pause_', '');
                    await db.query("UPDATE subscriptions SET status = 'PAUSED' WHERE subscription_id = $1", [subId]);
                    const text = userLang === 'HI' 
                        ? "⏸️ आपकी डिलीवरी रोक दी गई है। आप इसे कभी भी शुरू कर सकते हैं!"
                        : (userLang === 'MR' ? "⏸️ तुमची डिलिव्हरी थांबवली गेली आहे. तुम्ही कधीही सुरू करू शकता!" : "⏸️ Delivery schedule paused. You can resume at any time!");
                    await whatsappService.sendText(from, text);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_sub_resume_')) {
                    const subId = buttonId.replace('btn_sub_resume_', '');
                    await db.query("UPDATE subscriptions SET status = 'ACTIVE' WHERE subscription_id = $1", [subId]);
                    const text = userLang === 'HI' 
                        ? "▶️ आपकी डिलीवरी फिर से शुरू कर दी गई है!"
                        : (userLang === 'MR' ? "▶️ तुमची डिलिव्हरी पुन्हा सुरू झाली आहे!" : "▶️ Delivery schedule resumed successfully!");
                    await whatsappService.sendText(from, text);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_sub_cancel_')) {
                    const subId = buttonId.replace('btn_sub_cancel_', '');
                    await db.query("DELETE FROM subscriptions WHERE subscription_id = $1", [subId]);
                    const text = userLang === 'HI' 
                        ? "❌ आपकी सदस्यता सफलतापूर्वक रद्द कर दी गई है।"
                        : (userLang === 'MR' ? "❌ तुमची वर्गणी यशस्वीरित्या रद्द करण्यात आली आहे." : "❌ Subscription schedule cancelled and deleted successfully.");
                    await whatsappService.sendText(from, text);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId === 'btn_sub_new') {
                    const variantsRes = await db.query(`
                        SELECT pv.variant_id, pv.weight_label, pv.price, p.base_name
                        FROM product_variants pv
                        JOIN products p ON pv.product_id = p.product_id
                        WHERE pv.is_active = true AND p.is_active = true
                        ORDER BY p.base_name ASC, pv.price ASC
                    `);
                    
                    const rows = variantsRes.rows.map(v => ({
                        id: `sub_select_var_${v.variant_id}`,
                        title: `${v.base_name} (${v.weight_label})`.substring(0, 24),
                        description: `₹${v.price} / delivery`
                    }));
                    
                    const sections = [
                        {
                            title: userLang === 'HI' ? "दूध और डेयरी उत्पाद" : (userLang === 'MR' ? "दूध आणि डेअरी उत्पादने" : "Dairy Products"),
                            rows: rows
                        }
                    ];
                    
                    const listBody = userLang === 'HI' 
                        ? "कृपया उस उत्पाद का चयन करें जिसे आप नियमित रूप से डिलीवर करवाना चाहते हैं:" 
                        : (userLang === 'MR' ? "कृपया नियमितपणे डिलिव्हर करू इच्छित असलेले उत्पादन निवडा:" : "Please select the product you would like to have delivered regularly:");
                    
                    const listTitle = userLang === 'HI' ? "उत्पाद चुनें" : (userLang === 'MR' ? "उत्पादन निवडा" : "Choose Product");
                    
                    await whatsappService.sendList(from, listTitle, listBody, listTitle, sections);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_sub_freq_')) {
                    const frequency = buttonId.replace('btn_sub_freq_', '');
                    const variantId = metadata.sub_variant_id;
                    
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const dateStr = tomorrow.toISOString().split('T')[0];
                    
                    await db.query(`
                        INSERT INTO subscriptions (customer_id, variant_id, quantity, frequency, status, next_delivery_date)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [customerId, variantId, 1, frequency, 'ACTIVE', dateStr]);
                    
                    metadata.stage = 'START';
                    metadata.sub_variant_id = null;
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    const successText = userLang === 'HI'
                        ? `🎉 *सदस्यता सफल!*\n\nआपकी आवर्ती डिलीवरी सफलतापूर्वक सेट हो गई है। पहली डिलीवरी कल होगी!`
                        : (userLang === 'MR'
                            ? `🎉 *वर्गणी यशस्वी!*\n\nतुमची डिलिव्हरी यशस्वीरित्या सेट केली गेली आहे. पहिली डिलिव्हरी उद्या होईल!`
                            : `🎉 *Subscription Created Successfully!*\n\nYour recurring shipment has been set up. Your first delivery is scheduled for tomorrow!`);
                            
                    await whatsappService.sendText(from, successText);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_repeat_last_')) {
                    const lastOrderId = buttonId.replace('btn_repeat_last_', '');
                    const oldOrderQuery = await db.query('SELECT * FROM orders WHERE order_id = $1 LIMIT 1', [lastOrderId]);
                    if (oldOrderQuery.rows.length === 0) {
                        await whatsappService.sendText(from, "Could not find your last order. Please browse catalog.");
                        return;
                    }
                    const oldOrder = oldOrderQuery.rows[0];
                    const oldItemsQuery = await db.query(`
                        SELECT oi.variant_id, oi.quantity, oi.unit_price, pv.weight_label, p.base_name
                        FROM order_items oi
                        JOIN product_variants pv ON oi.variant_id = pv.variant_id
                        JOIN products p ON pv.product_id = p.product_id
                        WHERE oi.order_id = $1
                    `, [lastOrderId]);
                    
                    await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
                    let subtotal = 0;
                    let summary = "🔄 *Repeat Last Order Summary:*\n\n";
                    for (const item of oldItemsQuery.rows) {
                        await db.query(
                            'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)',
                            [cartId, item.variant_id, item.quantity]
                        );
                        const itemSub = parseFloat(item.unit_price) * parseInt(item.quantity);
                        subtotal += itemSub;
                        summary += `• ${item.base_name} (${item.weight_label}) x ${item.quantity} = *₹${itemSub.toFixed(2)}*\n`;
                    }
                    
                    metadata = { 
                        stage: 'CHOOSE_PAYMENT',
                        delivery_slot: oldOrder.delivery_slot,
                        address: oldOrder.delivery_address_snapshot
                    };
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    summary += `\n*Subtotal:* ₹${subtotal.toFixed(2)}`;
                    summary += `\n*Deliver To:* ${oldOrder.delivery_address_snapshot}`;
                    summary += `\n*Slot:* ${oldOrder.delivery_slot}`;
                    
                    const buttons = [
                        { id: 'pay_upi', title: '💳 Pay Online' },
                        { id: 'pay_cod', title: '💵 Cash on Delivery' }
                    ];
                    await whatsappService.sendButtons(from, `${summary}\n\nSelect Payment Method to confirm repeat order:`, buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId === 'btn_orders') {
                    const recentOrders = await db.query(`
                        SELECT readable_order_id, status, total_amount, created_at 
                        FROM orders 
                        WHERE customer_id = $1 
                        ORDER BY created_at DESC 
                        LIMIT 3
                    `, [customerId]);

                    if (recentOrders.rows.length === 0) {
                        const buttons = [
                            { id: 'btn_products', title: '🛍️ Browse Products' }
                        ];
                        await whatsappService.sendButtons(from, "You haven't placed any orders yet! 🏪", buttons);
                    } else {
                        let msg = "📦 *Your Recent Orders:*\n\n";
                        recentOrders.rows.forEach(order => {
                            const dateStr = new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                            msg += `• *Order #${order.readable_order_id}* - Status: _${order.status}_\n  Total: *₹${parseFloat(order.total_amount).toFixed(2)}* | Placed on ${dateStr}\n\n`;
                        });
                        const buttons = [
                            { id: 'btn_products', title: '🛍️ Browse Products' },
                            { id: 'btn_view_cart', title: '🛒 View Cart' }
                        ];
                        await whatsappService.sendButtons(from, msg, buttons);
                    }
                    await whatsappService.markAsRead(messageId);
                    return;
                } else if (buttonId === 'btn_support') {
                    const buttons = [
                        { id: 'btn_products', title: '🛍️ Browse Products' },
                        { id: 'btn_talk_to_owner', title: '🤝 Talk to Owner' }
                    ];
                    await whatsappService.sendButtons(
                        from, 
                        "📞 *Call Support:*\n\nYou can reach our store manager directly at *+91 98765 43210* for any order queries or delivery assistance. We are open from 6:00 AM to 9:00 PM!\n\nOr click below to speak to an agent directly in this chat:",
                        buttons
                    );
                    await whatsappService.markAsRead(messageId);
                    return;
                } else if (buttonId === 'btn_talk_to_owner') {
                    metadata.stage = 'HUMAN_HANDOFF';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    await whatsappService.sendText(from, "🤝 *Human Handoff Active*\n\nI have paused automatic replies and alerted the store owner. An agent will reply to you directly here shortly.\n\n*To resume automatic bot ordering at any time, just type START.*");
                    await whatsappService.markAsRead(messageId);
                    return;
                } else if (buttonId === 'btn_products') {
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
                        cartSummary.rows.forEach((row, i) => {
                            const sub = row.price * row.quantity;
                            total += sub;
                            summaryText += `*${i + 1}.* ${row.base_name} (${row.weight_label}) x ${row.quantity} = *₹${sub}*\n`;
                        });
                        summaryText += `\n*Total: ₹${total.toFixed(2)}*`;
                        summaryText += `\n\n💡 *To remove an item*, reply with *REMOVE* followed by the item number (e.g. *REMOVE 1*).`;
                        const buttons = [
                            { id: 'btn_products', title: '🛍️ Add More' },
                            { id: 'btn_clear_cart', title: '🗑️ Clear Cart' },
                            { id: 'btn_checkout', title: '💳 Checkout' }
                        ];
                        await whatsappService.sendButtons(from, summaryText, buttons);
                    }
                } else if (buttonId === 'btn_checkout' || buttonId === 'btn_resume_checkout') {
                    // Check Minimum order values
                    const subtotal = await getCartSubtotal(cartId);

                    if (subtotal === 0) {
                        await whatsappService.sendText(from, "Your cart is empty! 🛒");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }

                    const mov = await getSetting('minimum_order_value', 150);
                    if (subtotal < mov) {
                        const diff = (mov - subtotal).toFixed(2);
                        const msgText = TRANSLATIONS.MIN_ORDER_WARN[userLang]
                            .replace('$MOV', mov)
                            .replace('$DIFF', diff);
                        await whatsappService.sendText(from, msgText);
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
                    const subtotal = await getCartSubtotal(cartId);

                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;

                    const paymentText = TRANSLATIONS.BILL_SUMMARY[userLang]
                        .replace('$SUB', subtotal.toFixed(2))
                        .replace('$DEL', deliveryFee.toFixed(2))
                        .replace('$TOT', (subtotal + deliveryFee).toFixed(2));
                    
                    const buttons = [
                        { id: 'pay_upi', title: TRANSLATIONS.BTN_PAY_ONLINE[userLang] },
                        { id: 'pay_cod', title: TRANSLATIONS.BTN_PAY_COD[userLang] }
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

                    // Apply coupon discount if set in session
                    if (metadata.coupon_code) {
                        const couponRes = await db.query('SELECT discount_type, discount_value FROM coupons WHERE code = $1 AND is_active = true', [metadata.coupon_code]);
                        if (couponRes.rows.length > 0) {
                            const cp = couponRes.rows[0];
                            const discount = cp.discount_type === 'PERCENT' ? (subtotal * cp.discount_value) / 100 : parseFloat(cp.discount_value);
                            finalTotal -= discount;
                            itemsText += `• Coupon Discount (${metadata.coupon_code}): -₹${discount.toFixed(2)}\n`;
                        }
                    }

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

                        const markup = parseFloat(await getSetting('voice_cost_markup', 2));
                        let subtotal = 0;
                        cartItems.rows.forEach(i => {
                            const markedUpPrice = parseFloat(i.price) * (1 + markup / 100);
                            subtotal += (markedUpPrice * i.quantity);
                        });

                        const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                        let deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;
                        
                        let finalTotal = subtotal + deliveryFee;

                        if (metadata.coupon_code) {
                            const couponRes = await client.query('SELECT discount_type, discount_value FROM coupons WHERE code = $1 AND is_active = true', [metadata.coupon_code]);
                            if (couponRes.rows.length > 0) {
                                const cp = couponRes.rows[0];
                                const discount = cp.discount_type === 'PERCENT' ? (subtotal * cp.discount_value) / 100 : parseFloat(cp.discount_value);
                                finalTotal -= discount;
                                
                                // Increment coupon usage
                                await client.query('UPDATE coupons SET current_uses = current_uses + 1 WHERE code = $1', [metadata.coupon_code]);
                            }
                        }

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
                            const unitPriceMarkedUp = parseFloat(i.price) * (1 + markup / 100);
                            await client.query(`
                                INSERT INTO order_items (order_id, variant_id, quantity, unit_price, total_price) 
                                VALUES ($1, $2, $3, $4, $5)
                            `, [orderId, i.variant_id, i.quantity, unitPriceMarkedUp, unitPriceMarkedUp * i.quantity]);
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
                                    logError(rzpErr, 'Razorpay_link_generation');
                                }
                            }
                            
                            await whatsappService.sendText(from, `⏳ *Order #${order.rows[0].readable_order_id} is Pending Payment!*`);
                            await whatsappService.sendImage(from, qrUrl, `Scan this dynamic QR Code to pay ₹${finalTotal.toFixed(2)} directly from GPay/PhonePe.`);
                            await whatsappService.sendText(from, `Or tap this direct link to pay now: ${intentLink}`);
                        }

                    } catch (error) {
                        await client.query('ROLLBACK');
                        logError(error, 'Order_transaction');
                        await whatsappService.sendText(from, "Something went wrong placing your order. Please try again.");
                    } finally {
                        client.release();
                    }
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Interactive list response triggers
            if (interactive && interactive.list_reply) {
                const listId = interactive.list_reply.id;
                
                if (listId.startsWith('sub_select_var_')) {
                    const variantId = listId.replace('sub_select_var_', '');
                    metadata.sub_variant_id = variantId;
                    metadata.stage = 'SUB_CHOOSE_FREQUENCY';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    const buttons = [
                        { id: 'btn_sub_freq_DAILY', title: '🔄 Daily' },
                        { id: 'btn_sub_freq_ALTERNATE', title: '🔄 Alternate Days' },
                        { id: 'btn_sub_freq_WEEKLY', title: '🔄 Weekly' }
                    ];
                    
                    const bodyText = userLang === 'HI' 
                        ? "कृपया डिलीवरी की आवृत्ति (Frequency) चुनें:" 
                        : (userLang === 'MR' ? "कृपया डिलिव्हरीची वारंवारता निवडा:" : "Please select the delivery frequency:");
                    
                    await whatsappService.sendButtons(from, bodyText, buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

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
                    const subtotal = await getCartSubtotal(cartId);

                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;

                    const paymentText = TRANSLATIONS.BILL_SUMMARY[userLang]
                        .replace('$SUB', subtotal.toFixed(2))
                        .replace('$DEL', deliveryFee.toFixed(2))
                        .replace('$TOT', (subtotal + deliveryFee).toFixed(2));
                    
                    const buttons = [
                        { id: 'pay_upi', title: TRANSLATIONS.BTN_PAY_ONLINE[userLang] },
                        { id: 'pay_cod', title: TRANSLATIONS.BTN_PAY_COD[userLang] }
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

            // Conversational Cart Item Removals handler
            const removeMatch = type === 'text' && text && text.trim().match(/^remove\s+(\d+)$/i);
            if (removeMatch) {
                const itemIndex = parseInt(removeMatch[1]) - 1; // 0-indexed
                
                const cartSummary = await db.query(`
                    SELECT ci.cart_item_id, p.base_name, pv.weight_label
                    FROM cart_items ci
                    JOIN product_variants pv ON ci.variant_id = pv.variant_id
                    JOIN products p ON pv.product_id = p.product_id
                    WHERE ci.cart_id = $1
                    ORDER BY ci.cart_item_id ASC
                `, [cartId]);
                
                if (itemIndex >= 0 && itemIndex < cartSummary.rows.length) {
                    const targetItem = cartSummary.rows[itemIndex];
                    await db.query('DELETE FROM cart_items WHERE cart_item_id = $1', [targetItem.cart_item_id]);
                    await whatsappService.sendText(from, `🗑️ *Removed:* ${targetItem.base_name} (${targetItem.weight_label}) has been removed from your cart.`);
                    
                    // Display updated cart
                    const updatedCart = await db.query(`
                        SELECT ci.quantity, pv.price, pv.weight_label, p.base_name
                        FROM cart_items ci
                        JOIN product_variants pv ON ci.variant_id = pv.variant_id
                        JOIN products p ON pv.product_id = p.product_id
                        WHERE ci.cart_id = $1
                        ORDER BY ci.cart_item_id ASC
                    `, [cartId]);
                    
                    if (updatedCart.rows.length === 0) {
                        await whatsappService.sendText(from, "Your cart is now empty! 🛒");
                    } else {
                        let total = 0, summaryText = "🛒 *Updated Cart:*\n\n";
                        updatedCart.rows.forEach((row, i) => {
                            const sub = row.price * row.quantity;
                            total += sub;
                            summaryText += `*${i + 1}.* ${row.base_name} (${row.weight_label}) x ${row.quantity} = *₹${sub}*\n`;
                        });
                        summaryText += `\n*Total: ₹${total.toFixed(2)}*`;
                        summaryText += `\n\n💡 *To remove an item*, reply with *REMOVE* followed by the item number (e.g. *REMOVE 1*).`;
                        const buttons = [
                            { id: 'btn_products', title: '🛍️ Add More' },
                            { id: 'btn_clear_cart', title: '🗑️ Clear Cart' },
                            { id: 'btn_checkout', title: '💳 Checkout' }
                        ];
                        await whatsappService.sendButtons(from, summaryText, buttons);
                    }
                } else {
                    await whatsappService.sendText(from, "⚠️ Invalid item number. Please view your cart first to see the correct numbers.");
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

            // Coupon Code Application handler
            if (type === 'text' && metadata.stage && metadata.stage !== 'START') {
                const possibleCoupon = text.trim().toUpperCase();
                const couponRes = await db.query(
                    'SELECT * FROM coupons WHERE code = $1 AND is_active = true AND (end_date IS NULL OR end_date > NOW()) AND (max_uses IS NULL OR current_uses < max_uses)',
                    [possibleCoupon]
                );
                
                if (couponRes.rows.length > 0) {
                    const coupon = couponRes.rows[0];
                    
                    const subtotal = await getCartSubtotal(cartId);

                    if (subtotal < parseFloat(coupon.min_order_value || 0)) {
                        await whatsappService.sendText(from, `⚠️ Coupon *${possibleCoupon}* requires a minimum order value of *₹${coupon.min_order_value}*. Current subtotal is *₹${subtotal.toFixed(2)}*.`);
                    } else {
                        metadata.coupon_code = possibleCoupon;
                        await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                        
                        const discount = coupon.discount_type === 'PERCENT' ? (subtotal * coupon.discount_value) / 100 : parseFloat(coupon.discount_value);
                        
                        await whatsappService.sendText(from, `🎉 *Coupon "${possibleCoupon}" Applied!*\nYou saved *₹${discount.toFixed(2)}* on this order!`);
                        
                        // Re-trigger bill summary / payment selection
                        metadata.stage = 'CHOOSE_PAYMENT';
                        await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                        const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                        const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;

                        const discountHeader = userLang === 'HI' ? 'कूपन छूट' : (userLang === 'MR' ? 'कूपन सूट' : 'Coupon Discount');
                        const updatedTitle = userLang === 'HI' ? 'अद्यतन ऑर्डर बिल सारांश' : (userLang === 'MR' ? 'अपडेटेड ऑर्डर बिल सारांश' : 'Updated Order Bill Summary');
                        const paymentMethodSelect = userLang === 'HI' ? 'भुगतान विधि चुनें:' : (userLang === 'MR' ? 'पेमेंट पद्धत निवडा:' : 'Select Payment Method:');
                        const totalLabel = userLang === 'HI' ? 'कुल योग' : (userLang === 'MR' ? 'एकूण' : 'Total');
                        const subtotalLabel = userLang === 'HI' ? 'उप-योग' : (userLang === 'MR' ? 'उप-एकूण' : 'Subtotal');
                        const delLabel = userLang === 'HI' ? 'डिलिवरी शुल्क' : (userLang === 'MR' ? 'डिलिवरी शुल्क' : 'Delivery Fee');
                        
                        const paymentText = `📋 *${updatedTitle}:*\n\n` +
                            `*${subtotalLabel}:* ₹${subtotal.toFixed(2)}\n` +
                            `*${discountHeader} (${possibleCoupon}):* -₹${discount.toFixed(2)}\n` +
                            `*${delLabel}:* ₹${deliveryFee.toFixed(2)}\n` +
                            `*${totalLabel}:* ₹${(subtotal - discount + deliveryFee).toFixed(2)}\n\n` +
                            `${paymentMethodSelect}`;
                        
                        const buttons = [
                            { id: 'pay_upi', title: TRANSLATIONS.BTN_PAY_ONLINE[userLang] },
                            { id: 'pay_cod', title: TRANSLATIONS.BTN_PAY_COD[userLang] }
                        ];
                        await whatsappService.sendButtons(from, paymentText, buttons);
                    }
                    await whatsappService.markAsRead(messageId);
                    return;
                }
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
                        { id: 'btn_resume_checkout', title: TRANSLATIONS.BTN_RESUME[userLang] },
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] }
                    ];
                    await whatsappService.sendButtons(from, TRANSLATIONS.DRAFT_PROMPT[userLang], buttons);
                } else {
                    metadata = { stage: 'START' };
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                    
                    const buttons = [
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] }
                    ];
                    await whatsappService.sendButtons(from, TRANSLATIONS.FALLBACK[userLang], buttons);
                }
                await whatsappService.markAsRead(messageId);
                return;
            }

        } catch (error) {
            logError(error, 'webhook_message_processing');
        } finally {
            activeUserLocks.delete(from);
        }
    } else if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.statuses) {
        console.log('Status update received - Ignoring');
    }
});

module.exports = router;
