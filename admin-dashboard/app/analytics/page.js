"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    BarChart3, TrendingUp, Users, MessageSquare, AlertCircle, 
    ShoppingBag, ArrowRight, Loader2, X, Phone, Clock, Calendar 
} from 'lucide-react';

export default function AnalyticsPage() {
    const [summary, setSummary] = useState(null);
    const [chats, setChats] = useState([]);
    const [selectedChat, setSelectedChat] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    
    const [loadingSummary, setLoadingSummary] = useState(true);
    const [loadingChats, setLoadingChats] = useState(true);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        loadSummary();
        loadChats();
    }, []);

    const loadSummary = async () => {
        try {
            setLoadingSummary(true);
            const res = await api.get('/analytics/summary');
            setSummary(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingSummary(false);
        }
    };

    const loadChats = async () => {
        try {
            setLoadingChats(true);
            const res = await api.get('/analytics/chats');
            setChats(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingChats(false);
        }
    };

    const handleViewChat = async (chat) => {
        setSelectedChat(chat);
        setLoadingMessages(true);
        setShowModal(true);
        try {
            const res = await api.get(`/analytics/chats/${chat.conversation_id}`);
            setChatMessages(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingMessages(false);
        }
    };

    // Calculate dynamic funnel stages percentages based on drop-offs
    const getFunnelMetrics = () => {
        if (!summary) return [];
        const total = summary.metrics.totalSessions || 1;
        const orders = summary.metrics.totalOrders || 0;
        
        // Count drop-offs by stage
        const dropMap = { CART: 0, ADDRESS: 0, SLOT: 0, PAYMENT: 0 };
        summary.dropoffs.forEach(d => {
            if (dropMap[d.stage] !== undefined) {
                dropMap[d.stage] += Number(d.count);
            }
        });

        // Compute forward conversions
        const cartUsers = total;
        const addressUsers = Math.max(0, cartUsers - dropMap.CART);
        const slotUsers = Math.max(0, addressUsers - dropMap.ADDRESS);
        const paymentUsers = Math.max(0, slotUsers - dropMap.SLOT);
        const confirmedUsers = orders;

        return [
            { stage: '1. Chat Initialized (Greetings)', count: cartUsers, pct: 100, color: 'bg-green-500' },
            { stage: '2. Product Selected (Cart Active)', count: addressUsers, pct: Math.round((addressUsers / total) * 100), color: 'bg-emerald-500' },
            { stage: '3. Serviceable Address Confirmed', count: slotUsers, pct: Math.round((slotUsers / total) * 100), color: 'bg-teal-500' },
            { stage: '4. Delivery Slot Selected', count: paymentUsers, pct: Math.round((paymentUsers / total) * 100), color: 'bg-cyan-500' },
            { stage: '5. Order Placed (Success)', count: confirmedUsers, pct: Math.round((confirmedUsers / total) * 100), color: 'bg-blue-600' }
        ];
    };

    const formatTimestamp = (isoString) => {
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStageBadgeColor = (stage) => {
        switch (stage) {
            case 'GREETING': return 'bg-gray-100 text-gray-700';
            case 'START': return 'bg-blue-100 text-blue-700';
            case 'CART_VIEW': return 'bg-yellow-100 text-yellow-700';
            case 'ADDRESS_SELECTION': return 'bg-purple-100 text-purple-700';
            case 'SLOT_SELECTION': return 'bg-cyan-100 text-cyan-700';
            case 'CHOOSE_PAYMENT': return 'bg-orange-100 text-orange-700';
            case 'CONFIRMED': return 'bg-green-100 text-green-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-center border-b pb-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <BarChart3 className="text-green-600 w-8 h-8" /> Business Analytics & Chat Console
                    </h1>
                    <p className="text-gray-500 mt-1">Audit customer conversations, track funnel leaks, and view inventory conversions.</p>
                </div>
            </div>

            {/* Core KPI cards */}
            {!loadingSummary && summary && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
                        <div className="p-4 bg-green-50 rounded-xl text-green-600">
                            <MessageSquare size={24} />
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total Customer Threads</span>
                            <span className="text-2xl font-black text-gray-900 mt-0.5">{summary.metrics.totalSessions}</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
                        <div className="p-4 bg-blue-50 rounded-xl text-blue-600">
                            <ShoppingBag size={24} />
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Completed Checkout Orders</span>
                            <span className="text-2xl font-black text-gray-900 mt-0.5">{summary.metrics.totalOrders}</span>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-5">
                        <div className="p-4 bg-emerald-50 rounded-xl text-emerald-600">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">WhatsApp Conversion Ratio</span>
                            <span className="text-2xl font-black text-gray-900 mt-0.5">
                                {summary.metrics.totalSessions > 0 
                                    ? ((summary.metrics.totalOrders / summary.metrics.totalSessions) * 100).toFixed(1)
                                    : '0.0'}%
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Funnel & Products Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Funnel Dropoff Map */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <TrendingUp className="text-green-600" size={20} /> Customer Conversion Funnel
                    </h2>

                    {loadingSummary ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-green-600" /></div>
                    ) : (
                        <div className="space-y-4">
                            {getFunnelMetrics().map(item => (
                                <div key={item.stage} className="space-y-1.5">
                                    <div className="flex justify-between text-xs font-bold text-gray-700">
                                        <span>{item.stage}</span>
                                        <span>{item.count} sessions ({item.pct}%)</span>
                                    </div>
                                    <div className="w-full bg-gray-100 h-6 rounded-lg overflow-hidden flex">
                                        <div 
                                            className={`${item.color} h-full text-[10px] text-white font-bold flex items-center justify-end pr-2 transition-all duration-500`}
                                            style={{ width: `${item.pct}%` }}
                                        >
                                            {item.pct}%
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Top Products Table */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                        <ShoppingBag className="text-green-600" size={20} /> Top Selling Dairy Products
                    </h2>

                    {loadingSummary ? (
                        <div className="flex items-center justify-center py-16"><Loader2 className="animate-spin text-green-600" /></div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider font-semibold border-b">
                                    <tr>
                                        <th className="p-3">Product Variant</th>
                                        <th className="p-3 text-center">Units Sold</th>
                                        <th className="p-3 text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                                    {summary?.topProducts.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50/50">
                                            <td className="p-3 font-bold text-gray-900">{p.base_name} ({p.weight_label})</td>
                                            <td className="p-3 text-center font-mono">{p.total_units}</td>
                                            <td className="p-3 text-right font-bold text-gray-900">₹{parseFloat(p.total_revenue).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {(!summary || summary.topProducts.length === 0) && (
                                        <tr>
                                            <td colSpan="3" className="p-8 text-center text-gray-400">No product sales logged yet.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Live Chat Logs List */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 border-b pb-3">
                    <MessageSquare className="text-green-600" size={20} /> Live WhatsApp Chat Logs
                </h2>

                {loadingChats ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-green-600" size={32} /></div>
                ) : (
                    <div className="overflow-x-auto border rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                                <tr>
                                    <th className="p-4">Customer Phone</th>
                                    <th className="p-4">Conversation ID</th>
                                    <th className="p-4">Current stage</th>
                                    <th className="p-4">Last Message preview</th>
                                    <th className="p-4">Time</th>
                                    <th className="p-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                                {chats.map(chat => (
                                    <tr key={chat.conversation_id} className="hover:bg-gray-50/50 transition">
                                        <td className="p-4 flex items-center gap-2 font-bold text-gray-900">
                                            <Phone size={14} className="text-gray-400" /> {chat.customer_phone}
                                        </td>
                                        <td className="p-4 font-mono text-xs text-gray-400">
                                            {chat.conversation_id.substring(0, 8)}...
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${getStageBadgeColor(chat.session_stage)}`}>
                                                {chat.session_stage}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs text-gray-500 max-w-xs truncate font-normal">
                                            {chat.last_message}
                                        </td>
                                        <td className="p-4 text-xs text-gray-400">
                                            {new Date(chat.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => handleViewChat(chat)}
                                                className="text-xs bg-green-50 text-green-700 px-3.5 py-1.5 rounded-lg border border-green-100 hover:bg-green-100 transition font-bold"
                                            >
                                                Audit Conversation
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {chats.length === 0 && (
                                    <tr>
                                        <td colSpan="6" className="p-12 text-center text-gray-400">No customer threads active in database logs yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* WhatsApp Chat Simulator Modal */}
            {showModal && selectedChat && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-100 w-full max-w-lg h-[600px] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-white/20">
                        {/* Chat header */}
                        <div className="bg-green-600 p-4 text-white flex items-center justify-between shadow">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-green-700/80 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-inner">
                                    👤
                                </div>
                                <div>
                                    <h4 className="font-extrabold text-sm">{selectedChat.customer_phone}</h4>
                                    <span className="text-[10px] text-green-100 flex items-center gap-1 font-mono uppercase">
                                        Active stage: {selectedChat.session_stage}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="bg-white/10 hover:bg-white/25 rounded-full p-2 text-white transition active:scale-95"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Messages Area (Simulates WhatsApp Background) */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#efeae2] relative shadow-inner">
                            {/* WhatsApp themed styling watermark */}
                            <div className="absolute inset-0 bg-[radial-gradient(#dfdcd6_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none"></div>
                            
                            {loadingMessages ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs gap-2">
                                    <Loader2 className="animate-spin text-green-600" /> Loading chat logs...
                                </div>
                            ) : (
                                chatMessages.map((msg) => {
                                    const isIncoming = msg.message_type === 'incoming';
                                    return (
                                        <div 
                                            key={msg.log_id} 
                                            className={`flex ${isIncoming ? 'justify-start' : 'justify-end'} relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-200`}
                                        >
                                            <div 
                                                className={`max-w-[80%] p-3.5 rounded-2xl shadow-sm relative text-sm ${
                                                    isIncoming 
                                                        ? 'bg-white text-gray-900 rounded-tl-none border-l-4 border-green-500' 
                                                        : 'bg-[#d9fdd3] text-gray-900 rounded-tr-none'
                                                }`}
                                            >
                                                {/* Session Stage tag */}
                                                <span className="text-[9px] font-bold text-gray-400 block uppercase mb-1 font-mono">
                                                    [{msg.session_stage}]
                                                </span>
                                                <div className="whitespace-pre-wrap leading-relaxed break-words font-medium">{msg.content}</div>
                                                <span className="text-[9px] text-gray-400 font-bold block text-right mt-1 font-mono">
                                                    {formatTimestamp(msg.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
