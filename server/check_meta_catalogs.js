const axios = require('axios');
(async () => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) { console.error('ERR missing WHATSAPP_ACCESS_TOKEN'); process.exit(1); }
    const catalogs = ['1565894964726780', '1096398329205036'];
    const target = '1dvax9ozjs';
    for (const cat of catalogs) {
        try {
            const url = `https://graph.facebook.com/v17.0/${cat}/products`;
            const r = await axios.get(url, { params: { fields: 'id,retailer_id,name,price', limit: 50, access_token: token }, timeout: 15000 });
            const items = (r.data && r.data.data) || [];
            console.log(`CATALOG ${cat}: ${items.length} items`);
            for (const it of items.slice(0, 20)) {
                const mark = String(it.retailer_id || '') === target ? ' <== ORDER MATCH' : '';
                console.log(`  - ${it.name} | retailer=${it.retailer_id}${mark}`);
            }
            if (items.some((it) => String(it.retailer_id) === target)) console.log(`RESULT: live catalog = ${cat}`);
        } catch (e) {
            const msg = e.response ? JSON.stringify(e.response.data).slice(0, 300) : e.message;
            console.log(`CATALOG ${cat}: ERROR ${msg}`);
        }
    }
})();
