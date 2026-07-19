"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Plus, Package, Save, Eye, EyeOff, Edit, Trash2, X } from 'lucide-react';

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [userRole, setUserRole] = useState('Owner'); // Toggle 'Owner' or 'Manager' for CP security check
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
    
    // Edit Modal State
    const [editingProduct, setEditingProduct] = useState(null);

    // New Product Form State
    const [newProduct, setNewProduct] = useState({
        base_name: '',
        description: '',
        price: '', // Selling price
        cost_price: '', // Cost price (Owner-only)
        stock: ''
    });

    useEffect(() => {
        fetchProducts();
    }, []);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg({ type: '', text: '' }), 4000);
    };

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch (err) {
            console.error("Failed to load products", err);
            showStatus('error', 'Failed to fetch catalog list.');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                base_name: newProduct.base_name,
                description: newProduct.description,
                variants: [
                    {
                        weight: "Standard",
                        price: parseFloat(newProduct.price),
                        cost_price: userRole === 'Owner' && newProduct.cost_price ? parseFloat(newProduct.cost_price) : 0,
                        stock: parseInt(newProduct.stock) || 0
                    }
                ]
            };
            await api.post('/products', payload);
            setShowForm(false);
            setNewProduct({ base_name: '', description: '', price: '', cost_price: '', stock: '' });
            fetchProducts();
            showStatus('success', 'Product created successfully!');
        } catch (err) {
            showStatus('error', err.response?.data?.error || 'Failed to create product.');
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const variantObj = editingProduct.variants[0] || {};
            const payload = {
                base_name: editingProduct.base_name,
                description: editingProduct.description,
                variants: [
                    {
                        variant_id: variantObj.variant_id,
                        weight: variantObj.weight || "Standard",
                        price: parseFloat(editingProduct.price),
                        cost_price: userRole === 'Owner' && editingProduct.cost_price ? parseFloat(editingProduct.cost_price) : variantObj.cost_price,
                        stock: parseInt(editingProduct.stock) || 0,
                        sku: variantObj.sku
                    }
                ]
            };
            await api.put(`/products/${editingProduct.product_id}`, payload);
            setEditingProduct(null);
            fetchProducts();
            showStatus('success', 'Product updated successfully!');
        } catch (err) {
            showStatus('error', err.response?.data?.error || 'Failed to update product.');
        }
    };

    const handleDeactivate = async (id) => {
        if (!confirm('Are you sure you want to deactivate this product from the catalog?')) return;
        try {
            await api.delete(`/products/${id}`);
            fetchProducts();
            showStatus('success', 'Product deactivated.');
        } catch (err) {
            showStatus('error', 'Failed to deactivate product.');
        }
    };

    const startEditing = (p) => {
        const primaryVariant = p.variants[0] || {};
        setEditingProduct({
            ...p,
            price: primaryVariant.price || '',
            cost_price: primaryVariant.cost_price || '',
            stock: primaryVariant.stock || 0
        });
    };

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
                        <Package size={30} className="text-green-600" /> Product Catalog
                    </h1>
                    <p className="text-gray-500 mt-1">Manage dairy categories, variants, pricing, and stock limits.</p>
                </div>
                
                <div className="flex items-center gap-3 flex-wrap">
                    {/* Role selector dropdown to test CP restriction */}
                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border text-sm shadow-sm">
                        <span className="font-semibold text-gray-500 pl-1">Role:</span>
                        <select 
                            value={userRole} 
                            onChange={e => setUserRole(e.target.value)}
                            className="bg-transparent border-0 font-bold text-gray-800 outline-none cursor-pointer"
                        >
                            <option value="Owner">👑 Owner (Show CP)</option>
                            <option value="Manager">🧑‍💼 Manager (Hide CP)</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-green-600 text-white px-5 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow-md font-semibold text-sm"
                    >
                        <Plus size={18} /> Add Product
                    </button>
                </div>
            </div>

            {/* Status alerts */}
            {statusMsg.text && (
                <div className={`p-4 rounded-xl text-sm font-semibold border ${
                    statusMsg.type === 'success' 
                    ? 'bg-green-50 text-green-700 border-green-100' 
                    : 'bg-rose-50 text-rose-700 border-rose-100'
                }`}>
                    {statusMsg.text}
                </div>
            )}

            {/* Add Product Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 animate-in slide-in-from-top duration-300">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">New Product Details</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name</label>
                            <input
                                className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-gray-50/20"
                                placeholder="e.g. Fresh Paneer"
                                value={newProduct.base_name}
                                onChange={e => setNewProduct({ ...newProduct, base_name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Selling Price (₹)</label>
                                <input
                                    type="number"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-gray-50/20"
                                    placeholder="120"
                                    value={newProduct.price}
                                    onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                                    required
                                />
                            </div>
                            
                            {/* Cost Price: Show input strictly only for Owner role */}
                            {userRole === 'Owner' ? (
                                <div>
                                    <label className="block text-sm font-semibold text-rose-600 mb-1 flex items-center gap-1">
                                        Cost Price (₹) <span className="text-xs font-normal text-rose-400">(Owner Only)</span>
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full border border-rose-200 bg-rose-50/10 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition text-sm"
                                        placeholder="80"
                                        value={newProduct.cost_price}
                                        onChange={e => setNewProduct({ ...newProduct, cost_price: e.target.value })}
                                    />
                                </div>
                            ) : null}

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Initial Stock</label>
                                <input
                                    type="number"
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm bg-gray-50/20"
                                    placeholder="100"
                                    value={newProduct.stock}
                                    onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition text-sm">Cancel</button>
                            <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-bold shadow active:scale-95 transition-all">
                                <Save size={18} /> Save Product
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Product List */}
            {loading ? (
                <div className="flex justify-center text-gray-500 font-semibold p-20">Loading catalog...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(p => (
                        <div key={p.product_id} className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between space-y-4">
                            <div className="space-y-3">
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-lg text-gray-900">{p.base_name}</h3>
                                    <span className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full font-bold border border-green-100">Active</span>
                                </div>
                                <div className="space-y-3 border-t pt-3">
                                    {p.variants.map((v, i) => {
                                        const margin = v.cost_price ? (v.price - v.cost_price) : 0;
                                        const marginPercent = v.cost_price ? ((margin / v.cost_price) * 100).toFixed(0) : 0;
                                        
                                        return (
                                            <div key={i} className="flex justify-between text-sm text-gray-600 border-b border-gray-100 pb-2 last:border-0 last:pb-0 items-center">
                                                <span className="font-medium text-gray-500">{v.weight}</span>
                                                <div className="text-right">
                                                    <div className="font-bold text-gray-900">₹{v.price} <span className="text-xs font-normal text-gray-400">({v.stock} left)</span></div>
                                                    
                                                    {userRole === 'Owner' && v.cost_price ? (
                                                        <div className="text-[11px] text-rose-600 font-bold mt-0.5">
                                                            CP: ₹{v.cost_price} \| Mg: {marginPercent}% (+₹{margin.toFixed(0)})
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div className="flex gap-2 border-t pt-4">
                                <button
                                    onClick={() => startEditing(p)}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-gray-50 hover:bg-gray-100 text-gray-700 active:scale-95 transition"
                                >
                                    <Edit size={14} /> Edit Details
                                </button>
                                <button
                                    onClick={() => handleDeactivate(p.product_id)}
                                    className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 active:scale-95 transition"
                                    title="Deactivate Product"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {products.length === 0 && (
                        <p className="text-gray-500 col-span-full text-center py-20 font-semibold border-dashed border rounded-2xl bg-white">No products found. Add your first item!</p>
                    )}
                </div>
            )}

            {/* Edit Product Modal */}
            {editingProduct && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border p-6 space-y-4 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center border-b pb-3">
                            <h2 className="text-lg font-bold text-gray-900">Edit Catalog Product</h2>
                            <button onClick={() => setEditingProduct(null)} className="p-1 text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name</label>
                                <input
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    value={editingProduct.base_name}
                                    onChange={e => setEditingProduct({ ...editingProduct, base_name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Selling Price (₹)</label>
                                    <input
                                        type="number"
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        value={editingProduct.price}
                                        onChange={e => setEditingProduct({ ...editingProduct, price: e.target.value })}
                                        required
                                    />
                                </div>
                                {userRole === 'Owner' ? (
                                    <div>
                                        <label className="block text-sm font-semibold text-rose-600 mb-1">Cost Price (₹)</label>
                                        <input
                                            type="number"
                                            className="w-full border border-rose-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 transition text-sm bg-rose-50/10"
                                            value={editingProduct.cost_price}
                                            onChange={e => setEditingProduct({ ...editingProduct, cost_price: e.target.value })}
                                        />
                                    </div>
                                ) : null}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">Stock Quantity</label>
                                    <input
                                        type="number"
                                        className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                        value={editingProduct.stock}
                                        onChange={e => setEditingProduct({ ...editingProduct, stock: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                                <button type="button" onClick={() => setEditingProduct(null)} className="px-5 py-2.5 rounded-xl text-gray-500 hover:bg-gray-50 font-medium transition text-sm">Cancel</button>
                                <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-bold shadow active:scale-95 transition-all">
                                    <Save size={18} /> Update Product
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
