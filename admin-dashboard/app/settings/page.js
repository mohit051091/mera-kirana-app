"use client";
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { 
    Settings, Save, Shield, HelpCircle, Check, Database, 
    MessageSquare, Clock, MapPin, X, Loader, UploadCloud, 
    AlertCircle, Power, Mic
} from 'lucide-react';

export default function SettingsPage() {
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        whatsappPhoneId: '',
        whatsappVerifyToken: '',
        whatsappCatalogId: '',
        minimum_order_value: 150,
        delivery_fee_rules: { base_fee: 20, waive_threshold: 200, campaign_active: false },
        cod_premium: 10,
        online_discount: 5,
        rider_slot_limit: 10,
        vacation_mode: { is_closed: false },
        payment_vpa: 'merakirana@okaxis',
        voice_rate_limit_hourly: 3,
        voice_rate_limit_daily: 10,
        voice_cost_markup: 2,
        voice_duration_cap: 30,
        unsupported_format_audio_url: 'https://github.com/mohit051091/mera-kirana-app/raw/main/assets/unsupported_warning.ogg',
        welcome_tip_new_audio_url: 'https://github.com/mohit051091/mera-kirana-app/raw/main/assets/welcome_tip.ogg',
        welcome_tip_repeat_audio_url: 'https://github.com/mohit051091/mera-kirana-app/raw/main/assets/tip_repeat.ogg'
    });

    // Pincode variables
    const [allowedPincodes, setAllowedPincodes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState(null);

    // Day-wise schedules (standard default template)
    const [operatingHours, setOperatingHours] = useState({
        Monday: { open: true, start: "06:00", end: "21:00" },
        Tuesday: { open: true, start: "06:00", end: "21:00" },
        Wednesday: { open: true, start: "06:00", end: "21:00" },
        Thursday: { open: true, start: "06:00", end: "21:00" },
        Friday: { open: true, start: "06:00", end: "21:00" },
        Saturday: { open: true, start: "06:00", end: "21:00" },
        Sunday: { open: true, start: "07:00", end: "19:00" }
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [settingsRes, pincodesRes] = await Promise.all([
                api.get('/settings'),
                api.get('/settings/pincodes/allowed')
            ]);
            
            // Map settings
            const dbSettings = settingsRes.data;
            setSettings(prev => ({
                ...prev,
                whatsappPhoneId: dbSettings.whatsappPhoneId || '',
                whatsappVerifyToken: dbSettings.whatsappVerifyToken || '',
                whatsappCatalogId: dbSettings.whatsappCatalogId || '',
                minimum_order_value: Number(dbSettings.minimum_order_value ?? 150),
                delivery_fee_rules: dbSettings.delivery_fee_rules || prev.delivery_fee_rules,
                cod_premium: Number(dbSettings.cod_premium ?? 10),
                online_discount: Number(dbSettings.online_discount ?? 5),
                rider_slot_limit: Number(dbSettings.rider_slot_limit ?? 10),
                vacation_mode: dbSettings.vacation_mode || prev.vacation_mode,
                payment_vpa: dbSettings.payment_vpa || prev.payment_vpa,
                voice_rate_limit_hourly: Number(dbSettings.voice_rate_limit_hourly ?? 3),
                voice_rate_limit_daily: Number(dbSettings.voice_rate_limit_daily ?? 10),
                voice_cost_markup: Number(dbSettings.voice_cost_markup ?? 2),
                voice_duration_cap: Number(dbSettings.voice_duration_cap ?? 30),
                unsupported_format_audio_url: dbSettings.unsupported_format_audio_url || prev.unsupported_format_audio_url,
                welcome_tip_new_audio_url: dbSettings.welcome_tip_new_audio_url || prev.welcome_tip_new_audio_url,
                welcome_tip_repeat_audio_url: dbSettings.welcome_tip_repeat_audio_url || prev.welcome_tip_repeat_audio_url
            }));

            if (dbSettings.operating_hours) {
                setOperatingHours(dbSettings.operating_hours);
            }

            setAllowedPincodes(pincodesRes.data);
        } catch (e) {
            console.error('Error fetching settings data:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                whatsappPhoneId: settings.whatsappPhoneId,
                whatsappVerifyToken: settings.whatsappVerifyToken,
                whatsappCatalogId: settings.whatsappCatalogId,
                minimum_order_value: settings.minimum_order_value,
                delivery_fee_rules: settings.delivery_fee_rules,
                cod_premium: settings.cod_premium,
                online_discount: settings.online_discount,
                rider_slot_limit: settings.rider_slot_limit,
                vacation_mode: settings.vacation_mode,
                operating_hours: operatingHours,
                payment_vpa: settings.payment_vpa,
                voice_rate_limit_hourly: settings.voice_rate_limit_hourly,
                voice_rate_limit_daily: settings.voice_rate_limit_daily,
                voice_cost_markup: settings.voice_cost_markup,
                voice_duration_cap: settings.voice_duration_cap,
                unsupported_format_audio_url: settings.unsupported_format_audio_url,
                welcome_tip_new_audio_url: settings.welcome_tip_new_audio_url,
                welcome_tip_repeat_audio_url: settings.welcome_tip_repeat_audio_url
            };

            await api.post('/settings', payload);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Failed to save settings:', err);
        }
    };

    // Smart Pincode Search
    const handlePincodeSearch = async (val) => {
        setSearchQuery(val);
        if (val.trim().length >= 2) {
            try {
                const res = await api.get(`/settings/pincodes/search?query=${val}`);
                setSearchResults(res.data);
            } catch (err) {
                console.error(err);
            }
        } else {
            setSearchResults([]);
        }
    };

    // Toggle pincode serviceability
    const handleTogglePincode = async (item, isAllowed) => {
        try {
            await api.post('/settings/pincodes/toggle', { pincode: item.pincode, is_allowed: isAllowed });
            setSearchQuery('');
            setSearchResults([]);
            
            // Reload allowed pincodes
            const res = await api.get('/settings/pincodes/allowed');
            setAllowedPincodes(res.data);
        } catch (e) {
            console.error('Error toggling pincode status:', e);
        }
    };

    // Bulk upload CSV Pincodes
    const handleCsvUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        setUploadMessage(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const textContent = event.target.result;
                const rows = textContent.split(/\r?\n/);
                const pincodes = [];

                rows.forEach(row => {
                    const cleanRow = row.trim().replace(/^"|"$/g, '');
                    // match 6 digit numeric pincode strings
                    const match = cleanRow.match(/\b\d{6}\b/);
                    if (match) {
                        pincodes.push(match[0]);
                    }
                });

                if (pincodes.length === 0) {
                    setUploadMessage({ type: 'error', text: 'No valid 6-digit pincodes found in the CSV.' });
                    setUploading(false);
                    return;
                }

                await api.post('/settings/pincodes/bulk-upload', { pincodes });
                setUploadMessage({ type: 'success', text: `Successfully imported ${pincodes.length} serviceable pincodes!` });
                
                // Refresh allowed list
                const res = await api.get('/settings/pincodes/allowed');
                setAllowedPincodes(res.data);
            } catch (err) {
                console.error(err);
                setUploadMessage({ type: 'error', text: 'Import failed. Check file format.' });
            } finally {
                setUploading(false);
            }
        };
        reader.readAsText(file);
    };

    const handleDayToggle = (day) => {
        setOperatingHours(prev => ({
            ...prev,
            [day]: { ...prev[day], open: !prev[day].open }
        }));
    };

    const handleTimeChange = (day, field, value) => {
        setOperatingHours(prev => ({
            ...prev,
            [day]: { ...prev[day], [field]: value }
        }));
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center gap-2 text-gray-500 font-semibold">
                <Loader className="animate-spin text-green-600" size={24} /> Loading settings dashboard...
            </div>
        );
    }

    return (
        <div className="p-8 max-w-5xl mx-auto space-y-8">
            <div className="flex justify-between items-center pb-4 border-b">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <Settings className="text-green-600 w-8 h-8" /> Settings Control Center
                    </h1>
                    <p className="text-gray-500 mt-1">Real-time parameters, slot capacities, operational timings, and serviceable area boundaries.</p>
                </div>
                
                {/* Shop Status: Vacation mode toggle */}
                <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-2xl shadow-sm border">
                    <span className="text-sm font-semibold text-gray-700">Shop Open Status:</span>
                    <button
                        onClick={() => setSettings(prev => ({
                            ...prev,
                            vacation_mode: { is_closed: !prev.vacation_mode.is_closed }
                        }))}
                        className={`px-4 py-2 rounded-xl font-bold flex items-center gap-2 active:scale-95 transition-all text-sm ${
                            !settings.vacation_mode.is_closed 
                            ? 'bg-green-100 text-green-700 border border-green-200' 
                            : 'bg-rose-100 text-rose-700 border border-rose-200'
                        }`}
                    >
                        <Power size={16} /> {!settings.vacation_mode.is_closed ? 'Active' : 'Closed (Vacation)'}
                    </button>
                </div>
            </div>

            <form onSubmit={handleSave} className="space-y-8">
                {/* 1. Core Operating Fees & MOV */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Database className="text-green-600" size={20} /> Checkout & Delivery Rules
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Minimum Order Value (MOV)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.minimum_order_value}
                                onChange={e => setSettings({ ...settings, minimum_order_value: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Base Delivery Fee</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.delivery_fee_rules.base_fee}
                                onChange={e => setSettings({
                                    ...settings,
                                    delivery_fee_rules: { ...settings.delivery_fee_rules, base_fee: Number(e.target.value) }
                                })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Delivery Free Threshold (Waive-off)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.delivery_fee_rules.waive_threshold}
                                onChange={e => setSettings({
                                    ...settings,
                                    delivery_fee_rules: { ...settings.delivery_fee_rules, waive_threshold: Number(e.target.value) }
                                })}
                            />
                        </div>
                    </div>
                </div>

                {/* 2. Payment Adjustments */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Shield className="text-green-600" size={20} /> Payment Adjustments
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">COD Premium Fee (extra charge)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.cod_premium}
                                onChange={e => setSettings({ ...settings, cod_premium: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Online UPI Pay Discount (%)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.online_discount}
                                onChange={e => setSettings({ ...settings, online_discount: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Rider Booking Cap (orders/slot)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition"
                                value={settings.rider_slot_limit}
                                onChange={e => setSettings({ ...settings, rider_slot_limit: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Shop UPI Address (VPA)</label>
                            <input
                                type="text"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm font-mono"
                                placeholder="owner@gpay"
                                value={settings.payment_vpa}
                                onChange={e => setSettings({ ...settings, payment_vpa: e.target.value })}
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Day-Wise operating hours */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Clock className="text-green-600" size={20} /> Operating Hours (Day-Wise Schedules)
                    </h2>

                    <div className="space-y-4">
                        {Object.entries(operatingHours).map(([day, timings]) => (
                            <div key={day} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                                <div className="w-32 flex items-center gap-2">
                                    <input 
                                        type="checkbox" 
                                        checked={timings.open} 
                                        onChange={() => handleDayToggle(day)}
                                        className="rounded text-green-600 focus:ring-green-500 h-4 w-4"
                                    />
                                    <span className="font-semibold text-gray-800">{day}</span>
                                </div>
                                
                                {timings.open ? (
                                    <div className="flex items-center gap-4 flex-1 justify-end">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 font-medium">Start:</span>
                                            <input 
                                                type="time" 
                                                value={timings.start}
                                                onChange={e => handleTimeChange(day, 'start', e.target.value)}
                                                className="border rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-green-500 text-sm"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500 font-medium">End:</span>
                                            <input 
                                                type="time" 
                                                value={timings.end}
                                                onChange={e => handleTimeChange(day, 'end', e.target.value)}
                                                className="border rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-green-500 text-sm"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-rose-600 text-sm font-semibold flex-1 text-right">Closed for Delivery</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Voice Note & Spam Controls */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Mic className="text-green-600" size={20} /> Voice Note & Spam Costing Controls
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Hourly Voice Note Limit</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm"
                                value={settings.voice_rate_limit_hourly}
                                onChange={e => setSettings({ ...settings, voice_rate_limit_hourly: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Daily Voice Note Limit</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm"
                                value={settings.voice_rate_limit_daily}
                                onChange={e => setSettings({ ...settings, voice_rate_limit_daily: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Voice Cost Markup (%)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm"
                                value={settings.voice_cost_markup}
                                onChange={e => setSettings({ ...settings, voice_cost_markup: Number(e.target.value) })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Voice Duration Cap (secs)</label>
                            <input
                                type="number"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm"
                                value={settings.voice_duration_cap}
                                onChange={e => setSettings({ ...settings, voice_duration_cap: Number(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Unsupported Format Fallback Audio (URL)</label>
                        <input
                            type="text"
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm font-mono"
                            value={settings.unsupported_format_audio_url}
                            onChange={e => setSettings({ ...settings, unsupported_format_audio_url: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Welcome Tip Audio for New Users (URL)</label>
                        <input
                            type="text"
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm font-mono"
                            value={settings.welcome_tip_new_audio_url}
                            onChange={e => setSettings({ ...settings, welcome_tip_new_audio_url: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Welcome Tip Audio for Repeat Users (URL)</label>
                        <input
                            type="text"
                            className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm font-mono"
                            value={settings.welcome_tip_repeat_audio_url}
                            onChange={e => setSettings({ ...settings, welcome_tip_repeat_audio_url: e.target.value })}
                        />
                    </div>
                </div>

                {/* 4. Pincode Boundaries Settings */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <MapPin className="text-green-600" size={20} /> Serviceable Area Boundaries
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Smart search pincode database */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Allow New Pincodes (Smart Search Master)</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Type Pincode, District, or Office (e.g. Bhandup, 400080)"
                                    className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition text-sm"
                                    value={searchQuery}
                                    onChange={e => handlePincodeSearch(e.target.value)}
                                />
                                {searchResults.length > 0 && (
                                    <div className="absolute left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-10 max-h-60 overflow-auto border-gray-100">
                                        {searchResults.map(item => (
                                            <div 
                                                key={item.pincode} 
                                                onClick={() => handleTogglePincode(item, true)}
                                                className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0 text-sm"
                                            >
                                                <div>
                                                    <span className="font-bold text-gray-800">{item.pincode}</span>
                                                    <span className="text-xs text-gray-500 ml-2">({item.office_name}, {item.district_name})</span>
                                                </div>
                                                <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded font-bold">Add Tag</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bulk CSV Upload */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-gray-700">Bulk Upload Serviceable Pincodes (CSV/Excel)</label>
                            <div className="relative border-2 border-dashed border-gray-200 rounded-xl p-4 flex flex-col items-center justify-center bg-gray-50/50 hover:bg-gray-50 transition cursor-pointer">
                                <input 
                                    type="file" 
                                    accept=".csv,.txt"
                                    onChange={handleCsvUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    disabled={uploading}
                                />
                                {uploading ? (
                                    <Loader className="animate-spin text-green-600 mb-2" size={24} />
                                ) : (
                                    <UploadCloud className="text-gray-400 mb-2" size={24} />
                                )}
                                <span className="text-xs text-gray-500 text-center font-medium">
                                    {uploading ? 'Parsing CSV data...' : 'Drop CSV file containing one-column pincode list'}
                                </span>
                            </div>
                            {uploadMessage && (
                                <div className={`flex items-center gap-2 p-3 rounded-lg text-xs font-semibold ${
                                    uploadMessage.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'
                                }`}>
                                    <AlertCircle size={14} /> {uploadMessage.text}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Serviceable Pincodes Pill list display */}
                    <div className="space-y-3">
                        <label className="block text-sm font-semibold text-gray-700">Active allowed Serviceable Pincodes ({allowedPincodes.length}):</label>
                        <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-4 rounded-xl border bg-gray-50/30">
                            {allowedPincodes.length === 0 ? (
                                <span className="text-xs text-gray-400">No active serviceable pincodes configured. Use the search or bulk upload options above to add serviceable boundaries.</span>
                            ) : (
                                allowedPincodes.map(item => (
                                    <div 
                                        key={item.pincode} 
                                        className="bg-white border border-gray-200 rounded-lg py-1.5 px-3 flex items-center gap-2 shadow-sm text-sm"
                                    >
                                        <span className="font-bold text-gray-800">{item.pincode}</span>
                                        <span className="text-xs text-gray-400 font-medium">({item.office_name})</span>
                                        <button 
                                            type="button"
                                            onClick={() => handleTogglePincode(item, false)}
                                            className="text-gray-400 hover:text-rose-500 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Submit button bar */}
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
                        <Save size={18} /> Save Config Settings
                    </button>
                </div>
            </form>
        </div>
    );
}
