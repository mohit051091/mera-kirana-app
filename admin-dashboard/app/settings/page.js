"use client";
import { useState } from 'react';
import { Settings, Save, Shield, HelpCircle, Check, Database, MessageSquare } from 'lucide-react';

export default function SettingsPage() {
    const [saved, setSaved] = useState(false);
    const [settings, setSettings] = useState({
        whatsappPhoneId: '450416738151870',
        whatsappVerifyToken: 'merakirana123',
        whatsappCatalogId: '5h0o9zetew',
        dbHost: 'db.exoldbhtrnbvnvbmqmlu.supabase.co',
        dbName: 'postgres',
        dbUser: 'postgres'
    });

    const handleSave = (e) => {
        e.preventDefault();
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                    <Settings className="text-green-600 w-8 h-8" /> Settings
                </h1>
                <p className="text-gray-500 mt-1">Configure your WhatsApp integration keys and Database configurations.</p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                {/* WhatsApp configuration */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <MessageSquare className="text-green-600" size={20} /> WhatsApp credentials
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp Phone ID</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.whatsappPhoneId}
                                onChange={e => setSettings({ ...settings, whatsappPhoneId: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Webhook Verify Token</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.whatsappVerifyToken}
                                onChange={e => setSettings({ ...settings, whatsappVerifyToken: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp Catalog ID</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.whatsappCatalogId}
                                onChange={e => setSettings({ ...settings, whatsappCatalogId: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* Database configuration */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Database className="text-green-600" size={20} /> Database credentials (Railway)
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">DB Host</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.dbHost}
                                onChange={e => setSettings({ ...settings, dbHost: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Database Name</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.dbName}
                                onChange={e => setSettings({ ...settings, dbName: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Database User</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.dbUser}
                                onChange={e => setSettings({ ...settings, dbUser: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* Security advisory info */}
                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 text-amber-800 text-sm">
                    <Shield size={20} className="shrink-0 text-amber-600" />
                    <div>
                        <span className="font-semibold">Security Note:</span> To prevent leaking sensitive database passwords, actual credentials should be defined as secure environmental variables directly on your Railway project panel.
                    </div>
                </div>

                {/* Submit button */}
                <div className="flex justify-end items-center gap-4">
                    {saved && (
                        <span className="text-green-600 font-semibold flex items-center gap-1 animate-pulse">
                            <Check size={18} /> Settings saved successfully!
                        </span>
                    )}
                    <button
                        type="submit"
                        className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow-md"
                    >
                        <Save size={18} /> Save Settings
                    </button>
                </div>
            </form>
        </div>
    );
}
