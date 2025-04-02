// Global Variables
let token = localStorage.getItem('token');
let userTier = localStorage.getItem('userTier') || 'Solace';

// WebSocket Setup (ensure it happens after user session data is available)
const socket = new WebSocket(`wss://${window.location.host}`);

// WebSocket message handling
socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const messageHandlers = {
    'leaderboard_update': () => {
      updateLeaderboard();
      showNotification('Leaderboard Updated!');
    },
    'event_update': () => {
      fetchEvents();
      showNotification(`Event Stock: ${data.stock}`);
    },
    'new_event': () => {
      fetchEvents();
      showNotification(`New Event: ${data.event.name}`);
    }
  };
  
  if (messageHandlers[data.type]) {
    messageHandlers[data.type]();
  }
};

// Authentication and Session Management
async function login() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (data.token) {
    token = data.token;
    localStorage.setItem('token', token);
    localStorage.setItem('userTier', data.user.tier);
    userTier = data.user.tier;
    showSection('shop');
    fetchAllData();
  }
}

async function register() {
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const username = email.split('@')[0];
  const res = await fetch('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  const data = await res.json();
  if (data.token) {
    token = data.token;
    localStorage.setItem('token', token);
    localStorage.setItem('userTier', data.user.tier);
    userTier = data.user.tier;
    showSection('shop');
    fetchAllData();
  }
}

async function logout() {
  localStorage.removeItem('token');
  token = null;
  showSection('home');
}

// Fetch User Profile
async function fetchProfile() {
  const res = await fetch('/auth/profile', { headers: { 'Authorization': `Bearer ${token}` } });
  const user = await res.json();
  userTier = user.tier;
  localStorage.setItem('userTier', userTier);
  updateOverlay(userTier, 'profile');
}

// Fetch All Data
async function fetchAllData() {
  fetchProfile();
  fetchProducts();
  fetchEvents();
  fetchNotifications();
}

// Fetch Products for the Store
async function fetchProducts() {
  const res = await fetch('/shop/products');
  const products = await res.json();
  renderProducts(products);
}

// Fetch Events
async function fetchEvents() {
  const res = await fetch('/events', { headers: { 'Authorization': `Bearer ${token}` } });
  const events = await res.json();
  const eventsSection = document.getElementById('events');
  eventsSection.innerHTML = events.map(e => `
    <div>
      <h2>${e.name}</h2>
      <p>Stock: ${e.stock}</p>
      <p>Ends: ${new Date(e.endDate).toLocaleString()}</p>
      <button onclick="participate(${e.id})">Participate</button>
    </div>
  `).join('');
  events.forEach(e => updateCountdown(e.id, e.endDate));
}

// Countdown for Event Participation
function updateCountdown(eventId, endDate) {
  const end = new Date(endDate).getTime();
  const timer = setInterval(() => {
    const now = Date.now();
    const distance = end - now;
    if (distance < 0) {
      clearInterval(timer);
      document.getElementById(`countdown-${eventId}`).textContent = 'Ended';
      return;
    }
    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const countdown = document.getElementById(`countdown-${eventId}`);
    countdown.textContent = `${days}d ${hours}h`;
  }, 1000);
}

// Product Loading and Filtering
async function loadProducts() {
  const res = await fetch('/shop/products');
  const products = await res.json();
  renderProducts(products);
  
  // Populate category filter
  const categories = [...new Set(products.map(p => p.product_type))];
  const categoryFilter = document.getElementById('category-filter');
  categoryFilter.innerHTML = '<option value="">All Categories</option>' + 
    categories.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function applyFilters() {
  const category = document.getElementById('category-filter').value;
  const maxPrice = document.getElementById('price-filter').value;
  const url = `/shop/products?${category ? `category=${category}&` : ''}${maxPrice ? `maxPrice=${maxPrice}` : ''}`;
  const res = await fetch(url);
  const products = await res.json();
  renderProducts(products);
}

// Render Products
function renderProducts(products) {
  const productList = document.getElementById('product-list');
  productList.innerHTML = products.map(p => `
    <div class="product" onclick="showProductModal('${p.id}')">
      <img src="${p.images[0]?.src}" alt="${p.title}">
      <h3>${p.title}</h3>
      <p>$${p.variants[0].price}</p>
    </div>
  `).join('');
}

// Show Product Modal
async function showProductModal(productId) {
  const res = await fetch(`/shop/products/${productId}`);
  const product = await res.json();
  document.getElementById('modal-body').innerHTML = `
    <img src="${product.images[0]?.src}" alt="${product.title}">
    <h3>${product.title}</h3>
    <p>${product.description}</p>
    <p>$${product.variants[0].price}</p>
    <button onclick="checkout('${product.id}')">Buy Now</button>
  `;
  document.getElementById('product-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('product-modal').classList.add('hidden');
}

// Checkout
async function checkout(productId) {
  const token = localStorage.getItem('token');
  const res = await fetch('/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ productId }),
  });
  const data = await res.json();
  if (data.checkoutUrl) window.location.href = data.checkoutUrl;
}

// Participate in an Event
async function participate(eventId) {
  const res = await fetch('/events/event/participate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ eventId })
  });
  const data = await res.json();
  if (data.success) {
    socket.send(JSON.stringify({ type: 'event_participation', eventId }));
    showNotification(data.message);
  }
}

// Show Section (for navigation)
function showSection(sectionId) {
  document.querySelectorAll('section').forEach(s => {
    s.classList.remove('active');
    setTimeout(() => s.classList.add('hidden'), 300);
  });
  const section = document.getElementById(sectionId);
  section.classList.remove('hidden');
  setTimeout(() => section.classList.add('active'), 10);
}

// Display Notifications
function showNotification(message) {
  const popup = document.querySelector('.notification-popup');
  popup.textContent = message;
  popup.style.display = 'block';
  new Audio(`/assets/sounds/${localStorage.getItem('soundChoice') || 'notification'}.mp3`).play();
  setTimeout(() => popup.style.display = 'none', 3000);
}

// Update Overlay with Tier Colors
function updateOverlay(tier, sectionId) {
  const overlay = document.getElementById('overlay');
  const tierColors = {
    Solace: 'rgba(208,208,208,0.3)', Lovers: 'rgba(255,153,153,0.3)', Loyal: 'rgba(255,215,0,0.3)',
    Servitude: 'rgba(102,153,255,0.3)', Echelon: 'rgba(204,0,255,0.3)'
  };
  overlay.style.background = `linear-gradient(to bottom, ${tierColors[tier]}, rgba(224,224,224,0.5))`;
}

// Fetch Notifications
async function fetchNotifications() {
  const res = await fetch('/notifications', { headers: { 'Authorization': `Bearer ${token}` } });
  const notifications = await res.json();
  const notificationList = document.getElementById('notifications');
  notificationList.innerHTML = notifications.map(n => `
    <div class="notification-item">
      <p>${n.message}</p>
      <span>${new Date(n.date).toLocaleString()}</span>
    </div>
  `).join('');
}

// Scroll Fade-in Effect for Logo
window.addEventListener('scroll', () => {
  const logo = document.querySelector('.logo');
  if (window.scrollY > 50 && !logo.classList.contains('fade')) logo.classList.add('fade');
});

window.addEventListener('load', loadProducts);
