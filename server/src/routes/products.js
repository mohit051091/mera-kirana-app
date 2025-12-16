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
        res.json(result.rows);
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
                    'INSERT INTO product_variants (product_id, weight_label, price, stock_quantity, sku_code) VALUES ($1, $2, $3, $4, $5)',
                    [productId, v.weight, v.price, v.stock || 0, v.sku]
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
                        'INSERT INTO product_variants (product_id, weight_label, price, stock_quantity) VALUES ($1, $2, $3, $4)',
                        [productId, v.weight, v.price, v.stock || 100]
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

module.exports = router;
