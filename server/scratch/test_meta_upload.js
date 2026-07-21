const axios = require('axios');
const FormData = require('form-data');

const SARVAM_KEY = 'sk_o2r2qvi7_wO6CZZ4vWWlGkgZ45SPwCBrJ';
const WA_TOKEN = 'EAAWJurSGNC8BR6Db6DCyhaP5v1vDkdEyv3PkhR2mj4ycI8lQsvBUl6NbaGW8r4rZC5g4ZBGdFK8LoH8d2sds3WVYAiowCDAR3tEc1sHhW1ZAbXYnaXyZBDtuJnkjPQqUe5SNcoRgecHfcMJTKF7Ee4rgK4SK2gM1fv44NqAY4ZAEq3JuJjdnxSztTVZBL91nL8PwZDZD';
const WA_PHONE_ID = '871709562699676';

async function testUpload() {
    console.log('1. Fetching Sarvam audio...');
    const ttsRes = await axios.post('https://api.sarvam.ai/text-to-speech', {
        text: 'Welcome to Mera Kirana!',
        target_language_code: 'hi-IN',
        speaker: 'ritu',
        model: 'bulbul:v3'
    }, {
        headers: { 'api-subscription-key': SARVAM_KEY }
    });

    const audioBuffer = Buffer.from(ttsRes.data.audios[0], 'base64');
    console.log('Got audio buffer:', audioBuffer.length, 'bytes. Magic:', audioBuffer.slice(0, 4).toString());

    // Test combinations
    const tests = [
        { filename: 'tip.mp3', mime: 'audio/mpeg' },
        { filename: 'tip.ogg', mime: 'audio/ogg' },
        { filename: 'tip.opus', mime: 'audio/opus' },
        { filename: 'tip.m4a', mime: 'audio/mp4' },
        { filename: 'tip.aac', mime: 'audio/aac' },
        { filename: 'tip.wav', mime: 'audio/wav' }
    ];

    for (const t of tests) {
        try {
            const formData = new FormData();
            formData.append('messaging_product', 'whatsapp');
            formData.append('file', audioBuffer, { filename: t.filename, contentType: t.mime });
            formData.append('type', t.mime);

            const uploadRes = await axios.post(
                `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/media`,
                formData,
                { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, ...formData.getHeaders() } }
            );

            console.log(`✅ Upload success for [${t.filename} / ${t.mime}]: Media ID = ${uploadRes.data.id}`);

            // Test sending message with this media ID to see if Meta processing accepts it!
            const sendRes = await axios.post(
                `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/messages`,
                {
                    messaging_product: 'whatsapp',
                    to: '917039426206',
                    type: 'audio',
                    audio: { id: uploadRes.data.id }
                },
                { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' } }
            );
            console.log(`   🚀 Send message success for [${t.filename}]: Message ID = ${sendRes.data.messages[0].id}`);
        } catch (err) {
            const msg = err.response ? JSON.stringify(err.response.data) : err.message;
            console.log(`❌ Failed for [${t.filename} / ${t.mime}]:`, msg);
        }
    }
}

testUpload();
