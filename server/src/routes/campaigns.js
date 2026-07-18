const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');
const whatsappService = require('../services/whatsapp');

// GET /api/campaigns - Get all past marketing campaigns
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM campaigns ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

// POST /api/campaigns/broadcast - Trigger batch marketing templates
router.post('/broadcast', async (req, res) => {
    try {
        const { name, templateType, messageBody, imageUrl, segment } = req.body;

        if (!name || !messageBody || !segment) {
            return res.status(400).json({ error: 'Missing required parameters: name, messageBody, segment' });
        }

        // 1. Fetch recipient numbers based on segment choice
        let query = 'SELECT phone FROM customers WHERE dnd_active = false';
        const params = [];
        
        if (segment === 'REFERRAL') {
            query += ' AND referred_by_salesperson_id IS NOT NULL';
        }
        
        const custQuery = await pool.query(query, params);
        const phones = custQuery.rows.map(r => r.phone);

        if (phones.length === 0) {
            return res.status(400).json({ error: 'No active subscribers found in this segment' });
        }

        console.log(`🚀 Triggering Campaign: ${name} (Type: ${templateType}) to ${phones.length} active contacts.`);

        let successCount = 0;
        let apiCost = 0.00;

        // 2. Loop over numbers and dispatch
        for (const phone of phones) {
            try {
                // Meta API standard cost charge: ~ ₹0.72 per marketing conversation in India
                apiCost += 0.72; 
                
                if (templateType === 'IMAGE_TEXT' && imageUrl) {
                    await whatsappService.sendImage(phone, imageUrl, messageBody);
                } else {
                    await whatsappService.sendText(phone, messageBody);
                }
                successCount++;
                
                // Slight delay to prevent webhook lock/rate controls
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (err) {
                console.error(`Failed to dispatch message to: ${phone}`, err.message);
            }
        }

        // 3. Log details in campaigns registry table
        const campaignLog = await pool.query(`
            INSERT INTO campaigns (name, type, total_sent, meta_api_cost, sales_generated, profit_margin)
            VALUES ($1, $2, $3, $4, 0.00, 0.00)
            RETURNING campaign_id, name, total_sent, meta_api_cost
        `, [name, 'Promo', successCount, apiCost]);

        res.status(201).json({
            message: `Campaign broadcast completed successfully.`,
            campaign: campaignLog.rows[0],
            targeted: phones.length,
            dispatched: successCount
        });

    } catch (err) {
        console.error('Campaign broadcast failure:', err);
        res.status(500).json({ error: 'Failed to execute broadcast' });
    }
});

module.exports = router;
