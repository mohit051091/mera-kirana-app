const axios = require('axios');
const FormData = require('form-data');

const SARVAM_KEY = 'sk_o2r2qvi7_wO6CZZ4vWWlGkgZ45SPwCBrJ';
const WA_TOKEN = 'EAAWJurSGNC8BR6Db6DCyhaP5v1vDkdEyv3PkhR2mj4ycI8lQsvBUl6NbaGW8r4rZC5g4ZBGdFK8LoH8d2sds3WVYAiowCDAR3tEc1sHhW1ZAbXYnaXyZBDtuJnkjPQqUe5SNcoRgecHfcMJTKF7Ee4rgK4SK2gM1fv44NqAY4ZAEq3JuJjdnxSztTVZBL91nL8PwZDZD';
const WA_PHONE_ID = '871709562699676';

async function testFormat(encoding, mimeType, filename) {
    console.log(`Testing Sarvam format=${encoding}, Meta filename=${filename}, mime=${mimeType}...`);
    try {
        const ttsRes = await axios.post('https://api.sarvam.ai/text-to-speech', {
            text: 'Welcome to Mera Kirana!',
            target_language_code: 'hi-IN',
            speaker: 'ritu',
            model: 'bulbul:v3',
            audio_encoding: encoding
        }, {
            headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' }
        });

        const buf = Buffer.from(ttsRes.data.audios[0], 'base64');
        console.log(`  Received ${buf.length} bytes. Header:`, buf.slice(0, 10).toString('hex'));

        const fd = new FormData();
        fd.append('messaging_product', 'whatsapp');
        fd.append('file', buf, { filename, contentType: mimeType });
        fd.append('type', mimeType);

        const up = await axios.post(`https://graph.facebook.com/v17.0/${WA_PHONE_ID}/media`, fd, {
            headers: { 'Authorization': `Bearer ${WA_TOKEN}`, ...fd.getHeaders() }
        });

        const mediaId = up.data.id;
        console.log(`  Uploaded to Meta! Media ID: ${mediaId}`);

        // Try sending to user phone to verify Meta processing doesn't fail on delivery status!
        const send = await axios.post(`https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`, {
            messaging_product: 'whatsapp',
            to: '917039426206',
            type: 'audio',
            audio: { id: mediaId }
        }, {
            headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' }
        });

        console.log(`  SUCCESS! Sent message ID: ${send.data.messages[0].id}\n`);
    } catch (err) {
        console.error(`  FAILED:`, err.response ? err.response.data : err.message, '\n');
    }
}

async function run() {
    await testFormat('mp3', 'audio/mpeg', 'test.mp3');
    await testFormat('aac', 'audio/aac', 'test.aac');
    await testFormat('opus', 'audio/ogg', 'test.ogg');
}

run();
