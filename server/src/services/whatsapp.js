const axios = require('axios');
require('dotenv').config();
const { logError } = require('./logger');

const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`;

// Validate environment variables on startup
if (!WHATSAPP_PHONE_ID || !TOKEN) {
    logError('CRITICAL: Missing WhatsApp credentials!', 'whatsapp_init');
}

const logOutgoingMessage = async (to, data, messageId) => {
    try {
        if (!to || !messageId) return;
        
        // Lazy require db pool
        const { pool } = require('../database/db');
        
        // 1. Determine active conversation_id and stage
        const lastLogRes = await pool.query(`
            SELECT conversation_id, session_stage,
                   (EXTRACT(EPOCH FROM (NOW() - created_at)) * 1000) as age_ms
            FROM conversation_logs 
            WHERE customer_phone = $1 AND conversation_id IS NOT NULL 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [to]);
        
        let conversationId;
        let stage = 'GREETING';
        
        const TWO_HOURS_IN_MS = 2 * 60 * 60 * 1000;
        if (lastLogRes.rows.length > 0 && parseFloat(lastLogRes.rows[0].age_ms) < TWO_HOURS_IN_MS) {
            conversationId = lastLogRes.rows[0].conversation_id;
            stage = lastLogRes.rows[0].session_stage || 'GREETING';
        } else {
            conversationId = require('crypto').randomUUID();
        }

        // 2. Extract outgoing text content
        let content = '';
        if (data.type === 'text' && data.text) {
            content = data.text.body;
        } else if (data.type === 'interactive' && data.interactive) {
            const inter = data.interactive;
            if (inter.type === 'button') {
                content = `[Button Message]: ${inter.body?.text || ''} | Options: ` + (inter.action?.buttons || []).map(b => b.reply?.title).join(', ');
            } else if (inter.type === 'list') {
                content = `[List Message]: ${inter.body?.text || ''} | ${inter.action?.button || ''}`;
            } else if (inter.type === 'product_list') {
                content = `[Product List]: ${inter.body?.text || ''}`;
            } else if (inter.type === 'catalog_message') {
                content = `[Catalog Message]`;
            } else {
                content = `[Interactive: ${inter.type}]`;
            }
        } else if (data.type === 'image' && data.image) {
            content = `[Image Link]: ${data.image.link} | Caption: ${data.image.caption || ''}`;
        } else if (data.status === 'read') {
            return;
        } else {
            content = `[Outgoing Message: ${data.type || 'unknown'}]`;
        }

        // 3. Save to database
        await pool.query(
            `INSERT INTO conversation_logs (customer_phone, message_type, content, message_id, conversation_id, session_stage, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (message_id) DO NOTHING`,
            [to, 'outgoing', content, messageId, conversationId, stage, JSON.stringify(data)]
        );
    } catch (e) {
        console.error('Failed to log outgoing message to DB:', e.message);
    }
};

const sendMessage = async (data) => {
    if (process.env.NODE_ENV === 'test') {
        if (data.status !== 'read') {
            console.log(`[MOCK WHATSAPP OUT] to ${data.to}:`, JSON.stringify(data));
            const mockMsgId = 'mock_msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            logOutgoingMessage(data.to, data, mockMsgId);
            return { message_id: mockMsgId };
        }
        return { message_id: 'mock_read_' + Date.now() };
    }

    const postWithRetry = async (retries = 3, delay = 1000) => {
        try {
            return await axios.post(WHATSAPP_API_URL, data, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${TOKEN}`
                }
            });
        } catch (error) {
            const status = error.response?.status;
            if (retries > 0 && (status === 429 || (status >= 500 && status < 600))) {
                console.warn(`⚠️ WhatsApp API rate limit or error (${status}). Retrying in ${delay}ms... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return postWithRetry(retries - 1, delay * 2);
            }
            throw error;
        }
    };

    try {
        const response = await postWithRetry();
        const resData = response.data;
        const actualMsgId = resData?.messages?.[0]?.id;
        if (actualMsgId && data.status !== 'read') {
            logOutgoingMessage(data.to, data, actualMsgId);
        }
        return resData;
    } catch (error) {
        logError(error, 'WhatsApp_send_message_API');
        throw error;
    }
};

const sendText = (to, text) => {
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text }
    });
};

const sendButtons = (to, text, buttons) => {
    // buttons = [{ id: 'btn_1', title: 'Option 1' }]
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: text },
            action: {
                buttons: buttons.map(btn => ({
                    type: 'reply',
                    reply: { id: btn.id, title: btn.title }
                }))
            }
        }
    });
};

const sendList = (to, header, body, buttonText, sections) => {
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'list',
            header: { type: 'text', text: header },
            body: { text: body },
            footer: { text: 'Select an option' },
            action: {
                button: buttonText,
                sections: sections
                // sections = [{ title: 'Category', rows: [{ id: '1', title: 'Item', description: 'desc' }] }]
            }
        }
    });
};

const sendProductList = (to, body, catalogId, sections) => {
    // sections = [{ title: 'Category Name', product_retailer_ids: ['sku_1', 'sku_2'] }]
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'product_list',
            header: { type: 'text', text: 'Catalog' },
            body: { text: body },
            footer: { text: 'Select products to add to cart' },
            action: {
                catalog_id: catalogId,
                sections: sections
            }
        }
    });
};

const sendAddressMessage = (to, body, values = {}) => {
    return sendMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'address_message',
            body: {
                text: body
            },
            action: {
                name: 'address_message',
                parameters: {
                    country: 'IN',
                    values: values
                }
            }
        }
    });
};

const sendCatalog = (to, body, thumbnailProductRetailerId) => {
    // Meta REQUIRES a valid thumbnail SKU for catalog_message to work.
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'catalog_message',
            body: { text: body },
            action: {
                name: 'catalog_message',
                parameters: {
                    thumbnail_product_retailer_id: thumbnailProductRetailerId
                }
            }
        }
    });
};

const markAsRead = (messageId) => {
    return sendMessage({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
    });
};

const sendImage = (to, imageUrl, caption = '') => {
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'image',
        image: {
            link: imageUrl,
            caption: caption
        }
    });
};

const downloadMedia = async (mediaId) => {
    try {
        const mediaInfo = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${TOKEN}` }
        });
        const mediaUrl = mediaInfo.data.url;
        const response = await axios.get(mediaUrl, {
            headers: { 'Authorization': `Bearer ${TOKEN}` },
            responseType: 'arraybuffer'
        });
        return { buffer: Buffer.from(response.data), mimeType: mediaInfo.data.mime_type };
    } catch (error) {
        console.error('Error downloading Meta media:', error);
        throw error;
    }
};

module.exports = {
    sendText,
    sendButtons,
    sendList,
    sendProductList,
    sendCatalog,
    sendAddressMessage,
    markAsRead,
    sendImage,
    downloadMedia
};
