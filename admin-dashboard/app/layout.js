"use client";
import './globals.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, BarChart2, ShoppingBag, Package, Users, Settings, LogOut, Megaphone } from 'lucide-react';

export default function RootLayout({ children }) {
    const router = useRouter();

    const handleLogout = () => {
        document.cookie = "admin_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        router.push('/login');
        router.refresh();
    };

    return (
        <html lang="en">
            <body className="bg-gray-50 flex h-screen text-gray-900">
                {/* Sidebar */}
                <aside className="w-64 bg-white border-r flex flex-col md:flex">
                    <div className="p-6 border-b">
                        <h1 className="font-bold text-xl text-green-600">Mera Kirana</h1>
                        <p className="text-xs text-gray-500">Shop Admin Panel</p>
                    </div>

                    <nav className="flex-1 p-4 space-y-1">
                        <Link href="/" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg">
                            <LayoutDashboard size={20} /> Dashboard
                        </Link>
                        <Link href="/analytics" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <BarChart2 size={20} /> Analytics & Logs
                        </Link>
                        <Link href="/orders" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <ShoppingBag size={20} /> Orders
                        </Link>
                        <Link href="/products" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <Package size={20} /> Products
                        </Link>
                        <Link href="/coupons" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <ShoppingBag size={20} /> Coupons
                        </Link>
                        <Link href="/salespeople" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <Users size={20} /> Sales Agents
                        </Link>
                        <Link href="/campaigns" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <Megaphone size={20} /> Campaigns
                        </Link>
                        <Link href="/partners" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <Users size={20} /> Delivery Team
                        </Link>
                    </nav>

                    <div className="p-4 border-t space-y-1">
                        <Link href="/settings" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg">
                            <Settings size={20} /> Settings
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-lg text-left font-semibold text-sm active:scale-95 transition-all"
                        >
                            <LogOut size={20} /> Sign Out
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 overflow-auto">
                    {children}
                </main>
            </body>
        </html>
    );
}
