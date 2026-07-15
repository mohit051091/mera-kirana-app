"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { ShoppingBag, Clock, CheckCircle, Truck, PackageCheck, Ban } from 'lucide-react';

export default function OrdersPage() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchOrders();
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

    const getStatusColor = (status) => {
        switch (status) {
            case 'PENDING_PAYMENT': return 'bg-yellow-100 text-yellow-800';
            case 'CONFIRMED': return 'bg-blue-100 text-blue-800';
            case 'DELIVERED': return 'bg-green-100 text-green-800';
            case 'CANCELLED': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
                <ShoppingBag size={24} /> Recent Orders
            </h1>

            <div className="bg-white rounded-lg shadow overflow-hidden border">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-700 font-semibold border-b">
                        <tr>
                            <th className="p-4">Order ID</th>
                            <th className="p-4">Customer</th>
                            <th className="p-4">Amount</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Payment</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="p-8 text-center text-gray-500">
                                    No active orders yet. They will appear here instantly.
                                </td>
                            </tr>
                        ) : (
                            orders.map(order => (
                                <tr key={order.order_id} className="border-b hover:bg-gray-50">
                                    <td className="p-4 font-mono">#{order.readable_order_id}</td>
                                    <td className="p-4">
                                        <div className="font-medium">Customer {order.customer_id.substring(0, 6)}...</div>
                                        <div className="text-xs text-gray-500">{order.delivery_slot}</div>
                                    </td>
                                    <td className="p-4 font-bold">₹{order.total_amount}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm">{order.payment_method}</td>
                                    <td className="p-4">
                                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">View Details</button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
