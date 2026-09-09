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

// Helper: parse a weight label into grams ("200 gm"->200, "1 kg"->1000). Null if unparseable.
function weightToGrams(label) {
    if (!label) return null;
    const m = String(label).toLowerCase().replace(/,/g, '').match(/([\d.]+)\s*(kg|gms?|ml|ltr|litres?|liters?)?/);
    if (!m) return null;
    const val = parseFloat(m[1]);
    if (!val || val <= 0) return null;
    const unit = m[2] || 'g';
    if (unit.startsWith('kg')) return Math.round(val * 1000);
    if (unit.startsWith('ltr') || unit === 'l' || unit.startsWith('lit')) return Math.round(val * 1000); // milk litres ~ grams
    if (unit.startsWith('ml')) return Math.round(val);
    return Math.round(val); // g / gm default
}

// Helper: split a target weight into available pack sizes (greedy largest-first, exact only).
// packs: [{variant_id, grams, price}] → returns [{variant_id, grams, price, count}] or null if no exact combo.
function decomposeGrams(targetG, packs) {
    const usable = packs.filter(p => p.grams && p.grams > 0).sort((a, b) => b.grams - a.grams);
    if (!usable.length || !targetG || targetG <= 0) return null;
    let rest = targetG;
    const out = [];
    for (const p of usable) {
        const c = Math.floor(rest / p.grams);
        if (c > 0) { out.push({ ...p, count: c }); rest -= c * p.grams; }
        if (rest === 0) break;
    }
    return rest === 0 ? out : null;
}

// Helper: requested quantity → grams (qty_unit: grams|kg|packets|pieces). Null = count-based fallback.
function itemToGrams(item) {
    if (!item) return null;
    if (item.qty_value != null && item.qty_unit) {
        const v = parseFloat(item.qty_value);
        if (!v || v <= 0) return null;
        const u = String(item.qty_unit).toLowerCase();
        if (/^kgs?|^kilo/.test(u)) return Math.round(v * 1000);
        if (u.startsWith('lit') || u === 'l' || u.startsWith('ltr')) return Math.round(v * 1000); // litres ~ grams for milk
        if (u.startsWith('gram') || u === 'g' || u.startsWith('gm')) return Math.round(v);
        return null; // packets/pieces → count fallback
    }
    // Legacy shape {"quantity": n}: treat 50..10000 as grams (voice "200 grams"), else count
    if (item.quantity != null) {
        const q = parseFloat(item.quantity);
        if (q >= 50 && q <= 10000) return Math.round(q);
    }
    return null;
}

// Helper: English number words → digits ("two hundred fifty" → "250") so STT word-form works.
function wordsToDigits(text) {
    const ONES = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, a: 1, an: 1 };
    const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
    const out = [];
    const words = String(text).toLowerCase().split(/(\s+|[,])/);
    let i = 0;
    const isNumWord = (w) => ONES[w] != null || TENS[w] != null || w === 'hundred' || w === 'thousand' || w === 'half' || w === 'quarter';
    while (i < words.length) {
        const w = words[i].toLowerCase();
        if (isNumWord(w)) {
            let total = 0, cur = 0, consumed = 0;
            if (w === 'half') { total = 0.5; consumed = 1; }
            else if (w === 'quarter') { total = 0.25; consumed = 1; }
            else {
                let j = i;
                while (j < words.length) {
                    const x = words[j].toLowerCase();
                    if (ONES[x] != null) { cur += ONES[x]; j++; }
                    else if (TENS[x] != null) { cur += TENS[x]; j++; }
                    else if (x === 'hundred') { cur = (cur || 1) * 100; j++; }
                    else if (x === 'thousand') { total += (cur || 1) * 1000; cur = 0; j++; }
                    else if (/^\s+$/.test(words[j]) || words[j] === '-') { j++; }
                    else break;
                }
                total += cur;
                consumed = j - i;
            }
            // Only replace when followed by a unit word (avoid mangling addresses like "3103")
            const after = words.slice(i + consumed).join('').trim().split(/\s+/)[0] || '';
            if (/^(kg|kilos?|grams?|gms?|g\b|litres?|liters?|ltrs?|l\b|packets?|pieces?|pcs?|kilos?\b)/i.test(after)) {
                out.push(String(total));
                i += consumed;
                continue;
            }
            out.push(words[i]);
            i++;
        } else { out.push(words[i]); i++; }
    }
    return out.join('');
}

// Helper: local transcript parser (no LLM). Used when Gemini is down/overloaded.
// Handles "200 grams of paneer, 2 kg of mawa, 5 PM, <street>, <6-digit pin>".
function localParseTranscript(transcript) {
    if (!transcript) return null;
    const t = wordsToDigits(transcript);
    const lower = t.toLowerCase();
    const out = { items: [], unknown: [], address: { street: null, pincode: null }, delivery_slot: { date: null, slot: null } };

    const SYNONYMS = [
        { keys: ['paneer', 'cottage cheese'], name: 'Paneer' },
        { keys: ['mawa', 'khoya', 'khoa', 'mava', 'khova'], name: 'Mawa' },
        { keys: ['milk', 'doodh', 'dudh'], name: 'Milk' },
        { keys: ['curd', 'dahi', 'yogurt', 'yoghurt'], name: 'Curd' },
        { keys: ['ghee', 'clarified butter'], name: 'Clarified Butter' },
    ];
    const prodName = (chunk) => {
        const c = chunk.toLowerCase();
        for (const s of SYNONYMS) if (s.keys.some(k => c.includes(k))) return s.name;
        return null;
    };

    // Split on commas/plus/and-then boundaries, keep numbers attached
    const chunks = t.split(/,|\bplus\b|\baur\b|\band then\b/i);
    for (const ch of chunks) {
        const m = ch.match(/([\d.]+)\s*(kgs?|kilos?|kilograms?|grams?|gms?|\bg\b|litres?|liters?|ltrs?|\bl\b|packets?|pieces?|pcs?)?\s*(?:of\s+)?(.+)?/i);
        if (!m) continue;
        const name = prodName(m[3] || '');
        if (!name) {
            // Audible item we don't sell (e.g. "3 kilograms of gram flour") — surface it, don't swallow it
            const said = ch.trim().replace(/\s+/g, ' ').slice(0, 40);
            if (said && /paneer|mawa|khoya|milk|doodh|curd|dahi|ghee|besan|flour|atta|sugar|rice/i.test(said)) out.unknown.push(said);
            continue;
        }
        const rawU = (m[2] || 'packets').toLowerCase();
        let unit = 'packets';
        if (/^kg|kilo/.test(rawU)) unit = 'kg';
        else if (/^gram|^gm$|^\bg\b/.test(rawU)) unit = 'grams';
        else if (/^lit|^ltr|^\bl\b/.test(rawU)) unit = 'litres';
        else if (/^piece|^pcs/.test(rawU)) unit = 'pieces';
        out.items.push({ name, qty_value: parseFloat(m[1]), qty_unit: unit });
    }

    const pin = t.match(/\b\d{6}\b/);
    if (pin) {
        out.address.pincode = pin[0];
        out.address.street = t.replace(pin[0], '').split(/,|\./).map(s => s.trim()).filter(s => s && !/^\d+\s*(am|pm)$/i.test(s) && !/morning|evening|noon|afternoon/i.test(s)).slice(-2).join(', ') || null;
    }
    if (/\bjaldi\b|urgent|asap|10\s*min|abhi\b/.test(lower)) out.delivery_slot.slot = 'express';
    else if (/morning/.test(lower)) out.delivery_slot.slot = 'morning';
    else if (/noon|afternoon/.test(lower)) out.delivery_slot.slot = 'noon';
    else if (/evening|night|\bpm\b/.test(lower)) out.delivery_slot.slot = 'evening';
    if (/\btomorrow\b|\bkal\b/.test(lower)) out.delivery_slot.date = 'tomorrow';
    else if (out.delivery_slot.slot) out.delivery_slot.date = 'today';
    if (!out.delivery_slot.slot) out.delivery_slot = { date: null, slot: null };

    return (out.items.length || out.address.pincode || (out.delivery_slot && out.delivery_slot.slot)) ? out : null;
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
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!VERIFY_TOKEN) {
        console.error('FATAL: WHATSAPP_VERIFY_TOKEN env var is required.');
        return res.sendStatus(500);
    }

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

// Helper: express fee / scheduled-discount for a slot key
async function getSlotAdjustments(slotKey, subtotal) {
    let expressFee = 0, schedDiscount = 0, schedPct = 0;
    if (slotKey === 'express') {
        expressFee = parseFloat(await getSetting('express_fee', 30));
    }
    if (String(slotKey || '').startsWith('tomorrow_')) {
        schedPct = parseFloat(await getSetting('scheduled_discount', 5));
        if (schedPct > 0) schedDiscount = (subtotal * schedPct) / 100;
    }
    return { expressFee, schedDiscount, schedPct };
}

// Helper to generate and send Delivery Slots List Message (rider-aware capacity)
async function sendSlotList(from, addrId, metadata, cartId) {
    metadata.address_id = addrId;
    metadata.stage = 'DELIVERY_SLOT_SELECTION';
    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

    // Query active address text
    const addrRes = await db.query('SELECT address_text FROM addresses WHERE address_id = $1', [addrId]);
    const addrText = addrRes.rows[0]?.address_text || 'Saved Address';

    // Rider-aware capacity: available riders x per-rider max orders per slot
    let availRiders = 0;
    try {
        const r = await db.query("SELECT COUNT(1) AS c FROM delivery_partners WHERE is_active = true AND current_status = 'AVAILABLE'");
        availRiders = parseInt(r.rows[0]?.c || 0);
    } catch { availRiders = 0; }
    const perRider = Math.max(1, parseInt(await getSetting('rider_max_orders', 15)));
    const legacyLimit = parseInt(await getSetting('rider_slot_limit', 10));
    const capacity = availRiders > 0 ? availRiders * perRider : legacyLimit;

    const slots = [
        { key: 'morning', label: '🌅 Morning (6-8 AM)' },
        { key: 'noon', label: '☀️ Noon (12-2 PM)' },
        { key: 'evening', label: '🌇 Evening (5-7 PM)' }
    ];

    const slotRows = [];

    // ⚡ Express (10-min) first when a rider is free
    if (availRiders > 0) {
        const expressFee = parseFloat(await getSetting('express_fee', 30));
        slotRows.push({ id: 'btn_slot_select_express', title: `⚡ 10-min (+₹${expressFee})`.substring(0, 24) });
    }

    for (const slot of slots) {
        const countRes = await db.query(
            "SELECT COUNT(1) FROM orders WHERE delivery_slot = $1 AND status != 'CANCELLED' AND created_at::date = CURRENT_DATE",
            [slot.label]
        );
        if (parseInt(countRes.rows[0].count) < capacity) {
            slotRows.push({ id: `btn_slot_select_${slot.key}`, title: slot.label.substring(0, 24) });
        }
    }

    // Tomorrow pre-order slots (scheduled discount applies)
    const schedPct = parseFloat(await getSetting('scheduled_discount', 5));
    const tmHint = schedPct > 0 ? ` (${schedPct}% off)` : '';
    slotRows.push(
        { id: 'btn_slot_select_tomorrow_morning', title: `🌅 Tomorrow AM${tmHint}`.substring(0, 24) },
        { id: 'btn_slot_select_tomorrow_evening', title: `🌇 Tomorrow PM${tmHint}`.substring(0, 24) }
    );

    const riderNote = availRiders === 0
        ? `\n\n⚠️ *All riders are busy right now* — only pre-order slots open.`
        : '';

    const listBody = `🏠 *Delivering to:* ${addrText}\n\nPlease select your preferred delivery timing slot:${riderNote}`;

    const sections = [
        {
            title: 'Available Timing',
            rows: slotRows
        },
        {
            title: 'Fulfillment Location',
            rows: [
                { id: 'btn_change_addr', title: '✍️ Change Delivery Address' }
            ]
        }
    ];

    await whatsappService.sendList(from, 'Select Delivery Slot', listBody, 'Choose Slot', sections);
}

// Helper: prefill for Meta's address form (fields can't be hidden — only prefilled).
// Name from pushname/CRM, phone = sender number. Customer ideally types only the street.
async function addressFormValues(customerId, from) {
    const values = { phone_number: from };
    try {
        const r = await db.query('SELECT name FROM customers WHERE customer_id = $1', [customerId]);
        const nm = r.rows[0]?.name;
        if (nm && nm !== 'WhatsApp User') values.name = String(nm).slice(0, 50);
    } catch { /* prefill best-effort */ }
    return values;
}

// Helper: address step — 1 saved address skips straight to slots (no question asked)
async function promptAddressStep(from, customerId, metadata, cartId) {
    metadata.stage = 'ADDRESS_SELECTION';
    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

    const addressesRes = await db.query('SELECT address_id, address_text FROM addresses WHERE customer_id = $1 LIMIT 3', [customerId]);
    if (addressesRes.rows.length === 1) {
        await sendSlotList(from, addressesRes.rows[0].address_id, metadata, cartId);
    } else if (addressesRes.rows.length > 1) {
        const buttons = addressesRes.rows.map((addr) => ({
            id: `btn_addr_select_${addr.address_id}`,
            title: addr.address_text.substring(0, 20)
        }));
        buttons.push({ id: 'btn_change_addr', title: '📍 Add New Address' });
        await whatsappService.sendButtons(from, '🏠 *Deliver to saved address?*', buttons);
    } else {
        // Name + phone prefilled from backend — customer types only the street.
        await whatsappService.sendAddressMessage(from, '🏠 *Enter Delivery Address*', await addressFormValues(customerId, from));
    }
}

// POST /webhook/whatsapp - Incoming Messages
router.post('/whatsapp', async (req, res) => {
    // 0. META SIGNATURE CHECK — reject forged webhooks before ACK (needs WHATSAPP_APP_SECRET)
    try {
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (appSecret) {
            const sig = req.headers['x-hub-signature-256'] || '';
            const expected = 'sha256=' + require('crypto').createHmac('sha256', appSecret).update(req.rawBody || Buffer.from(JSON.stringify(req.body))).digest('hex');
            const a = Buffer.from(String(sig));
            const b = Buffer.from(expected);
            if (a.length !== b.length || !require('crypto').timingSafeEqual(a, b)) {
                console.error('❌ WhatsApp webhook signature mismatch — rejecting.');
                return res.sendStatus(403);
            }
        } else if (!router._sigWarned) {
            router._sigWarned = true;
            console.warn('⚠️ WHATSAPP_APP_SECRET not set — webhook signature check SKIPPED (set it to enforce).');
        }
    } catch (sigErr) {
        console.error('Signature check error:', sigErr.message);
        return res.sendStatus(403);
    }
    const body = req.body;
    try {
        const m = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        console.log('Incoming Webhook:', JSON.stringify({ from: m?.from, type: m?.type, id: m?.id }));
    } catch { console.log('Incoming Webhook: (unparseable)'); }
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
            EN: `Welcome to *Mera Kirana*! 🏪\n\nI work with taps, not typing — tap below, or send a *voice note* (e.g. "200 gm paneer, Bhandup 400078, evening"):`,
            HI: `*मेरा किराना* में आपका स्वागत है! 🏪\n\nमैं टाइपिंग से नहीं, टैप से काम करता हूँ — नीचे टैप करें, या *वॉइस नोट* भेजें (जैसे "200 ग्राम पनीर, भांडुप 400078, शाम"):`,
            MR: `*मेरा किराना* मध्ये आपले स्वागत आहे! 🏪\n\nमी टायपिंगने नाही, टॅपने काम करतो — खाली टॅप करा किंवा *व्हॉइस नोट* पाठवा (उदा. "200 ग्रॅम पनीर, भांडुप 400078, संध्याकाळ"):`
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
        },
        CATALOG_PARSE_ERROR: {
            EN: "Sorry, we couldn't parse your catalog order. Please try again or browse products.",
            HI: "क्षमा करें, हम आपके कैटलॉग ऑर्डर को पढ़ नहीं सके। कृपया पुन: प्रयास करें या उत्पाद ब्राउज़ करें।",
            MR: "क्षमस्व, आम्ही तुमच्या कॅटलॉग ऑर्डरमधील वस्तू वाचू शकलो नाही. कृपया पुन्हा प्रयत्न करा किंवा उत्पादने पहा."
        }
    };

    if (!body.object) return;

    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
        const value = body.entry[0].changes[0].value;
        const msg = value.messages[0];
        const from = msg.from;
        // WhatsApp profile name (pushname) — used for address-form prefill + CRM
        const pushName = (value.contacts && value.contacts[0] && value.contacts[0].profile && value.contacts[0].profile.name) || null;
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
                text = msg.text?.body ?? '';
            } else if (type === 'interactive') {
                interactive = msg.interactive;
                if (interactive.button_reply) {
                    text = interactive.button_reply.id || interactive.button_reply.title || '';
                } else if (interactive.list_reply) {
                    text = interactive.list_reply.id || interactive.list_reply.title || '';
                }
            } else if (type === 'audio') {
                audioId = msg.audio ? msg.audio.id : null;
            } else if (type === 'order') {
                // Intercepted and handled below customer/cart session loaders
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
                RETURNING customer_id, dnd_active, language, name
            `, [from, pushName || 'WhatsApp User']);
            // Adopt pushname once (never overwrite a real saved name with it)
            if (pushName && (!upsertCust.rows[0].name || upsertCust.rows[0].name === 'WhatsApp User')) {
                await db.query('UPDATE customers SET name = $1 WHERE customer_id = $2', [pushName.slice(0, 100), upsertCust.rows[0].customer_id]);
                upsertCust.rows[0].name = pushName.slice(0, 100);
            }
            
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

            // 4.1 INTERCEPT AND PARSE WHATSAPP CATALOG ORDERS (CART)
            if (type === 'order') {
                // Load Cart
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

                const orderData = msg.order;
                const productItems = orderData ? orderData.product_items : [];
                console.log(`[CATALOG ORDER] Customer ${from}: ${productItems.length} items received. Retailer IDs:`, productItems.map(i => i.product_retailer_id));

                if (productItems && productItems.length > 0) {
                    let addedCount = 0;
                    let unmatchedIds = [];
                    const stagedInserts = [];
                    for (const item of productItems) {
                        const retailerId = item.product_retailer_id;
                        const qty = Math.min(Math.max(parseInt(item.quantity, 10) || 1, 1), 20);
                        if (!retailerId) { unmatchedIds.push('(missing-id)'); continue; }

                        // Exact match only on meta_product_retailer_id, sku_code, or UUID (no price/cheapest fallback)
                        let variantQuery = await db.query(
                            `SELECT variant_id FROM product_variants 
                             WHERE (LOWER(TRIM(meta_product_retailer_id)) = LOWER(TRIM($1)) 
                                OR LOWER(TRIM(sku_code)) = LOWER(TRIM($1))
                                OR variant_id::text = $1) 
                             AND is_active = true LIMIT 1`,
                            [retailerId]
                        );

                        if (variantQuery.rows.length === 0) {
                            unmatchedIds.push(String(retailerId));
                            continue;
                        }

                        if (variantQuery.rows.length > 0) {
                            const variantId = variantQuery.rows[0].variant_id;
                            stagedInserts.push({ variantId, qty });
                            addedCount++;
                            // NOTE: auto-learn of attacker-supplied retailer_id removed (abuse vector). Map IDs via admin dashboard.
                        }
                    }
                    // Only replace cart after successful validation (never wipe on parse failure)
                    if (stagedInserts.length > 0) {
                        await db.query('DELETE FROM cart_items WHERE cart_id = $1', [cartId]);
                        for (const s of stagedInserts) {
                            await db.query(
                                'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3)',
                                [cartId, s.variantId, s.qty]
                            );
                        }
                        // Reset stage to checkout ready
                        metadata.stage = 'START';
                        await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                        const cartItemsQuery = await db.query(`
                            SELECT ci.quantity, pv.price, pv.weight_label, p.base_name
                            FROM cart_items ci
                            JOIN product_variants pv ON ci.variant_id = pv.variant_id
                            JOIN products p ON pv.product_id = p.product_id
                            WHERE ci.cart_id = $1
                            ORDER BY ci.cart_item_id ASC
                        `, [cartId]);

                        let total = 0, summaryText = "🛒 *Cart Updated from Catalog:*\n\n";
                        cartItemsQuery.rows.forEach((row, i) => {
                            const sub = row.price * row.quantity;
                            total += sub;
                            summaryText += `*${i + 1}.* ${row.base_name} (${row.weight_label}) x ${row.quantity} = *₹${sub}*\n`;
                        });
                        summaryText += `\n*Total: ₹${total.toFixed(2)}*`;
                        summaryText += `\n\n💡 *To remove an item*, reply with *REMOVE* followed by the item number (e.g. *REMOVE 1*).`;

                        const buttons = [
                            { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                            { id: 'btn_clear_cart', title: userLang === 'HI' ? '🗑️ कार्ट साफ़ करें' : (userLang === 'MR' ? '🗑️ कार्ट साफ करा' : '🗑️ Clear Cart') },
                            { id: 'btn_checkout', title: userLang === 'HI' ? '💳 चेकआउट' : (userLang === 'MR' ? '💳 चेकआउट' : '💳 Checkout') }
                        ];

                        await whatsappService.sendButtons(from, summaryText, buttons);
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                }

                console.error(`[CATALOG ORDER] ❌ Failed to parse catalog order for ${from}. 0 items matched. Unmatched:`, unmatchedIds);
                const parseErrorMsg = TRANSLATIONS.CATALOG_PARSE_ERROR[userLang];
                await whatsappService.sendText(from, parseErrorMsg);
                await whatsappService.markAsRead(messageId);
                return;
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
                    await whatsappService.sendText(from, `⚠️ *Limit Exceeded*\n\nYou have sent too many voice notes recently. Please use the buttons below, or try a voice note again in an hour.`);
                    const buttons = [
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] }
                    ];
                    await whatsappService.sendButtons(from, TRANSLATIONS.FALLBACK[userLang], buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                }
                
                if (dailyCount >= dailyLimit) {
                    await whatsappService.sendText(from, `⚠️ *Limit Exceeded*\n\nYou have hit your daily limit of ${dailyLimit} voice orders. Please use text messaging to place your order.`);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                // 6.2 Check duplicate hash de-duplication (exclude THIS message's own log row)
                const sha256 = msg.audio ? msg.audio.sha256 : null;
                if (sha256) {
                    const recentDuplicateRes = await db.query(`
                        SELECT 1 
                        FROM conversation_logs 
                        WHERE customer_phone = $1 
                          AND created_at > NOW() - INTERVAL '1 minute'
                          AND message_id != $3
                          AND metadata->'audio'->>'sha256' = $2
                        LIMIT 1
                    `, [from, sha256, messageId]);
                    
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
                        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
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
                    await whatsappService.sendText(from, "Sorry, I couldn't hear that clearly. Please send the voice note again — slowly.");
                    const buttons = [
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] }
                    ];
                    await whatsappService.sendButtons(from, TRANSLATIONS.FALLBACK[userLang], buttons);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                // Step 2: Use Gemini to parse rawTranscript into JSON schema (2 tries, then local parser)
                if (geminiKey) {
                    for (let attempt = 1; attempt <= 2 && !voiceParsed; attempt++) {
                    try {
                        const genAI = new GoogleGenerativeAI(geminiKey);
                        const model = genAI.getGenerativeModel({
                            model: "gemini-3.6-flash",
                            generationConfig: { responseMimeType: "application/json" }
                        });
                        
                        const systemPrompt = `
You are a structured parser for a kirana dairy shop. You extract order items, addresses, and delivery slot details from customer voice messages.
You MUST output a raw JSON object matching this schema ONLY.

{
  "items": [{"name": "string", "qty_value": "number", "qty_unit": "grams|kg|litres|packets|pieces"}],
  "address": {"street": "string", "pincode": "string"},
  "delivery_slot": {"date": "string", "slot": "string"}
}

Catalog Products & Synonyms:
- Cow Milk (doodh, milk, cow milk)
- Curd (dahi, yogurt, curd packet)
- Mawa (khoya, khoa, mava, dry milk solids)
- Paneer (cottage cheese, paneer block)
- Clarified Butter (ghee, cow ghee, pure ghee)

Quantity mapping (output qty_value + qty_unit, NEVER convert yourself):
- "aadha kilo" / "half kg" = {"qty_value": 0.5, "qty_unit": "kg"}
- "pao kilo" / "quarter kg" = {"qty_value": 250, "qty_unit": "grams"}
- "200 grams paneer" = {"name": "Paneer", "qty_value": 200, "qty_unit": "grams"}
- "1 kg mawa" = {"name": "Mawa", "qty_value": 1, "qty_unit": "kg"}
- "1 litre milk" / "1 ltr doodh" = {"qty_value": 1, "qty_unit": "litres"}
- "ek packet" / "2 packets" = {"qty_value": 1|2, "qty_unit": "packets"} (no weight mentioned)
- No quantity mentioned = {"qty_value": 1, "qty_unit": "packets"}

Rules:
1. Map items to catalog names. If empty/unclear, set items to [].
2. Extract address and 6-digit postal pincode.
3. Extract slots. Date is "today" or "tomorrow". Slot is "morning", "noon", "evening", or "express" (only for urgent words: jaldi, urgent, asap, 10 minutes, abhi). "Tomorrow ..." → date "tomorrow" with morning/evening.
4. If a field is not mentioned, set it to null.
5. Field ORDER NEVER MATTERS: product-first, address-first, or slot-first all parse identically — extract every field you find, wherever it appears.
`;
                        const response = await model.generateContent([
                            { text: rawTranscript },
                            { text: systemPrompt }
                        ]);
                        voiceParsed = JSON.parse(response.response.text());
                        console.log('Gemini voice structural extraction results:', voiceParsed);
                    } catch (structErr) {
                        logError(structErr, 'Gemini_structural_extraction_failed');
                        if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * attempt));
                    }
                    }
                }
                // Last resort: local regex parser (no LLM) so overloads never silence the bot
                if (!voiceParsed && rawTranscript) {
                    voiceParsed = localParseTranscript(rawTranscript);
                    if (voiceParsed) console.log('Local transcript parse fallback used:', JSON.stringify(voiceParsed));
                }
                
                if (!voiceParsed) {
                    const heard = rawTranscript ? `\n\n👂 *I heard:* "${String(rawTranscript).slice(0, 200)}"` : '';
                    await whatsappService.sendText(from, `Sorry, I couldn't piece together that order.${heard}\n\nPlease send the voice note again — slowly, with weight, address + pincode.`);
                    const buttons = [
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] }
                    ];
                    await whatsappService.sendButtons(from, TRANSLATIONS.FALLBACK[userLang], buttons);
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
            const addedLines = [];   // grouped display: "Mawa 1 kg = 2 x 500 gm"
            const skippedLines = []; // honest failures with available sizes
            if (voiceParsed) {
                // Local parser may flag audible items we don't sell — say so openly
                for (const u of (voiceParsed.unknown || [])) {
                    skippedLines.push(`• ${u} — not on our menu yet`);
                }
                // Parse items (weight-aware: decompose into available packs)
                if (voiceParsed.items && voiceParsed.items.length > 0) {
                    for (const item of voiceParsed.items) {
                        // All active variants of the matched product
                        const varRes = await db.query(`
                            SELECT pv.variant_id, pv.weight_label, pv.price
                            FROM product_variants pv
                            JOIN products p ON pv.product_id = p.product_id
                            WHERE p.base_name ILIKE '%' || $1 || '%' AND pv.is_active = true
                            ORDER BY pv.price ASC
                        `, [item.name]);
                        if (varRes.rows.length === 0) {
                            skippedLines.push(`• ${item.name} — not on our menu`);
                            continue;
                        }
                        const variants = varRes.rows.map(r => ({
                            variant_id: r.variant_id,
                            grams: weightToGrams(r.weight_label),
                            price: parseFloat(r.price),
                            label: r.weight_label,
                        }));
                        const targetG = itemToGrams(item);
                        if (targetG && variants.every(v => v.grams)) {
                            const combo = decomposeGrams(targetG, variants);
                            if (combo) {
                                let comboTotal = 0;
                                const parts = [];
                                for (const c of combo) {
                                    await db.query(
                                        'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + $3',
                                        [cartId, c.variant_id, c.count]
                                    );
                                    comboTotal += c.price * c.count;
                                    parts.push(`${c.count} x ${c.label}`);
                                }
                                const prettyKg = targetG >= 1000 ? `${(targetG / 1000).toString().replace(/\.0$/, '')} kg` : `${targetG} gm`;
                                addedLines.push(`• ${item.name} ${prettyKg} = ${parts.join(' + ')} → *₹${comboTotal.toFixed(2)}*`);
                                continue;
                            }
                            const sizes = variants.map(v => v.label).join(', ');
                            skippedLines.push(`• ${item.name} ${targetG}gm — no pack combo (have: ${sizes})`);
                            continue;
                        }
                        // Count-based fallback (packets / unparseable weights): first variant x count
                        const count = Math.min(Math.max(parseInt(item.qty_value ?? item.quantity, 10) || 1, 1), 20);
                        await db.query(
                            'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + $3',
                            [cartId, variants[0].variant_id, count]
                        );
                        addedLines.push(`• ${item.name} (${variants[0].label}) x ${count}`);
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
                    if (addedLines.length > 0) {
                        updateMsg = `✅ *Added to cart:*\n${addedLines.join('\n')}\n_Subtotal: ₹${subtotal.toFixed(2)}_`;
                        if (skippedLines.length > 0) updateMsg += `\n\n⚠️ _Couldn't add:_\n${skippedLines.join('\n')}`;
                        // Street heard but no pincode: ask ONLY the pin (one word), not the whole address
                        if (!metadata.address_id && voiceParsed.address?.street && !voiceParsed.address?.pincode) {
                            updateMsg += `\n\n📍 *Almost done!* Just reply with your 6-digit pincode (e.g. 400078) — no need to repeat the address.`;
                            metadata.stage = 'ADDRESS_SELECTION';
                            metadata.pending_street = voiceParsed.address.street;
                            await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);
                        }
                    } else if (skippedLines.length > 0) {
                        updateMsg = `⚠️ *Couldn't match your items:*\n${skippedLines.join('\n')}\n\nTap below to browse the catalog — exact pack sizes are all there.`;
                    } else if (voiceParsed.items && voiceParsed.items.length > 0) {
                        updateMsg = `✅ *Items Added to Cart!* (Subtotal: ₹${subtotal.toFixed(2)})`;
                    } else if (voiceParsed.address && voiceParsed.address.pincode) {
                        updateMsg = `📍 *Delivery Address Saved!* (Pincode: ${voiceParsed.address.pincode})`;
                    } else if (voiceParsed.delivery_slot && voiceParsed.delivery_slot.slot) {
                        updateMsg = `📅 *Delivery Slot Saved!* (${voiceParsed.delivery_slot.slot} on ${voiceParsed.delivery_slot.date})`;
                    } else if ((!voiceParsed.items || voiceParsed.items.length === 0) && !addedLines.length) {
                        // Nothing usable at all: point at the catalog, not checkout
                        await whatsappService.sendText(from, `${updateMsg || '👍 Got it!'}\nI couldn't catch an order in that note. The catalog has everything with exact sizes:`);
                        const buttons = [
                            { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                            { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] }
                        ];
                        await whatsappService.sendButtons(from, TRANSLATIONS.FALLBACK[userLang], buttons);
                        await whatsappService.markAsRead(messageId);
                        return;
                    } else {
                        updateMsg = `👍 *Voice instructions parsed successfully!*`;
                    }

                    await whatsappService.sendText(from, `${updateMsg}\nTo proceed with checkout, please select:`);
                    const addrBtn = { id: 'btn_set_address', title: '📍 Set Address' };
                    const buttons = !metadata.address_id
                        ? [
                            { id: 'btn_checkout', title: '💳 Checkout Now' },
                            addrBtn,
                            { id: 'btn_products', title: '🛍️ Add More' }
                        ]
                        : [
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
                    
                    // Send pre-generated welcome tip Hinglish voice note (cached media ID from seed script)
                    const tipMediaKey = hasAddress ? 'welcome_tip_repeat_media_id_v5' : 'welcome_tip_new_media_id_v5';
                    let cachedMediaId = await getSetting(tipMediaKey, null);

                    if (cachedMediaId) {
                        cachedMediaId = String(cachedMediaId).replace(/^"|"$/g, '').trim();
                        try {
                            console.log(`Sending welcome tip voice note (${tipMediaKey}: ${cachedMediaId}) to ${from}...`);
                            await whatsappService.sendAudio(from, cachedMediaId);
                        } catch (audioErr) {
                            console.error('Welcome tip audio send failed:', audioErr.message);
                        }
                    }

                    const buttons = [
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] },
                        { id: 'btn_orders', title: TRANSLATIONS.BTN_MY_ORDERS[userLang] },
                        { id: 'btn_view_subscriptions', title: TRANSLATIONS.BTN_SUBSCRIPTIONS[userLang] }
                    ];
                    
                    const welcomeMsg = userLang === 'EN' 
                        ? `Welcome to *Mera Kirana*! 🏪\n\nChoose an option to start:`
                        : (userLang === 'HI' 
                            ? `*मेरा किराना* में आपका स्वागत है! 🏪\n\nशुरू करने के लिए एक विकल्प चुनें:` 
                            : `*मेरा किराना* मध्ये आपले स्वागत आहे! 🏪\n\nसुरू करण्यासाठी एक पर्याय निवडा:`);

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
                    if (!/^[0-9a-fA-F-]{36}$/.test(subId)) { await whatsappService.markAsRead(messageId); return; }
                    await db.query("UPDATE subscriptions SET status = 'PAUSED' WHERE subscription_id = $1 AND customer_id = $2", [subId, customerId]);
                    const text = userLang === 'HI' 
                        ? "⏸️ आपकी डिलीवरी रोक दी गई है। आप इसे कभी भी शुरू कर सकते हैं!"
                        : (userLang === 'MR' ? "⏸️ तुमची डिलिव्हरी थांबवली गेली आहे. तुम्ही कधीही सुरू करू शकता!" : "⏸️ Delivery schedule paused. You can resume at any time!");
                    await whatsappService.sendText(from, text);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_sub_resume_')) {
                    const subId = buttonId.replace('btn_sub_resume_', '');
                    if (!/^[0-9a-fA-F-]{36}$/.test(subId)) { await whatsappService.markAsRead(messageId); return; }
                    await db.query("UPDATE subscriptions SET status = 'ACTIVE' WHERE subscription_id = $1 AND customer_id = $2", [subId, customerId]);
                    const text = userLang === 'HI' 
                        ? "▶️ आपकी डिलीवरी फिर से शुरू कर दी गई है!"
                        : (userLang === 'MR' ? "▶️ तुमची डिलिव्हरी पुन्हा सुरू झाली आहे!" : "▶️ Delivery schedule resumed successfully!");
                    await whatsappService.sendText(from, text);
                    await whatsappService.markAsRead(messageId);
                    return;
                }

                if (buttonId.startsWith('btn_sub_cancel_')) {
                    const subId = buttonId.replace('btn_sub_cancel_', '');
                    if (!/^[0-9a-fA-F-]{36}$/.test(subId)) { await whatsappService.markAsRead(messageId); return; }
                    await db.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE subscription_id = $1 AND customer_id = $2", [subId, customerId]);
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
                    if (!['DAILY', 'WEEKLY', 'ALTERNATE', 'MONTHLY'].includes(frequency)) {
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                    const variantId = metadata.sub_variant_id;
                    if (!variantId) { await whatsappService.markAsRead(messageId); return; }
                    const variantCheck = await db.query('SELECT 1 FROM product_variants WHERE variant_id = $1 AND is_active = true', [variantId]);
                    if (variantCheck.rows.length === 0) {
                        await whatsappService.sendText(from, "That product is no longer available. Please choose another.");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                    
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
                    if (!/^[0-9a-fA-F-]{36}$/.test(lastOrderId)) { await whatsappService.markAsRead(messageId); return; }
                    const oldOrderQuery = await db.query('SELECT * FROM orders WHERE order_id = $1 AND customer_id = $2 LIMIT 1', [lastOrderId, customerId]);
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
                        const catalogId = process.env.WHATSAPP_CATALOG_ID;
                        if (!catalogId) throw new Error('WHATSAPP_CATALOG_ID not configured');
                        // Real product thumbnail (paneer 200g) so the card shows food, not a blank.
                        const thumbRes = await db.query(
                            `SELECT meta_product_retailer_id FROM product_variants WHERE is_active = true AND meta_product_retailer_id IS NOT NULL ORDER BY price ASC LIMIT 1`
                        );
                        const thumb = thumbRes.rows[0]?.meta_product_retailer_id || catalogId;
                        await whatsappService.sendCatalog(from, "Browse our fresh catalog! 🏪", thumb);
                    } catch (e) {
                        const phoneNumber = (process.env.WHATSAPP_PHONE_ID || '').replace(/\D/g, '');
                        await whatsappService.sendText(from, "Browse catalog here: https://wa.me/c/" + (phoneNumber || ''));
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

                    // Skip order-type question: default ONE_TIME (subscribe offered after ordering).
                    // Old sessions with CHOOSE_ORDER_TYPE buttons still work via handlers below.
                    metadata.order_type = 'ONE_TIME';
                    await promptAddressStep(from, customerId, metadata, cartId);

                } else if (buttonId === 'btn_choose_one_time') {
                    metadata.order_type = 'ONE_TIME';
                    await promptAddressStep(from, customerId, metadata, cartId);

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
                    await promptAddressStep(from, customerId, metadata, cartId);

                } else if (buttonId.startsWith('btn_addr_select_')) {
                    const addrId = buttonId.replace('btn_addr_select_', '');
                    await sendSlotList(from, addrId, metadata, cartId);

                } else if (buttonId === 'btn_change_addr' || buttonId === 'btn_set_address') {
                    await whatsappService.sendAddressMessage(from, '🏠 *Enter Delivery Address*', await addressFormValues(customerId, from));

                } else if (buttonId.startsWith('btn_slot_select_')) {
                    const slotName = buttonId.replace('btn_slot_select_', '');
                    metadata.slot = slotName;
                    metadata.stage = 'CHOOSE_PAYMENT';
                    await db.query('UPDATE carts SET session_metadata = $1 WHERE cart_id = $2', [metadata, cartId]);

                    // Calc Order totals & fees
                    const subtotal = await getCartSubtotal(cartId);

                    const deliveryRules = await getSetting('delivery_fee_rules', { base_fee: 20, waive_threshold: 200, campaign_active: false });
                    const deliveryFee = (subtotal >= deliveryRules.waive_threshold || deliveryRules.campaign_active) ? 0 : deliveryRules.base_fee;

                    // Express fee + scheduled pre-order discount (shown here AND charged at placement)
                    const slotAdj = await getSlotAdjustments(slotName, subtotal);
                    const slotLine = slotName === 'express'
                        ? `\n⚡ *Express 10-min:* +₹${slotAdj.expressFee.toFixed(2)}`
                        : (slotAdj.schedDiscount > 0 ? `\n📅 *Pre-order ${slotAdj.schedPct}% off:* -₹${slotAdj.schedDiscount.toFixed(2)}` : '');
                    const slotTotal = subtotal + deliveryFee + slotAdj.expressFee - slotAdj.schedDiscount;

                    const paymentText = TRANSLATIONS.BILL_SUMMARY[userLang]
                        .replace('$SUB', subtotal.toFixed(2))
                        .replace('$DEL', deliveryFee.toFixed(2))
                        .replace('$TOT', slotTotal.toFixed(2)) + slotLine +
                        `\n\n🔄 _Want this daily? Order once, then tap Subscriptions._`;
                    
                    const buttons = [
                        { id: 'pay_upi', title: TRANSLATIONS.BTN_PAY_ONLINE[userLang] },
                        { id: 'pay_cod', title: TRANSLATIONS.BTN_PAY_COD[userLang] }
                    ];
                    await whatsappService.sendButtons(from, paymentText, buttons);

                } else if (buttonId === 'pay_upi' || buttonId === 'pay_cod') {
                    const method = buttonId === 'pay_upi' ? 'UPI' : 'COD';
                    if (!metadata.address_id) {
                        await whatsappService.sendText(from, "Please set a delivery address first. Tap 📦 My Orders or send your address with pincode.");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
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

                    // Express fee + tomorrow pre-order discount (matches slot preview + placement charge)
                    const slotAdj3 = await getSlotAdjustments(metadata.slot, subtotal);
                    if (slotAdj3.expressFee > 0) { finalTotal += slotAdj3.expressFee; itemsText += `• ⚡ Express 10-min: +₹${slotAdj3.expressFee.toFixed(2)}\n`; }
                    if (slotAdj3.schedDiscount > 0) { finalTotal -= slotAdj3.schedDiscount; itemsText += `• 📅 Pre-order ${slotAdj3.schedPct}% off: -₹${slotAdj3.schedDiscount.toFixed(2)}\n`; }

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

                    const fssai = await getSetting('shop_fssai', '');
                    const policy = await getSetting('refund_policy_text', '');
                    const text = `📦 *Confirm Order Details:*\n\n` +
                        `${itemsText}` +
                        `*Final Total: ₹${finalTotal.toFixed(2)}*\n` +
                        `*Payment Mode: ${method}*\n` +
                        `*Delivery To:* ${summary.rows.length ? summary.rows[0].address_text : 'Saved Address'}` +
                        (policy ? `\n\n📜 *Policy:* ${policy}` : '') +
                        (fssai ? `\nFSSAI Lic. No. ${fssai}` : '');

                    const buttons = [{ id: `place_${method.toLowerCase()}`, title: '✅ Place Order' }];
                    await whatsappService.sendButtons(from, text, buttons);

                } else if (buttonId.startsWith('place_')) {
                    const method = buttonId.includes('upi') ? 'UPI' : 'COD';
                    // Idempotency: block double-tap / Meta retries on same cart
                    if (metadata.order_placed) {
                        await whatsappService.sendText(from, "Your order is already placed ✅. Check 📦 My Orders for status.");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                    if (!metadata.address_id || !metadata.slot) {
                        await whatsappService.sendText(from, "Missing address or delivery slot. Please restart checkout from 🛍️ View Products.");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                    const ALLOWED_SLOTS = ['morning', 'noon', 'evening', 'express', 'tomorrow_morning', 'tomorrow_evening'];
                    if (!ALLOWED_SLOTS.includes(String(metadata.slot))) {
                        await whatsappService.sendText(from, "Invalid delivery slot. Please choose a slot again.");
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
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

                        // Express 10-min fee + tomorrow pre-order discount (must match preview)
                        const slotAdj2 = await getSlotAdjustments(metadata.slot, subtotal);
                        if (slotAdj2.expressFee > 0) finalTotal += slotAdj2.expressFee;
                        if (slotAdj2.schedDiscount > 0) finalTotal -= slotAdj2.schedDiscount;

                        if (metadata.coupon_code) {
                            const couponRes = await client.query('SELECT discount_type, discount_value FROM coupons WHERE code = $1 AND is_active = true', [metadata.coupon_code]);
                            if (couponRes.rows.length > 0) {
                                const cp = couponRes.rows[0];
                                const discount = cp.discount_type === 'PERCENT' ? (subtotal * cp.discount_value) / 100 : parseFloat(cp.discount_value);
                                finalTotal -= discount;
                                
                                // Atomic increment with cap guard (prevents overuse race)
                                await client.query('UPDATE coupons SET current_uses = current_uses + 1 WHERE code = $1 AND (max_uses IS NULL OR current_uses < max_uses)', [metadata.coupon_code]);
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
                        if (addrRes.rows.length === 0) {
                            await client.query('ROLLBACK');
                            await whatsappService.sendText(from, "Delivery address not found. Please set your address again.");
                            client.release();
                            return;
                        }
                        const addrText = addrRes.rows[0].address_text;

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

                        // 4. Convert active cart + mark idempotency flag
                        metadata.order_placed = true;
                        await client.query("UPDATE carts SET status = 'CONVERTED', session_metadata = $1 WHERE cart_id = $2", [metadata, cartId]);

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
                        const policy2 = await getSetting('refund_policy_text', '');
                        const fssai2 = await getSetting('shop_fssai', '');
                        const policyLine = policy2 ? `\n📜 ${policy2}` : '';
                        const fssaiLine = fssai2 ? `\nFSSAI Lic. No. ${fssai2}` : '';
                        if (method === 'COD') {
                            await whatsappService.sendText(from, `🎉 *Order #${order.rows[0].readable_order_id} Confirmed!*\nCOD Premium applied.${policyLine} We will deliver to: ${addrText}${fssaiLine}`);
                        } else {
                            const host = process.env.PUBLIC_URL;
                            let qrUrl = host ? `${host}/api/orders/qr/${orderId}.png` : null;
                            let intentLink = null;
                            
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
                            if (intentLink && qrUrl) {
                                await whatsappService.sendImage(from, qrUrl, `Scan this dynamic QR Code to pay ₹${finalTotal.toFixed(2)} directly from GPay/PhonePe.`);
                                await whatsappService.sendText(from, `Or tap this direct link to pay now: ${intentLink}`);
                            } else {
                                await whatsappService.sendText(from, `Online payment is temporarily unavailable. Please choose Cash on Delivery or contact the shop. Amount: ₹${finalTotal.toFixed(2)}.`);
                            }
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
                    await whatsappService.sendAddressMessage(from, '🏠 *Enter Delivery Address*', await addressFormValues(customerId, from));
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
            if (interactive && interactive.type && !interactive.button_reply && !interactive.list_reply && interactive.type !== 'address_message') {
                console.log('Unknown interactive type:', interactive.type, 'keys:', Object.keys(interactive));
            }
            if (interactive && (interactive.type === 'address_message' || interactive.type === 'nfm_reply' || interactive.nfm_reply)) {
                // Normalize: Cloud API address reply OR Flow (nfm_reply) payload
                let a = interactive.address_message || {};
                if ((!a || !a.in_pin_code) && interactive.nfm_reply) {
                    try {
                        const rawRj = interactive.nfm_reply.response_json;
                        const flow = typeof rawRj === 'string' ? JSON.parse(rawRj) : (rawRj || {});
                        console.log('nfm_reply payload keys:', Object.keys(flow), 'hasPinValue:', /\b\d{6}\b/.test(JSON.stringify(flow)));
                        const pick = (...keys) => {
                            for (const k of keys) {
                                if (flow[k] != null && String(flow[k]).trim() !== '') return String(flow[k]).trim();
                                const found = Object.keys(flow).find(fk => fk.toLowerCase() === k.toLowerCase());
                                if (found && String(flow[found]).trim() !== '') return String(flow[found]).trim();
                            }
                            return null;
                        };
                        a = {
                            house_number: pick('house_number', 'houseNumber', 'house'),
                            building_name: pick('building_name', 'buildingName', 'building', 'society'),
                            address: pick('address', 'street', 'street_address', 'address_line1', 'locality', 'area'),
                            city: pick('city', 'town'),
                            in_pin_code: pick('in_pin_code', 'pin_code', 'pincode', 'pinCode', 'postal_code', 'postalCode', 'zip'),
                        };
                        // Last resort: any 6-digit number anywhere in the payload (key names vary by Flow version)
                        if (!a.in_pin_code) {
                            const anywhere = JSON.stringify(flow).match(/\b\d{6}\b/);
                            if (anywhere) a.in_pin_code = anywhere[0];
                        }
                    } catch (parseErr) {
                        logError(parseErr, 'nfm_reply_parse');
                    }
                }
                const pinMatch = String(a.in_pin_code || '').match(/\b\d{6}\b/);
                const pin = pinMatch ? pinMatch[0] : null;
                if (!pin) {
                    await whatsappService.sendText(from, 'I couldn\'t read the pincode from that form. Please try the address form again, or reply with your 6-digit pincode.');
                    await whatsappService.markAsRead(messageId);
                    return;
                }

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

                // Prompt delivery slot select directly (no extra tap)
                await whatsappService.sendText(from, '✅ *Address Saved!*');
                await sendSlotList(from, newAddr.rows[0].address_id, metadata, cartId);
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
                        await whatsappService.sendText(from, `Uh oh! We are not delivering to pincode *${pin}* yet.`);
                        const buttons = [
                            { id: 'btn_change_addr', title: '📝 Try Another Address' },
                            { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] }
                        ];
                        await whatsappService.sendButtons(from, 'Tap below to try a different address:', buttons);
                        await whatsappService.markAsRead(messageId);
                        return;
                    }
                    
                    await db.query('UPDATE addresses SET is_default = false WHERE customer_id = $1', [customerId]);
                    // If voice already captured the street, combine it with the pin-only reply
                    const streetPrefix = metadata.pending_street ? metadata.pending_street + ', ' : '';
                    const fullText = streetPrefix ? streetPrefix + pin : text;
                    const newAddr = await db.query('INSERT INTO addresses (customer_id, address_text, pincode, is_default) VALUES ($1, $2, $3, true) RETURNING address_id', [customerId, fullText, pin]);
                    
                    metadata.address_id = newAddr.rows[0].address_id;
                    delete metadata.pending_street;
                    await whatsappService.sendText(from, "✅ *Address Saved!*");
                    await sendSlotList(from, newAddr.rows[0].address_id, metadata, cartId);
                } else {
                    await whatsappService.sendText(from, "I need your delivery address with a 6-digit pincode — the form below is fastest (phone already filled):");
                    const buttons = [
                        { id: 'btn_change_addr', title: '📝 Address Form' },
                        { id: 'btn_products', title: TRANSLATIONS.BTN_VIEW_PRODUCTS[userLang] }
                    ];
                    await whatsappService.sendButtons(from, 'Choose:', buttons);
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
