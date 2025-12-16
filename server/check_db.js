const { pool } = require('./src/database/db');

async function checkTables() {
    try {
        const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

        console.log('✅ Found Tables:', res.rows.map(r => r.table_name));

        // Also check if we need to setup storage later (just a log for now)
        console.log('ℹ️ Note: Storage buckets for images are not checked here.');

        pool.end();
    } catch (err) {
        console.error('❌ Database Check Failed:', err.message);
    }
}

checkTables();
