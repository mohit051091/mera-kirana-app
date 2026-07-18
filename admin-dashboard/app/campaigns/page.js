"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    Send, Megaphone, Users, DollarSign, Clock, CheckCircle, 
    AlertTriangle, Image as ImageIcon, Sparkles, Loader
} from 'lucide-react';

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    
    // Form fields
    const [name, setName] = useState('');
    const [templateType, setTemplateType] = useState('TEXT_ONLY');
    const [messageBody, setMessageBody] = useState('Hello! 🏪 We have fresh Milk and Curd ready for dispatch. Order now on WhatsApp to get 5% discount on online payments!');
    const [imageUrl, setImageUrl] = useState('');
    const [segment, setSegment] = useState('ALL');
    const [statusMessage, setStatusMessage] = useState(null);

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const res = await api.get('/campaigns');
            setCampaigns(res.data);
        } catch (err) {
            console.error("Failed to load campaigns", err);
        } finally {
            setLoading(false);
        }
    };

    const handleBroadcast = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setStatusMessage(null);

        try {
            const res = await api.post('/campaigns/broadcast', {
                name,
                templateType,
                messageBody,
                imageUrl: templateType === 'IMAGE_TEXT' ? imageUrl : undefined,
                segment
            });
            
            setStatusMessage({
                type: 'success',
                text: `🎉 Broadcast sent successfully to ${res.data.dispatched} contacts!`
            });
            
            // Reset form fields
            setName('');
            setImageUrl('');
            
            fetchCampaigns();
        } catch (err) {
            console.error("Broadcast failed", err);
            setStatusMessage({
                type: 'error',
                text: err.response?.data?.error || 'Failed to dispatch campaign. Please check settings.'
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Aggregate statistics
    const totalSent = campaigns.reduce((acc, c) => acc + parseInt(c.total_sent || 0), 0);
    const totalCost = campaigns.reduce((acc, c) => acc + parseFloat(c.meta_api_cost || 0), 0);

    return (
        <div className="flex-1 p-8 space-y-8 bg-gray-50 overflow-y-auto h-screen">
            {/* Header */}
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 flex items-center gap-2">
                        <Megaphone className="text-green-600" /> WhatsApp Marketing & Broadcasts
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Compose templates, run remarketing campaigns, and monitor Meta API costs directly.
                    </p>
                </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
                    <div className="p-4 bg-green-50 text-green-600 rounded-xl">
                        <Users size={28} />
                    </div>
                    <div>
                        <div className="text-sm text-gray-400 font-semibold">Total Campaigns Run</div>
                        <div className="text-2xl font-bold text-gray-900 mt-0.5">{campaigns.length}</div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-xl">
                        <Send size={28} />
                    </div>
                    <div>
                        <div className="text-sm text-gray-400 font-semibold">Total Broadcasts Dispatched</div>
                        <div className="text-2xl font-bold text-gray-900 mt-0.5">{totalSent}</div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
                    <div className="p-4 bg-rose-50 text-rose-600 rounded-xl">
                        <DollarSign size={28} />
                    </div>
                    <div>
                        <div className="text-sm text-gray-400 font-semibold">Estimated API Cost</div>
                        <div className="text-2xl font-bold text-gray-900 mt-0.5">₹{totalCost.toFixed(2)}</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Campaign Composer Form */}
                <div className="lg:col-span-1 bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5 h-fit">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <Sparkles className="text-yellow-500" size={20} /> Create New Broadcast
                    </h2>

                    <form onSubmit={handleBroadcast} className="space-y-4 text-xs font-semibold text-gray-600">
                        {statusMessage && (
                            <div className={`p-4 rounded-xl border flex items-start gap-2.5 ${
                                statusMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
                            }`}>
                                {statusMessage.type === 'success' ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                                <span>{statusMessage.text}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-gray-700">Campaign Name</label>
                            <input 
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Morning Milk Promotion"
                                required
                                className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-green-500 focus:bg-white transition text-sm font-medium"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-gray-700">Target Customer Segment</label>
                            <select 
                                value={segment}
                                onChange={e => setSegment(e.target.value)}
                                className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-green-500 focus:bg-white transition text-sm font-medium"
                            >
                                <option value="ALL">All Customers (Opted-in)</option>
                                <option value="REFERRAL">Referral Leads Only</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-gray-700">Template Type</label>
                            <div className="grid grid-cols-2 gap-3">
                                <button 
                                    type="button"
                                    onClick={() => setTemplateType('TEXT_ONLY')}
                                    className={`p-3 border rounded-xl flex flex-col items-center gap-1 transition ${
                                        templateType === 'TEXT_ONLY' ? 'border-green-600 bg-green-50/50 text-green-700 font-bold' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <Megaphone size={16} /> Text Only
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setTemplateType('IMAGE_TEXT')}
                                    className={`p-3 border rounded-xl flex flex-col items-center gap-1 transition ${
                                        templateType === 'IMAGE_TEXT' ? 'border-green-600 bg-green-50/50 text-green-700 font-bold' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <ImageIcon size={16} /> Image + Text
                                </button>
                            </div>
                        </div>

                        {templateType === 'IMAGE_TEXT' && (
                            <div className="space-y-1.5">
                                <label className="text-gray-700">Promotion Image URL</label>
                                <input 
                                    type="url"
                                    value={imageUrl}
                                    onChange={e => setImageUrl(e.target.value)}
                                    placeholder="https://example.com/banner.jpg"
                                    required={templateType === 'IMAGE_TEXT'}
                                    className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-green-500 focus:bg-white transition text-sm font-medium"
                                />
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-gray-700">Message Body Template</label>
                            <textarea 
                                value={messageBody}
                                onChange={e => setMessageBody(e.target.value)}
                                rows={4}
                                required
                                className="w-full p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-green-500 focus:bg-white transition text-sm font-medium"
                            />
                            <p className="text-[10px] text-gray-400 font-medium">
                                *Note: Broadcast messages must comply with Meta's marketing templates policy. Ensure your target users have opted-in (not stops).
                            </p>
                        </div>

                        <button 
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-green-600 text-white p-3.5 rounded-xl font-bold hover:bg-green-700 active:scale-[0.98] transition flex items-center justify-center gap-2 mt-2 shadow"
                        >
                            {submitting ? <Loader className="animate-spin" size={18} /> : <Send size={18} />}
                            {submitting ? 'Broadcasting...' : 'Launch Broadcast Campaign'}
                        </button>
                    </form>
                </div>

                {/* Campaigns History */}
                <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col self-start">
                    <div className="p-6 border-b">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="text-blue-500" size={20} /> Broadcast Logs & History
                        </h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Campaign Name</th>
                                    <th className="p-4 text-center">Type</th>
                                    <th className="p-4 text-center">Sent Vol</th>
                                    <th className="p-4 text-right">API Cost</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center text-gray-400">
                                            <Loader className="animate-spin mx-auto text-gray-300" size={32} />
                                        </td>
                                    </tr>
                                ) : campaigns.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="p-12 text-center text-gray-400">
                                            No campaigns dispatched yet. Launch one using the form on the left.
                                        </td>
                                    </tr>
                                ) : (
                                    campaigns.map(c => (
                                        <tr key={c.campaign_id} className="hover:bg-gray-50/50 transition">
                                            <td className="p-4 text-xs text-gray-500">
                                                {new Date(c.created_at).toLocaleDateString()} {new Date(c.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </td>
                                            <td className="p-4 font-bold text-gray-950">
                                                {c.name}
                                            </td>
                                            <td className="p-4 text-center">
                                                <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full font-bold border border-blue-100">
                                                    {c.type}
                                                </span>
                                            </td>
                                            <td className="p-4 text-center font-bold text-gray-900">
                                                {c.total_sent}
                                            </td>
                                            <td className="p-4 text-right font-bold text-rose-600">
                                                ₹{parseFloat(c.meta_api_cost || 0).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
