"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Plus, Package, Save, Eye, EyeOff } from 'lucide-react';

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [userRole, setUserRole] = useState('Owner'); // Toggle 'Owner' or 'Manager' for CP security check

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

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch (err) {
            console.error("Failed to load products", err);
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
                        cost_price: userRole === 'Owner' && newProduct.cost_price ? parseFloat(newProduct.cost_price) : null,
                        stock: parseInt(newProduct.stock)
                    }
                ]
            };
            await api.post('/products', payload);
            setShowForm(false);
            setNewProduct({ base_name: '', description: '', price: '', cost_price: '', stock: '' });
            fetchProducts(); // Refresh list
        } catch (err) {
            alert('Failed to create product');
        }
    };

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Package size={24} className="text-green-600" /> Product Catalog
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">Manage dairy categories, variants, pricing, and stock limits.</p>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Role selector dropdown to test CP restriction */}
                    <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-lg border text-sm">
                        <span className="font-semibold text-gray-600 pl-2">Testing Role:</span>
                        <select 
                            value={userRole} 
                            onChange={e => setUserRole(e.target.value)}
                            className="bg-white border rounded px-2.5 py-1 font-bold text-gray-800 outline-none"
                        >
                            <option value="Owner">👑 Owner (Show CP)</option>
                            <option value="Manager">🧑‍💼 Manager (Hide CP)</option>
                        </select>
                    </div>

                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-green-600 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-green-700 active:scale-95 transition-all shadow font-semibold text-sm"
                    >
                        <Plus size={18} /> Add Product
                    </button>
                </div>
            </div>

            {/* Add Product Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-2xl shadow-sm mb-8 border border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b">New Product Details</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Product Name</label>
                            <input
                                className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
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
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
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
                                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                                    placeholder="100"
                                    value={newProduct.stock}
                                    onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 text-sm font-semibold">Cancel</button>
                            <button type="submit" className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 flex items-center gap-2 text-sm font-semibold shadow">
                                <Save size={18} /> Save Product
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Product List */}
            {loading ? (
                <div className="flex justify-center text-gray-500 font-semibold p-10">Loading catalog...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(p => (
                        <div key={p.product_id} className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition duration-200">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-lg text-gray-900">{p.base_name}</h3>
                                <span className="bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full font-bold border border-green-100">Active</span>
                            </div>
                            <div className="mt-4 space-y-3">
                                {p.variants.map((v, i) => {
                                    // Calculate margins for Owner role only
                                    const margin = v.cost_price ? (v.price - v.cost_price) : 0;
                                    const marginPercent = v.cost_price ? ((margin / v.cost_price) * 100).toFixed(0) : 0;
                                    
                                    return (
                                        <div key={i} className="flex justify-between text-sm text-gray-600 border-b border-gray-100 pb-2 last:border-0 last:pb-0 items-center">
                                            <span className="font-medium text-gray-500">{v.weight}</span>
                                            <div className="text-right">
                                                <div className="font-bold text-gray-900">₹{v.price} <span className="text-xs font-normal text-gray-400">({v.stock} left)</span></div>
                                                
                                                {/* Cost price & margins are visible strictly to Owner */}
                                                {userRole === 'Owner' && v.cost_price ? (
                                                    <div className="text-xs text-rose-600 font-bold mt-0.5">
                                                        CP: ₹{v.cost_price} | Margin: {marginPercent}% (+₹{margin.toFixed(0)})
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {products.length === 0 && (
                        <p className="text-gray-500 col-span-full text-center py-10">No products found. Add your first item!</p>
                    )}
                </div>
            )}
        </div>
    );
}
