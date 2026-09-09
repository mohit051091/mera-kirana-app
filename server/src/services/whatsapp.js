const axios = require('axios');
require('dotenv').config();
const { logError } = require('./logger');

function getApiConfig() {
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!phoneId || !token) {
        throw new Error('WhatsApp credentials missing (WHATSAPP_PHONE_ID / WHATSAPP_ACCESS_TOKEN)');
    }
    return { url: `https://graph.facebook.com/v17.0/${phoneId}/messages`, token };
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
            const { url, token } = getApiConfig();
            return await axios.post(url, data, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
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
            await logOutgoingMessage(data.to, data, actualMsgId).catch(() => {});
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
    // Meta limits: max 3 buttons, title ≤ 20 chars
    const safe = (buttons || []).slice(0, 3).map(btn => ({
        type: 'reply',
        reply: { id: String(btn.id), title: String(btn.title || '').slice(0, 20) }
    }));
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: String(text || '').slice(0, 1024) },
            action: {
                buttons: safe
            }
        }
    });
};

const sendList = (to, header, body, buttonText, sections) => {
    const safeSections = (sections || []).map(s => ({
        title: String(s.title || '').slice(0, 24),
        rows: (s.rows || []).slice(0, 10).map(r => ({
            id: String(r.id),
            title: String(r.title || '').slice(0, 24),
            description: r.description ? String(r.description).slice(0, 72) : undefined
        }))
    }));
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
                sections: safeSections
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

const sendAudio = (to, linkOrId) => {
    const audioPayload = linkOrId.startsWith('http') 
        ? { link: linkOrId } 
        : { id: linkOrId };
    return sendMessage({
        messaging_product: 'whatsapp',
        to: to,
        type: 'audio',
        audio: audioPayload
    });
};

const downloadMedia = async (mediaId) => {
    try {
        const { token } = getApiConfig();
        const mediaInfo = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            timeout: 15000,
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const mediaUrl = mediaInfo.data.url;
        const response = await axios.get(mediaUrl, {
            timeout: 30000,
            maxContentLength: 10 * 1024 * 1024,
            maxBodyLength: 10 * 1024 * 1024,
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'arraybuffer'
        });
        return { buffer: Buffer.from(response.data), mimeType: mediaInfo.data.mime_type };
    } catch (error) {
        logError(error, 'downloadMedia');
        throw error;
    }
};

const uploadMedia = async (buffer, filename, mimeType) => {
    try {
        const phoneId = process.env.WHATSAPP_PHONE_ID;
        const { token } = getApiConfig();
        if (!phoneId) throw new Error('WHATSAPP_PHONE_ID missing');
        const formData = new FormData();
        formData.append('messaging_product', 'whatsapp');
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('file', blob, filename);
        formData.append('type', mimeType);

        const response = await axios.post(
            `https://graph.facebook.com/v17.0/${phoneId}/media`,
            formData,
            {
                timeout: 30000,
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }
        );
        return response.data.id;
    } catch (error) {
        logError(error, 'uploadMedia');
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
    sendAudio,
    downloadMedia,
    uploadMedia
};
