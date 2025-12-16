const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
const apiRoutes = require('./routes/index');
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.send('WhatsApp E-commerce Backend is Running');
});

// Database Connection Check (Placeholder)
// const db = require('./database/db'); 

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
