"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    Users, Search, DollarSign, Clock, MapPin, AlertCircle, 
    Send, Award, ShoppingCart, RefreshCw, Loader2, ArrowRight 
} from 'lucide-react';

export default function CRMPage() {
    const [activeTab, setActiveTab] = useState('directory');
    const [customers, setCustomers] = useState([]);
    const [carts, setCarts] = useState([]);
    const [neighborhoods, setNeighborhoods] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    const [recoveringId, setRecoveringId] = useState(null);

    useEffect(() => {
        loadData();
    }, [activeTab]);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
    };

    const loadData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'directory') {
                const res = await api.get('/crm/customers');
                setCustomers(res.data);
            } else if (activeTab === 'abandoned') {
                const res = await api.get('/crm/abandoned-carts');
                setCarts(res.data);
            } else if (activeTab === 'neighborhoods') {
                const res = await api.get('/crm/neighborhoods');
                setNeighborhoods(res.data);
            }
        } catch (err) {
            console.error("Failed to load CRM data", err);
            showStatus('error', 'Failed to retrieve CRM ledger records.');
        } finally {
            setLoading(false);
        }
    };

    const handleRecoverCart = async (cartId) => {
        setRecoveringId(cartId);
        try {
            await api.post(`/crm/abandoned-carts/${cartId}/recover`);
            showStatus('success', 'WhatsApp cart recovery alert dispatched!');
            // Refresh abandoned carts queue
            const res = await api.get('/crm/abandoned-carts');
            setCarts(res.data);
        } catch (err) {
            showStatus('error', 'Failed to send recovery alert.');
        } finally {
            setRecoveringId(null);
        }
    };

    const getFrequencyTagStyle = (tag) => {
        switch (tag) {
            case 'Daily Buyer': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'Regular': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'Churning': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Inactive': return 'bg-rose-50 text-rose-700 border-rose-200';
            default: return 'bg-gray-50 text-gray-600 border-gray-200';
        }
    };

    const filteredCustomers = customers.filter(c => 
        c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone?.includes(searchQuery) ||
        c.pincode?.includes(searchQuery)
    );

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <Users size={30} className="text-green-600" /> CRM & Customer Retention
                    </h1>
                    <p className="text-gray-500 mt-1">Audit customer purchase frequency segments, neighborhood revenues, and recover abandoned carts.</p>
                </div>
                <button 
                    onClick={loadData}
                    className="p-2.5 rounded-xl border bg-white hover:bg-gray-50 active:scale-95 transition-all text-gray-500 hover:text-green-600 shadow-sm"
                    title="Sync Data"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-green-600' : ''}`} />
                </button>
            </div>

            {statusMsg.text && (
                <div className={`p-4 rounded-xl text-sm font-semibold border ${
                    statusMsg.type === 'success' 
                    ? 'bg-green-50 text-green-700 border-green-100' 
                    : 'bg-rose-50 text-rose-700 border-rose-100'
                }`}>
                    {statusMsg.text}
                </div>
            )}

            {/* Tabs Selector */}
            <div className="flex border-b border-gray-200 overflow-x-auto min-w-max pb-px">
                <button
                    onClick={() => { setActiveTab('directory'); setSearchQuery(''); }}
                    className={`pb-3 px-6 text-sm font-bold border-b-2 transition-all ${
                        activeTab === 'directory' 
                        ? 'border-green-600 text-green-600' 
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    👥 Customer Directory
                </button>
                <button
                    onClick={() => { setActiveTab('abandoned'); setSearchQuery(''); }}
                    className={`pb-3 px-6 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
                        activeTab === 'abandoned' 
                        ? 'border-green-600 text-green-600' 
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    🛒 Abandoned Carts 
                    {carts.length > 0 && (
                        <span className="bg-rose-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                            {carts.length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => { setActiveTab('neighborhoods'); setSearchQuery(''); }}
                    className={`pb-3 px-6 text-sm font-bold border-b-2 transition-all ${
                        activeTab === 'neighborhoods' 
                        ? 'border-green-600 text-green-600' 
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                    }`}
                >
                    📍 Neighborhood Clusters
                </button>
            </div>

            {/* Content Body */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400">
                    <Loader2 className="animate-spin text-green-600" size={32} />
                    <span className="font-semibold text-sm">Synthesizing customer ledgers...</span>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Customer Directory Tab */}
                    {activeTab === 'directory' && (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                                <input 
                                    type="text" 
                                    placeholder="Search customers by name, phone, or pincode..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 border rounded-2xl outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-sm transition"
                                />
                            </div>

                            <div className="bg-white border rounded-2xl shadow-sm overflow-x-auto border-gray-100">
                                <table className="w-full border-collapse text-left text-sm min-w-max">
                                    <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                                        <tr>
                                            <th className="p-4">Customer</th>
                                            <th className="p-4">Primary Address</th>
                                            <th className="p-4">LTV (All Time)</th>
                                            <th className="p-4">Average Order</th>
                                            <th className="p-4">Total Orders</th>
                                            <th className="p-4">Buying Pattern</th>
                                            <th className="p-4">Last Active</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                                        {filteredCustomers.map(c => (
                                            <tr key={c.customer_id} className="hover:bg-gray-50/50 transition">
                                                <td className="p-4">
                                                    <div className="font-bold text-gray-900">{c.name || 'Anonymous Lead'}</div>
                                                    <div className="text-xs text-gray-400">{c.phone}</div>
                                                </td>
                                                <td className="p-4">
                                                    {c.address ? (
                                                        <div className="max-w-xs truncate" title={c.address}>
                                                            <span className="font-bold text-blue-600 text-xs bg-blue-50 px-2 py-0.5 rounded mr-1.5">{c.pincode}</span>
                                                            {c.address}
                                                        </div>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs italic">No address submitted</span>
                                                    )}
                                                </td>
                                                <td className="p-4 font-bold text-green-600">
                                                    ₹{parseFloat(c.ltv).toFixed(2)}
                                                </td>
                                                <td className="p-4">
                                                    ₹{parseFloat(c.aov).toFixed(2)}
                                                </td>
                                                <td className="p-4 text-gray-900">
                                                    {c.order_count} orders
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${getFrequencyTagStyle(c.frequency_tag)}`}>
                                                        {c.frequency_tag}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-xs text-gray-500">
                                                    {c.last_active ? new Date(c.last_active).toLocaleString() : 'N/A'}
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredCustomers.length === 0 && (
                                            <tr>
                                                <td colSpan="7" className="text-center py-12 text-gray-400 font-semibold bg-white border border-dashed rounded-2xl">No customer records matching search parameters.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Abandoned Carts Tab */}
                    {activeTab === 'abandoned' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                            {carts.map(cart => {
                                const days = Math.floor((new Date() - new Date(cart.updated_at)) / (1000 * 60 * 60 * 24));
                                const hours = Math.floor((new Date() - new Date(cart.updated_at)) / (1000 * 60 * 60)) % 24;
                                const timeSinceStr = days > 0 ? `${days}d ${hours}h ago` : `${hours}h ago`;
                                
                                return (
                                    <div key={cart.cart_id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-lg text-gray-900">{cart.name || 'Anonymous User'}</h3>
                                                    <span className="text-xs text-gray-400">{cart.phone}</span>
                                                </div>
                                                <span className="bg-rose-50 border border-rose-200 text-rose-600 font-bold text-xs px-2.5 py-1 rounded-full flex items-center gap-1">
                                                    <AlertCircle size={12} /> Abandoned
                                                </span>
                                            </div>

                                            <div className="space-y-2 text-xs border-t pt-3 font-semibold text-gray-500">
                                                <div className="flex justify-between">
                                                    <span>Drop-off Stage:</span>
                                                    <span className="text-gray-950 font-bold">{cart.session_metadata?.stage || 'ADD_TO_CART'}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Cart Value:</span>
                                                    <span className="text-emerald-600 font-extrabold text-sm">₹{parseFloat(cart.cart_value).toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center bg-gray-50 border p-2 rounded-xl text-gray-400">
                                                    <span className="flex items-center gap-1"><Clock size={12} /> Idle for:</span>
                                                    <span className="text-gray-800 font-bold">{timeSinceStr}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => handleRecoverCart(cart.cart_id)}
                                            disabled={recoveringId === cart.cart_id || parseFloat(cart.cart_value) === 0}
                                            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition active:scale-95 shadow disabled:opacity-50"
                                        >
                                            {recoveringId === cart.cart_id ? (
                                                <Loader2 className="animate-spin" size={14} />
                                            ) : (
                                                <Send size={14} />
                                            )}
                                            Send WhatsApp Recovery Alert
                                        </button>
                                    </div>
                                );
                            })}
                            {carts.length === 0 && (
                                <div className="col-span-full bg-white border border-dashed rounded-2xl py-16 text-center text-gray-500">
                                    <ShoppingCart className="mx-auto w-12 h-12 text-gray-300 mb-4" />
                                    <p className="font-bold text-gray-700">No abandoned checkouts today!</p>
                                    <p className="text-sm text-gray-400 mt-1">Carts left incomplete for over 2 hours will populate here.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Neighborhood Clusters Tab */}
                    {activeTab === 'neighborhoods' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
                            {/* Neighborhood stats leaderboard */}
                            <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                                    <Award size={20} className="text-yellow-500" /> Top Performing Clusters
                                </h3>
                                <div className="divide-y divide-gray-100">
                                    {neighborhoods.map((n, i) => (
                                        <div key={n.pincode} className="py-4 flex items-center justify-between first:pt-0 last:pb-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 font-bold text-xs flex items-center justify-center">
                                                    {i + 1}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">Pincode {n.pincode}</span>
                                                    <div className="text-[10px] text-gray-400 font-semibold mt-1">LBS Road Hyperlocal Cluster</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-extrabold text-gray-950">₹{parseFloat(n.total_revenue).toFixed(0)}</div>
                                                <div className="text-[10px] text-gray-400 font-bold mt-0.5">{n.total_orders} orders placed</div>
                                            </div>
                                        </div>
                                    ))}
                                    {neighborhoods.length === 0 && (
                                        <p className="text-center text-gray-500 py-10">No neighborhood clusters mapped. Place orders to compile graphs.</p>
                                    )}
                                </div>
                            </div>

                            {/* Neighborhood logistics optimization insights card */}
                            <div className="bg-radial from-emerald-950 via-gray-900 to-black rounded-2xl p-6 text-white flex flex-col justify-between shadow-lg">
                                <div className="space-y-3">
                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">Logistics Moat</span>
                                    <h3 className="font-bold text-lg">Cluster Routing Strategy</h3>
                                    <p className="text-xs text-gray-300 leading-relaxed">
                                        Hyperlocal concentration reduces delivery cost per order by up to 60%. Use the Dispatch optimization center to bundle cluster shipments in real time, saving rider fuel and merchant expenses.
                                    </p>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/10 pt-4 mt-6 text-xs font-semibold">
                                    <span className="text-gray-400">Target Delivery Density:</span>
                                    <span className="text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer">
                                        Optimize Routes <ArrowRight size={14} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
