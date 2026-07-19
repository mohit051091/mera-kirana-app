const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');

// GET /api/partners - List all active partners
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM delivery_partners WHERE is_active = TRUE ORDER BY name ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch partners' });
    }
});

// POST /api/partners - Register new partner
router.post('/', async (req, res) => {
    try {
        const { name, phone, pin } = req.body;

        const result = await pool.query(
            `INSERT INTO delivery_partners (name, phone, pin) 
       VALUES ($1, $2, $3) 
       RETURNING partner_id, name, is_active`,
            [name, phone, pin]
        );

        res.status(201).json({ message: 'Partner registered', partner: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') { // Unique violation
            return res.status(400).json({ error: 'Phone number already registered' });
        }
        console.error(err);
        res.status(500).json({ error: 'Failed to register partner' });
    }
});

// PUT /api/partners/:id/status - Update availability
router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { current_status } = req.body; // AVAILABLE, BUSY, OFFLINE

        await pool.query(
            'UPDATE delivery_partners SET current_status = $1 WHERE partner_id = $2',
            [current_status, id]
        );

        // Log availability change (Basic)
        await pool.query(
            `INSERT INTO partner_availability_logs (partner_id, status_change, changed_by)
       VALUES ($1, $2, 'System')`,
            [id, current_status]
        );

        res.json({ message: 'Status updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// POST /api/partners/route-optimize - Optimize delivery sequence for multiple orders using OSRM
const axios = require('axios');
router.post('/route-optimize', async (req, res) => {
    try {
        const { orderIds, start_lat, start_lng } = req.body;
        
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ error: 'No order IDs specified' });
        }

        // 1. Fetch order details & addresses
        const ordersQuery = await pool.query(`
            SELECT order_id, readable_order_id, delivery_address_snapshot 
            FROM orders 
            WHERE order_id = ANY($1)
        `, [orderIds]);

        const orders = ordersQuery.rows;
        if (orders.length === 0) {
            return res.status(404).json({ error: 'No orders found matching input IDs' });
        }

        // 2. Extract pincodes & fetch coordinates
        const ordersWithCoords = [];
        for (const order of orders) {
            const pinMatch = order.delivery_address_snapshot.match(/\b\d{6}\b/);
            const pin = pinMatch ? pinMatch[0] : null;
            
            let lat = null;
            let lng = null;

            if (pin) {
                const pinRes = await pool.query('SELECT latitude, longitude FROM pincode_master WHERE pincode = $1 LIMIT 1', [pin]);
                if (pinRes.rows.length > 0 && pinRes.rows[0].latitude !== 'NA') {
                    lat = parseFloat(pinRes.rows[0].latitude);
                    lng = parseFloat(pinRes.rows[0].longitude);
                }
            }
            ordersWithCoords.push({ ...order, pincode: pin, lat, lng });
        }

        // Start location: default to Mumbai dairy shop if not specified
        const dairyLat = start_lat ? parseFloat(start_lat) : 19.1176;
        const dairyLng = start_lng ? parseFloat(start_lng) : 72.9060;

        // Filter waypoints with valid coordinates
        const validCoords = [{ lat: dairyLat, lng: dairyLng, label: 'Dairy Shop', isStart: true }];
        ordersWithCoords.forEach((ord, index) => {
            if (ord.lat && ord.lng) {
                validCoords.push({ 
                    lat: ord.lat, 
                    lng: ord.lng, 
                    order_id: ord.order_id, 
                    readable_order_id: ord.readable_order_id,
                    address: ord.delivery_address_snapshot,
                    originalIndex: index 
                });
            }
        });

        // 3. Call OSRM Trip API if we have at least 1 delivery coordinate
        if (validCoords.length > 1) {
            // Coordinate format is {longitude},{latitude} separated by semicolons
            const coordString = validCoords.map(c => `${c.lng},${c.lat}`).join(';');
            const osrmUrl = `http://router.project-osrm.org/trip/v1/driving/${coordString}?source=first&destination=any&roundtrip=false`;
            
            try {
                const osrmRes = await axios.get(osrmUrl);
                if (osrmRes.data && osrmRes.data.code === 'Ok') {
                    // OSRM returns waypoints in optimized visitation order
                    const optimizedWaypoints = osrmRes.data.waypoints;
                    const optimizedOrders = [];

                    // Skip index 0 (which is the start location) and reconstruct the order list
                    optimizedWaypoints.forEach(w => {
                        const originalInputIndex = w.waypoint_index;
                        const waypointObj = validCoords[originalInputIndex];
                        if (waypointObj && !waypointObj.isStart) {
                            optimizedOrders.push({
                                order_id: waypointObj.order_id,
                                readable_order_id: waypointObj.readable_order_id,
                                address: waypointObj.address,
                                position: w.trips_index,
                                lat: waypointObj.lat,
                                lng: waypointObj.lng
                            });
                        }
                    });

                    // Add any orders that didn't have coordinates to the end of the list
                    const missingCoordsOrders = ordersWithCoords
                        .filter(ord => !ord.lat || !ord.lng)
                        .map(ord => ({
                            order_id: ord.order_id,
                            readable_order_id: ord.readable_order_id,
                            address: ord.delivery_address_snapshot,
                            position: null
                        }));

                    return res.json({
                        optimized: true,
                        route: [...optimizedOrders, ...missingCoordsOrders]
                    });
                }
            } catch (osrmErr) {
                console.warn('OSRM routing failed, falling back to database order:', osrmErr.message);
            }
        }

        res.json({
            optimized: false,
            route: orders.map(o => ({
                order_id: o.order_id,
                readable_order_id: o.readable_order_id,
                address: o.delivery_address_snapshot,
                position: null
            }))
        });

    } catch (err) {
        console.error('Route optimization error:', err);
        res.status(500).json({ error: 'Failed to optimize route' });
    }
});

// PUT /api/partners/:id - Update partner registration details
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, pin, max_concurrent_orders } = req.body;
        
        await pool.query(
            `UPDATE delivery_partners 
             SET name = $1, phone = $2, pin = COALESCE($3, pin), max_concurrent_orders = $4 
             WHERE partner_id = $5`,
            [name, phone, pin || null, max_concurrent_orders || 5, id]
        );
        res.json({ message: 'Delivery partner details updated successfully' });
    } catch (err) {
        console.error('Update Partner Error:', err);
        res.status(500).json({ error: 'Failed to update partner details' });
    }
});

// DELETE /api/partners/:id - Soft-deactivate delivery partner (set is_active = FALSE)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('UPDATE delivery_partners SET is_active = FALSE, current_status = \'OFFLINE\' WHERE partner_id = $1', [id]);
        res.json({ message: 'Delivery partner deactivated successfully' });
    } catch (err) {
        console.error('Deactivate Partner Error:', err);
        res.status(500).json({ error: 'Failed to deactivate delivery partner' });
    }
});

module.exports = router;
