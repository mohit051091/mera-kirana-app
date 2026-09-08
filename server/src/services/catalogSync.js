const axios = require('axios');
const { logError } = require('./logger');

const API_VERSION = 'v17.0';

function getConfig() {
    const catalogId = process.env.WHATSAPP_CATALOG_ID;
    const token = process.env.META_CATALOG_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    if (!catalogId || !token) return null;
    return { catalogId, token };
}

// Push one variant to Meta catalog (create-or-update by retailer_id). Returns retailer_id or null.
async function pushVariant({ name, price, retailerId, imageUrl, description, stock }) {
    const cfg = getConfig();
    if (!cfg) return null;
    const payload = {
        access_token: cfg.token,
        retailer_id: retailerId,
        name: String(name).slice(0, 200),
        price: `${Math.round(Number(price) * 100)}INR`,
        currency: 'INR',
        availability: Number(stock) > 0 ? 'in stock' : 'out of stock',
        condition: 'new',
        link: process.env.PUBLIC_URL || 'https://example.com',
        image_link: imageUrl || `${process.env.PUBLIC_URL || 'https://example.com'}/placeholder.png`,
        description: String(description || name).slice(0, 5000),
    };
    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${cfg.catalogId}/products`;
        const r = await axios.post(url, payload, { timeout: 15000 });
        return (r.data && r.data.retailer_id) || retailerId;
    } catch (e) {
        const msg = e.response ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
        logError(new Error('catalog push failed: ' + msg), 'catalogSync.pushVariant');
        return null;
    }
}

async function deleteVariantFromCatalog(retailerId) {
    const cfg = getConfig();
    if (!cfg || !retailerId) return false;
    try {
        const url = `https://graph.facebook.com/${API_VERSION}/${cfg.catalogId}/products`;
        await axios.delete(url, { params: { retailer_id: retailerId, access_token: cfg.token }, timeout: 15000 });
        return true;
    } catch (e) {
        logError(e, 'catalogSync.deleteVariant');
        return false;
    }
}

// Pull Meta catalog items into a plain list for import preview.
async function fetchCatalogItems(limit = 100) {
    const cfg = getConfig();
    if (!cfg) throw new Error('Catalog not configured (WHATSAPP_CATALOG_ID / token missing)');
    const url = `https://graph.facebook.com/${API_VERSION}/${cfg.catalogId}/products`;
    const r = await axios.get(url, {
        params: { fields: 'retailer_id,name,price,image_link,availability', limit, access_token: cfg.token },
        timeout: 15000,
    });
    return (r.data && r.data.data) || [];
}

module.exports = { pushVariant, deleteVariantFromCatalog, fetchCatalogItems, getConfig };
