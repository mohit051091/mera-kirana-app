const { pool } = require('./src/database/db');
(async () => {
    const hourly = parseInt(process.argv[2] || '20', 10);
    const daily = parseInt(process.argv[3] || '50', 10);
    await pool.query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES ('voice_rate_limit_hourly', $1, NOW()), ('voice_rate_limit_daily', $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(hourly), JSON.stringify(daily)]
    );
    console.log(`LIMITS_SET hourly=${hourly} daily=${daily}`);
    await pool.end();
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
