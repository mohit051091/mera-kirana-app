const axios = require('axios');
require('dotenv').config();

const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_ID}/messages`;

// Validate environment variables on startup
if (!WHATSAPP_PHONE_ID || !TOKEN) {
    console.error('CRITICAL: Missing WhatsApp credentials!');
    console.error(`WHATSAPP_PHONE_ID: ${WHATSAPP_PHONE_ID ? 'SET' : 'MISSING'}`);
    console.error(`WHATSAPP_ACCESS_TOKEN: ${TOKEN ? 'SET' : 'MISSING'}`);
}

const sendMessage = async (data) => {
    try {
        const response = await axios.post(WHATSAPP_API_URL, data, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${TOKEN}`
            }
        });
        return response.data;
    } catch (error) {
        // Enhanced error logging
        if (error.response) {
            // The request was made and the server responded with a status code outside of 2xx
            console.error('WhatsApp API Error Response:');
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Headers:', error.response.headers);
        } else if (error.request) {
            // The request was made but no response was received
            console.error('No response received from WhatsApp API');
            console.error('Request:', error.request);
        } else {
            // Something happened in setting up the request
            console.error('Error setting up WhatsApp request:', error.message);
        }
        console.error('Full error stack:', error.stack);
        throw error; // Re-throw so calling code knows it failed
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

module.exports = {
    sendText,
    sendButtons,
    sendList,
    sendProductList,
    sendCatalog,
    sendAddressMessage,
    markAsRead
};
