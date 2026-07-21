const { pool } = require('./src/database/db');

async function runMigration() {
    console.log('🔄 Starting Database Migration...');
    try {
        // 1. Enable UUID Extension
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
        console.log('✅ Checked Extension: uuid-ossp');

        // 2. Check and add columns on customers table
        const customersColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'customers';
        `);
        const customersCols = customersColsRes.rows.map(r => r.column_name);

        if (!customersCols.includes('dnd_active')) {
            await pool.query(`ALTER TABLE customers ADD COLUMN dnd_active BOOLEAN DEFAULT FALSE;`);
            console.log('✅ Added Column: dnd_active to customers');
        }

        if (!customersCols.includes('referred_by_salesperson_id')) {
            await pool.query(`ALTER TABLE customers ADD COLUMN referred_by_salesperson_id UUID;`);
            console.log('✅ Added Column: referred_by_salesperson_id to customers');
        }

        // 3. Check and add columns on product_variants table
        const variantsColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'product_variants';
        `);
        const variantsCols = variantsColsRes.rows.map(r => r.column_name);

        if (!variantsCols.includes('cost_price')) {
            await pool.query(`ALTER TABLE product_variants ADD COLUMN cost_price DECIMAL(10, 2) DEFAULT 0.00;`);
            console.log('✅ Added Column: cost_price to product_variants');
        }

        if (!variantsCols.includes('meta_product_retailer_id')) {
            await pool.query(`ALTER TABLE product_variants ADD COLUMN meta_product_retailer_id VARCHAR(100);`);
            console.log('✅ Added Column: meta_product_retailer_id to product_variants');
        }

        // 4. Create carts table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS carts (
                cart_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                customer_id UUID REFERENCES customers(customer_id),
                status VARCHAR(20) DEFAULT 'ACTIVE',
                session_metadata JSONB DEFAULT '{}'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: carts');

        const cartsColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'carts';
        `);
        const cartsCols = cartsColsRes.rows.map(r => r.column_name);
        if (!cartsCols.includes('session_metadata')) {
            await pool.query(`ALTER TABLE carts ADD COLUMN session_metadata JSONB DEFAULT '{}'::jsonb;`);
            console.log('✅ Added Column: session_metadata to carts');
        }

        // 5. Create cart_items table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cart_items (
                cart_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                cart_id UUID REFERENCES carts(cart_id) ON DELETE CASCADE,
                variant_id UUID REFERENCES product_variants(variant_id),
                quantity INTEGER NOT NULL DEFAULT 1,
                UNIQUE(cart_id, variant_id)
            );
        `);
        console.log('✅ Checked/Created Table: cart_items');

        // 6. Create system_settings table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS system_settings (
                key VARCHAR(100) PRIMARY KEY,
                value JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: system_settings');

        // Seed default settings if not exists
        const defaultSettings = [
            { key: 'minimum_order_value', value: 150 },
            { key: 'voice_rate_limit_hourly', value: 3 },
            { key: 'voice_rate_limit_daily', value: 10 },
            { key: 'voice_cost_markup', value: 2 },
            { key: 'voice_duration_cap', value: 30 }
            // Welcome tip audio media IDs are seeded separately via:  node scratch/seed_welcome_audio.js
        ];
        for (const setting of defaultSettings) {
            await pool.query(`
                INSERT INTO system_settings (key, value, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (key) DO NOTHING
            `, [setting.key, JSON.stringify(setting.value)]);
        }
        console.log('✅ Seeded Default System Settings');

        // 7. Create pincode_master table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pincode_master (
                pincode VARCHAR(10) PRIMARY KEY,
                office_name VARCHAR(100),
                taluk VARCHAR(100),
                district_name VARCHAR(100),
                state_name VARCHAR(100)
            );
        `);
        console.log('✅ Checked/Created Table: pincode_master');

        const pincodeColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'pincode_master';
        `);
        const pincodeCols = pincodeColsRes.rows.map(r => r.column_name);
        if (!pincodeCols.includes('is_allowed')) {
            await pool.query(`ALTER TABLE pincode_master ADD COLUMN is_allowed BOOLEAN DEFAULT FALSE;`);
            await pool.query(`UPDATE pincode_master SET is_allowed = TRUE WHERE pincode IN ('400078', '400077', '400076', '400080');`);
            console.log('✅ Added Column: is_allowed to pincode_master');
        }
        if (!pincodeCols.includes('latitude')) {
            await pool.query(`ALTER TABLE pincode_master ADD COLUMN latitude VARCHAR(30);`);
            await pool.query(`ALTER TABLE pincode_master ADD COLUMN longitude VARCHAR(30);`);
            console.log('✅ Added Columns: latitude, longitude to pincode_master');
        }

        // 8. Create dropoffs table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS dropoffs (
                dropoff_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                customer_id UUID REFERENCES customers(customer_id),
                stage VARCHAR(20) CHECK (stage IN ('CART', 'ADDRESS', 'SLOT', 'PAYMENT')),
                reason VARCHAR(50) CHECK (reason IN ('UNSERVICEABLE', 'OUT_OF_HOURS', 'VACATION_MODE', 'HIGH_PRICE', 'NO_SLOT', 'EXIT_INTENT_ABANDONED', 'OTHER')),
                notes TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: dropoffs');

        // 9. Create campaigns table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS campaigns (
                campaign_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                type VARCHAR(30) CHECK (type IN ('Promo', 'Festive', 'Clearance')),
                products_promoted UUID[],
                total_sent INTEGER DEFAULT 0,
                meta_api_cost DECIMAL(10, 2) DEFAULT 0.00,
                sales_generated DECIMAL(10, 2) DEFAULT 0.00,
                profit_margin DECIMAL(10, 2) DEFAULT 0.00,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: campaigns');

        // 10. Create coupons table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS coupons (
                coupon_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                code VARCHAR(50) UNIQUE NOT NULL,
                discount_type VARCHAR(10) CHECK (discount_type IN ('PERCENT', 'FLAT')),
                discount_value DECIMAL(10, 2) NOT NULL,
                min_order_value DECIMAL(10, 2) DEFAULT 0.00,
                start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                end_date TIMESTAMP WITH TIME ZONE,
                max_uses INTEGER DEFAULT NULL,
                current_uses INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE
            );
        `);
        console.log('✅ Checked/Created Table: coupons');

        // 11. Create salespeople table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS salespeople (
                salesperson_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) UNIQUE NOT NULL,
                referral_code VARCHAR(20) UNIQUE NOT NULL,
                incentive_type VARCHAR(10) CHECK (incentive_type IN ('PERCENT', 'FLAT')),
                incentive_value DECIMAL(10, 2) NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: salespeople');

        // 12. Create sales_commissions table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sales_commissions (
                commission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                salesperson_id UUID REFERENCES salespeople(salesperson_id),
                order_id UUID REFERENCES orders(order_id),
                commission_amount DECIMAL(10, 2) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: sales_commissions');

        // 13. Add Foreign Key reference on customers table back to salespeople if not exists
        const constraintsRes = await pool.query(`
            SELECT conname 
            FROM pg_constraint 
            WHERE conname = 'fk_referred_by_salesperson';
        `);
        if (constraintsRes.rowCount === 0) {
            await pool.query(`
                ALTER TABLE customers 
                ADD CONSTRAINT fk_referred_by_salesperson 
                FOREIGN KEY (referred_by_salesperson_id) 
                REFERENCES salespeople(salesperson_id);
            `);
            console.log('✅ Added Foreign Key Constraint: fk_referred_by_salesperson to customers');
        }

        // 14. Create subscriptions table & indexes
        await pool.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                subscription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                customer_id UUID REFERENCES customers(customer_id),
                variant_id UUID REFERENCES product_variants(variant_id),
                quantity INTEGER NOT NULL DEFAULT 1,
                frequency VARCHAR(20) CHECK (frequency IN ('DAILY', 'ALTERNATE', 'WEEKLY')),
                status VARCHAR(20) DEFAULT 'ACTIVE',
                next_delivery_date DATE NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_subscriptions_customer_id ON subscriptions(customer_id);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created_at ON subscriptions(status, created_at DESC);
        `);
        console.log('✅ Checked/Created Table: subscriptions & indexes');

        // 15. Verify/Alter conversation_logs schema columns
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversation_logs (
                log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                customer_phone VARCHAR(20) NOT NULL,
                message_type VARCHAR(20),
                content TEXT,
                message_id VARCHAR(100) UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        
        const logColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'conversation_logs';
        `);
        const logCols = logColsRes.rows.map(r => r.column_name);
        
        if (!logCols.includes('conversation_id')) {
            await pool.query(`ALTER TABLE conversation_logs ADD COLUMN conversation_id UUID;`);
            console.log('✅ Added Column: conversation_id to conversation_logs');
        }
        if (!logCols.includes('session_stage')) {
            await pool.query(`ALTER TABLE conversation_logs ADD COLUMN session_stage VARCHAR(50);`);
            console.log('✅ Added Column: session_stage to conversation_logs');
        }
        if (!logCols.includes('metadata')) {
            await pool.query(`ALTER TABLE conversation_logs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;`);
            console.log('✅ Added Column: metadata to conversation_logs');
        }
        if (!logCols.includes('processing_type')) {
            await pool.query(`ALTER TABLE conversation_logs ADD COLUMN processing_type VARCHAR(20) DEFAULT 'manual';`);
            console.log('✅ Added Column: processing_type to conversation_logs');
        }

        // 16. Verify/Alter customers schema for preferred language
        const customerColsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'customers';
        `);
        const customerCols = customerColsRes.rows.map(r => r.column_name);
        if (!customerCols.includes('language')) {
            await pool.query(`ALTER TABLE customers ADD COLUMN language VARCHAR(5) DEFAULT 'EN';`);
            console.log('✅ Added Column: language to customers');
        }

        // 17. Backfill meta_product_retailer_id from sku_code where missing
        const backfillRes = await pool.query(`
            UPDATE product_variants 
            SET meta_product_retailer_id = sku_code 
            WHERE meta_product_retailer_id IS NULL AND sku_code IS NOT NULL
        `);
        if (backfillRes.rowCount > 0) {
            console.log(`✅ Backfilled meta_product_retailer_id for ${backfillRes.rowCount} product variants`);
        }

        // 18. Auto-seed welcome tip voice note media IDs if missing
        const mediaCheck = await pool.query("SELECT 1 FROM system_settings WHERE key = 'welcome_tip_new_media_id_EN' LIMIT 1");
        if (mediaCheck.rows.length === 0) {
            console.log('🎙️ Welcome tip voice notes missing in DB. Auto-generating via Sarvam TTS and uploading to Meta...');
            try {
                const SARVAM_KEY = process.env.SARVAM_API_KEY;
                const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
                const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

                if (SARVAM_KEY && WA_TOKEN && WA_PHONE_ID) {
                    const axios = require('axios');
                    const FormData = require('form-data');
                    const TIPS = {
                        TIP_NEW: {
                            EN: "Welcome to Mera Kirana! You can browse our dairy products by tapping View Products below. Or, simply send a voice note telling us what you need — for example, say '2 packets of curd and 1 litre milk'. We'll add it to your cart automatically!",
                            HI: "मेरा किराना में आपका स्वागत है! नीचे 'उत्पाद देखें' बटन दबाकर हमारे डेयरी प्रोडक्ट्स देखें। या, बस एक वॉइस नोट भेजें — जैसे '2 पैकेट दही और 1 लीटर दूध'। हम इसे अपने आप आपकी कार्ट में जोड़ देंगे!",
                            MR: "मेरा किराना मध्ये आपले स्वागत आहे! खाली 'उत्पादने पहा' बटण दाबून आमची डेअरी उत्पादने पहा. किंवा, फक्त एक व्हॉइस नोट पाठवा — जसे '2 पॅकेट दही आणि 1 लिटर दूध'. आम्ही ते आपोआप तुमच्या कार्टमध्ये जोडू!"
                        },
                        TIP_REPEAT: {
                            EN: "Welcome back to Mera Kirana! You can repeat your last order with one tap, browse products, or send a voice note to order directly.",
                            HI: "मेरा किराना में फिर से आपका स्वागत है! आप एक टैप से अपना पिछला ऑर्डर दोहरा सकते हैं, प्रोडक्ट्स देख सकते हैं, या सीधे वॉइस नोट भेजकर ऑर्डर कर सकते हैं।",
                            MR: "मेरा किराना मध्ये पुन्हा स्वागत! तुम्ही एका टॅपने तुमची शेवटची ऑर्डर पुन्हा करू शकता, उत्पादने पाहू शकता, किंवा थेट व्हॉइस नोट पाठवून ऑर्डर करू शकता।"
                        }
                    };
                    const LANG_MAP = { EN: 'en-IN', HI: 'hi-IN', MR: 'mr-IN' };
                    const variants = [
                        { settingsKey: 'welcome_tip_new_media_id_EN', type: 'TIP_NEW', lang: 'EN' },
                        { settingsKey: 'welcome_tip_new_media_id_HI', type: 'TIP_NEW', lang: 'HI' },
                        { settingsKey: 'welcome_tip_new_media_id_MR', type: 'TIP_NEW', lang: 'MR' },
                        { settingsKey: 'welcome_tip_repeat_media_id_EN', type: 'TIP_REPEAT', lang: 'EN' },
                        { settingsKey: 'welcome_tip_repeat_media_id_HI', type: 'TIP_REPEAT', lang: 'HI' },
                        { settingsKey: 'welcome_tip_repeat_media_id_MR', type: 'TIP_REPEAT', lang: 'MR' }
                    ];

                    for (const v of variants) {
                        const text = TIPS[v.type][v.lang];
                        const ttsRes = await axios.post('https://api.sarvam.ai/text-to-speech', {
                            text,
                            target_language_code: LANG_MAP[v.lang],
                            speaker: 'ritu',
                            model: 'bulbul:v3'
                        }, {
                            headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
                            timeout: 30000
                        });

                        if (ttsRes.data?.audios?.[0]) {
                            const audioBuffer = Buffer.from(ttsRes.data.audios[0], 'base64');
                            const formData = new FormData();
                            formData.append('messaging_product', 'whatsapp');
                            formData.append('file', audioBuffer, { filename: 'tip.wav', contentType: 'audio/wav' });
                            formData.append('type', 'audio/wav');

                            const uploadRes = await axios.post(
                                `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/media`,
                                formData,
                                { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, ...formData.getHeaders() } }
                            );

                            const mediaId = uploadRes.data.id;
                            await pool.query(
                                `INSERT INTO system_settings (key, value) VALUES ($1, $2)
                                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                                [v.settingsKey, JSON.stringify(mediaId)]
                            );
                            console.log(`  ✅ Auto-seeded welcome audio media ID for ${v.settingsKey}`);
                        }
                    }
                } else {
                    console.warn('⚠️ Missing API keys for auto-seeding welcome audio.');
                }
            } catch (autoErr) {
                console.error('⚠️ Auto-seeding welcome audio failed:', autoErr.message);
            }
        }

        console.log('🎉 Database Migration Successful!');
    } catch (err) {
        console.error('❌ Migration Failed:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
