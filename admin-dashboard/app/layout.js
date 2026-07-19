"use client";
import './globals.css';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { LayoutDashboard, BarChart2, ShoppingBag, Package, Users, Settings, LogOut, Megaphone, Menu, X } from 'lucide-react';

export default function RootLayout({ children }) {
    const router = useRouter();
    const pathname = usePathname();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Close mobile sidebar on route change
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [pathname]);

    const handleLogout = () => {
        document.cookie = "admin_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        router.push('/login');
        router.refresh();
    };

    // Hide sidebar on the login screen
    const isLoginPage = pathname === '/login';

    if (isLoginPage) {
        return (
            <html lang="en">
                <body>{children}</body>
            </html>
        );
    }

    return (
        <html lang="en">
            <body className="bg-gray-50 flex flex-col md:flex-row h-screen text-gray-900 overflow-hidden">
                {/* Mobile Top Header */}
                <header className="md:hidden bg-white border-b h-16 px-4 flex items-center justify-between z-30 shrink-0">
                    <div className="flex flex-col">
                        <span className="font-bold text-lg text-green-600">Mera Kirana</span>
                        <span className="text-[10px] text-gray-500 font-semibold tracking-wider uppercase">Operations Hub</span>
                    </div>
                    <button 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition"
                    >
                        {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </header>

                {/* Sidebar Backdrop Overlay on Mobile */}
                {isSidebarOpen && (
                    <div 
                        onClick={() => setIsSidebarOpen(false)} 
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200" 
                    />
                )}

                {/* Sidebar */}
                <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
                    isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`}>
                    <div className="p-6 border-b flex justify-between items-center">
                        <div>
                            <h1 className="font-bold text-xl text-green-600">Mera Kirana</h1>
                            <p className="text-xs text-gray-500">Shop Admin Panel</p>
                        </div>
                        <button 
                            onClick={() => setIsSidebarOpen(false)}
                            className="md:hidden p-1 text-gray-400 hover:text-gray-600"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        <Link href="/" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <LayoutDashboard size={18} /> Dashboard
                        </Link>
                        <Link href="/analytics" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/analytics' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <BarChart2 size={18} /> Analytics & Logs
                        </Link>
                        <Link href="/crm" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/crm' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <Users size={18} /> CRM & Retention
                        </Link>
                        <Link href="/orders" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/orders' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <ShoppingBag size={18} /> Orders
                        </Link>
                        <Link href="/products" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/products' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <Package size={18} /> Products
                        </Link>
                        <Link href="/coupons" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/coupons' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <ShoppingBag size={18} /> Coupons
                        </Link>
                        <Link href="/salespeople" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/salespeople' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <Users size={18} /> Sales Agents
                        </Link>
                        <Link href="/campaigns" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/campaigns' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <Megaphone size={18} /> Campaigns
                        </Link>
                        <Link href="/partners" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/partners' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <Users size={18} /> Delivery Team
                        </Link>
                    </nav>

                    <div className="p-4 border-t space-y-1 bg-white shrink-0">
                        <Link href="/settings" className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition ${
                            pathname === '/settings' ? 'bg-green-50 text-green-700' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                            <Settings size={18} /> Settings
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-lg text-left font-bold text-sm active:scale-95 transition-all"
                        >
                            <LogOut size={18} /> Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 overflow-auto bg-gray-50 relative">
                    {children}
                </main>
            </body>
        </html>
    );
}
