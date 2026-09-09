"use client";
import { useState, useEffect } from 'react';
import { BookOpen, Download, Languages } from 'lucide-react';

// Tiny renderer: headings, bold, bullets, numbered lines. Enough for our manuals.
function renderMd(src) {
    return src.split('\n').map((line, i) => {
        if (line.startsWith('# ')) return <h1 key={i} className="text-2xl font-extrabold mt-2 mb-3">{line.slice(2)}</h1>;
        if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-extrabold mt-6 mb-2 text-emerald-800">{line.slice(3)}</h2>;
        if (/^\d+\.\s/.test(line)) {
            const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p);
            return <li key={i} className="ml-5 list-decimal text-sm leading-relaxed mb-1">{parts}</li>;
        }
        if (line.startsWith('- ')) {
            const parts = line.slice(2).split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p);
            return <li key={i} className="ml-5 list-disc text-sm leading-relaxed mb-1">{parts}</li>;
        }
        if (line.startsWith('*') && line.endsWith('*') && line.length > 2) return <p key={i} className="text-sm text-stone-500 italic my-2">{line.slice(1, -1)}</p>;
        if (!line.trim()) return null;
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p);
        return <p key={i} className="text-sm leading-relaxed mb-1.5">{parts}</p>;
    });
}

export default function GuidePage() {
    const [lang, setLang] = useState('en');
    const [md, setMd] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(lang === 'en' ? '/owner-manual-en.md' : '/owner-manual-hi.md')
            .then(r => r.text())
            .then(t => { setMd(t); setLoading(false); })
            .catch(() => setLoading(false));
    }, [lang]);

    const file = lang === 'en' ? '/owner-manual-en.md' : '/owner-manual-hi.md';

    return (
        <div className="p-5 md:p-8 max-w-4xl mx-auto space-y-5">
            <div className="rounded-3xl bg-stone-950 text-white p-6 flex flex-wrap items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-emerald-500 grid place-items-center"><BookOpen size={20} /></span>
                <div className="flex-1 min-w-[180px]">
                    <h1 className="font-extrabold text-xl leading-tight">{lang === 'en' ? 'Owner Manual' : 'मालिक पुस्तिका'}</h1>
                    <p className="text-xs text-stone-400">{lang === 'en' ? 'What every button is for. Read once, keep forever.' : 'हर बटन किस काम का। एक बार पढ़ें, हमेशा रखें।'}</p>
                </div>
                <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold flex items-center gap-1.5 transition">
                    <Languages size={14} /> {lang === 'en' ? 'हिंदी में पढ़ें' : 'Read in English'}
                </button>
                <a href={file} download className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-bold flex items-center gap-1.5 transition">
                    <Download size={14} /> {lang === 'en' ? 'Download .md' : '.md डाउनलोड करें'}
                </a>
            </div>
            <article className="rounded-3xl bg-white border border-stone-200 shadow-lg shadow-stone-200/40 p-5 md:p-8">
                {loading ? <p className="text-sm text-stone-500">Loading…</p> : renderMd(md)}
            </article>
        </div>
    );
}
