-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Customers & Identity
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE,
    is_blocked BOOLEAN DEFAULT FALSE
);

CREATE TABLE addresses (
    address_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(customer_id),
    address_text TEXT NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    lat DECIMAL(10, 8),
    lng DECIMAL(11, 8),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Products & Catalog (Weight-based)
CREATE TABLE product_categories (
    category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES product_categories(category_id),
    base_name VARCHAR(200) NOT NULL, -- e.g. "Basmati Rice"
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE product_variants (
    variant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(product_id),
    weight_label VARCHAR(50) NOT NULL, -- e.g. "500g", "1kg"
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    sku_code VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. Orders & Transactions
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    readable_order_id SERIAL, -- Short ID for humans (e.g. 1001)
    customer_id UUID REFERENCES customers(customer_id),
    status VARCHAR(50) DEFAULT 'PENDING_PAYMENT', 
    -- Statuses: PENDING_PAYMENT, CONFIRMED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, CANCELLED, RETURNED
    total_amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL, -- 'UPI', 'COD'
    payment_status VARCHAR(50) DEFAULT 'PENDING',
    delivery_slot VARCHAR(100),
    delivery_address_snapshot TEXT, -- Snapshot of address at time of order
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_items (
    order_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(order_id),
    variant_id UUID REFERENCES product_variants(variant_id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL, -- Price at time of order
    total_price DECIMAL(10, 2) NOT NULL
);

-- 4. Delivery Partner System
CREATE TABLE delivery_partners (
    partner_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    pin VARCHAR(6), -- Simple login pin
    is_active BOOLEAN DEFAULT TRUE,
    current_status VARCHAR(50) DEFAULT 'AVAILABLE', -- AVAILABLE, BUSY, OFFLINE
    max_concurrent_orders INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_assignments (
    assignment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(order_id),
    partner_id UUID REFERENCES delivery_partners(partner_id),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'ASSIGNED', -- ASSIGNED, COMPLETED, REJECTED
    notes TEXT
);

-- 5. Security (OTPs)
CREATE TABLE otps (
    otp_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL,
    otp_code VARCHAR(6) NOT NULL,
    context VARCHAR(50), -- 'LOGIN', 'DELIVERY_VERIFICATION'
    order_id UUID REFERENCES orders(order_id), -- Optional, for delivery OTP
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Comprehensive Logging
CREATE TABLE payment_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(order_id),
    upi_transaction_id VARCHAR(100),
    amount DECIMAL(10, 2),
    status VARCHAR(50),
    raw_response JSONB, -- Store full webhook payload
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE order_status_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(order_id),
    old_status VARCHAR(50),
    new_status VARCHAR(50),
    changed_by VARCHAR(100), -- 'System', 'Admin', or Partner Name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE conversation_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(customer_id),
    message_type VARCHAR(20), -- 'INCOMING', 'OUTGOING'
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_customers_phone ON customers(phone);
