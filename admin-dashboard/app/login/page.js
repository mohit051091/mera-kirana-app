"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, ShieldAlert, Key } from 'lucide-react';

export default function LoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const router = useRouter();

    const handleLogin = (e) => {
        e.preventDefault();
        
        // Define admin panel access password matching WhatsApp store configurations
        if (password === 'merakirana2026' || password === 'merakirana123') {
            // Set cookies for 7 days
            document.cookie = "admin_auth=true; path=/; max-age=604800; SameSite=Strict";
            document.cookie = `admin_access_key=${password}; path=/; max-age=604800; SameSite=Strict`;
            router.push('/');
            router.refresh();
        } else {
            setError(true);
            setTimeout(() => setError(false), 3000);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-radial from-emerald-950 via-gray-900 to-black px-4">
            <div className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-3xl shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center border border-green-500/20">
                        <Lock className="text-green-500" size={24} />
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Mera Kirana Admin</h1>
                    <p className="text-sm text-gray-400 font-medium">Verify your access key to enter store operations dashboard.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Access Password</label>
                        <div className="relative flex items-center">
                            <input
                                type="password"
                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 pr-12 transition-all font-mono"
                                placeholder="••••••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                            <Key className="absolute right-4 text-gray-500" size={18} />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold animate-shake">
                            <ShieldAlert size={16} /> Access denied. Invalid password code.
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-green-600 hover:bg-green-700 active:scale-95 transition-all text-white p-4 rounded-2xl font-bold text-sm shadow-lg shadow-green-600/20"
                    >
                        Authenticate Login
                    </button>
                </form>

                <div className="text-center text-[10px] text-gray-500 font-medium pt-2">
                    Protected by secure session credentials control boundaries.
                </div>
            </div>
        </div>
    );
}
