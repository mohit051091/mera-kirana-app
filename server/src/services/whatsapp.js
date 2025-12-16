const axios = require('axios');
require('dotenv').config();

const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

const sendMessage = async (data) => {
    try {
        await axios.post(WHATSAPP_API_URL, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            }
        });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error.response ? error.response.data : error.message);
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

const markAsRead = (messageId) => {
    return sendMessage({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
    });
};

module.exports = {
    sendText,
    sendButtons,
    sendList,
    markAsRead
};
