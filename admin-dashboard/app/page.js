"use client";
import { useState, useEffect } from 'react';
import api from '../lib/api';
import Link from 'next/link';
import { ShoppingBag, Truck, DollarSign, Users, RefreshCw, ShoppingCart, UserCheck } from 'lucide-react';

export default function DashboardHome() {
    const [kpis, setKpis] = useState({
        todayOrders: 0,
        pendingDelivery: 0,
        todayRevenue: 0,
        activePartners: 0
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetchKpis();
        const interval = setInterval(fetchKpis, 15000); // refresh every 15s
        return () => clearInterval(interval);
    }, []);

    const fetchKpis = async () => {
        try {
            const res = await api.get('/analytics/kpis');
            setKpis(res.data);
            setError(false);
        } catch (err) {
            console.error("Failed to load KPIs", err);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="flex justify-between items-center border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Store Operations Overview</h1>
                    <p className="text-gray-500 mt-1">Real-time health statistics, transactional conversions, and fleet logs.</p>
                </div>
                <button 
                    onClick={() => { setLoading(true); fetchKpis(); }}
                    className="p-2.5 rounded-xl border bg-white hover:bg-gray-50 active:scale-95 transition-all text-gray-500 hover:text-green-600 shadow-sm"
                    title="Refresh data"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-green-600' : ''}`} />
                </button>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-sm font-medium flex items-center justify-between">
                    <span>Failed to retrieve live KPIs from the server. Showing last cached counts.</span>
                    <button onClick={fetchKpis} className="underline hover:text-rose-800">Retry Connection</button>
                </div>
            )}

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Today's Orders */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition flex items-center justify-between group">
                    <div className="space-y-2">
                        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Today's Orders</h3>
                        {loading ? (
                            <div className="h-9 w-16 bg-gray-100 animate-pulse rounded-lg"></div>
                        ) : (
                            <p className="text-4xl font-extrabold text-gray-900">{kpis.todayOrders}</p>
                        )}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center border border-green-100 group-hover:scale-110 transition duration-300">
                        <ShoppingCart size={24} />
                    </div>
                </div>

                {/* Pending Deliveries */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition flex items-center justify-between group">
                    <div className="space-y-2">
                        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Pending Delivery</h3>
                        {loading ? (
                            <div className="h-9 w-16 bg-gray-100 animate-pulse rounded-lg"></div>
                        ) : (
                            <p className="text-4xl font-extrabold text-blue-600">{kpis.pendingDelivery}</p>
                        )}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:scale-110 transition duration-300">
                        <Truck size={24} />
                    </div>
                </div>

                {/* Today's Revenue */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition flex items-center justify-between group">
                    <div className="space-y-2">
                        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Today's Revenue</h3>
                        {loading ? (
                            <div className="h-9 w-24 bg-gray-100 animate-pulse rounded-lg"></div>
                        ) : (
                            <p className="text-4xl font-extrabold text-emerald-600">₹{kpis.todayRevenue.toFixed(0)}</p>
                        )}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 group-hover:scale-110 transition duration-300">
                        <DollarSign size={24} />
                    </div>
                </div>

                {/* Active Delivery Riders */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition flex items-center justify-between group">
                    <div className="space-y-2">
                        <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider">Active Partners</h3>
                        {loading ? (
                            <div className="h-9 w-16 bg-gray-100 animate-pulse rounded-lg"></div>
                        ) : (
                            <p className="text-4xl font-extrabold text-indigo-600">{kpis.activePartners}</p>
                        )}
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 group-hover:scale-110 transition duration-300">
                        <UserCheck size={24} />
                    </div>
                </div>
            </div>

            {/* Quick Actions Panel */}
            <div className="bg-radial from-emerald-950 via-gray-900 to-black border border-emerald-900/30 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
                <div className="relative z-10 space-y-4 max-w-xl">
                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">Hyperlocal Dairy Moat</span>
                    <h2 className="text-2xl font-bold tracking-tight">Welcome to your Shop Admin!</h2>
                    <p className="text-gray-300 text-sm leading-relaxed">
                        Control your catalog pricing, coordinate active delivery cycles using OSRM, broadcast custom campaigns, and audit sales commissions referral streams from a single unified hub.
                    </p>
                    <div className="flex flex-wrap gap-3 pt-2">
                        <Link href="/orders" className="bg-emerald-600 hover:bg-emerald-500 transition-all font-bold text-sm px-5 py-3 rounded-xl shadow-lg shadow-emerald-700/20 active:scale-95">
                            Manage Orders
                        </Link>
                        <Link href="/products" className="bg-white/10 hover:bg-white/15 border border-white/10 transition-all font-bold text-sm px-5 py-3 rounded-xl active:scale-95">
                            Modify Catalog
                        </Link>
                    </div>
                </div>
                <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-x-12 translate-y-12">
                    <ShoppingBag size={350} />
                </div>
            </div>
        </div>
    );
}