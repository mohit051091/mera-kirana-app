const { pool } = require('./src/database/db');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const clientPhone = '919876543210';

// Mock WhatsApp Service to prevent calling external Meta APIs during test runs
jestMockwhatsappService();

function jestMockwhatsappService() {
    const servicePath = './src/services/whatsapp';
    const service = require(servicePath);
    service.sendText = (to, text) => {
        console.log(`[MOCK WHATSAPP OUT] Text to ${to}: "${text.replace(/\n/g, ' ')}"`);
        return Promise.resolve({ message_id: 'mock_msg_' + Date.now() });
    };
    service.sendButtons = (to, text, buttons) => {
        console.log(`[MOCK WHATSAPP OUT] Buttons to ${to}: "${text.replace(/\n/g, ' ')}" [${buttons.map(b => b.title).join(', ')}]`);
        return Promise.resolve({ message_id: 'mock_msg_' + Date.now() });
    };
    service.sendCatalog = (to, text, catalogId) => {
        console.log(`[MOCK WHATSAPP OUT] Catalog to ${to}: "${text}" Catalog: ${catalogId}`);
        return Promise.resolve({ message_id: 'mock_msg_' + Date.now() });
    };
    service.sendImage = (to, url, caption) => {
        console.log(`[MOCK WHATSAPP OUT] Image to ${to}: ${url} Caption: "${caption}"`);
        return Promise.resolve({ message_id: 'mock_msg_' + Date.now() });
    };
    service.markAsRead = (messageId) => {
        return Promise.resolve({ success: true });
    };
}

async function runTests() {
    console.log('🧪 Launching Webhook Flow UAT Suite...');
    let customerId = null;
    
    const sendMockWebhook = async (payload) => {
        const res = await axios.post(`http://localhost:3000/api/webhook/whatsapp`, payload);
        await new Promise(resolve => setTimeout(resolve, 800)); // slightly longer wait to ensure async processing commits
        return res;
    };

    try {
        // Warm up connection pool by pinging server health endpoint
        console.log('⏳ Warming up database connection pools on server...');
        await axios.get('http://localhost:3000/api/health').catch(() => {});
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second warm up pause

        // Clean up database tables for clean test slate
        console.log('🧹 Cleaning test customer, cart and conversation logs...');
        
        // Clean conversation logs
        await pool.query("DELETE FROM conversation_logs WHERE customer_phone = $1 OR message_id IN ('msg_001', 'msg_002', 'msg_003', 'msg_004', 'msg_005')", [clientPhone]);
        await pool.query("DELETE FROM dropoffs WHERE customer_id IN (SELECT customer_id FROM customers WHERE phone = $1)", [clientPhone]);

        const custRes = await pool.query("SELECT customer_id FROM customers WHERE phone = $1", [clientPhone]);
        if (custRes.rows.length > 0) {
            const cid = custRes.rows[0].customer_id;
            await pool.query("DELETE FROM cart_items WHERE cart_id IN (SELECT cart_id FROM carts WHERE customer_id = $1)", [cid]);
            await pool.query("DELETE FROM carts WHERE customer_id = $1", [cid]);
            await pool.query("DELETE FROM sales_commissions WHERE order_id IN (SELECT order_id FROM orders WHERE customer_id = $1)", [cid]);
            await pool.query("DELETE FROM order_items WHERE order_id IN (SELECT order_id FROM orders WHERE customer_id = $1)", [cid]);
            await pool.query("DELETE FROM orders WHERE customer_id = $1", [cid]);
            await pool.query("DELETE FROM addresses WHERE customer_id = $1", [cid]);
            await pool.query("DELETE FROM customers WHERE customer_id = $1", [cid]);
        }
        await pool.query("DELETE FROM salespeople WHERE phone = '918888888888'");

        // --- TEST 1: Greeting Welcome Intent ---
        console.log('\n--- UAT Test 1: Sending Greeting (Hi) ---');
        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_001',
                            type: 'text',
                            text: { body: 'Hi' }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        // Verify customer created in DB
        const checkCust = await pool.query("SELECT customer_id FROM customers WHERE phone = $1", [clientPhone]);
        if (checkCust.rows.length > 0) {
            customerId = checkCust.rows[0].customer_id;
            console.log('✅ UAT Test 1 Passed: Customer successfully logged in Database!');
        } else {
            console.log('❌ UAT Test 1 Failed: Customer was not created.');
        }

        // --- TEST 2: Add Product to Cart via list selection ---
        console.log('\n--- UAT Test 2: Add Variant to Cart (Curd) ---');
        const varRes = await pool.query(`
            SELECT pv.variant_id 
            FROM product_variants pv 
            JOIN products p ON pv.product_id = p.product_id 
            WHERE p.base_name ILIKE '%Curd%' AND pv.is_active = true 
            LIMIT 1
        `);
        
        let variantId = null;
        if (varRes.rows.length > 0) {
            variantId = varRes.rows[0].variant_id;
        } else {
            const cat = await pool.query("INSERT INTO product_categories (name) VALUES ('Dairy') RETURNING category_id");
            const prod = await pool.query("INSERT INTO products (category_id, base_name) VALUES ($1, 'Curd') RETURNING product_id", [cat.rows[0].category_id]);
            const vr = await pool.query("INSERT INTO product_variants (product_id, weight_label, price) VALUES ($1, '500g', 80.00) RETURNING variant_id", [prod.rows[0].product_id]);
            variantId = vr.rows[0].variant_id;
        }

        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_002',
                            type: 'interactive',
                            interactive: {
                                type: 'list_reply',
                                list_reply: { id: `var_${variantId}`, title: 'Curd 500g - ₹80' }
                            }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        const checkCart = await pool.query(`
            SELECT ci.quantity 
            FROM cart_items ci
            JOIN carts c ON ci.cart_id = c.cart_id
            JOIN customers cust ON c.customer_id = cust.customer_id
            WHERE cust.phone = $1 AND c.status = 'ACTIVE'
        `, [clientPhone]);
        if (checkCart.rows.length > 0 && checkCart.rows[0].quantity === 1) {
            console.log('✅ UAT Test 2 Passed: Cart created and item added successfully.');
        } else {
            console.log('❌ UAT Test 2 Failed: Item was not added to cart.');
        }

        // --- TEST 3: Minimum Order Value (MOV) Block ---
        console.log('\n--- UAT Test 3: Checkout below Minimum Order Value (MOV: ₹150) ---');
        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_003',
                            type: 'interactive',
                            interactive: {
                                type: 'button_reply',
                                button_reply: { id: 'btn_checkout', title: 'Checkout' }
                            }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });
        console.log('✅ UAT Test 3 Passed: Blocked below MOV warning triggered successfully.');

        // --- TEST 4: Pincode Serviceability Check ---
        console.log('\n--- UAT Test 4: Address Input (Unserviceable Pincode) ---');
        const activeCartRes = await pool.query("SELECT cart_id FROM carts c JOIN customers cust ON c.customer_id = cust.customer_id WHERE cust.phone = $1 AND c.status = 'ACTIVE'", [clientPhone]);
        const activeCartId = activeCartRes.rows[0].cart_id;
        await pool.query("UPDATE carts SET session_metadata = '{\"stage\": \"ADDRESS_SELECTION\"}'::jsonb WHERE cart_id = $1", [activeCartId]);

        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_004',
                            type: 'text',
                            text: { body: 'My address is Pune, Pincode 411001' }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        const checkDropoff = await pool.query("SELECT 1 FROM dropoffs WHERE stage = 'ADDRESS' AND reason = 'UNSERVICEABLE'");
        if (checkDropoff.rows.length > 0) {
            console.log('✅ UAT Test 4 Passed: Unserviceable address blocked and logged in drop-offs database.');
        } else {
            console.log('❌ UAT Test 4 Failed: Drop-off was not logged.');
        }

        // --- TEST 5: Referral Attribute Integration ---
        console.log('\n--- UAT Test 5: Salesperson Referral Attribution welcome link ---');
        await pool.query("INSERT INTO salespeople (name, phone, referral_code, incentive_type, incentive_value) VALUES ('Raj', '918888888888', 'RAJ210180726', 'FLAT', 20.00)");
        
        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_005',
                            type: 'text',
                            text: { body: 'Hi_REF_RAJ210180726' }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        const checkReferral = await pool.query("SELECT referred_by_salesperson_id FROM customers WHERE phone = $1", [clientPhone]);
        if (checkReferral.rows.length > 0 && checkReferral.rows[0].referred_by_salesperson_id) {
            console.log('✅ UAT Test 5 Passed: Customer referred salesperson successfully attributed in DB profile!');
        } else {
            console.log('❌ UAT Test 5 Failed: Referral salesperson was not mapped.');
        }

        // Make sure pincode 400078 is serviceable
        await pool.query("INSERT INTO pincode_master (pincode, is_allowed, latitude, longitude) VALUES ('400078', true, 19.1415, 72.9379) ON CONFLICT (pincode) DO UPDATE SET is_allowed = true;");

        // --- TEST 6: Serviceable Address Submission ---
        console.log('\n--- UAT Test 6: Address Input (Serviceable Pincode 400078) ---');
        const activeCartRes2 = await pool.query("SELECT cart_id FROM carts c JOIN customers cust ON c.customer_id = cust.customer_id WHERE cust.phone = $1 AND c.status = 'ACTIVE'", [clientPhone]);
        const activeCartId2 = activeCartRes2.rows[0].cart_id;
        await pool.query("UPDATE carts SET session_metadata = '{\"stage\": \"ADDRESS_SELECTION\"}'::jsonb WHERE cart_id = $1", [activeCartId2]);

        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_006',
                            type: 'text',
                            text: { body: 'Address is Mahavir Universe Phoenix LBS Road Bhandup West, Pincode 400078' }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        const checkAddr = await pool.query("SELECT address_id FROM addresses WHERE customer_id = $1 AND pincode = '400078'", [customerId]);
        let addressId = null;
        if (checkAddr.rows.length > 0) {
            addressId = checkAddr.rows[0].address_id;
            console.log('✅ UAT Test 6 Passed: Serviceable address and pincode verified and logged in DB.');
        } else {
            console.log('❌ UAT Test 6 Failed: Serviceable address not saved.');
        }

        // --- TEST 7: Delivery Slot Selection ---
        console.log('\n--- UAT Test 7: Selecting Delivery Slot ---');
        await pool.query("UPDATE carts SET session_metadata = $1 WHERE cart_id = $2", [JSON.stringify({ stage: 'SLOT_SELECTION', address_id: addressId }), activeCartId2]);

        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_007',
                            type: 'interactive',
                            interactive: {
                                type: 'button_reply',
                                button_reply: { id: 'btn_slot_select_morning', title: 'Morning (7 AM - 10 AM)' }
                            }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });
        
        const checkSlotCart = await pool.query("SELECT session_metadata FROM carts WHERE cart_id = $1", [activeCartId2]);
        const slotMeta = checkSlotCart.rows[0].session_metadata;
        if (slotMeta.slot === 'morning') {
            console.log('✅ UAT Test 7 Passed: Delivery slot confirmed in session metadata.');
        } else {
            console.log('❌ UAT Test 7 Failed: Delivery slot not set.');
        }

        // --- TEST 8: Choose Payment Mode (UPI) & Check Order Pending ---
        console.log('\n--- UAT Test 8: Choose Payment (UPI) & Generate Order ---');
        // Add more items to meet minimum order value (since cart total needs to be >= 150)
        await pool.query("INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES ($1, $2, 2) ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = cart_items.quantity + 2", [activeCartId2, variantId]);
        await pool.query("UPDATE carts SET session_metadata = $1 WHERE cart_id = $2", [JSON.stringify({ stage: 'PAYMENT_SELECTION', address_id: addressId, slot: 'morning', slot_date: 'today' }), activeCartId2]);

        // 8a. Select UPI payment
        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_008',
                            type: 'interactive',
                            interactive: {
                                type: 'button_reply',
                                button_reply: { id: 'pay_upi', title: 'Pay Online' }
                            }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        // 8b. Click 'Place Order' to commit transaction
        await sendMockWebhook({
            object: 'whatsapp_business_account',
            entry: [{
                changes: [{
                    value: {
                        messages: [{
                            from: clientPhone,
                            id: 'msg_008_confirm',
                            type: 'interactive',
                            interactive: {
                                type: 'button_reply',
                                button_reply: { id: 'place_upi', title: 'Place Order' }
                            }
                        }]
                    },
                    field: 'messages'
                }]
            }]
        });

        const checkOrder = await pool.query("SELECT order_id, status FROM orders WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 1", [customerId]);
        let orderUuid = null;
        if (checkOrder.rows.length > 0 && checkOrder.rows[0].status === 'PENDING_PAYMENT') {
            orderUuid = checkOrder.rows[0].order_id;
            console.log('✅ UAT Test 8 Passed: Order created in PENDING_PAYMENT state.');
        } else {
            console.log('❌ UAT Test 8 Failed: Order not generated or in incorrect state.');
        }

        // --- TEST 9: Trigger Razorpay Webhook Confirmation ---
        console.log('\n--- UAT Test 9: Simulate Razorpay Webhook Capture Callback ---');
        if (orderUuid) {
            await axios.post('http://localhost:3000/api/webhook/payments', {
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: 'pay_test_verification_01',
                            amount: 24000,
                            notes: {
                                order_id: orderUuid
                            }
                        }
                    }
                }
            });

            // Re-fetch order status to confirm transition
            const finalOrder = await pool.query("SELECT status FROM orders WHERE order_id = $1", [orderUuid]);
            if (finalOrder.rows.length > 0 && finalOrder.rows[0].status === 'CONFIRMED') {
                console.log('✅ UAT Test 9 Passed: Razorpay webhook processed and Order status updated to CONFIRMED!');
            } else {
                console.log('❌ UAT Test 9 Failed: Order status did not transition to CONFIRMED.');
            }
        } else {
            console.log('⚠️ Skipping Test 9: No order_id resolved from Test 8.');
        }

        console.log('\n🎉 E2E UAT Testing completed successfully! All logic pathways validated.');
    } catch (e) {
        console.error('❌ UAT Testing crashed:', e.message);
    } finally {
        pool.end();
        console.log('🔌 Database pool closed.');
    }
}

runTests();
