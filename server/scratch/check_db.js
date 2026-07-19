const { pool } = require('../src/database/db');

async function main() {
    try {
        const res = await pool.query('SELECT variant_id, sku_code, meta_product_retailer_id, price FROM product_variants');
        console.log('Product variants in database:');
        console.table(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
main();
