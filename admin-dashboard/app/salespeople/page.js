"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { 
    Users, Plus, Trash2, CheckCircle2, XCircle, 
    DollarSign, Percent, Save, Loader, Eye, ChevronRight, Edit, X, CreditCard
} from 'lucide-react';

export default function SalespeoplePage() {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [commissionLogs, setCommissionLogs] = useState([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    
    // Edit Modal State
    const [editingAgent, setEditingAgent] = useState(null);

    const [newAgent, setNewAgent] = useState({
        name: '',
        phone: '',
        incentive_type: 'FLAT',
        incentive_value: ''
    });

    useEffect(() => {
        fetchAgents();
    }, []);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
    };

    const fetchAgents = async () => {
        try {
            setLoading(true);
            const res = await api.get('/salespeople');
            setAgents(res.data);
        } catch (err) {
            console.error("Failed to load salespeople", err);
            showStatus('error', 'Failed to fetch sales agents.');
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
            showStatus('success', 'Sales agent registered successfully.');
        } catch (err) {
            showStatus('error', err.response?.data?.error || 'Failed to register sales agent.');
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/salespeople/${editingAgent.salesperson_id}`, {
                name: editingAgent.name,
                phone: editingAgent.phone,
                incentive_type: editingAgent.incentive_type,
                incentive_value: parseFloat(editingAgent.incentive_value),
                is_active: editingAgent.is_active
            });
            setEditingAgent(null);
            fetchAgents();
            setSelectedAgent(null);
            showStatus('success', 'Sales agent updated successfully.');
        } catch (err) {
            showStatus('error', err.response?.data?.error || 'Failed to update sales agent.');
        }
    };

    const handleDeactivate = async (id) => {
        if (!confirm('Are you sure you want to deactivate this sales agent?')) return;
        try {
            await api.delete(`/salespeople/${id}`);
            fetchAgents();
            setSelectedAgent(null);
            showStatus('success', 'Sales agent deactivated.');
        } catch (err) {
            showStatus('error', 'Failed to deactivate agent.');
        }
    };

    const handleToggleStatus = async (id, currentStatus) => {
        try {
            await api.put(`/salespeople/${id}`, { is_active: !currentStatus });
            fetchAgents();
            showStatus('success', 'Agent status toggled.');
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

    const handleSettlePayout = async (agentId) => {
        if (!confirm('Mark all unpaid commissions as settled/paid?')) return;
        try {
            await api.post(`/salespeople/${agentId}/payout`);
            fetchAgents();
            if (selectedAgent && selectedAgent.salesperson_id === agentId) {
                // Refresh list
                const updatedAgent = { ...selectedAgent, unpaid_commissions: 0 };
                setSelectedAgent(updatedAgent);
                const res = await api.get(`/salespeople/${agentId}/commissions`);
                setCommissionLogs(res.data);
            }
            showStatus('success', 'Commissions ledger settled successfully.');
        } catch (err) {
            showStatus('error', 'Failed to settle commissions.');
        }
    };

    return (
        <div className="p-8 max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 animate-in fade-in duration-300">
            <div className="flex-1 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                            <Users size={30} className="text-green-600" /> Referral Agents
                        </h1>
                        <p className="text-gray-500 mt-1">Register agents, auto-generate referral deep-links, and audit commissions.</p>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-green-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow-md font-semibold text-sm"
                    >
                        <Plus size={18} /> Register Sales Agent
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

                {/* Create Agent Form */}
                {showForm && (
                    <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 animate-in slide-in-from-top duration-300">
                        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">Register Referral Agent</h2>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Agent Full Name</label>
                                    <input
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-gray-50/20"
                                        placeholder="e.g. Ramesh Kumar"
                                        value={newAgent.name}
                                        onChange={e => setNewAgent({ ...newAgent, name: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp Phone Number</label>
                                    <input
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-gray-50/20"
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
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-white cursor-pointer"
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
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-gray-50/20"
                                        placeholder="e.g. 20 or 5"
                                        value={newAgent.incentive_value}
                                        onChange={e => setNewAgent({ ...newAgent, incentive_value: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition text-sm">Cancel</button>
                                <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-bold shadow active:scale-95 transition-all">
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
                    <div className="bg-white border rounded-2xl shadow-sm overflow-x-auto border-gray-100">
                        <table className="w-full border-collapse text-left text-sm min-w-max">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b">
                                <tr>
                                    <th className="p-4">Agent Name</th>
                                    <th className="p-4">Referral Link</th>
                                    <th className="p-4">Incentive Rule</th>
                                    <th className="p-4">Referrals</th>
                                    <th className="p-4">Total Commission</th>
                                    <th className="p-4">Unpaid Ledger</th>
                                    <th className="p-4 text-center">Status</th>
                                    <th className="p-4 text-center">Actions</th>
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
                                        <td className="p-4 text-xs font-mono text-blue-600 font-bold select-all">
                                            {agent.referral_code}
                                        </td>
                                        <td className="p-4 text-xs font-semibold text-gray-600">
                                            {agent.incentive_type === 'FLAT' ? (
                                                <span>₹{agent.incentive_value} / order</span>
                                            ) : (
                                                <span>{agent.incentive_value}% of bill</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-gray-900">{agent.total_referrals} orders</td>
                                        <td className="p-4 font-bold text-green-600">₹{parseFloat(agent.total_commissions).toFixed(2)}</td>
                                        <td className="p-4 font-bold text-rose-600">₹{parseFloat(agent.unpaid_commissions).toFixed(2)}</td>
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={() => handleToggleStatus(agent.salesperson_id, agent.is_active)}
                                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                                                    agent.is_active 
                                                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
                                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                                }`}
                                            >
                                                {agent.is_active ? 'Active' : 'Disabled'}
                                            </button>
                                        </td>
                                        <td className="p-4 text-center" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-2 justify-center">
                                                <button
                                                    onClick={() => setEditingAgent(agent)}
                                                    className="p-1.5 rounded-lg border bg-gray-50 hover:bg-gray-100 text-gray-600"
                                                    title="Edit Details"
                                                >
                                                    <Edit size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeactivate(agent.salesperson_id)}
                                                    className="p-1.5 rounded-lg border bg-rose-50 hover:bg-rose-100 text-rose-600"
                                                    title="Deactivate Agent"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {agents.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="text-center py-12 text-gray-500 font-semibold bg-white border border-dashed rounded-2xl">No registered sales agents found. Create your first referrer code link above!</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Commissions Ledger Sidebar Drawer */}
            {selectedAgent && (
                <div className="w-full lg:w-96 bg-white border border-gray-100 rounded-2xl p-5 shadow-md space-y-4 self-start animate-in slide-in-from-right duration-300 shrink-0">
                    <div className="flex justify-between items-start border-b pb-3">
                        <div>
                            <h3 className="font-bold text-gray-900 text-lg">{selectedAgent.name}</h3>
                            <p className="text-xs text-gray-500">Commission Audit Trail Logs</p>
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
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-xl flex flex-col gap-2 border">
                                <div className="flex justify-between items-center text-xs font-semibold text-gray-500">
                                    <span>Total Referrals:</span>
                                    <span className="font-bold text-gray-800 text-sm">{commissionLogs.length} sales</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-semibold text-rose-500">
                                    <span>Pending Payout:</span>
                                    <span className="font-bold text-sm">₹{parseFloat(selectedAgent.unpaid_commissions).toFixed(2)}</span>
                                </div>
                                {parseFloat(selectedAgent.unpaid_commissions) > 0 && (
                                    <button
                                        onClick={() => handleSettlePayout(selectedAgent.salesperson_id)}
                                        className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition active:scale-95 shadow"
                                    >
                                        <CreditCard size={14} /> Settle Payouts
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                                {commissionLogs.map(log => (
                                    <div key={log.commission_id} className="border border-gray-100 rounded-xl p-3.5 space-y-1.5 bg-gray-50/20 text-xs relative overflow-hidden">
                                        <div className="flex justify-between items-center font-bold text-gray-900">
                                            <span>Order: #{log.readable_order_id}</span>
                                            <span className="text-green-600">Payout: +₹{parseFloat(log.commission_amount).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-500 font-medium">
                                            <span>Buyer: {log.customer_name}</span>
                                            <span>Bill: ₹{log.total_amount}</span>
                                        </div>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-[10px] text-gray-400">
                                                Date: {new Date(log.created_at).toLocaleString()}
                                            </span>
                                            <span className={`text-[9px] font-extrabold border px-2 py-0.5 rounded-full ${
                                                log.payout_status === 'PAID'
                                                ? 'bg-green-50 border-green-200 text-green-700'
                                                : 'bg-rose-50 border-rose-200 text-rose-700'
                                            }`}>
                                                {log.payout_status}
                                            </span>
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

            {/* Edit Salesperson Modal */}
            {editingAgent && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h2 className="text-lg font-bold text-gray-900">Edit Sales Agent Details</h2>
                            <button onClick={() => setEditingAgent(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Agent Full Name</label>
                                <input
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    value={editingAgent.name}
                                    onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">WhatsApp Phone Number</label>
                                <input
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    value={editingAgent.phone}
                                    onChange={e => setEditingAgent({ ...editingAgent, phone: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Incentive Structure</label>
                                    <select
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-white"
                                        value={editingAgent.incentive_type}
                                        onChange={e => setEditingAgent({ ...editingAgent, incentive_type: e.target.value })}
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
                                        value={editingAgent.incentive_value}
                                        onChange={e => setEditingAgent({ ...editingAgent, incentive_value: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                                <button type="button" onClick={() => setEditingAgent(null)} className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition text-sm">Cancel</button>
                                <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-bold shadow active:scale-95 transition-all">
                                    <Save size={18} /> Update Agent
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
