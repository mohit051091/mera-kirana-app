export default function DashboardHome() {
    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Store Overview</h1>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-gray-500 text-sm font-medium">Today's Orders</h3>
                    <p className="text-3xl font-bold mt-2">0</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-gray-500 text-sm font-medium">Pending Delivery</h3>
                    <p className="text-3xl font-bold mt-2 text-blue-600">0</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-gray-500 text-sm font-medium">Total Revenue (Today)</h3>
                    <p className="text-3xl font-bold mt-2 text-green-600">₹0</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="text-gray-500 text-sm font-medium">Active Partners</h3>
                    <p className="text-3xl font-bold mt-2">0</p>
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">Welcome to your Shop Admin!</h2>
                <p className="text-blue-600">
                    Start by adding products in the <span className="font-bold">Products</span> tab.
                    Once you connect WhatsApp, orders will appear here automatically.
                </p>
            </div>
        </div>
    );
}