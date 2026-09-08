"use client";
import { useState, useEffect, useMemo } from 'react';
import api from '../../lib/api';
import { Plus, Package, Save, Pencil, Trash2, X, RefreshCw, Download, Upload, Check, AlertTriangle, Milk } from 'lucide-react';

const WEIGHT_PRESETS = ['100 gm', '200 gm', '250 gm', '500 gm', '1 kg', '2 kg', '5 kg', 'Custom…'];
const QTY_STEPS = [1, 2, 5];

const emptyVariant = () => ({ weight: '500 gm', customWeight: '', price: '', stock: 100, min_qty: 1, max_qty: 20, qty_step: 1, sku: '', retailer_id: '', is_active: true });

function SyncBadge({ retailerId }) {
    if (retailerId) return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><Check size={12} /> Synced</span>;
    return <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5"><AlertTriangle size={12} /> Pending push</span>;
}

export default function ProductsPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [draftVariants, setDraftVariants] = useState([]);
    const [newProduct, setNewProduct] = useState({ base_name: '', description: '', variants: [emptyVariant()] });
    const [busy, setBusy] = useState('');
    const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });

    useEffect(() => { fetchProducts(); }, []);

    const showStatus = (type, text) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg({ type: '', text: '' }), 4500);
    };

    const fetchProducts = async () => {
        try {
            const res = await api.get('/products');
            setProducts(res.data);
        } catch { showStatus('error', 'Failed to fetch catalog.'); }
        finally { setLoading(false); }
    };

    const stats = useMemo(() => {
        const all = products.flatMap(p => (p.variants || []).map(v => ({ ...v, product: p })));
        return {
            products: products.length,
            variants: all.length,
            outOfStock: all.filter(v => (v.stock ?? v.stock_quantity ?? 0) <= 0).length,
            pending: all.filter(v => !(v.retailer_id || v.meta_product_retailer_id)).length,
        };
    }, [products]);

    const filtered = useMemo(() => {
        return products.filter(p => {
            if (query && !(p.base_name || '').toLowerCase().includes(query.toLowerCase())) return false;
            const vs = p.variants || [];
            if (filter === 'out') return vs.some(v => (v.stock ?? v.stock_quantity ?? 0) <= 0);
            if (filter === 'pending') return vs.some(v => !(v.retailer_id || v.meta_product_retailer_id));
            if (filter === 'inactive') return vs.some(v => v.is_active === false);
            return true;
        });
    }, [products, query, filter]);

    const weightValue = (v) => (v.weight && !WEIGHT_PRESETS.includes(v.weight) ? 'Custom…' : (v.weight || '500 gm'));

    const handleCreate = async (e) => {
        e.preventDefault();
        setBusy('create');
        try {
            const payload = {
                base_name: newProduct.base_name, description: newProduct.description,
                variants: newProduct.variants.map(v => ({
                    weight: v.weight === 'Custom…' ? (v.customWeight || 'Standard') : v.weight,
                    price: parseFloat(v.price), stock: parseInt(v.stock) || 0,
                    min_qty: v.min_qty, max_qty: v.max_qty, qty_step: v.qty_step, sku: v.sku || undefined,
                })),
            };
            await api.post('/products', payload);
            setShowForm(false);
            setNewProduct({ base_name: '', description: '', variants: [emptyVariant()] });
            fetchProducts();
            showStatus('success', 'Product created — pushing to Meta in background.');
        } catch (err) { showStatus('error', err.response?.data?.error || 'Create failed.'); }
        finally { setBusy(''); }
    };

    const startEdit = (p) => {
        setEditingId(p.product_id);
        setDraftVariants((p.variants || []).map(v => ({
            variant_id: v.variant_id, weight: v.weight || 'Standard', customWeight: '',
            price: v.price ?? '', stock: v.stock ?? v.stock_quantity ?? 0,
            min_qty: v.min_qty ?? v.min_quantity ?? 1, max_qty: v.max_qty ?? v.max_quantity ?? 20,
            qty_step: v.qty_step ?? v.quantity_step ?? 1,
            sku: v.sku || v.sku_code || '', retailer_id: v.retailer_id || v.meta_product_retailer_id || '',
            is_active: v.is_active !== false,
        })));
    };

    const saveEdit = async (p) => {
        setBusy(p.product_id);
        try {
            await api.put(`/products/${p.product_id}`, {
                base_name: p.base_name, description: p.description,
                variants: draftVariants.map(v => ({
                    variant_id: v.variant_id,
                    weight: v.weight === 'Custom…' ? (v.customWeight || 'Standard') : v.weight,
                    price: parseFloat(v.price), stock: parseInt(v.stock) || 0,
                    min_qty: v.min_qty, max_qty: v.max_qty, qty_step: v.qty_step,
                    sku: v.sku, retailer_id: v.retailer_id, is_active: v.is_active,
                })),
            });
            setEditingId(null);
            fetchProducts();
            showStatus('success', 'Saved — Meta push queued.');
        } catch (err) { showStatus('error', err.response?.data?.error || 'Save failed.'); }
        finally { setBusy(''); }
    };

    const toggleVariant = async (variantId, is_active) => {
        try {
            await api.patch(`/products/variants/${variantId}`, { is_active });
            fetchProducts();
            showStatus('success', is_active ? 'Variant enabled.' : 'Variant disabled + removed from Meta.');
        } catch { showStatus('error', 'Toggle failed.'); }
    };

    const pushProduct = async (id) => {
        setBusy('push' + id);
        try {
            const r = await api.post(`/products/${id}/push`);
            showStatus('success', r.data.message);
            fetchProducts();
        } catch (err) { showStatus('error', err.response?.data?.error || 'Push failed — check META token.'); }
        finally { setBusy(''); }
    };

    const importCatalog = async () => {
        if (!confirm('Pull all Meta catalog items into the dashboard?')) return;
        setBusy('import');
        try {
            const r = await api.post('/products/import-catalog');
            showStatus('success', r.data.message);
            fetchProducts();
        } catch (err) { showStatus('error', err.response?.data?.error || 'Import failed — check META token.'); }
        finally { setBusy(''); }
    };

    if (loading) return <div className="p-10 text-sm text-stone-500">Loading catalog…</div>;

    return (
        <div className="p-5 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="rounded-3xl bg-stone-950 text-white p-6 md:p-8 relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-emerald-500/20 blur-2xl" />
                <div className="absolute right-20 bottom-0 w-32 h-32 rounded-full bg-emerald-400/10 blur-xl" />
                <div className="relative flex flex-col md:flex-row md:items-end gap-4">
                    <div className="flex-1">
                        <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-emerald-300">Catalog manager</p>
                        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1 flex items-center gap-2"><Milk size={26} className="text-emerald-300" /> Products & Variants</h1>
                        <p className="text-stone-300 text-sm mt-1">Owner edits here flow to the shop database instantly, and to WhatsApp catalog in the background.</p>
                        <div className="flex gap-2.5 mt-4 flex-wrap">
                            {[['Products', stats.products], ['Variants', stats.variants], ['Out of stock', stats.outOfStock], ['Pending push', stats.pending]].map(([l, n]) => (
                                <div key={l} className="rounded-2xl bg-white/5 border border-white/10 px-3.5 py-2 min-w-[104px]">
                                    <p className="text-xl font-extrabold leading-none">{n}</p>
                                    <p className="text-[11px] text-stone-400 font-semibold mt-1">{l}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <button onClick={importCatalog} disabled={busy === 'import'} className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-bold flex items-center gap-2 transition active:scale-95 disabled:opacity-50">
                            <Download size={16} /> {busy === 'import' ? 'Importing…' : 'Import from Meta'}
                        </button>
                        <button onClick={() => setShowForm(!showForm)} className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-sm font-bold flex items-center gap-2 transition active:scale-95 shadow-lg shadow-emerald-900/40">
                            {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Close' : 'Add Product'}
                        </button>
                    </div>
                </div>
            </div>

            {statusMsg.text && (
                <div className={`p-4 rounded-2xl text-sm font-semibold border ${statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>{statusMsg.text}</div>
            )}

            {showForm && (
                <form onSubmit={handleCreate} className="rounded-3xl bg-white border border-stone-200 shadow-xl shadow-stone-200/50 p-5 md:p-6 space-y-4">
                    <h2 className="font-extrabold">New product</h2>
                    <div className="grid md:grid-cols-2 gap-3">
                        <input className="border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-50/50" placeholder="Product name — e.g. Fresh Paneer" value={newProduct.base_name} onChange={e => setNewProduct({ ...newProduct, base_name: e.target.value })} required />
                        <input className="border border-stone-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 bg-stone-50/50" placeholder="Description (optional)" value={newProduct.description} onChange={e => setNewProduct({ ...newProduct, description: e.target.value })} />
                    </div>
                    {newProduct.variants.map((v, i) => (
                        <div key={i} className="rounded-2xl bg-stone-50 border border-stone-200 p-3.5 grid grid-cols-2 md:grid-cols-7 gap-2.5 items-end">
                            <label className="text-xs font-bold text-stone-500 col-span-2 md:col-span-2">Weight
                                <select value={v.weight} onChange={e => { const c = [...newProduct.variants]; c[i].weight = e.target.value; setNewProduct({ ...newProduct, variants: c }); }} className="mt-1 w-full border border-stone-200 rounded-xl px-2.5 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500">
                                    {WEIGHT_PRESETS.map(w => <option key={w}>{w}</option>)}
                                </select>
                                {v.weight === 'Custom…' && <input value={v.customWeight} onChange={e => { const c = [...newProduct.variants]; c[i].customWeight = e.target.value; setNewProduct({ ...newProduct, variants: c }); }} placeholder="e.g. 750 gm" className="mt-1.5 w-full border border-stone-200 rounded-xl px-2.5 py-2 text-sm bg-white" />}
                            </label>
                            <label className="text-xs font-bold text-stone-500">Price ₹<input type="number" min="1" required value={v.price} onChange={e => { const c = [...newProduct.variants]; c[i].price = e.target.value; setNewProduct({ ...newProduct, variants: c }); }} className="mt-1 w-full border border-stone-200 rounded-xl px-2.5 py-2 text-sm bg-white" /></label>
                            <label className="text-xs font-bold text-stone-500">Stock<input type="number" min="0" value={v.stock} onChange={e => { const c = [...newProduct.variants]; c[i].stock = e.target.value; setNewProduct({ ...newProduct, variants: c }); }} className="mt-1 w-full border border-stone-200 rounded-xl px-2.5 py-2 text-sm bg-white" /></label>
                            <label className="text-xs font-bold text-stone-500">Min–Max<input className="mt-1 w-full border border-stone-200 rounded-xl px-2.5 py-2 text-sm bg-white" value={`${v.min_qty}-${v.max_qty}`} onChange={e => { const m = e.target.value.split('-'); const c = [...newProduct.variants]; c[i].min_qty = m[0]; c[i].max_qty = m[1]; setNewProduct({ ...newProduct, variants: c }); }} placeholder="1-20" /></label>
                            <label className="text-xs font-bold text-stone-500">Step<select value={v.qty_step} onChange={e => { const c = [...newProduct.variants]; c[i].qty_step = e.target.value; setNewProduct({ ...newProduct, variants: c }); }} className="mt-1 w-full border border-stone-200 rounded-xl px-2.5 py-2 text-sm bg-white">{QTY_STEPS.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                            <button type="button" onClick={() => setNewProduct({ ...newProduct, variants: newProduct.variants.filter((_, j) => j !== i) })} className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 justify-self-end"><Trash2 size={16} /></button>
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setNewProduct({ ...newProduct, variants: [...newProduct.variants, emptyVariant()] })} className="text-sm font-bold text-emerald-700 hover:underline">+ Add weight option</button>
                        <button disabled={busy === 'create'} className="ml-auto px-5 py-2.5 rounded-xl bg-stone-950 text-white text-sm font-bold hover:bg-stone-800 transition active:scale-95 disabled:opacity-50 flex items-center gap-2"><Save size={15} /> {busy === 'create' ? 'Saving…' : 'Save product'}</button>
                    </div>
                </form>
            )}

            <div className="flex flex-col md:flex-row gap-2.5">
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products…" className="flex-1 border border-stone-200 rounded-2xl px-4 py-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm" />
                <div className="flex gap-1.5 bg-white border border-stone-200 rounded-2xl p-1 shadow-sm">
                    {[['all', 'All'], ['out', 'Out of stock'], ['pending', 'Pending push'], ['inactive', 'Hidden']].map(([k, l]) => (
                        <button key={k} onClick={() => setFilter(k)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${filter === k ? 'bg-stone-950 text-white' : 'text-stone-500 hover:bg-stone-100'}`}>{l}</button>
                    ))}
                </div>
            </div>

            <div className="grid gap-4">
                {filtered.map(p => {
                    const editing = editingId === p.product_id;
                    const rows = editing ? draftVariants : (p.variants || []);
                    return (
                        <div key={p.product_id} className="rounded-3xl bg-white border border-stone-200 shadow-lg shadow-stone-200/40 overflow-hidden">
                            <div className="p-4 md:p-5 flex flex-wrap items-center gap-3 border-b border-stone-100 bg-gradient-to-r from-stone-50 to-white">
                                <span className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 grid place-items-center font-extrabold">{(p.base_name || '?')[0]}</span>
                                <div className="flex-1 min-w-[160px]">
                                    <h3 className="font-extrabold leading-tight">{p.base_name}</h3>
                                    <p className="text-xs text-stone-500">{(p.variants || []).length} weight options</p>
                                </div>
                                <SyncBadge retailerId={(p.variants || []).every(v => v.retailer_id || v.meta_product_retailer_id) ? 'x' : ''} />
                                <div className="flex gap-1.5">
                                    {!editing ? (
                                        <>
                                            <button onClick={() => pushProduct(p.product_id)} disabled={busy === 'push' + p.product_id} className="p-2 rounded-xl text-emerald-700 hover:bg-emerald-50 transition" title="Push to Meta"><Upload size={16} /></button>
                                            <button onClick={() => startEdit(p)} className="p-2 rounded-xl text-stone-600 hover:bg-stone-100 transition" title="Edit"><Pencil size={16} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => saveEdit(p)} disabled={busy === p.product_id} className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50 flex items-center gap-1.5"><Save size={13} /> {busy === p.product_id ? 'Saving…' : 'Save'}</button>
                                            <button onClick={() => setEditingId(null)} className="p-2 rounded-xl text-stone-500 hover:bg-stone-100"><X size={16} /></button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm min-w-[760px]">
                                    <thead><tr className="text-left text-[11px] uppercase tracking-wider text-stone-400">
                                        <th className="px-4 py-2.5 font-bold">Weight</th><th className="px-2 py-2.5 font-bold">Price</th><th className="px-2 py-2.5 font-bold">Stock</th><th className="px-2 py-2.5 font-bold">Order qty</th><th className="px-2 py-2.5 font-bold">Meta ID</th><th className="px-2 py-2.5 font-bold">Status</th><th className="px-4 py-2.5"></th>
                                    </tr></thead>
                                    <tbody>
                                        {rows.map((v, i) => {
                                            const rid = v.retailer_id || v.meta_product_retailer_id || '';
                                            const stock = v.stock ?? v.stock_quantity ?? 0;
                                            const set = (k, val) => setDraftVariants(d => d.map((r, j) => j === i ? { ...r, [k]: val } : r));
                                            return (
                                                <tr key={v.variant_id || i} className={`border-t border-stone-100 ${v.is_active === false ? 'opacity-50' : ''}`}>
                                                    <td className="px-4 py-2.5 font-semibold">{editing ? (
                                                        <span className="flex gap-1.5">
                                                            <select value={weightValue(v)} onChange={e => set('weight', e.target.value)} className="border border-stone-200 rounded-lg px-2 py-1.5 text-sm bg-white">{WEIGHT_PRESETS.map(w => <option key={w}>{w}</option>)}</select>
                                                        </span>
                                                    ) : (v.weight || v.weight_label)}</td>
                                                    <td className="px-2 py-2.5">{editing ? <input type="number" min="1" value={v.price} onChange={e => set('price', e.target.value)} className="w-20 border border-stone-200 rounded-lg px-2 py-1.5 text-sm" /> : `₹${v.price}`}</td>
                                                    <td className="px-2 py-2.5">{editing ? <input type="number" min="0" value={v.stock} onChange={e => set('stock', e.target.value)} className="w-20 border border-stone-200 rounded-lg px-2 py-1.5 text-sm" /> : (<span className={`font-bold ${stock <= 0 ? 'text-rose-600' : stock < 10 ? 'text-amber-600' : 'text-stone-700'}`}>{stock <= 0 ? 'Out' : stock}</span>)}</td>
                                                    <td className="px-2 py-2.5 text-xs text-stone-500">{editing ? (
                                                        <span className="flex gap-1 items-center">
                                                            <input value={v.min_qty} onChange={e => set('min_qty', e.target.value)} className="w-11 border border-stone-200 rounded-lg px-1.5 py-1.5 text-sm" title="Min" />–
                                                            <input value={v.max_qty} onChange={e => set('max_qty', e.target.value)} className="w-11 border border-stone-200 rounded-lg px-1.5 py-1.5 text-sm" title="Max" />
                                                            <select value={v.qty_step} onChange={e => set('qty_step', e.target.value)} className="border border-stone-200 rounded-lg px-1 py-1.5 text-sm" title="Step">{QTY_STEPS.map(s => <option key={s} value={s}>×{s}</option>)}</select>
                                                        </span>
                                                    ) : `${v.min_qty ?? v.min_quantity ?? 1}–${v.max_qty ?? v.max_quantity ?? 20} ×${v.qty_step ?? v.quantity_step ?? 1}`}</td>
                                                    <td className="px-2 py-2.5"><code className="text-[11px] bg-stone-100 rounded-lg px-2 py-1 font-mono">{rid ? rid.slice(0, 10) + '…' : '—'}</code></td>
                                                    <td className="px-2 py-2.5"><SyncBadge retailerId={rid} /></td>
                                                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                                        {v.variant_id && (
                                                            <button onClick={() => toggleVariant(v.variant_id, !(v.is_active !== false))} className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition ${v.is_active !== false ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>
                                                                {v.is_active !== false ? 'Hide' : 'Show'}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {editing && (
                                <div className="p-3 border-t border-stone-100 bg-stone-50/60">
                                    <button onClick={() => setDraftVariants(d => [...d, { weight: '500 gm', price: '', stock: 100, min_qty: 1, max_qty: 20, qty_step: 1, sku: '', retailer_id: '', is_active: true }])} className="text-xs font-bold text-emerald-700 hover:underline">+ Add weight option</button>
                                </div>
                            )}
                        </div>
                    );
                })}
                {filtered.length === 0 && (
                    <div className="rounded-3xl border-2 border-dashed border-stone-200 p-10 text-center text-sm text-stone-500 bg-white/60">
                        <Package size={28} className="mx-auto mb-2 text-stone-300" /> No products match. Add your first product above, or Import from Meta.
                    </div>
                )}
            </div>
            <p className="text-[11px] text-stone-400 flex items-center gap-1.5"><RefreshCw size={12} /> Saves update the shop instantly; Meta catalog syncs in the background. Missing META token? Saves still work — badge shows Pending push.</p>
        </div>
    );
}
