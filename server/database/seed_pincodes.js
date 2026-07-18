const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

async function seedPincodes() {
    console.log('🌱 Starting Pincode Seeding...');
    const csvPath = path.join(__dirname, '../pincodes.csv');
    
    try {
        let pincodesToInsert = [];
        
        if (fs.existsSync(csvPath)) {
            console.log('📂 Found pincodes.csv. Parsing and deduplicating CSV records...');
            const fileContent = fs.readFileSync(csvPath, 'utf8');
            const lines = fileContent.split(/\r?\n/);
            
            const startIdx = lines[0].toLowerCase().includes('pincode') ? 1 : 0;
            const seenPincodes = new Set();
            
            for (let i = startIdx; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                // Simple CSV split handling quotes
                const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(p => p.replace(/^"|"$/g, '').trim());
                
                if (parts.length >= 11) {
                    const pinVal = parts[4];
                    if (pinVal && /^\d+$/.test(pinVal) && !seenPincodes.has(pinVal)) {
                        seenPincodes.add(pinVal);
                        pincodesToInsert.push({
                            pincode: pinVal,
                            office_name: parts[3] || 'Unknown Office',
                            taluk: parts[2] || 'Unknown Taluk',
                            district_name: parts[7] || 'Unknown District',
                            state_name: parts[8] || 'Unknown State',
                            latitude: parts[9] || 'NA',
                            longitude: parts[10] || 'NA'
                        });
                    }
                }
            }
            console.log(`✅ Parsed ${pincodesToInsert.length} unique pincodes with coordinates from CSV.`);
        } else {
            console.log('❌ Error: pincodes.csv not found in server root.');
            return;
        }

        console.log('⏳ Batch-inserting unique records into PostgreSQL...');
        const chunkSize = 500;
        for (let i = 0; i < pincodesToInsert.length; i += chunkSize) {
            const chunk = pincodesToInsert.slice(i, i + chunkSize);
            
            let query = `
                INSERT INTO pincode_master (pincode, office_name, taluk, district_name, state_name, latitude, longitude)
                VALUES 
            `;
            const values = [];
            const valueStrings = [];
            
            chunk.forEach((item, idx) => {
                const offset = idx * 7;
                valueStrings.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`);
                values.push(item.pincode, item.office_name, item.taluk, item.district_name, item.state_name, item.latitude, item.longitude);
            });
            
            query += valueStrings.join(', ');
            query += ` ON CONFLICT (pincode) DO UPDATE SET 
                office_name = EXCLUDED.office_name,
                taluk = EXCLUDED.taluk,
                district_name = EXCLUDED.district_name,
                state_name = EXCLUDED.state_name,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude;`;
            
            await pool.query(query, values);
            if (i % 5000 === 0 && i > 0) {
                console.log(`...inserted ${i} unique records`);
            }
        }
        
        console.log(`🎉 Pincodes seeding completed successfully! Total unique records: ${pincodesToInsert.length}.`);
    } catch (err) {
        console.error('❌ Seeding Failed:', err.message);
    } finally {
        pool.end();
    }
}

seedPincodes();
