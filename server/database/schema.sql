-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Customers & Identity
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    dnd_active BOOLEAN DEFAULT FALSE,
    referred_by_salesperson_id UUID,
    language VARCHAR(5) DEFAULT 'EN',
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
    cost_price DECIMAL(10, 2) DEFAULT 0.00,
    meta_product_retailer_id VARCHAR(100),
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
    customer_phone VARCHAR(20) NOT NULL,
    message_type VARCHAR(20), -- 'incoming', 'outgoing'
    content TEXT,
    message_id VARCHAR(100) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE partner_availability_logs (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    partner_id UUID REFERENCES delivery_partners(partner_id),
    status_change VARCHAR(50) NOT NULL, -- AVAILABLE, BUSY, OFFLINE
    changed_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- Indexes for Performance
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_customers_phone ON customers(phone);

-- 7. Shopping Carts
CREATE TABLE carts (
    cart_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(customer_id),
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CONVERTED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE cart_items (
    cart_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cart_id UUID REFERENCES carts(cart_id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(variant_id),
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE(cart_id, variant_id)
);

-- 8. System Configurations
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. Pincode Master
CREATE TABLE pincode_master (
    pincode VARCHAR(10) PRIMARY KEY,
    office_name VARCHAR(100),
    taluk VARCHAR(100),
    district_name VARCHAR(100),
    state_name VARCHAR(100)
);

-- 10. Funnel Drop-offs Analytics
CREATE TABLE dropoffs (
    dropoff_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(customer_id),
    stage VARCHAR(20) CHECK (stage IN ('CART', 'ADDRESS', 'SLOT', 'PAYMENT')),
    reason VARCHAR(50) CHECK (reason IN ('UNSERVICEABLE', 'OUT_OF_HOURS', 'VACATION_MODE', 'HIGH_PRICE', 'NO_SLOT', 'EXIT_INTENT_ABANDONED', 'OTHER')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Marketing Campaigns
CREATE TABLE campaigns (
    campaign_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(30) CHECK (type IN ('Promo', 'Festive', 'Clearance')),
    products_promoted UUID[],
    total_sent INTEGER DEFAULT 0,
    meta_api_cost DECIMAL(10, 2) DEFAULT 0.00,
    sales_generated DECIMAL(10, 2) DEFAULT 0.00,
    profit_margin DECIMAL(10, 2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Coupons
CREATE TABLE coupons (
    coupon_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    discount_type VARCHAR(10) CHECK (discount_type IN ('PERCENT', 'FLAT')),
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_value DECIMAL(10, 2) DEFAULT 0.00,
    start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_date TIMESTAMP WITH TIME ZONE, -- NULL means Indefinite
    max_uses INTEGER DEFAULT NULL,      -- NULL means unlimited
    current_uses INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 13. Salespeople & Referral Incentives
CREATE TABLE salespeople (
    salesperson_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    referral_code VARCHAR(20) UNIQUE NOT NULL,
    incentive_type VARCHAR(10) CHECK (incentive_type IN ('PERCENT', 'FLAT')),
    incentive_value DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE sales_commissions (
    commission_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    salesperson_id UUID REFERENCES salespeople(salesperson_id),
    order_id UUID REFERENCES orders(order_id),
    commission_amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add Foreign Key reference on customers table back to salespeople
ALTER TABLE customers ADD CONSTRAINT fk_referred_by_salesperson FOREIGN KEY (referred_by_salesperson_id) REFERENCES salespeople(salesperson_id);

-- 14. Subscriptions
CREATE TABLE subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID REFERENCES customers(customer_id),
    variant_id UUID REFERENCES product_variants(variant_id),
    quantity INTEGER NOT NULL DEFAULT 1,
    frequency VARCHAR(20) CHECK (frequency IN ('DAILY', 'ALTERNATE', 'WEEKLY')),
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, PAUSED, CANCELLED
    next_delivery_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
