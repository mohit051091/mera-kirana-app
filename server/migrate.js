const { pool } = require('./src/database/db');

async function runMigration() {
    console.log('🔄 Starting Database Migration...');
    try {
        // 1. Create partner_availability_logs if not exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS partner_availability_logs (
                log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                partner_id UUID REFERENCES delivery_partners(partner_id),
                status_change VARCHAR(50) NOT NULL,
                changed_by VARCHAR(100) DEFAULT 'System',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);
        console.log('✅ Checked/Created Table: partner_availability_logs');

        // 2. Check conversation_logs columns and update if necessary
        const columnsRes = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'conversation_logs';
        `);
        const columns = columnsRes.rows.map(r => r.column_name);

        if (!columns.includes('customer_phone')) {
            await pool.query(`
                ALTER TABLE conversation_logs 
                ADD COLUMN customer_phone VARCHAR(20);
            `);
            console.log('✅ Added Column: customer_phone to conversation_logs');
        }

        if (!columns.includes('message_id')) {
            await pool.query(`
                ALTER TABLE conversation_logs 
                ADD COLUMN message_id VARCHAR(100) UNIQUE;
            `);
            console.log('✅ Added Column: message_id to conversation_logs');
        }

        console.log('🎉 Database Migration Successful!');
    } catch (err) {
        console.error('❌ Migration Failed:', err.message);
    } finally {
        pool.end();
    }
}

runMigration();
