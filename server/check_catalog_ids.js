const { pool } = require('./src/database/db');
(async () => {
    try {
        const target = process.argv[2] || '1dvax9ozjs';
        const r = await pool.query(
            `SELECT pv.variant_id, pv.sku_code, pv.meta_product_retailer_id, pv.price, pv.is_active, p.base_name
             FROM product_variants pv JOIN products p ON pv.product_id = p.product_id
             ORDER BY p.base_name, pv.price LIMIT 50`
        );
        console.log('TARGET_RETAILER_ID=' + target);
        for (const row of r.rows) {
            const mark = (String(row.meta_product_retailer_id || '').toLowerCase() === target.toLowerCase()
                || String(row.sku_code || '').toLowerCase() === target.toLowerCase()) ? ' <== MATCH' : '';
            console.log(`${row.base_name} | price=${row.price} | sku=${row.sku_code} | retailer=${row.meta_product_retailer_id} | active=${row.is_active}${mark}`);
        }
        await pool.end();
    } catch (e) { console.error('ERR ' + e.message); process.exit(1); }
})();
