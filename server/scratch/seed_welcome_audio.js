/**
 * ONE-TIME SCRIPT: Generate welcome tip audio files via Sarvam TTS,
 * upload them to Meta WhatsApp, and cache the media IDs in system_settings.
 *
 * Run this ONCE:  node scratch/seed_welcome_audio.js
 *
 * After running, the webhook will read the cached media IDs directly —
 * zero TTS cost, zero upload cost on every greeting.
 */
require('dotenv').config();
const axios = require('axios');
const { pool } = require('../src/database/db');

const SARVAM_KEY = process.env.SARVAM_API_KEY;
const WA_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID;

const TIPS = {
    TIP_NEW: {
        EN: "Welcome to Mera Kirana! You can browse our dairy products by tapping View Products below. Or, simply send a voice note telling us what you need — for example, say '2 packets of curd and 1 litre milk'. We'll add it to your cart automatically!",
        HI: "मेरा किराना में आपका स्वागत है! नीचे 'उत्पाद देखें' बटन दबाकर हमारे डेयरी प्रोडक्ट्स देखें। या, बस एक वॉइस नोट भेजें — जैसे '2 पैकेट दही और 1 लीटर दूध'। हम इसे अपने आप आपकी कार्ट में जोड़ देंगे!",
        MR: "मेरा किराना मध्ये आपले स्वागत आहे! खाली 'उत्पादने पहा' बटण दाबून आमची डेअरी उत्पादने पहा. किंवा, फक्त एक व्हॉइस नोट पाठवा — जसे '2 पॅकेट दही आणि 1 लिटर दूध'. आम्ही ते आपोआप तुमच्या कार्टमध्ये जोडू!"
    },
    TIP_REPEAT: {
        EN: "Welcome back to Mera Kirana! You can repeat your last order with one tap, browse products, or send a voice note to order directly.",
        HI: "मेरा किराना में फिर से आपका स्वागत है! आप एक टैप से अपना पिछला ऑर्डर दोहरा सकते हैं, प्रोडक्ट्स देख सकते हैं, या सीधे वॉइस नोट भेजकर ऑर्डर कर सकते हैं।",
        MR: "मेरा किराना मध्ये पुन्हा स्वागत! तुम्ही एका टॅपने तुमची शेवटची ऑर्डर पुन्हा करू शकता, उत्पादने पाहू शकता, किंवा थेट व्हॉइस नोट पाठवून ऑर्डर करू शकता."
    }
};

const LANG_MAP = { EN: 'en-IN', HI: 'hi-IN', MR: 'mr-IN' };

async function generateAndUpload(text, langCode) {
    // 1. Sarvam TTS
    console.log(`  → Calling Sarvam TTS (${langCode})...`);
    const ttsRes = await axios.post('https://api.sarvam.ai/text-to-speech', {
        text,
        target_language_code: langCode,
        speaker: 'ritu',
        model: 'bulbul:v3',
        audio_encoding: 'mp3'
    }, {
        headers: { 'api-subscription-key': SARVAM_KEY, 'Content-Type': 'application/json' },
        timeout: 30000
    });

    if (!ttsRes.data?.audios?.[0]) throw new Error('Sarvam returned no audio');
    const audioBuffer = Buffer.from(ttsRes.data.audios[0], 'base64');
    console.log(`  → Got audio: ${audioBuffer.length} bytes`);

    // 2. Upload to Meta
    console.log(`  → Uploading to Meta WhatsApp...`);
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', audioBuffer, { filename: 'tip.mp3', contentType: 'audio/mpeg' });
    formData.append('type', 'audio/mpeg');

    const uploadRes = await axios.post(
        `https://graph.facebook.com/v17.0/${WA_PHONE_ID}/media`,
        formData,
        { headers: { 'Authorization': `Bearer ${WA_TOKEN}`, ...formData.getHeaders() } }
    );

    const mediaId = uploadRes.data.id;
    console.log(`  → Media ID: ${mediaId}`);
    return mediaId;
}

async function main() {
    console.log('🎙️  Seeding welcome tip audio files...\n');

    if (!SARVAM_KEY) { console.error('❌ SARVAM_API_KEY missing'); process.exit(1); }
    if (!WA_TOKEN)   { console.error('❌ WHATSAPP_ACCESS_TOKEN missing'); process.exit(1); }

    const variants = [
        { settingsKey: 'welcome_tip_new_media_id_EN',     type: 'TIP_NEW',    lang: 'EN' },
        { settingsKey: 'welcome_tip_new_media_id_HI',     type: 'TIP_NEW',    lang: 'HI' },
        { settingsKey: 'welcome_tip_new_media_id_MR',     type: 'TIP_NEW',    lang: 'MR' },
        { settingsKey: 'welcome_tip_repeat_media_id_EN',  type: 'TIP_REPEAT', lang: 'EN' },
        { settingsKey: 'welcome_tip_repeat_media_id_HI',  type: 'TIP_REPEAT', lang: 'HI' },
        { settingsKey: 'welcome_tip_repeat_media_id_MR',  type: 'TIP_REPEAT', lang: 'MR' },
    ];

    let success = 0;
    for (const v of variants) {
        try {
            console.log(`[${v.settingsKey}]`);
            const text = TIPS[v.type][v.lang];
            const mediaId = await generateAndUpload(text, LANG_MAP[v.lang]);

            await pool.query(
                `INSERT INTO system_settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2`,
                [v.settingsKey, mediaId]
            );
            console.log(`  ✅ Saved to system_settings\n`);
            success++;
        } catch (err) {
            console.error(`  ❌ Failed: ${err.response?.data?.error?.message || err.message}\n`);
        }
    }

    console.log(`\n🎉 Done! ${success}/6 audio variants seeded.`);
    await pool.end();
}

main();
