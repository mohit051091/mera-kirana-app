const axios = require('axios');
const fs = require('fs');

async function run() {
    try {
        const url = 'https://claude.ai/share/3fc8ba2a-60e7-4a86-afaa-fc964ce514f4';
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = res.data;
        const outDir = 'C:/Users/MOHIT/.gemini/antigravity/brain/8ec1a9c6-66ff-43f7-a670-68fbe921ce6b/scratch';
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        fs.writeFileSync(outDir + '/raw_share.html', html);
        console.log("HTML length:", html.length);
        
        // Find JSON data in script tags
        const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
        let match;
        let index = 1;
        while ((match = scriptRegex.exec(html)) !== null) {
            const content = match[1];
            if (content.includes('__NEXT_DATA__') || content.includes('preloaded') || content.includes('window.') || content.includes('conversation')) {
                fs.writeFileSync(outDir + `/script_${index}.js`, content);
                console.log(`Found interesting script tag ${index}, length:`, content.length);
                index++;
            }
        }
    } catch (e) {
        console.error("Fetch error:", e.message);
    }
}

run();
