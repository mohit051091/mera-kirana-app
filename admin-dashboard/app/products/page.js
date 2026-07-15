"use client";
import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Plus, Package, Save } from 'lucide-react';

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // New Product Form State
    const [newProduct, setNewProduct] = useState({
        base_name: '',
        description: '',
        price: '', // Base price/First variant
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
            // Simple creation logic for MVP - Creates 1 product with 1 default variant
            const payload = {
                base_name: newProduct.base_name,
                description: newProduct.description,
                variants: [
                    {
                        weight: "Standard",
                        price: parseFloat(newProduct.price),
                        stock: parseInt(newProduct.stock)
                    }
                ]
            };
            await api.post('/products', payload);
            setShowForm(false);
            setNewProduct({ base_name: '', description: '', price: '', stock: '' });
            fetchProducts(); // Refresh list
        } catch (err) {
            alert('Failed to create product');
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Package size={24} /> Product Catalog
                </h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700"
                >
                    <Plus size={18} /> Add Product
                </button>
            </div>

            {/* Add Product Form */}
            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-8 border">
                    <h2 className="text-xl font-semibold mb-4">New Product Details</h2>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Product Name</label>
                            <input
                                className="w-full border p-2 rounded"
                                placeholder="e.g. Basmati Rice"
                                value={newProduct.base_name}
                                onChange={e => setNewProduct({ ...newProduct, base_name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Price (₹)</label>
                                <input
                                    type="number"
                                    className="w-full border p-2 rounded"
                                    placeholder="120"
                                    value={newProduct.price}
                                    onChange={e => setNewProduct({ ...newProduct, price: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Stock</label>
                                <input
                                    type="number"
                                    className="w-full border p-2 rounded"
                                    placeholder="100"
                                    value={newProduct.stock}
                                    onChange={e => setNewProduct({ ...newProduct, stock: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600">Cancel</button>
                            <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 flex items-center gap-2">
                                <Save size={18} /> Save Product
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Product List */}
            {loading ? (
                <p>Loading catalog...</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map(p => (
                        <div key={p.product_id} className="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-lg">{p.base_name}</h3>
                                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">Active</span>
                            </div>
                            <div className="mt-4 space-y-2">
                                {p.variants.map((v, i) => (
                                    <div key={i} className="flex justify-between text-sm text-gray-600 border-b pb-1 last:border-0">
                                        <span>{v.weight}</span>
                                        <span className="font-medium">₹{v.price} ({v.stock} in stock)</span>
                                    </div>
                                ))}
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
