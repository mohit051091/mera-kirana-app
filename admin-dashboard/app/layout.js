"use client";
import './globals.css';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LayoutDashboard, BarChart2, ShoppingBag, Package, Users, Settings, LogOut, Megaphone, Menu, X, Calendar, Truck, Ticket, Store, BookOpen } from 'lucide-react';

const GROUPS = [
    {
        label: 'Sell', items: [
            { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
            { href: '/orders', icon: ShoppingBag, label: 'Orders' },
            { href: '/products', icon: Package, label: 'Catalog' },
            { href: '/subscriptions', icon: Calendar, label: 'Subscriptions' },
        ]
    },
    {
        label: 'Grow', items: [
            { href: '/campaigns', icon: Megaphone, label: 'Campaigns' },
            { href: '/coupons', icon: Ticket, label: 'Coupons' },
            { href: '/crm', icon: Users, label: 'CRM' },
            { href: '/analytics', icon: BarChart2, label: 'Analytics' },
        ]
    },
    {
        label: 'Run', items: [
            { href: '/partners', icon: Truck, label: 'Delivery Team' },
            { href: '/salespeople', icon: Users, label: 'Sales Agents' },
            { href: '/settings', icon: Settings, label: 'Settings' },
            { href: '/guide', icon: BookOpen, label: 'Manual' },
        ]
    },
];

export default function RootLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    useEffect(() => { setIsSidebarOpen(false); }, [pathname]);

    const handleLogout = () => {
        document.cookie = "admin_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        router.push('/login');
        router.refresh();
    };

    const isLoginPage = pathname === '/login';
    if (isLoginPage) {
        return (<html lang="en"><body className="bg-stone-950 text-stone-100">{children}</body></html>);
    }

    const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

    return (
        <html lang="en">
            <body className="bg-stone-100 text-stone-900 flex flex-col md:flex-row h-screen overflow-hidden antialiased">
                <header className="md:hidden bg-stone-950 text-white h-16 px-4 flex items-center justify-between z-30 shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-xl bg-emerald-500 grid place-items-center"><Store size={18} /></span>
                        <div className="flex flex-col">
                            <span className="font-bold leading-none">Mera Kirana</span>
                            <span className="text-[10px] text-emerald-300 font-semibold tracking-widest uppercase">Owner Studio</span>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-stone-300 hover:bg-white/10 rounded-xl transition" aria-label="Menu">
                        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </header>

                {isSidebarOpen && (
                    <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden" />
                )}

                <aside className={`fixed inset-y-0 left-0 z-50 w-[268px] bg-stone-950 text-stone-200 flex flex-col transform transition-transform duration-300 md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                    <div className="p-5 pb-4 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 grid place-items-center shadow-lg shadow-emerald-900/50"><Store size={20} className="text-white" /></span>
                        <div className="flex-1">
                            <h1 className="font-extrabold text-white leading-none">Mera Kirana</h1>
                            <p className="text-[11px] text-emerald-300/90 font-semibold tracking-widest uppercase mt-1">Owner Studio</p>
                        </div>
                        <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 text-stone-400"><X size={20} /></button>
                    </div>
                    <div className="mx-5 mb-3 rounded-2xl bg-white/5 border border-white/10 px-3.5 py-2.5 flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" /></span>
                        <span className="text-xs font-semibold text-stone-200">Shop open</span>
                        <span className="ml-auto text-[11px] text-stone-400">{today}</span>
                    </div>

                    <nav className="flex-1 px-3 pb-3 space-y-4 overflow-y-auto">
                        {GROUPS.map(g => (
                            <div key={g.label}>
                                <p className="px-3 mb-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-stone-500">{g.label}</p>
                                <div className="space-y-0.5">
                                    {g.items.map(it => {
                                        const active = pathname === it.href;
                                        const Icon = it.icon;
                                        return (
                                            <Link key={it.href} href={it.href} className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-900/40' : 'text-stone-300 hover:bg-white/5 hover:text-white'}`}>
                                                <Icon size={17} className={active ? '' : 'text-stone-400 group-hover:text-emerald-300'} />
                                                {it.label}
                                                {it.href === '/products' && <span className="ml-auto text-[10px] font-bold bg-white/15 rounded-full px-2 py-0.5">NEW</span>}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>

                    <div className="p-3 border-t border-white/10 shrink-0">
                        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 text-rose-300 hover:bg-rose-500/10 rounded-xl text-sm font-bold transition-all active:scale-[0.98]">
                            <LogOut size={17} /> Sign Out
                        </button>
                    </div>
                </aside>

                <main className="flex-1 overflow-auto relative">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-emerald-100/60 to-transparent" />
                    <div className="relative">{children}</div>
                </main>
            </body>
        </html>
    );
}
