const express = require('express');
const Shopify = require('shopify-api-node');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_API_PASSWORD,
});

// Authentication middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.id;
    next();
  });
}

// Get products with optional filtering by category and maxPrice
router.get('/products', async (req, res) => {
  const { category, maxPrice } = req.query;
  try {
    const products = await shopify.product.list();
    let filtered = products;
    if (category) {
      filtered = filtered.filter(p => p.product_type === category);
    }
    if (maxPrice) {
      filtered = filtered.filter(p => parseFloat(p.variants[0].price) <= parseFloat(maxPrice));
    }
    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Checkout and purchase flow
router.post('/checkout', authenticate, async (req, res) => {
  const { productId } = req.body;
  const userId = req.userId;
  try {
    // Fetch product details
    const product = await shopify.product.get(productId);
    const variantId = product.variants[0].id;
    const amount = product.variants[0].price;

    // Create checkout session with Shopify
    const checkout = await shopify.checkout.create({
      lineItems: [{ variantId, quantity: 1 }],
    });

    // Log purchase in the database
    db.run('INSERT INTO purchases (userId, amount, date) VALUES (?, ?, ?)',
      [userId, amount, new Date().toISOString()],
      (err) => { if (err) console.error(err); });

    // Return checkout URL
    res.json({ checkoutUrl: checkout.webUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
