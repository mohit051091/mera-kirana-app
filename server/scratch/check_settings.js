const { pool } = require('../src/database/db');

async function main() {
    try {
        const res = await pool.query('SELECT key, value FROM system_settings');
        console.log('System settings in database:');
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}
main();
