const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors(ALLOWED_ORIGINS.length ? { origin: ALLOWED_ORIGINS } : { origin: false }));
app.disable('x-powered-by');
app.use(bodyParser.json({ limit: '100kb' }));

// Routes
const apiRoutes = require('./routes/index');
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send('WhatsApp E-commerce Backend is Running');
});

// 404 + error handler (prevents hangs on unknown routes)
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});
process.on('unhandledRejection', (reason) => console.error('UnhandledRejection:', reason));

// Database Connection Check (Placeholder)
// const db = require('./database/db'); 

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
