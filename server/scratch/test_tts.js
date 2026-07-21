require('dotenv').config();
const axios = require('axios');

async function testTTS() {
    const sarvamKey = process.env.SARVAM_API_KEY;
    console.log('Sarvam key:', sarvamKey ? `${sarvamKey.substring(0, 10)}...` : 'MISSING');
    
    try {
        const res = await axios.post('https://api.sarvam.ai/text-to-speech', {
            text: 'Welcome to Mera Kirana! You can browse products by tapping the button below, or send a voice note to order directly.',
            target_language_code: 'en-IN',
            speaker: 'ritu',
            model: 'bulbul:v2'
        }, {
            headers: { 'api-subscription-key': sarvamKey, 'Content-Type': 'application/json' },
            timeout: 15000
        });

        console.log('Response status:', res.status);
        console.log('Has audios:', !!(res.data && res.data.audios));
        if (res.data && res.data.audios && res.data.audios[0]) {
            const buf = Buffer.from(res.data.audios[0], 'base64');
            console.log('Audio buffer size:', buf.length, 'bytes');
            require('fs').writeFileSync('scratch/test_tts_output.wav', buf);
            console.log('Saved to scratch/test_tts_output.wav');
        }
    } catch (err) {
        console.error('TTS Error:', err.response ? err.response.data : err.message);
    }
}

testTTS();
