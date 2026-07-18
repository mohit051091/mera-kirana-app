"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    ShoppingBag, Clock, CheckCircle, Truck, PackageCheck, Ban, 
    Navigation, UserCheck, Loader, Check, X, MapPin, ExternalLink 
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

    useEffect(() => {
        fetchOrders();
        fetchRiders();
        // Poll for new orders every 30 seconds
        const interval = setInterval(fetchOrders, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchOrders = async () => {
        try {
            const res = await api.get('/orders');
            setOrders(res.data);
        } catch (err) {
            console.error("Failed to fetch orders", err);
        } finally {
            setLoading(false);
        }
    };

    const handleConfirmPayment = async (orderId) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: 'CONFIRMED' });
            fetchOrders();
        } catch (e) {
            console.error(e);
            alert('Failed to confirm payment');
        }
    };

    const handleMarkDelivered = async (orderId) => {
        try {
            await api.put(`/orders/${orderId}/status`, { status: 'DELIVERED' });
            fetchOrders();
        } catch (e) {
            console.error(e);
            alert('Failed to mark as delivered');
        }
    };

    const fetchRiders = async () => {
        try {
            const res = await api.get('/partners');
            // Filter only available riders
            setRiders(res.data.filter(r => r.current_status === 'AVAILABLE'));
        } catch (e) {
            console.error(e);
        }
    };

    const handleSelectOrder = (id) => {
        setSelectedOrderIds(prev => 
            prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
        );
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            // Select all confirmed/pending orders
            const checkable = orders
                .filter(o => o.status === 'CONFIRMED' || o.status === 'PENDING_PAYMENT')
                .map(o => o.order_id);
            setSelectedOrderIds(checkable);
        } else {
            setSelectedOrderIds([]);
        }
    };

    // Optimize Route
    const handleOptimizeRoute = async () => {
        if (selectedOrderIds.length === 0) return;
        setOptimizing(true);
        setShowRouteDrawer(true);
        try {
            // Mumbai shop default coordinates
            const res = await api.post('/partners/route-optimize', {
                orderIds: selectedOrderIds,
                start_lat: 19.1176,
                start_lng: 72.9060
            });
            setOptimizedRoute(res.data.route);
        } catch (err) {
            console.error(err);
        } finally {
            setOptimizing(false);
        }
    };

    // Dispatch orders to rider
    const handleConfirmDispatch = async () => {
        if (!selectedRider || selectedOrderIds.length === 0) return;
        setDispatching(true);
        try {
            // Standard action: Update order status to DELIVERING in batch
            for (const orderId of selectedOrderIds) {
                // Hits order status update routes
                await api.put(`/orders/${orderId}/status`, { status: 'DELIVERING' });
            }
            
            // Toggle rider availability to BUSY
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
            console.error(e);
            alert('Failed to dispatch orders');
        } finally {
            setDispatching(false);
        }
    };

    // Generate Google Maps Directions URL
    const getGoogleMapsDirectionsUrl = () => {
        if (!optimizedRoute) return '';
        const validCoords = optimizedRoute.filter(r => r.lat && r.lng);
        if (validCoords.length === 0) return '';
        
        // Format: https://www.google.com/maps/dir/{start_lat,start_lng}/{lat1,lng1}/{lat2,lng2}...
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

    return (
        <div className="p-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <ShoppingBag size={24} className="text-green-600" /> Dispatch Control Center
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">Review live WhatsApp orders, allocate riders, and compute dynamic OSRM transit routes.</p>
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

                <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                    <table className="w-full text-left text-sm border-collapse">
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
                                <th className="p-4">Customer Info</th>
                                <th className="p-4">Delivery address</th>
                                <th className="p-4">Amount</th>
                                <th className="p-4">Status</th>
                                <th className="p-4">Payment</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                            {orders.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="p-12 text-center text-gray-400">
                                        No active orders in database yet. Incoming WhatsApp checkout orders will appear here automatically.
                                    </td>
                                </tr>
                            ) : (
                                orders.map(order => (
                                    <tr key={order.order_id} className="hover:bg-gray-50/50 transition">
                                        <td className="p-4 text-center">
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
                                        <td className="p-4">
                                            <div className="font-bold text-gray-950">Customer {order.customer_id.substring(0, 6)}...</div>
                                            <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                                <Clock size={12} /> {order.delivery_slot || 'Standard'}
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
                                        <td className="p-4 text-xs font-bold text-gray-500">
                                            {order.payment_method}
                                        </td>
                                        <td className="p-4 text-center">
                                            {order.status === 'PENDING_PAYMENT' && (
                                                <button
                                                    onClick={() => handleConfirmPayment(order.order_id)}
                                                    className="bg-blue-600 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold hover:bg-blue-700 active:scale-95 transition-all shadow"
                                                >
                                                    Confirm Payment
                                                </button>
                                            )}
                                            {order.status === 'CONFIRMED' && (
                                                <span className="text-gray-400 text-xs font-semibold">Awaiting Dispatch</span>
                                            )}
                                            {order.status === 'DELIVERING' && (
                                                <button
                                                    onClick={() => handleMarkDelivered(order.order_id)}
                                                    className="bg-green-600 text-white text-[10px] px-2.5 py-1.5 rounded-lg font-bold hover:bg-green-700 active:scale-95 transition-all shadow"
                                                >
                                                    Mark Delivered
                                                </button>
                                            )}
                                            {order.status === 'DELIVERED' && (
                                                <span className="text-green-600 text-xs font-semibold">Complete</span>
                                            )}
                                            {order.status === 'CANCELLED' && (
                                                <span className="text-rose-600 text-xs font-semibold">Cancelled</span>
                                            )}
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
                <div className="w-full lg:w-96 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4 self-start">
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
                            {/* Route summary & Google Maps redirection link */}
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

                            {/* Waypoint list in sorted order */}
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

                            {/* Dispatch allocation */}
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
        </div>
    );
}
