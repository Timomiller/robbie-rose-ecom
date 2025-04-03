require('dotenv').config();  // Load environment variables

const express = require('express');
const cors = require('cors');
const shopRoutes = require('./server/routes/shop');  // Ensure correct path

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());  // To parse JSON request bodies

// Use the shop routes
app.use('/shop', shopRoutes);

// Root Route (for testing)
app.get('/', (req, res) => {
  res.send('RobbieRose API is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
