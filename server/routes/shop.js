const express = require('express');
const Shopify = require('shopify-api-node');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
require('dotenv').config();  // Ensure environment variables are loaded

// Log environment variables for debugging
console.log("SHOPIFY_SHOP_NAME:", process.env.SHOPIFY_SHOP_NAME);
console.log("SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY ? 'Loaded' : 'Missing');
console.log("SHOPIFY_ACCESS_TOKEN:", process.env.SHOPIFY_ACCESS_TOKEN ? 'Loaded' : 'Missing'); // Corrected key

// Validate Shopify credentials before initializing
if (!process.env.SHOPIFY_SHOP_NAME || !process.env.SHOPIFY_ACCESS_TOKEN) {
  throw new Error('Missing Shopify API credentials in .env file');
}

// Initialize Shopify API client
const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  accessToken: process.env.SHOPIFY_ACCESS_TOKEN, // Corrected to use the access token
});

// Test Shopify API connection
(async () => {
  try {
    const shopInfo = await shopify.shop.get();
    console.log(`✅ Connected to Shopify Store: ${shopInfo.name}`);
  } catch (err) {
    console.error('❌ Shopify API connection failed:', err.message);
  }
})();

// Authentication Middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // Bearer token
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.id;
    next();
  });
}

// Get products with optional filtering by category and maxPrice
router.get('/products', async (req, res) => {
  try {
    const { category, maxPrice } = req.query;
    let products = await shopify.product.list();

    if (category) {
      products = products.filter(p => p.product_type === category);
    }
    if (maxPrice) {
      products = products.filter(p => parseFloat(p.variants[0].price) <= parseFloat(maxPrice));
    }

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products', details: err.message });
  }
});

// Checkout and purchase flow
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'Product ID is required' });

    const product = await shopify.product.get(productId);
    const variantId = product.variants[0].id;
    const amount = product.variants[0].price;

    // Create checkout session with Shopify
    const checkout = await shopify.checkout.create({
      line_items: [{ variant_id: variantId, quantity: 1 }],  // Correct Shopify field
    });

    // Log environment variables before checkout for debugging
    console.log("SHOPIFY_SHOP_NAME:", process.env.SHOPIFY_SHOP_NAME);
    console.log("SHOPIFY_API_KEY:", process.env.SHOPIFY_API_KEY ? 'Loaded' : 'Missing');
    console.log("SHOPIFY_ACCESS_TOKEN:", process.env.SHOPIFY_ACCESS_TOKEN ? 'Loaded' : 'Missing');

    // Log purchase in the database
    db.run('INSERT INTO purchases (userId, amount, date) VALUES (?, ?, ?)', 
      [req.userId, amount, new Date().toISOString()], 
      (err) => { if (err) console.error(err); });

    res.json({ checkoutUrl: checkout.webUrl });
  } catch (err) {
    res.status(500).json({ error: 'Checkout failed', details: err.message });
  }
});

module.exports = router;
