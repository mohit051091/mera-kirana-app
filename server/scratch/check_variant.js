const { pool } = require('../src/database/db');

async function main() {
    try {
        // Check for specific retailer IDs from the logs
        const ids = ['1dvax9ozjs', 'w3r33lopvf'];
        for (const id of ids) {
            const res = await pool.query(
                "SELECT variant_id, sku_code, meta_product_retailer_id, price FROM product_variants WHERE sku_code = $1 OR meta_product_retailer_id = $1",
                [id]
            );
            console.log(`\nLookup for "${id}": ${res.rows.length} rows found`);
            if (res.rows.length > 0) console.table(res.rows);
            else console.log('  -> NOT FOUND in database!');
        }

        // Also do case-insensitive check
        for (const id of ids) {
            const res = await pool.query(
                "SELECT variant_id, sku_code, meta_product_retailer_id, price FROM product_variants WHERE LOWER(sku_code) = LOWER($1) OR LOWER(meta_product_retailer_id) = LOWER($1)",
                [id]
            );
            console.log(`\nCase-insensitive lookup for "${id}": ${res.rows.length} rows found`);
            if (res.rows.length > 0) console.table(res.rows);
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
main();
