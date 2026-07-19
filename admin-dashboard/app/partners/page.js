"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Users, UserPlus, Phone, Shield, Clock, ToggleLeft, ToggleRight, Loader2, Edit, Trash2, Save, X } from 'lucide-react';

export default function PartnersPage() {
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    
    // Edit Modal State
    const [editingPartner, setEditingPartner] = useState(null);

    // Form state
    const [newPartner, setNewPartner] = useState({
        name: '',
        phone: '',
        pin: ''
    });

    useEffect(() => {
        fetchPartners();
    }, []);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
    };

    const fetchPartners = async () => {
        try {
            const res = await api.get('/partners');
            setPartners(res.data);
        } catch (err) {
            console.error("Failed to load delivery team", err);
            showStatus('error', 'Failed to load delivery partners.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post('/partners', newPartner);
            setShowForm(false);
            setNewPartner({ name: '', phone: '', pin: '' });
            fetchPartners();
            showStatus('success', 'Rider registered successfully.');
        } catch (err) {
            showStatus('error', err.response?.data?.error || 'Failed to register partner.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/partners/${editingPartner.partner_id}`, {
                name: editingPartner.name,
                phone: editingPartner.phone,
                pin: editingPartner.pin,
                max_concurrent_orders: parseInt(editingPartner.max_concurrent_orders) || 5
            });
            setEditingPartner(null);
            fetchPartners();
            showStatus('success', 'Rider details updated successfully.');
        } catch (err) {
            showStatus('error', err.response?.data?.error || 'Failed to update rider.');
        }
    };

    const handleDeactivate = async (id) => {
        if (!confirm('Are you sure you want to deactivate this delivery rider?')) return;
        try {
            await api.delete(`/partners/${id}`);
            fetchPartners();
            showStatus('success', 'Rider deactivated.');
        } catch (err) {
            showStatus('error', 'Failed to deactivate partner.');
        }
    };

    const toggleStatus = async (partnerId, currentStatus) => {
        const nextStatus = currentStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
        try {
            await api.put(`/partners/${partnerId}/status`, { current_status: nextStatus });
            fetchPartners();
        } catch (err) {
            showStatus('error', 'Failed to update status.');
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'AVAILABLE': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'BUSY': return 'bg-amber-50 text-amber-700 border-amber-100';
            case 'OFFLINE': return 'bg-gray-50 text-gray-700 border-gray-100';
            default: return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <Users className="text-green-600 w-8 h-8" /> Delivery Team
                    </h1>
                    <p className="text-gray-500 mt-1">Manage delivery partners, registration, and live statuses.</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-green-600 text-white px-5 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow-md hover:shadow-lg"
                >
                    <UserPlus size={18} /> Register Partner
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

            {/* Registration Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 animate-in slide-in-from-top duration-300">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 pb-2 border-b">
                        <Shield className="text-green-600" size={20} /> Register New Rider
                    </h2>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                            <input
                                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-green-500 transition outline-none text-sm bg-gray-50/20"
                                placeholder="e.g. Rajesh Kumar"
                                value={newPartner.name}
                                onChange={e => setNewPartner({ ...newPartner, name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                            <input
                                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-green-500 transition outline-none text-sm bg-gray-50/20"
                                placeholder="e.g. 919876543210"
                                value={newPartner.phone}
                                onChange={e => setNewPartner({ ...newPartner, phone: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Secret Pin (6 digits)</label>
                            <input
                                type="password"
                                maxLength="6"
                                className="w-full border p-3 rounded-xl focus:ring-2 focus:ring-green-500 transition outline-none text-sm bg-gray-50/20"
                                placeholder="123456"
                                value={newPartner.pin}
                                onChange={e => setNewPartner({ ...newPartner, pin: e.target.value })}
                                required
                            />
                        </div>
                        <div className="md:col-span-3 flex justify-end gap-2 mt-4 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-green-700 active:scale-95 transition-all shadow-md flex items-center gap-2 text-sm"
                            >
                                {submitting && <Loader2 className="animate-spin" size={18} />}
                                Save Rider
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Partners List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="animate-spin text-green-600" size={40} />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {partners.map(p => (
                        <div key={p.partner_id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition duration-300 flex flex-col justify-between space-y-4">
                            <div className="space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900">{p.name}</h3>
                                        <span className="text-[10px] text-gray-400 font-mono">ID: {p.partner_id.substring(0, 8)}...</span>
                                    </div>
                                    <span className={`border px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(p.current_status)}`}>
                                        {p.current_status}
                                    </span>
                                </div>

                                <div className="space-y-2 text-sm text-gray-600 border-t pt-3">
                                    <div className="flex items-center gap-2">
                                        <Phone size={16} className="text-gray-400" />
                                        <span>{p.phone}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Clock size={16} className="text-gray-400" />
                                        <span>Joined {new Date(p.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-semibold bg-gray-50 border p-2 rounded-xl">
                                        Cap: {p.max_concurrent_orders || 5} concurrent delivery jobs
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 border-t pt-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="font-semibold text-gray-500">Live Availability</span>
                                    <button onClick={() => toggleStatus(p.partner_id, p.current_status)}>
                                        {p.current_status === 'AVAILABLE' ? (
                                            <ToggleRight className="text-emerald-500 w-9 h-9" />
                                        ) : (
                                            <ToggleLeft className="text-gray-300 w-9 h-9" />
                                        )}
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingPartner(p)}
                                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 active:scale-95 transition"
                                    >
                                        <Edit size={14} /> Edit Rider
                                    </button>
                                    <button
                                        onClick={() => handleDeactivate(p.partner_id)}
                                        className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 active:scale-95 transition"
                                        title="Deactivate Rider"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {partners.length === 0 && (
                        <div className="col-span-full bg-white border border-dashed rounded-2xl py-16 text-center text-gray-500">
                            <Users className="mx-auto w-12 h-12 text-gray-300 mb-4" />
                            <p className="font-medium text-gray-700">No delivery partners registered yet.</p>
                            <p className="text-sm text-gray-400 mt-1">Click "Register Partner" to add your first delivery rider.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Edit Rider Modal */}
            {editingPartner && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h2 className="text-lg font-bold text-gray-900">Edit Rider Details</h2>
                            <button onClick={() => setEditingPartner(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Rider Full Name</label>
                                <input
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    value={editingPartner.name}
                                    onChange={e => setEditingPartner({ ...editingPartner, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                                    <input
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        value={editingPartner.phone}
                                        onChange={e => setEditingPartner({ ...editingPartner, phone: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Max Concurrent Jobs</label>
                                    <input
                                        type="number"
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        value={editingPartner.max_concurrent_orders || 5}
                                        onChange={e => setEditingPartner({ ...editingPartner, max_concurrent_orders: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">New Secret Pin <span className="text-xs font-normal text-gray-400">(leave blank to keep current pin)</span></label>
                                <input
                                    type="password"
                                    maxLength="6"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    placeholder="••••••"
                                    value={editingPartner.pin || ''}
                                    onChange={e => setEditingPartner({ ...editingPartner, pin: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                                <button type="button" onClick={() => setEditingPartner(null)} className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition text-sm">Cancel</button>
                                <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-bold shadow active:scale-95 transition-all">
                                    <Save size={18} /> Update Rider
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
