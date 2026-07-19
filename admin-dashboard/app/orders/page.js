"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    ShoppingBag, Clock, CheckCircle, Truck, PackageCheck, Ban, 
    Navigation, UserCheck, Loader, Check, X, MapPin, ExternalLink, Calendar, Search, Trash2
} from 'lucide-react';

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrderIds, setSelectedOrderIds] = useState([]);
    
    // Route optimization state
    const [optimizing, setOptimizing] = useState(false);
    const [optimizedRoute, setOptimizedRoute] = useState(null);
    const [showRouteDrawer, setShowRouteDrawer] = useState(false);
    const [riders, setRiders] = useState([]);
    const [selectedRider, setSelectedRider] = useState('');
    const [dispatching, setDispatching] = useState(false);
    const [dispatchSuccess, setDispatchSuccess] = useState(false);

    // Filters and Toast state
    const [dateFilter, setDateFilter] = useState('ALL');
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedOrder, setExpandedOrder] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        fetchOrders();
        fetchRiders();
        const interval = setInterval(fetchOrders, 30000);
        return () => clearInterval(interval);
    }, [dateFilter]);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
    };

    const fetchOrders = async () => {
        try {
            const params = {};
            const today = new Date();
            today.setHours(0,0,0,0);
            
            if (dateFilter === 'TODAY') {
                params.startDate = today.toISOString();
            } else if (dateFilter === 'YESTERDAY') {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                params.startDate = yesterday.toISOString();
                params.endDate = today.toISOString();
            } else if (dateFilter === 'WEEK') {
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                params.startDate = weekAgo.toISOString();
            }

            const res = await api.get('/orders', { params });
            setOrders(res.data);
        } catch (err) {
            console.error("Failed to fetch orders", err);
            showStatus('error', 'Failed to load orders list.');
        } finally {
            setLoading(false);
        }
    };

    const fetchRiders = async () => {
        try {
            const res = await api.get('/partners');
            setRiders(res.data.filter(r => r.current_status === 'AVAILABLE'));
        } catch (e) {
            console.error(e);
        }
    };

    const handleConfirmPayment = async (orderId) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: 'CONFIRMED' });
            fetchOrders();
            showStatus('success', 'Order payment confirmed!');
        } catch (e) {
            showStatus('error', 'Failed to confirm payment.');
        }
    };

    const handleMarkDelivered = async (orderId) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: 'DELIVERED' });
            fetchOrders();
            showStatus('success', 'Order marked as delivered.');
        } catch (e) {
            showStatus('error', 'Failed to mark as delivered.');
        }
    };

    const handleCancelOrder = async (orderId) => {
        if (!confirm('Are you sure you want to cancel this order?')) return;
        try {
            await api.put(`/orders/${orderId}/cancel`, { changed_by: 'Admin' });
            fetchOrders();
            setExpandedOrder(null);
            showStatus('success', 'Order cancelled successfully.');
        } catch (e) {
            showStatus('error', 'Failed to cancel order.');
        }
    };

    const handleViewOrderDetails = async (orderId) => {
        setLoadingDetails(true);
        try {
            const res = await api.get(`/orders/${orderId}`);
            setExpandedOrder(res.data);
        } catch (err) {
            showStatus('error', 'Failed to load order items details.');
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleSelectOrder = (id) => {
        setSelectedOrderIds(prev => 
            prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const checkable = filteredOrders
                .filter(o => o.status === 'CONFIRMED' || o.status === 'PENDING_PAYMENT')
                .map(o => o.order_id);
            setSelectedOrderIds(checkable);
        } else {
            setSelectedOrderIds([]);
        }
    };

    const handleOptimizeRoute = async () => {
        if (selectedOrderIds.length === 0) return;
        setOptimizing(true);
        setShowRouteDrawer(true);
        try {
            const res = await api.post('/partners/route-optimize', {
                orderIds: selectedOrderIds,
                start_lat: 19.1176,
                start_lng: 72.9060
            });
            setOptimizedRoute(res.data.route);
        } catch (err) {
            console.error(err);
            showStatus('error', 'OSRM Route Optimization failed.');
        } finally {
            setOptimizing(false);
        }
    };

    const handleConfirmDispatch = async () => {
        if (!selectedRider || selectedOrderIds.length === 0) return;
        setDispatching(true);
        try {
            for (const orderId of selectedOrderIds) {
                await api.put(`/orders/${orderId}/status`, { status: 'DELIVERING' });
            }
            await api.put(`/partners/${selectedRider}/status`, { current_status: 'BUSY' });
            
            setDispatchSuccess(true);
            setSelectedOrderIds([]);
            setOptimizedRoute(null);
            setTimeout(() => {
                setDispatchSuccess(false);
                setShowRouteDrawer(false);
                fetchOrders();
                fetchRiders();
            }, 2500);
        } catch (e) {
            showStatus('error', 'Failed to dispatch orders.');
        } finally {
            setDispatching(false);
        }
    };

    const getGoogleMapsDirectionsUrl = () => {
        if (!optimizedRoute) return '';
        const validCoords = optimizedRoute.filter(r => r.lat && r.lng);
        if (validCoords.length === 0) return '';
        const origin = '19.1176,72.9060'; // Mumbai Dairy Shop
        const stops = validCoords.map(c => `${c.lat},${c.lng}`).join('/');
        return `https://www.google.com/maps/dir/${origin}/${stops}`;
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'PENDING_PAYMENT': return 'bg-yellow-50 text-yellow-700 border-yellow-100';
            case 'CONFIRMED': return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'DELIVERING': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
            case 'DELIVERED': return 'bg-green-50 text-green-700 border-green-100';
            case 'CANCELLED': return 'bg-rose-50 text-rose-700 border-rose-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const filteredOrders = orders.filter(o => 
        o.readable_order_id.toString().includes(searchQuery) ||
        o.delivery_address_snapshot?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 animate-in fade-in duration-300">
            <div className="flex-1 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                            <ShoppingBag size={30} className="text-green-600" /> Dispatch Control
                        </h1>
                        <p className="text-gray-500 mt-1">Review live WhatsApp orders, allocate riders, and compute dynamic OSRM transit routes.</p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Date Filter selector */}
                        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border text-sm shadow-sm">
                            <Calendar size={16} className="text-gray-400" />
                            <select 
                                value={dateFilter} 
                                onChange={e => setDateFilter(e.target.value)}
                                className="bg-transparent border-0 font-bold text-gray-800 outline-none cursor-pointer"
                            >
                                <option value="ALL">🗓️ All Time</option>
                                <option value="TODAY">☀️ Today</option>
                                <option value="YESTERDAY">🌙 Yesterday</option>
                                <option value="WEEK">📆 Last 7 Days</option>
                            </select>
                        </div>

                        {selectedOrderIds.length > 0 && (
                            <button
                                onClick={handleOptimizeRoute}
                                className="bg-green-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow font-semibold text-sm"
                            >
                                <Navigation size={16} /> Route {selectedOrderIds.length} Orders
                            </button>
                        )}
                    </div>
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

                {/* Search Bar */}
                <div className="relative">
                    <Search className="absolute left-3 top-3.5 text-gray-400 w-5 h-5" />
                    <input 
                        type="text" 
                        placeholder="Search by Order ID or delivery address..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border rounded-2xl outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-sm transition"
                    />
                </div>

                {/* Orders Table */}
                <div className="bg-white rounded-2xl shadow-sm overflow-x-auto border border-gray-100">
                    <table className="w-full text-left text-sm border-collapse min-w-max">
                        <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                            <tr>
                                <th className="p-4 w-12 text-center">
                                    <input 
                                        type="checkbox"
                                        onChange={handleSelectAll}
                                        className="rounded text-green-600 focus:ring-green-500 h-4 w-4"
                                    />
                                </th>
                                <th className="p-4">Order ID</th>
                                <th className="p-4">Delivery Slot</th>
                                <th className="p-4">Delivery Address</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Payment</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                            {filteredOrders.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center text-gray-400 font-semibold bg-white">
                                        No matching orders found.
                                    </td>
                                </tr>
                            ) : (
                                filteredOrders.map(order => (
                                    <tr 
                                        key={order.order_id} 
                                        onClick={() => handleViewOrderDetails(order.order_id)}
                                        className="hover:bg-gray-50/50 transition cursor-pointer"
                                    >
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            {(order.status === 'CONFIRMED' || order.status === 'PENDING_PAYMENT') ? (
                                                <input 
                                                    type="checkbox"
                                                    checked={selectedOrderIds.includes(order.order_id)}
                                                    onChange={() => handleSelectOrder(order.order_id)}
                                                    className="rounded text-green-600 focus:ring-green-500 h-4 w-4"
                                                />
                                            ) : (
                                                <span className="text-gray-300 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 font-mono font-bold text-gray-900">
                                            #{order.readable_order_id}
                                        </td>
                                        <td className="p-4 text-xs font-semibold">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={12} className="text-gray-400" />
                                                {order.delivery_slot || 'Standard'}
                                            </div>
                                        </td>
                                        <td className="p-4 text-xs text-gray-500 max-w-xs truncate">
                                            {order.delivery_address_snapshot}
                                        </td>
                                        <td className="p-4 font-bold text-gray-900">₹{order.total_amount}</td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>
                                                {order.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs font-extrabold text-gray-500">
                                            {order.payment_method}
                                        </td>
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex justify-center gap-2">
                                                {order.status === 'PENDING_PAYMENT' && (
                                                    <button
                                                        onClick={() => handleConfirmPayment(order.order_id)}
                                                        className="bg-blue-600 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold hover:bg-blue-700 active:scale-95 transition-all shadow"
                                                    >
                                                        Confirm Pay
                                                    </button>
                                                )}
                                                {order.status === 'DELIVERING' && (
                                                    <button
                                                        onClick={() => handleMarkDelivered(order.order_id)}
                                                        className="bg-green-600 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold hover:bg-green-700 active:scale-95 transition-all shadow"
                                                    >
                                                        Mark Delivered
                                                    </button>
                                                )}
                                                {(order.status === 'PENDING_PAYMENT' || order.status === 'CONFIRMED') && (
                                                    <button
                                                        onClick={() => handleCancelOrder(order.order_id)}
                                                        className="bg-rose-50 text-rose-600 hover:bg-rose-100 text-[10px] px-2 py-1.5 rounded-lg font-bold transition active:scale-95 border border-rose-200"
                                                        title="Cancel Order"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* OSRM Route Optimization Drawer */}
            {showRouteDrawer && (
                <div className="w-full lg:w-96 bg-white border border-gray-100 rounded-2xl p-5 shadow-md space-y-4 self-start animate-in slide-in-from-right duration-300 shrink-0">
                    <div className="flex justify-between items-start border-b pb-3">
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                <Navigation className="text-green-600" size={18} /> Optimized Transit Map
                            </h3>
                            <p className="text-xs text-gray-500">Computed via OpenStreetMap / OSRM engine</p>
                        </div>
                        <button 
                            onClick={() => setShowRouteDrawer(false)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {optimizing ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-2 text-gray-400 text-sm">
                            <Loader className="animate-spin text-green-600" size={24} /> Generating optimal route...
                        </div>
                    ) : optimizedRoute ? (
                        <div className="space-y-4">
                            {getGoogleMapsDirectionsUrl() && (
                                <a 
                                    href={getGoogleMapsDirectionsUrl()}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full bg-blue-600 text-white p-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-700 active:scale-95 transition-all shadow shadow-blue-500/20"
                                >
                                    <MapPin size={14} /> Open Route in Google Maps <ExternalLink size={12} />
                                </a>
                            )}

                            <div className="space-y-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Optimized delivery sequence:</span>
                                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                                    <div className="border border-dashed border-green-200 rounded-xl p-3 flex items-center gap-2.5 bg-green-50/10 text-xs">
                                        <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center font-bold text-green-700 text-[10px]">🏠</div>
                                        <div>
                                            <div className="font-bold text-gray-900">Dairy Shop (Start)</div>
                                            <div className="text-[10px] text-gray-400">Kanjurmarg / Bhandup, Mumbai</div>
                                        </div>
                                    </div>

                                    {optimizedRoute.map((stop, index) => (
                                        <div key={stop.order_id} className="border border-gray-100 rounded-xl p-3 flex items-center gap-2.5 bg-gray-50/40 text-xs">
                                            <div className="w-5 h-5 bg-blue-100 rounded-full flex items-center justify-center font-bold text-blue-700 text-[10px]">
                                                {index + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-gray-900 flex justify-between">
                                                    <span>Order: #{stop.readable_order_id}</span>
                                                    {stop.lat && stop.lng ? (
                                                        <span className="text-[10px] bg-green-50 text-green-600 px-1 rounded font-bold">Mapped</span>
                                                    ) : (
                                                        <span className="text-[10px] bg-amber-50 text-amber-600 px-1 rounded font-bold">No GPS</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-400 truncate mt-0.5">{stop.address}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="border-t pt-4 space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Assign Delivery Rider:</label>
                                    <select
                                        value={selectedRider}
                                        onChange={e => setSelectedRider(e.target.value)}
                                        className="w-full border p-3 rounded-xl text-xs outline-none focus:ring-1 focus:ring-green-500 bg-white"
                                    >
                                        <option value="">-- Choose Available Rider --</option>
                                        {riders.map(r => (
                                            <option key={r.partner_id} value={r.partner_id}>{r.name} ({r.phone})</option>
                                        ))}
                                    </select>
                                </div>

                                {dispatchSuccess ? (
                                    <div className="bg-green-50 border border-green-200 text-green-700 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2">
                                        <Check size={16} /> Rider dispatched successfully!
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleConfirmDispatch}
                                        disabled={!selectedRider || dispatching}
                                        className="w-full bg-green-600 text-white p-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-green-700 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        {dispatching ? 'Processing...' : 'Confirm Dispatch Rider'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-xs text-gray-400">Failed to optimize routes.</div>
                    )}
                </div>
            )}

            {/* Expanded Order Items Detail Modal */}
            {expandedOrder && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl border p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b pb-3">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Order details: #{expandedOrder.readable_order_id}</h2>
                                <p className="text-[10px] text-gray-400 font-mono">UUID: {expandedOrder.order_id}</p>
                            </div>
                            <button onClick={() => setExpandedOrder(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        {loadingDetails ? (
                            <div className="flex justify-center py-10">
                                <Loader className="animate-spin text-green-600" size={24} />
                            </div>
                        ) : (
                            <div className="space-y-4 text-sm">
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border text-xs">
                                    <div>
                                        <span className="text-gray-500 font-semibold uppercase block">Delivery Target:</span>
                                        <span className="font-bold text-gray-900">{expandedOrder.delivery_address_snapshot}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500 font-semibold uppercase block">Delivery Slot:</span>
                                        <span className="font-bold text-gray-900 flex items-center gap-1.5 mt-1"><Clock size={12} /> {expandedOrder.delivery_slot || 'Standard'}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Items breakdown:</span>
                                    <div className="divide-y border rounded-xl overflow-hidden bg-white">
                                        {expandedOrder.items?.map((item, index) => (
                                            <div key={index} className="p-3.5 flex justify-between items-center text-xs">
                                                <div>
                                                    <div className="font-bold text-gray-900">{item.base_name} ({item.weight_label})</div>
                                                    <div className="text-gray-400 mt-0.5">Price: ₹{item.unit_price} x {item.quantity} units</div>
                                                </div>
                                                <div className="font-extrabold text-gray-950">₹{parseFloat(item.total_price).toFixed(2)}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex justify-between items-center border-t pt-4">
                                    <div>
                                        <span className="text-gray-500 text-xs font-semibold">Payment mode:</span>
                                        <div className="font-bold text-gray-900 text-xs uppercase">{expandedOrder.payment_method} ({expandedOrder.payment_status || 'PENDING'})</div>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-gray-500 text-xs font-semibold">Grand Total:</span>
                                        <div className="font-extrabold text-green-600 text-xl">₹{parseFloat(expandedOrder.total_amount).toFixed(2)}</div>
                                    </div>
                                </div>

                                <div className="flex justify-end gap-2 border-t pt-4">
                                    {(expandedOrder.status === 'PENDING_PAYMENT' || expandedOrder.status === 'CONFIRMED') && (
                                        <button
                                            onClick={() => handleCancelOrder(expandedOrder.order_id)}
                                            className="bg-rose-600 text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-rose-700 active:scale-95 transition-all shadow"
                                        >
                                            Cancel Order
                                        </button>
                                    )}
                                    <button 
                                        type="button" 
                                        onClick={() => setExpandedOrder(null)} 
                                        className="px-5 py-2.5 rounded-xl border hover:bg-gray-50 font-semibold transition text-xs"
                                    >
                                        Close Details
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
