const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// Best-effort Meta push after DB write. Never fails the request; badge shows Pending on failure.
function scheduleCatalogPush(dbClient, productId, variantId, v, product) {
    setImmediate(async () => {
        try {
            const catalogSync = require('../services/catalogSync');
            if (!catalogSync.getConfig()) return;
            const r = await pool.query(
                'SELECT weight_label, price, sku_code, meta_product_retailer_id, stock_quantity FROM product_variants WHERE variant_id = $1',
                [variantId]
            );
            if (!r.rows.length) return;
            const row = r.rows[0];
            const retailerId = row.meta_product_retailer_id
                || (row.sku_code)
                || `${String(product.base_name || 'ITEM').slice(0, 3).toUpperCase()}-${String(row.weight_label || '').replace(/\s+/g, '').toUpperCase()}-${String(variantId).slice(0, 4).toUpperCase()}`;
            const pushed = await catalogSync.pushVariant({
                name: `${product.base_name} (${row.weight_label})`,
                price: row.price, retailerId,
                imageUrl: product.image_url, description: product.description,
                stock: row.stock_quantity,
            });
            if (pushed) {
                await pool.query('UPDATE product_variants SET meta_product_retailer_id = $1 WHERE variant_id = $2', [pushed, variantId]);
            }
        } catch (e) { console.error('catalog auto-push failed:', e.message); }
    });
}

// GET /api/products - List all products with their variants
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        p.product_id, 
        p.base_name, 
        p.description,
        p.image_url,
        COALESCE(
          json_agg(
            json_build_object(
              'variant_id', pv.variant_id,
              'weight', pv.weight_label,
              'price', pv.price,
              'cost_price', pv.cost_price,
              'stock', pv.stock_quantity,
              'sku', pv.sku_code,
              'retailer_id', pv.meta_product_retailer_id,
              'is_active', pv.is_active,
              'min_qty', pv.min_quantity,
              'max_qty', pv.max_quantity,
              'qty_step', pv.quantity_step
            ) ORDER BY pv.price ASC
          ) FILTER (WHERE pv.variant_id IS NOT NULL), 
          '[]'
        ) as variants
      FROM products p
      LEFT JOIN product_variants pv ON p.product_id = pv.product_id
      WHERE p.is_active = TRUE
      GROUP BY p.product_id
      ORDER BY p.base_name ASC;
    `;
        const result = await pool.query(query);

        // Fetch dynamic cost markup from DB settings
        const markupRes = await pool.query("SELECT value FROM system_settings WHERE key = 'voice_cost_markup'");
        const markupPercent = markupRes.rows.length ? parseFloat(markupRes.rows[0].value) : 2; // Default 2%

        const products = result.rows.map(row => {
            const parsedVariants = typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants;
            const updatedVariants = (parsedVariants || []).map(v => {
                const markedUpPrice = parseFloat(v.price) * (1 + markupPercent / 100);
                return {
                    ...v,
                    original_price: v.price,
                    price: parseFloat(markedUpPrice.toFixed(2)) // Display marked up price
                };
            });
            return {
                ...row,
                variants: updatedVariants
            };
        });

        res.json(products);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// POST /api/products - Create a single product with variants
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { base_name, description, image_url, variants } = req.body;

        // 1. Insert Product
        const productRes = await client.query(
            'INSERT INTO products (base_name, description, image_url) VALUES ($1, $2, $3) RETURNING product_id',
            [base_name, description, image_url]
        );
        const productId = productRes.rows[0].product_id;

        // 2. Insert Variants
        if (variants && variants.length > 0) {
            for (const v of variants) {
                const minQ = Math.min(Math.max(parseInt(v.min_qty, 10) || 1, 1), 100);
                const maxQ = Math.min(Math.max(parseInt(v.max_qty, 10) || 20, minQ), 100);
                const stepQ = [1, 2, 5].includes(parseInt(v.qty_step, 10)) ? parseInt(v.qty_step, 10) : 1;
                const ins = await client.query(
                    'INSERT INTO product_variants (product_id, weight_label, price, cost_price, stock_quantity, sku_code, min_quantity, max_quantity, quantity_step) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING variant_id',
                    [productId, v.weight, v.price, v.cost_price || null, v.stock || 0, v.sku, minQ, maxQ, stepQ]
                );
                scheduleCatalogPush(client, productId, ins.rows[0].variant_id, v, { base_name, description, image_url });
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ message: 'Product created', productId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to create product' });
    } finally {
        client.release();
    }
});

// POST /api/products/bulk - Bulk Upload (Expects JSON array)
// The Frontend will convert CSV to this JSON format
router.post('/bulk', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const products = req.body; // Array of { base_name, variants: [...] }

        let count = 0;
        for (const p of products) {
            const productRes = await client.query(
                'INSERT INTO products (base_name, description, category_id) VALUES ($1, $2, $3) RETURNING product_id',
                [p.base_name, p.description, p.category_id || null]
            );
            const productId = productRes.rows[0].product_id;

            if (p.variants) {
                for (const v of p.variants) {
                    await client.query(
                        'INSERT INTO product_variants (product_id, weight_label, price, cost_price, stock_quantity) VALUES ($1, $2, $3, $4, $5)',
                        [productId, v.weight, v.price, v.cost_price || null, v.stock || 100]
                    );
                }
            }
            count++;
        }

        await client.query('COMMIT');
        res.json({ message: `Successfully imported ${count} products` });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Bulk upload failed' });
    } finally {
        client.release();
    }
});

// PUT /api/products/:id - Update product & variants
router.put('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { base_name, description, image_url, variants } = req.body;

        // 1. Update Product details
        await client.query(
            'UPDATE products SET base_name = $1, description = $2, image_url = $3 WHERE product_id = $4',
            [base_name, description, image_url || null, id]
        );

        // 2. Update Variants
        if (variants && variants.length > 0) {
            for (const v of variants) {
                const minQ = Math.min(Math.max(parseInt(v.min_qty ?? v.min_quantity, 10) || 1, 1), 100);
                const maxQ = Math.min(Math.max(parseInt(v.max_qty ?? v.max_quantity, 10) || 20, minQ), 100);
                const stepQ = [1, 2, 5].includes(parseInt(v.qty_step ?? v.quantity_step, 10)) ? parseInt(v.qty_step ?? v.quantity_step, 10) : 1;
                if (v.variant_id) {
                    await client.query(
                        `UPDATE product_variants
                          SET weight_label = $1, price = $2, cost_price = $3, stock_quantity = $4, sku_code = $5, is_active = $6,
                              min_quantity = $7, max_quantity = $8, quantity_step = $9,
                              meta_product_retailer_id = COALESCE(NULLIF($10,''), meta_product_retailer_id)
                          WHERE variant_id = $11 AND product_id = $12`,
                        [v.weight || 'Standard', v.price, v.cost_price || 0, v.stock ?? v.stock_quantity ?? 0, v.sku || v.sku_code || null, v.is_active !== false, minQ, maxQ, stepQ, v.retailer_id || v.meta_product_retailer_id || '', v.variant_id, id]
                    );
                    scheduleCatalogPush(client, id, v.variant_id, v, { base_name, description, image_url });
                } else {
                    const ins = await client.query(
                        `INSERT INTO product_variants (product_id, weight_label, price, cost_price, stock_quantity, sku_code, min_quantity, max_quantity, quantity_step, meta_product_retailer_id)
                          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULLIF($10,''))
                          RETURNING variant_id`,
                        [id, v.weight || 'Standard', v.price, v.cost_price || 0, v.stock ?? 0, v.sku || null, minQ, maxQ, stepQ, v.retailer_id || '']
                    );
                    scheduleCatalogPush(client, id, ins.rows[0].variant_id, v, { base_name, description, image_url });
                }
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Product updated successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Update Product Error:', err);
        res.status(500).json({ error: 'Failed to update product' });
    } finally {
        client.release();
    }
});

// POST /api/products/import-catalog - Pull Meta catalog items into DB (first fill / reconcile)
router.post('/import-catalog', async (req, res) => {
    try {
        const catalogSync = require('../services/catalogSync');
        const items = await catalogSync.fetchCatalogItems(200);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let upserted = 0;
            for (const it of items) {
                const price = parseFloat(String(it.price || '0').replace(/[^0-9.]/g, '')) / 100 || 0;
                const name = it.name || it.retailer_id;
                const chk = await client.query('SELECT variant_id FROM product_variants WHERE meta_product_retailer_id = $1', [it.retailer_id]);
                if (chk.rows.length) {
                    await client.query('UPDATE product_variants SET price = $1, is_active = TRUE WHERE meta_product_retailer_id = $2', [price || 0, it.retailer_id]);
                } else {
                    let pr = await client.query('SELECT product_id FROM products WHERE base_name = $1', [name]);
                    let pid = pr.rows[0]?.product_id;
                    if (!pid) {
                        const ins = await client.query('INSERT INTO products (base_name, description, is_active) VALUES ($1,$2,TRUE) RETURNING product_id', [name, 'Imported from Meta catalog']);
                        pid = ins.rows[0].product_id;
                    }
                    await client.query(
                        'INSERT INTO product_variants (product_id, weight_label, price, stock_quantity, meta_product_retailer_id, is_active) VALUES ($1,$2,$3,100,$4,TRUE)',
                        [pid, 'Standard', price || 0, it.retailer_id]
                    );
                }
                upserted++;
            }
            await client.query('COMMIT');
            res.json({ message: `Imported/reconciled ${upserted} Meta items`, count: upserted });
        } catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
    } catch (err) {
        console.error('import-catalog failed:', err.message);
        res.status(500).json({ error: err.message || 'Import failed (check META_CATALOG_TOKEN + WHATSAPP_CATALOG_ID)' });
    }
});

// POST /api/products/:id/push - Push one product + variants to Meta now
router.post('/:id/push', async (req, res) => {
    try {
        const catalogSync = require('../services/catalogSync');
        if (!catalogSync.getConfig()) return res.status(400).json({ error: 'Catalog not configured (WHATSAPP_CATALOG_ID / META_CATALOG_TOKEN)' });
        const { id } = req.params;
        const pr = await pool.query('SELECT base_name, description, image_url FROM products WHERE product_id = $1', [id]);
        if (!pr.rows.length) return res.status(404).json({ error: 'Product not found' });
        const vr = await pool.query('SELECT variant_id, weight_label, price, sku_code, meta_product_retailer_id, stock_quantity FROM product_variants WHERE product_id = $1 AND is_active = TRUE', [id]);
        let pushed = 0;
        for (const v of vr.rows) {
            const retailerId = v.meta_product_retailer_id || v.sku_code || `${pr.rows[0].base_name.slice(0, 3).toUpperCase()}-${String(v.weight_label).replace(/\s+/g, '').toUpperCase()}`;
            const ok = await catalogSync.pushVariant({ name: `${pr.rows[0].base_name} (${v.weight_label})`, price: v.price, retailerId, imageUrl: pr.rows[0].image_url, description: pr.rows[0].description, stock: v.stock_quantity });
            if (ok) { await pool.query('UPDATE product_variants SET meta_product_retailer_id = $1 WHERE variant_id = $2', [ok, v.variant_id]); pushed++; }
        }
        res.json({ message: `Pushed ${pushed}/${vr.rows.length} variants to Meta`, pushed });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Push failed' }); }
});

// PATCH /api/products/variants/:variantId - Toggle active / stock quick edit (owner dashboard)
router.patch('/variants/:variantId', async (req, res) => {
    try {
        const { variantId } = req.params;
        const { is_active, stock_quantity } = req.body;
        const updates = [], params = [variantId];
        if (is_active !== undefined) { updates.push(`is_active = $${params.length + 1}`); params.push(!!is_active); }
        if (stock_quantity !== undefined) { updates.push(`stock_quantity = $${params.length + 1}`); params.push(Math.max(0, parseInt(stock_quantity, 10) || 0)); }
        if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
        await pool.query(`UPDATE product_variants SET ${updates.join(', ')} WHERE variant_id = $1`, params);
        if (is_active === false) {
            const r = await pool.query('SELECT meta_product_retailer_id FROM product_variants WHERE variant_id = $1', [variantId]);
            if (r.rows[0]?.meta_product_retailer_id) {
                const catalogSync = require('../services/catalogSync');
                await catalogSync.deleteVariantFromCatalog(r.rows[0].meta_product_retailer_id);
            }
        }
        res.json({ message: 'Variant updated' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Variant update failed' }); }
});

// DELETE /api/products/:id - Soft delete product (set is_active = FALSE)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE products SET is_active = FALSE WHERE product_id = $1', [id]);
        // Also soft-deactivate all its variants
        await pool.query('UPDATE product_variants SET is_active = FALSE WHERE product_id = $1', [id]);
        res.json({ message: 'Product deactivated successfully' });
    } catch (err) {
        console.error('Deactivate Product Error:', err);
        res.status(500).json({ error: 'Failed to deactivate product' });
    }
});

module.exports = router;
