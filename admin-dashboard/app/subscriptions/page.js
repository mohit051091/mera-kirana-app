"use client";
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { 
    Calendar, RefreshCw, Play, Pause, Trash2, Edit, Check, 
    Loader, AlertCircle, Filter, Plus, Search, User, Clock, 
    CheckCircle, ShieldAlert 
} from 'lucide-react';

export default function SubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('ALL'); // ALL, ACTIVE, PAUSED, CANCELLED
    const [searchQuery, setSearchQuery] = useState('');
    const [editingSubId, setEditingSubId] = useState(null);
    const [editForm, setEditForm] = useState({ quantity: 1, frequency: 'DAILY', next_delivery_date: '' });
    const [toast, setToast] = useState(null);

    useEffect(() => {
        loadSubscriptions();
    }, []);

    const loadSubscriptions = async () => {
        try {
            setLoading(true);
            const res = await api.get('/subscriptions');
            setSubscriptions(res.data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Failed to fetch subscription records.');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const handleStatusToggle = async (subId, currentStatus) => {
        try {
            const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
            await api.put(`/subscriptions/${subId}/status`, { status: nextStatus });
            showToast(`Subscription ${nextStatus === 'ACTIVE' ? 'resumed' : 'paused'} successfully!`);
            
            // Update local state
            setSubscriptions(prev => prev.map(sub => 
                sub.subscription_id === subId ? { ...sub, status: nextStatus } : sub
            ));
        } catch (err) {
            console.error(err);
            showToast('Failed to update subscription status', 'error');
        }
    };

    const handleCancel = async (subId) => {
        if (!confirm('Are you sure you want to cancel and delete this customer subscription schedule?')) return;
        try {
            await api.delete(`/subscriptions/${subId}`);
            showToast('Subscription cancelled successfully!');
            setSubscriptions(prev => prev.filter(sub => sub.subscription_id !== subId));
        } catch (err) {
            console.error(err);
            showToast('Failed to cancel subscription', 'error');
        }
    };

    const startEdit = (sub) => {
        setEditingSubId(sub.subscription_id);
        // Format next_delivery_date to yyyy-MM-dd
        const rawDate = sub.next_delivery_date ? new Date(sub.next_delivery_date) : new Date();
        const dateStr = rawDate.toISOString().split('T')[0];
        setEditForm({
            quantity: sub.quantity,
            frequency: sub.frequency,
            next_delivery_date: dateStr
        });
    };

    const saveEdit = async (subId) => {
        try {
            await api.put(`/subscriptions/${subId}/status`, editForm);
            showToast('Subscription preferences updated!');
            setEditingSubId(null);
            
            // Reload all
            await loadSubscriptions();
        } catch (err) {
            console.error(err);
            showToast('Failed to save edit details', 'error');
        }
    };

    // Filtered subscriptions
    const filteredSubs = subscriptions.filter(sub => {
        const matchesTab = tab === 'ALL' || sub.status === tab;
        const matchesSearch = 
            (sub.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (sub.customer_phone || '').includes(searchQuery) ||
            (sub.product_name || '').toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTab && matchesSearch;
    });

    // Counts
    const activeCount = subscriptions.filter(s => s.status === 'ACTIVE').length;
    const pausedCount = subscriptions.filter(s => s.status === 'PAUSED').length;

    return (
        <div className="p-8 max-w-6xl mx-auto space-y-8">
            {/* Header section */}
            <div className="flex justify-between items-center pb-4 border-b">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <Calendar className="text-green-600 w-8 h-8" /> Subscription Manager
                    </h1>
                    <p className="text-gray-500 mt-1">Configure repeating dairy shipments, deliveries, calendars, and customer schedules.</p>
                </div>
                <button 
                    onClick={loadSubscriptions}
                    className="p-2 border rounded-xl hover:bg-gray-50 active:scale-95 transition-all text-gray-600 flex items-center gap-1.5 font-semibold text-sm"
                >
                    <RefreshCw size={16} /> Sync Live
                </button>
            </div>

            {/* Toast notice banner */}
            {toast && (
                <div className={`fixed bottom-8 right-8 z-50 p-4 rounded-xl shadow-lg border flex items-center gap-3 animate-in slide-in-from-bottom duration-300 ${
                    toast.type === 'error' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-green-50 text-green-700 border-green-200'
                }`}>
                    <CheckCircle size={18} />
                    <span className="text-sm font-bold">{toast.message}</span>
                </div>
            )}

            {/* Stats Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm flex items-center gap-4">
                    <div className="bg-green-50 p-3.5 rounded-xl text-green-600">
                        <CheckCircle size={24} />
                    </div>
                    <div>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Customers</span>
                        <h3 className="text-2xl font-bold text-gray-800">{activeCount}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm flex items-center gap-4">
                    <div className="bg-amber-50 p-3.5 rounded-xl text-amber-600">
                        <Pause size={24} />
                    </div>
                    <div>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Paused Deliveries</span>
                        <h3 className="text-2xl font-bold text-gray-800">{pausedCount}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm flex items-center gap-4">
                    <div className="bg-indigo-50 p-3.5 rounded-xl text-indigo-600">
                        <Calendar size={24} />
                    </div>
                    <div>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Schedules</span>
                        <h3 className="text-2xl font-bold text-gray-800">{subscriptions.length}</h3>
                    </div>
                </div>
            </div>

            {/* Filter and search bar */}
            <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
                    {['ALL', 'ACTIVE', 'PAUSED'].map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-4 py-2 rounded-lg font-bold text-xs active:scale-95 transition-all ${
                                tab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-3.5 text-gray-400" size={16} />
                    <input
                        type="text"
                        placeholder="Search customer name, phone, or product..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 outline-none text-sm focus:ring-2 focus:ring-green-500 transition"
                    />
                </div>
            </div>

            {/* Subscriptions Listing grid */}
            {loading ? (
                <div className="flex h-64 items-center justify-center gap-2 text-gray-500 font-semibold">
                    <Loader className="animate-spin text-green-600" size={24} /> Loading customer subscription schedules...
                </div>
            ) : error ? (
                <div className="bg-rose-50 border border-rose-100 p-6 rounded-2xl text-center text-rose-700 font-semibold flex flex-col items-center gap-2">
                    <ShieldAlert size={32} />
                    <span>{error}</span>
                </div>
            ) : filteredSubs.length === 0 ? (
                <div className="bg-white p-12 text-center text-gray-400 border rounded-2xl shadow-sm">
                    No matching recurring schedules found.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredSubs.map(sub => {
                        const isEditing = editingSubId === sub.subscription_id;
                        return (
                            <div 
                                key={sub.subscription_id} 
                                className={`bg-white border rounded-2xl shadow-sm p-6 space-y-4 hover:shadow-md transition relative ${
                                    sub.status === 'PAUSED' ? 'border-amber-200 bg-amber-50/5' : 'border-gray-100'
                                }`}
                            >
                                {/* Customer Row */}
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-green-100 text-green-700 h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm">
                                            {(sub.customer_name || 'U').substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                                                <User size={14} className="text-gray-400" /> {sub.customer_name || 'WhatsApp Customer'}
                                            </h4>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">{sub.customer_phone}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                        sub.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {sub.status}
                                    </span>
                                </div>

                                {/* Product details */}
                                <div className="p-3 bg-gray-50 rounded-xl flex justify-between items-center">
                                    <div>
                                        <h5 className="font-bold text-gray-800 text-sm">{sub.product_name}</h5>
                                        <p className="text-xs text-gray-400 font-medium mt-0.5">{sub.weight_label}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold text-gray-800">Qty: {sub.quantity}</span>
                                        <p className="text-xs text-gray-400 font-medium mt-0.5">₹{sub.price} / unit</p>
                                    </div>
                                </div>

                                {/* Delivery timing & calendar */}
                                <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-gray-600">
                                    <div className="flex items-center gap-2">
                                        <Clock size={14} className="text-gray-400" />
                                        <span>Freq: <strong className="text-green-600">{sub.frequency}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Calendar size={14} className="text-gray-400" />
                                        <span>Next: <strong className="text-gray-700">{new Date(sub.next_delivery_date).toLocaleDateString()}</strong></span>
                                    </div>
                                </div>

                                {/* Editing Form Panel */}
                                {isEditing && (
                                    <div className="border-t pt-4 space-y-3 animate-in fade-in duration-200">
                                        <div className="grid grid-cols-3 gap-2">
                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Quantity</label>
                                                <input 
                                                    type="number" 
                                                    min="1"
                                                    value={editForm.quantity}
                                                    onChange={e => setEditForm({ ...editForm, quantity: Number(e.target.value) })}
                                                    className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-green-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Frequency</label>
                                                <select 
                                                    value={editForm.frequency}
                                                    onChange={e => setEditForm({ ...editForm, frequency: e.target.value })}
                                                    className="w-full border rounded-lg p-2 text-xs outline-none bg-white focus:ring-1 focus:ring-green-500"
                                                >
                                                    <option value="DAILY">DAILY</option>
                                                    <option value="ALTERNATE">ALTERNATE</option>
                                                    <option value="WEEKLY">WEEKLY</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Next Delivery</label>
                                                <input 
                                                    type="date" 
                                                    value={editForm.next_delivery_date}
                                                    onChange={e => setEditForm({ ...editForm, next_delivery_date: e.target.value })}
                                                    className="w-full border rounded-lg p-1.5 text-xs outline-none focus:ring-1 focus:ring-green-500"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button 
                                                onClick={() => setEditingSubId(null)}
                                                className="px-3 py-1.5 rounded-lg border text-xs font-bold hover:bg-gray-50 active:scale-95 transition-all text-gray-500"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={() => saveEdit(sub.subscription_id)}
                                                className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 active:scale-95 transition-all flex items-center gap-1"
                                            >
                                                <Check size={12} /> Save
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons toolbar */}
                                {!isEditing && (
                                    <div className="flex gap-2 justify-end border-t pt-4">
                                        <button 
                                            onClick={() => handleStatusToggle(sub.subscription_id, sub.status)}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-all flex items-center gap-1.5 ${
                                                sub.status === 'ACTIVE' 
                                                ? 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100' 
                                                : 'bg-green-50 text-green-700 border border-green-100 hover:bg-green-100'
                                            }`}
                                        >
                                            {sub.status === 'ACTIVE' ? (
                                                <>
                                                    <Pause size={14} /> Pause
                                                </>
                                            ) : (
                                                <>
                                                    <Play size={14} /> Resume
                                                </>
                                            )}
                                        </button>
                                        <button 
                                            onClick={() => startEdit(sub)}
                                            className="px-3.5 py-2 rounded-xl border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all text-xs font-bold text-gray-500 flex items-center gap-1.5"
                                        >
                                            <Edit size={14} /> Edit
                                        </button>
                                        <button 
                                            onClick={() => handleCancel(sub.subscription_id)}
                                            className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 active:scale-95 transition-all text-xs font-bold flex items-center gap-1.5"
                                        >
                                            <Trash2 size={14} /> Cancel
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
