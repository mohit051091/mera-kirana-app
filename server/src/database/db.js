const { Pool } = require('pg');
const dns = require('dns');
require('dotenv').config();

let poolInstance = null;

function getPool() {
    if (!poolInstance) {
        const host = process.env.DB_HOST_IP || process.env.DB_HOST;
        console.log(`Connecting to database at host: ${host}`);
        poolInstance = new Pool({
            user: process.env.DB_USER,
            host: host,
            database: process.env.DB_NAME,
            password: process.env.DB_PASSWORD,
            port: process.env.DB_PORT || 5432,
            ssl: { rejectUnauthorized: false }
        });
        poolInstance.on('error', (err, client) => {
            console.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }
    return poolInstance;
}

// Pre-resolve database hostname to IPv4 on startup
dns.lookup(process.env.DB_HOST, { family: 4 }, (err, address) => {
    if (!err) {
        process.env.DB_HOST_IP = address;
        console.log(`✅ Pre-resolved database hostname to IPv4: ${address}`);
    } else {
        console.error(`⚠️ Database DNS pre-resolution failed: ${err.message}`);
    }
});

module.exports = {
    query: (text, params) => getPool().query(text, params),
    get pool() { return getPool(); }
};
