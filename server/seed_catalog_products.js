// One-time seed: mirror Meta Catalogue_Products (1565894964726780) into local DB.
// Mawa (Khoya): 4 variants @ Rs 432 | Paneer: 200gm Rs 72, 500gm Rs 180.
const { pool } = require('./src/database/db');

const SEED = [
    {
        base_name: 'Mawa (Khoya)', description: 'Fresh khoya/mawa for sweets',
        variants: [
            { weight: '500 gm', price: 432, retailer: '0l9oxsl56om' },
            { weight: '200 gm', price: 432, retailer: '5h0o9zetew' },
            { weight: '500 gm', price: 432, retailer: 'yrgj3roo1w' },
            { weight: '200 gm', price: 432, retailer: 'w3r33lopvf' },
        ],
    },
    {
        base_name: 'Paneer', description: 'Fresh paneer',
        variants: [
            { weight: '500 gm', price: 180, retailer: 'dfkz75axnm' },
            { weight: '200 gm', price: 72, retailer: '1dvax9ozjs' },
        ],
    },
];

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of SEED) {
            const pr = await client.query(
                `INSERT INTO products (base_name, description, is_active) VALUES ($1, $2, TRUE)
                 ON CONFLICT DO NOTHING RETURNING product_id`
            , [p.base_name, p.description]);
            let productId;
            if (pr.rows.length) productId = pr.rows[0].product_id;
            else {
                const ex = await client.query('SELECT product_id FROM products WHERE base_name = $1', [p.base_name]);
                productId = ex.rows[0].product_id;
            }
            for (const v of p.variants) {
                const sku = `${p.base_name.slice(0, 3).toUpperCase()}-${v.weight.replace(/\s+/g, '').toUpperCase()}-${v.retailer.slice(0, 4).toUpperCase()}`;
                await client.query(
                    `INSERT INTO product_variants (product_id, weight_label, price, stock_quantity, sku_code, meta_product_retailer_id, is_active, min_quantity, max_quantity, quantity_step)
                     VALUES ($1,$2,$3,100,$4,$5,TRUE,1,20,1)
                     ON CONFLICT DO NOTHING`, [productId, v.weight, v.price, sku, v.retailer]);
                // If variant exists by retailer id, refresh price/weight/active
                await client.query(
                    `UPDATE product_variants SET weight_label=$1, price=$2, is_active=TRUE
                     WHERE meta_product_retailer_id=$3`, [v.weight, v.price, v.retailer]);
            }
            console.log(`seeded ${p.base_name}: ${p.variants.length} variants`);
        }
        await client.query('COMMIT');
        console.log('SEED_DONE');
    } catch (e) { await client.query('ROLLBACK'); console.error('SEED_ERR ' + e.message); process.exit(1); }
    finally { client.release(); await pool.end(); }
})();
