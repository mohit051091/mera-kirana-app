"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Users, UserPlus, Phone, Shield, Clock, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react';

export default function PartnersPage() {
    const [partners, setPartners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [newPartner, setNewPartner] = useState({
        name: '',
        phone: '',
        pin: ''
    });

    useEffect(() => {
        fetchPartners();
    }, []);

    const fetchPartners = async () => {
        try {
            const res = await api.get('/partners');
            setPartners(res.data);
        } catch (err) {
            console.error("Failed to load delivery team", err);
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
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to register partner');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleStatus = async (partnerId, currentStatus) => {
        const nextStatus = currentStatus === 'AVAILABLE' ? 'OFFLINE' : 'AVAILABLE';
        try {
            await api.put(`/partners/${partnerId}/status`, { current_status: nextStatus });
            fetchPartners();
        } catch (err) {
            alert('Failed to update status');
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'AVAILABLE': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'BUSY': return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'OFFLINE': return 'bg-gray-100 text-gray-800 border-gray-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
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

            {/* Registration Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Shield className="text-green-600" size={20} /> Register New Rider
                    </h2>
                    <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Full Name</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all outline-none"
                                placeholder="e.g. Rajesh Kumar"
                                value={newPartner.name}
                                onChange={e => setNewPartner({ ...newPartner, name: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone Number</label>
                            <input
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all outline-none"
                                placeholder="e.g. 919876543210"
                                value={newPartner.phone}
                                onChange={e => setNewPartner({ ...newPartner, phone: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Secret Pin (6 digits)</label>
                            <input
                                type="password"
                                maxLength="6"
                                className="w-full border border-gray-200 p-3 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all outline-none"
                                placeholder="123456"
                                value={newPartner.pin}
                                onChange={e => setNewPartner({ ...newPartner, pin: e.target.value })}
                                required
                            />
                        </div>
                        <div className="md:col-span-3 flex justify-end gap-3 mt-2">
                            <button
                                type="button"
                                onClick={() => setShowForm(false)}
                                className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-green-700 active:scale-95 transition-all shadow-md flex items-center gap-2"
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
                        <div key={p.partner_id} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-lg transition duration-300 flex flex-col justify-between space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900">{p.name}</h3>
                                    <span className="text-xs text-gray-400 font-mono">ID: {p.partner_id.substring(0, 8)}...</span>
                                </div>
                                <span className={`border px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(p.current_status)}`}>
                                    {p.current_status}
                                </span>
                            </div>

                            <div className="space-y-2 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                    <Phone size={16} className="text-gray-400" />
                                    <span>{p.phone}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Clock size={16} className="text-gray-400" />
                                    <span>Joined {new Date(p.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>

                            <div className="border-t pt-4 flex justify-between items-center">
                                <span className="text-xs font-semibold text-gray-500">Toggle Status</span>
                                <button
                                    onClick={() => toggleStatus(p.partner_id, p.current_status)}
                                    className="text-gray-500 hover:text-green-600 transition"
                                >
                                    {p.current_status === 'AVAILABLE' ? (
                                        <ToggleRight className="text-emerald-500" size={36} />
                                    ) : (
                                        <ToggleLeft className="text-gray-300" size={36} />
                                    )}
                                </button>
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
        </div>
    );
}
