"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    Tag, Plus, Trash2, CheckCircle2, XCircle, 
    Calendar, Percent, DollarSign, Save, Loader 
} from 'lucide-react';

export default function CouponsPage() {
    const [coupons, setCoupons] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newCoupon, setNewCoupon] = useState({
        code: '',
        discount_type: 'PERCENTAGE',
        discount_value: '',
        min_order_value: '',
        max_uses: '',
        end_date: ''
    });
    const [error, setError] = useState('');

    useEffect(() => {
        fetchCoupons();
    }, []);

    const fetchCoupons = async () => {
        try {
            setLoading(true);
            const res = await api.get('/coupons');
            setCoupons(res.data);
        } catch (err) {
            console.error("Failed to load coupons", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const payload = {
                code: newCoupon.code,
                discount_type: newCoupon.discount_type,
                discount_value: parseFloat(newCoupon.discount_value),
                min_order_value: newCoupon.min_order_value ? parseFloat(newCoupon.min_order_value) : 0,
                max_uses: newCoupon.max_uses ? parseInt(newCoupon.max_uses) : null,
                end_date: newCoupon.end_date ? new Date(newCoupon.end_date) : null
            };
            await api.post('/coupons', payload);
            setShowForm(false);
            setNewCoupon({
                code: '',
                discount_type: 'PERCENTAGE',
                discount_value: '',
                min_order_value: '',
                max_uses: '',
                end_date: ''
            });
            fetchCoupons();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create coupon');
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            await api.put(`/coupons/${id}`, { is_active: !currentStatus });
            fetchCoupons();
        } catch (err) {
            console.error("Error toggling status:", err);
        }
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this coupon campaign?')) return;
        try {
            await api.delete(`/coupons/${id}`);
            fetchCoupons();
        } catch (err) {
            console.error("Error deleting coupon:", err);
        }
    };

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Tag size={24} className="text-green-600" /> Coupon & Discount Manager
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">Configure customer checkouts discounts, percentage caps, and campaign validity.</p>
                </div>
                <button
                    onClick={() => { setError(''); setShowForm(!showForm); }}
                    className="bg-green-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow font-semibold text-sm"
                >
                    <Plus size={18} /> New Coupon Campaign
                </button>
            </div>

            {/* Create Coupon Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-2xl shadow-sm mb-8 border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Configure Discount Campaign</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 p-3.5 rounded-xl text-sm font-medium">
                                ⚠️ {error}
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Coupon Code (Uppercase)</label>
                                <input
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm uppercase"
                                    placeholder="e.g. DIWALI50"
                                    value={newCoupon.code}
                                    onChange={e => setNewCoupon({ ...newCoupon, code: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Discount Type</label>
                                <select
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-white"
                                    value={newCoupon.discount_type}
                                    onChange={e => setNewCoupon({ ...newCoupon, discount_type: e.target.value })}
                                >
                                    <option value="PERCENTAGE">Percentage (%)</option>
                                    <option value="FLAT">Flat Amount (₹)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Discount Value</label>
                                <input
                                    type="number"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    placeholder="e.g. 10 or 150"
                                    value={newCoupon.discount_value}
                                    onChange={e => setNewCoupon({ ...newCoupon, discount_value: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Min Order Value (MOV)</label>
                                <input
                                    type="number"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    placeholder="e.g. 299"
                                    value={newCoupon.min_order_value}
                                    onChange={e => setNewCoupon({ ...newCoupon, min_order_value: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Max Uses Limit</label>
                                <input
                                    type="number"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    placeholder="Leave empty for unlimited"
                                    value={newCoupon.max_uses}
                                    onChange={e => setNewCoupon({ ...newCoupon, max_uses: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Expiry Date</label>
                                <input
                                    type="date"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    value={newCoupon.end_date}
                                    onChange={e => setNewCoupon({ ...newCoupon, end_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 text-sm font-semibold">Cancel</button>
                            <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-semibold shadow">
                                <Save size={18} /> Activate Coupon
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Coupon List Table */}
            {loading ? (
                <div className="flex justify-center text-gray-500 font-semibold p-10 gap-2">
                    <Loader className="animate-spin text-green-600" size={20} /> Loading campaigns...
                </div>
            ) : (
                <div className="bg-white border rounded-2xl shadow-sm overflow-hidden border-gray-100">
                    <table className="w-full border-collapse text-left text-sm">
                        <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                            <tr>
                                <th className="p-4">Coupon Code</th>
                                <th className="p-4">Discount</th>
                                <th className="p-4">Min. Ticket Size (MOV)</th>
                                <th className="p-4">Usage Limits</th>
                                <th className="p-4">Validity</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                            {coupons.map(coupon => (
                                <tr key={coupon.coupon_id} className="hover:bg-gray-50/50 transition">
                                    <td className="p-4">
                                        <span className="font-bold text-gray-900 bg-gray-100 px-2.5 py-1.5 rounded-lg text-xs tracking-wider border">
                                            {coupon.code}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        {coupon.discount_type === 'PERCENTAGE' ? (
                                            <span className="flex items-center gap-1 text-green-600">
                                                <Percent size={14} /> {coupon.discount_value}% Off
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-blue-600">
                                                <DollarSign size={14} /> ₹{coupon.discount_value} Flat
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4">₹{coupon.min_order_value}</td>
                                    <td className="p-4">
                                        {coupon.used_count} / {coupon.max_uses || '∞'}
                                    </td>
                                    <td className="p-4 text-xs text-gray-500">
                                        {coupon.end_date ? (
                                            <span className="flex items-center gap-1">
                                                <Calendar size={12} /> Expiry: {new Date(coupon.end_date).toLocaleDateString()}
                                            </span>
                                        ) : 'Lifetime Validity'}
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => handleToggleStatus(coupon.coupon_id, coupon.is_active)}
                                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                                                coupon.is_active 
                                                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                            }`}
                                        >
                                            {coupon.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                            {coupon.is_active ? 'Active' : 'Disabled'}
                                        </button>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => handleDelete(coupon.coupon_id)}
                                            className="text-gray-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition duration-150"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {coupons.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="text-center py-10 text-gray-500">No active coupon campaigns found. Add one to start distributing checkouts vouchers!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
