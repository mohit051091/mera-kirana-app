import './globals.css';
import Link from 'next/link';
import { LayoutDashboard, ShoppingBag, Package, Users, Settings } from 'lucide-react';

export const metadata = {
    title: 'WhatsApp Shop Admin',
    description: 'Manage your WhatsApp E-commerce Store',
};

export default function RootLayout({ children }) {
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
                        <Link href="/orders" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <ShoppingBag size={20} /> Orders
                        </Link>
                        <Link href="/products" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <Package size={20} /> Products
                        </Link>
                        <Link href="/partners" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg hover:text-blue-600">
                            <Users size={20} /> Delivery Team
                        </Link>
                    </nav>

                    <div className="p-4 border-t">
                        <Link href="/settings" className="flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg">
                            <Settings size={20} /> Settings
                        </Link>
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
