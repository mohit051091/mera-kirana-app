"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    Users, Plus, Trash2, CheckCircle2, XCircle, 
    DollarSign, Percent, Save, Loader, Eye, ChevronRight 
} from 'lucide-react';

export default function SalespeoplePage() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [commissionLogs, setCommissionLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const [newAgent, setNewAgent] = useState({
        name: '',
        phone: '',
        incentive_type: 'FLAT',
        incentive_value: ''
    });

    useEffect(() => {
        fetchAgents();
    }, []);

    const fetchAgents = async () => {
        try {
            setLoading(true);
            const res = await api.get('/salespeople');
            setAgents(res.data);
        } catch (err) {
            console.error("Failed to load salespeople", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                name: newAgent.name,
                phone: newAgent.phone,
                incentive_type: newAgent.incentive_type,
                incentive_value: parseFloat(newAgent.incentive_value)
            };
            await api.post('/salespeople', payload);
            setShowForm(false);
            setNewAgent({
                name: '',
                phone: '',
                incentive_type: 'FLAT',
                incentive_value: ''
            });
            fetchAgents();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to register sales agent');
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            await api.put(`/salespeople/${id}`, { is_active: !currentStatus });
            fetchAgents();
        } catch (err) {
            console.error("Error toggling status:", err);
        }
    };

    const handleViewCommissions = async (agent) => {
        setSelectedAgent(agent);
        setLoadingLogs(true);
        try {
            const res = await api.get(`/salespeople/${agent.salesperson_id}/commissions`);
            setCommissionLogs(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoadingLogs(false);
        }
    };

    return (
        <div className="p-6 flex flex-col lg:flex-row gap-6">
            <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Users size={24} className="text-green-600" /> Sales Agents Referral Program
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">Register agents, auto-generate referral deep-links, and audit commissions.</p>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-green-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow font-semibold text-sm"
                    >
                        <Plus size={18} /> Register Sales Agent
                    </button>
                </div>

                {/* Create Agent Form */}
                {showForm && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm mb-8 border border-gray-100">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Register Referral Agent</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Agent Full Name</label>
                                    <input
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        placeholder="e.g. Ramesh Kumar"
                                        value={newAgent.name}
                                        onChange={e => setNewAgent({ ...newAgent, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp Phone Number (with Country Code)</label>
                                    <input
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        placeholder="e.g. 919876543210"
                                        value={newAgent.phone}
                                        onChange={e => setNewAgent({ ...newAgent, phone: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Incentive Structure</label>
                                    <select
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-white"
                                        value={newAgent.incentive_type}
                                        onChange={e => setNewAgent({ ...newAgent, incentive_type: e.target.value })}
                                    >
                                        <option value="FLAT">Flat Fee (₹ per order)</option>
                                        <option value="PERCENTAGE">Percentage (% of order value)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Incentive Value</label>
                                    <input
                                        type="number"
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        placeholder="e.g. 20 or 5"
                                        value={newAgent.incentive_value}
                                        onChange={e => setNewAgent({ ...newAgent, incentive_value: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 text-sm font-semibold">Cancel</button>
                                <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-semibold shadow">
                                    <Save size={18} /> Register Agent
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Agents List Table */}
                {loading ? (
                    <div className="flex justify-center text-gray-500 font-semibold p-10 gap-2">
                        <Loader className="animate-spin text-green-600" size={20} /> Loading agents...
                    </div>
                ) : (
                    <div className="bg-white border rounded-2xl shadow-sm overflow-hidden border-gray-100">
                        <table className="w-full border-collapse text-left text-sm">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                                <tr>
                                    <th className="p-4">Name</th>
                                    <th className="p-4">Referral Code</th>
                                    <th className="p-4">WhatsApp Link</th>
                                    <th className="p-4">Incentive Rule</th>
                                    <th className="p-4">Referrals</th>
                                    <th className="p-4">Commissions Paid</th>
                                    <th className="p-4 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-700 font-medium">
                                {agents.map(agent => (
                                    <tr 
                                        key={agent.salesperson_id} 
                                        onClick={() => handleViewCommissions(agent)}
                                        className={`hover:bg-gray-50/50 transition cursor-pointer ${
                                            selectedAgent?.salesperson_id === agent.salesperson_id ? 'bg-green-50/20' : ''
                                        }`}
                                    >
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900">{agent.name}</div>
                                            <div className="text-xs text-gray-400">{agent.phone}</div>
                                        </td>
                                        <td className="p-4">
                                            <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                                {agent.referral_code}
                                            </span>
                                        </td>
                                        <td className="p-4 text-xs font-mono text-gray-400 truncate max-w-xs">
                                            https://wa.me/shop?text=Hi_REF_{agent.referral_code}
                                        </td>
                                        <td className="p-4">
                                            {agent.incentive_type === 'FLAT' ? (
                                                <span>₹{agent.incentive_value} / order</span>
                                            ) : (
                                                <span>{agent.incentive_value}% of bill</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-gray-900">{agent.total_referrals} orders</td>
                                        <td className="p-4 font-bold text-green-600">₹{parseFloat(agent.total_commissions).toFixed(2)}</td>
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleToggleStatus(agent.salesperson_id, agent.is_active)}
                                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                                                    agent.is_active 
                                                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                                }`}
                                            >
                                                {agent.is_active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                                {agent.is_active ? 'Active' : 'Disabled'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {agents.length === 0 && (
                                    <tr>
                                        <td colSpan="7" className="text-center py-10 text-gray-500">No registered sales agents found. Create your first referrer code link above!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Commissions Ledger Sidebar (Right-hand drawer detail) */}
            {selectedAgent && (
                <div className="w-full lg:w-96 bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4 self-start">
                    <div className="flex justify-between items-start border-b pb-3">
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">{selectedAgent.name}</h3>
                            <p className="text-xs text-gray-500">Commision Audit Trail Logs</p>
                        </div>
                        <button 
                            onClick={() => setSelectedAgent(null)}
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {loadingLogs ? (
                        <div className="flex justify-center py-10 text-gray-400 text-sm">
                            <Loader className="animate-spin text-green-600 mr-2" size={16} /> Loading ledger details...
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="bg-gray-50 p-4 rounded-xl flex justify-between items-center border">
                                <span className="text-xs font-semibold text-gray-500">Total Referrals:</span>
                                <span className="font-bold text-gray-800 text-sm">{commissionLogs.length} sales</span>
                            </div>

                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {commissionLogs.map(log => (
                                    <div key={log.commission_id} className="border border-gray-100 rounded-xl p-3.5 space-y-1.5 bg-gray-50/20 text-xs">
                                        <div className="flex justify-between items-center font-bold text-gray-900">
                                            <span>Order: #{log.readable_order_id}</span>
                                            <span className="text-green-600">Payout: +₹{parseFloat(log.commission_amount).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-500 font-medium">
                                            <span>Buyer: {log.customer_name}</span>
                                            <span>Bill: ₹{log.total_amount}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400">
                                            Date: {new Date(log.created_at).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                                {commissionLogs.length === 0 && (
                                    <div className="text-center py-10 text-xs text-gray-400 font-semibold">No commission records linked for this salesperson yet.</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
