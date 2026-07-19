const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

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
              'sku', pv.sku_code
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
                await client.query(
                    'INSERT INTO product_variants (product_id, weight_label, price, cost_price, stock_quantity, sku_code) VALUES ($1, $2, $3, $4, $5, $6)',
                    [productId, v.weight, v.price, v.cost_price || null, v.stock || 0, v.sku]
                );
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
                if (v.variant_id) {
                    await client.query(
                        `UPDATE product_variants 
                         SET weight_label = $1, price = $2, cost_price = $3, stock_quantity = $4, sku_code = $5, is_active = $6
                         WHERE variant_id = $7 AND product_id = $8`,
                        [v.weight || 'Standard', v.price, v.cost_price || 0, v.stock || 0, v.sku || null, v.is_active !== false, v.variant_id, id]
                    );
                } else {
                    await client.query(
                        `INSERT INTO product_variants (product_id, weight_label, price, cost_price, stock_quantity, sku_code) 
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [id, v.weight || 'Standard', v.price, v.cost_price || 0, v.stock || 0, v.sku || null]
                    );
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
