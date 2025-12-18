// ========================================
// CONFIGURATION - Environment Variables
// ========================================
// NEVER hardcode API keys or secrets in this file
// Load from environment variables or secure config service
const CONFIG = {
    API_BASE_URL: window.location.hostname === 'localhost' 
        ? 'http://localhost:5678'
        : 'https://your-n8n-vps.com',
    API_KEY: window.API_KEY || '',  // Set via environment or global variable
    PRODUCTS_ENDPOINT: '/webhook/products',
    TIMEOUT_MS: 15000
};

// ========================================
// STATE MANAGEMENT
// ========================================
let allProducts = [];
let filteredProducts = [];
let activeCategory = 'all';
let searchQuery = '';

// ========================================
// DOM ELEMENTS CACHE
// ========================================
const productGrid = document.getElementById('product-grid');
const loadingSpinner = document.getElementById('loading-spinner');
const emptyState = document.getElementById('empty-state');
const categoryButtons = document.querySelectorAll('.filter-chip');
const searchInput = document.getElementById('search-input');

// ========================================
// VALIDATION & CONFIGURATION
// ========================================
function validateConfig() {
    if (!CONFIG.API_KEY) {
        console.error('❌ API Key not configured. Set API_KEY in environment.');
        showEmptyState('Configuration error. Please contact support.');
        return false;
    }
    if (!CONFIG.API_BASE_URL) {
        console.error('❌ API Base URL not configured.');
        showEmptyState('Configuration error. Please contact support.');
        return false;
    }
    return true;
}

// ========================================
// FETCH PRODUCTS FROM N8N
// ========================================
async function fetchProducts() {
    try {
        // Show loading state
        loadingSpinner.classList.remove('hidden');
        productGrid.classList.add('hidden');
        emptyState.classList.add('hidden');

        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

        // Make secure request to n8n endpoint
        const response = await fetch(
            `${CONFIG.API_BASE_URL}${CONFIG.PRODUCTS_ENDPOINT}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        // Handle response errors
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        // Parse and validate response
        const data = await response.json();

        if (!data.products || !Array.isArray(data.products)) {
            throw new Error('Invalid response format from n8n endpoint');
        }

        // Store and render products
        allProducts = data.products;
        filteredProducts = [...allProducts];
        renderProducts();
        loadingSpinner.classList.add('hidden');

        console.log(`✅ Successfully loaded ${allProducts.length} products`);

    } catch (error) {
        console.error('❌ Error fetching products:', error.message);
        loadingSpinner.classList.add('hidden');

        if (error.name === 'AbortError') {
            showEmptyState('Request timed out. Please try again.');
        } else {
            showEmptyState('Failed to load products. Please try again later.');
        }
    }
}

// ========================================
// RENDER PRODUCT GRID
// ========================================
function renderProducts() {
    productGrid.innerHTML = '';

    if (filteredProducts.length === 0) {
        showEmptyState('No products match your search.');
        return;
    }

    // Create and append product cards
    filteredProducts.forEach(product => {
        const card = createProductCard(product);
        productGrid.appendChild(card);
    });

    // Show grid, hide loading/empty states
    productGrid.classList.remove('hidden');
    emptyState.classList.add('hidden');
}

// ========================================
// CREATE PRODUCT CARD
// ========================================
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';

    // Extract product data with fallbacks
    const imageUrl = product.image_url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop';
    const productName = product.product_name || 'Unknown Product';
    const finalPrice = product.final_price_kes || 0;
    const productId = product.product_id || '';
    const category = product.category || '';
    const supplier = product.supplier_name || 'Unknown Supplier';
    const sku = product.sku || '';

    // Build card HTML
    card.innerHTML = `
        <div class="relative overflow-hidden" style="aspect-ratio: 1/1;">
            <img 
                src="${escapeHtml(imageUrl)}" 
                alt="${escapeHtml(productName)}" 
                class="product-image"
                onerror="this.src='https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop'"
            >
            ${category ? `<div class="absolute top-3 right-3 bg-white px-3 py-1 rounded-full text-xs font-semibold text-gray-700">
                ${escapeHtml(category)}
            </div>` : ''}
        </div>
        <div class="product-content">
            <h3 class="product-name">${escapeHtml(productName)}</h3>
            <p class="product-supplier">${escapeHtml(supplier)}</p>
            ${sku ? `<p class="text-xs text-gray-500 mb-3">SKU: ${escapeHtml(sku)}</p>` : ''}
            <div class="product-footer">
                <div class="price-section">
                    <p class="price-label">Fully Landed Price</p>
                    <p class="price-badge">KES ${formatPrice(finalPrice)}</p>
                </div>
                <button class="product-cta" data-product-id="${escapeHtml(productId)}">
                    View
                </button>
            </div>
        </div>
    `;

    // Add event listener to CTA button
    const ctaButton = card.querySelector('.product-cta');
    ctaButton.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToProduct(productId);
    });

    // Add click listener to entire card
    card.addEventListener('click', () => {
        navigateToProduct(productId);
    });

    return card;
}

// ========================================
// FILTER & SEARCH PRODUCTS
// ========================================
function filterProducts() {
    filteredProducts = allProducts.filter(product => {
        // Category filter
        const matchesCategory = activeCategory === 'all' || 
            (product.category && product.category.toLowerCase() === activeCategory);

        // Search filter (check product name, supplier, and SKU)
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch = 
            (product.product_name && product.product_name.toLowerCase().includes(searchLower)) ||
            (product.supplier_name && product.supplier_name.toLowerCase().includes(searchLower)) ||
            (product.sku && product.sku.includes(searchQuery));

        return matchesCategory && matchesSearch;
    });

    renderProducts();
}

// ========================================
// EVENT LISTENERS
// ========================================

// Category filter buttons
categoryButtons.forEach(button => {
    button.addEventListener('click', (e) => {
        // Update active state
        categoryButtons.forEach(btn => btn.classList.remove('active'));
        e.target.classList.add('active');

        // Update filter and re-render
        activeCategory = e.target.dataset.category;
        filterProducts();
    });
});

// Search input with debounce
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    
    searchTimeout = setTimeout(() => {
        searchQuery = e.target.value;
        filterProducts();
    }, 300);
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Format price to KES currency format
 * @param {number} price - Price value
 * @returns {string} Formatted price string
 */
function formatPrice(price) {
    return new Intl.NumberFormat('en-KE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price);
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
}

/**
 * Navigate to product detail page
 * @param {string} productId - Product ID
 */
function navigateToProduct(productId) {
    if (!productId) {
        console.error('❌ Invalid product ID');
        return;
    }
    // Navigate to product detail page
    window.location.href = `product-detail.html?product_id=${productId}`;
}

/**
 * Show empty state message
 * @param {string} message - Message to display
 */
function showEmptyState(message) {
    productGrid.classList.add('hidden');
    loadingSpinner.classList.add('hidden');
    emptyState.textContent = message;
    emptyState.classList.remove('hidden');
}

// ========================================
// INITIALIZATION
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Validate configuration before fetching
    if (!validateConfig()) {
        return;
    }

    // Detect which page we're on
    if (document.getElementById('product-grid')) {
        // Marketplace page
        fetchProducts();
    } else if (document.getElementById('product-detail-container')) {
        // Product detail page
        initializeProductDetail();
    }
});

// ========================================
// PRODUCT DETAIL PAGE LOGIC
// ========================================

/**
 * Get URL parameter by name
 * @param {string} name - Parameter name
 * @returns {string|null} Parameter value
 */
function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

/**
 * Extract product ID from URL path
 * @returns {string|null} Product ID
 */
function getProductIdFromUrl() {
    const pathParts = window.location.pathname.split('/');
    const productIndex = pathParts.indexOf('product');
    if (productIndex !== -1 && pathParts[productIndex + 1]) {
        return pathParts[productIndex + 1];
    }
    return null;
}

/**
 * Fetch product details and pricing from n8n
 * @param {string} productId - Product ID
 */
async function fetchProductDetails(productId) {
    try {
        if (!productId) {
            throw new Error('No product ID provided');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/product/${productId}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.product;

    } catch (error) {
        console.error('❌ Error fetching product details:', error.message);
        throw error;
    }
}

/**
 * Fetch pricing calculation from n8n price-check endpoint
 * @param {string} productId - Product ID
 * @param {number} quantity - Order quantity
 */
async function fetchPricingCalculation(productId, quantity) {
    try {
        if (!productId || !quantity || quantity < 1) {
            throw new Error('Invalid product ID or quantity');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT_MS);

        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/price-check?product_id=${productId}&quantity=${quantity}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Pricing API Error: ${response.status}`);
        }

        const data = await response.json();
        return {
            final_price_kes: data.final_price_kes || 0,
            breakdown: data.breakdown || {},
            total_order_price: (data.final_price_kes || 0) * quantity
        };

    } catch (error) {
        console.error('❌ Error fetching pricing:', error.message);
        throw error;
    }
}

/**
 * Initialize product detail page
 */
async function initializeProductDetail() {
    const loadingState = document.getElementById('loading-state');
    const productContainer = document.getElementById('product-detail-container');
    const errorState = document.getElementById('error-state');

    try {
        // Get product ID from URL
        const productId = getProductIdFromUrl();
        if (!productId) {
            throw new Error('No product ID found in URL');
        }

        // Fetch product details
        const product = await fetchProductDetails(productId);
        if (!product) {
            throw new Error('Product not found');
        }

        // Store product data globally for use in event handlers
        window.currentProduct = product;
        window.currentProductId = productId;

        // Render product details
        renderProductDetails(product);

        // Fetch and render initial pricing
        await updatePricing(productId, 1);

        // Show content, hide loading
        loadingState.classList.add('hidden');
        productContainer.classList.remove('hidden');

    } catch (error) {
        console.error('❌ Failed to initialize product detail:', error.message);
        loadingState.classList.add('hidden');
        errorState.classList.remove('hidden');
    }
}

/**
 * Render product details to the page
 * @param {object} product - Product object
 */
function renderProductDetails(product) {
    // Set main image
    const mainImage = document.getElementById('main-image');
    mainImage.src = product.image_url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop';
    mainImage.onerror = () => {
        mainImage.src = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop';
    };

    // Set product name and header info
    document.getElementById('product-name').textContent = product.product_name || 'Unknown Product';
    document.getElementById('supplier-name').querySelector('span').textContent = product.supplier_name || 'Unknown Supplier';
    document.getElementById('sku-display').querySelector('span').textContent = product.sku || 'N/A';
    document.getElementById('product-description').textContent = product.description || 'No description available';

    // Set MOQ value
    const moq = product.moq || 1;
    document.getElementById('moq-value').textContent = moq;
    window.minOrderQuantity = moq;

    // Set quantity input minimum
    const quantityInput = document.getElementById('quantity-input');
    quantityInput.min = moq;
    quantityInput.value = moq;

    // Render gallery thumbnails
    renderThumbnails(product.images || [product.image_url]);

    // Set terms
    document.getElementById('payment-terms').textContent = product.payment_terms || '30 Days';
    document.getElementById('delivery-time').textContent = product.delivery_time || '7-14 Days';
    document.getElementById('warranty-period').textContent = product.warranty || '6 Months';
}

/**
 * Render thumbnail gallery
 * @param {array} images - Array of image URLs
 */
function renderThumbnails(images) {
    const gallery = document.getElementById('thumbnail-gallery');
    gallery.innerHTML = '';

    if (!images || images.length === 0) {
        return;
    }

    images.forEach((img, index) => {
        const thumbnail = document.createElement('img');
        thumbnail.src = img;
        thumbnail.alt = `Product image ${index + 1}`;
        thumbnail.className = `thumbnail ${index === 0 ? 'active' : ''}`;
        thumbnail.addEventListener('click', () => {
            document.getElementById('main-image').src = img;
            document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
            thumbnail.classList.add('active');
        });
        gallery.appendChild(thumbnail);
    });
}

/**
 * Update pricing based on quantity
 * @param {string} productId - Product ID
 * @param {number} quantity - Order quantity
 */
async function updatePricing(productId, quantity) {
    try {
        // Validate quantity against MOQ
        const moq = window.minOrderQuantity || 1;
        if (quantity < moq) {
            const warning = document.getElementById('moq-warning');
            warning.classList.remove('hidden');
            return;
        }

        document.getElementById('moq-warning').classList.add('hidden');

        // Show loading state
        document.getElementById('final-price-display').textContent = 'KES Calculating...';

        // Fetch pricing
        const pricing = await fetchPricingCalculation(productId, quantity);

        // Update display
        document.getElementById('final-price-display').textContent = `KES ${formatPrice(pricing.final_price_kes)}`;
        document.getElementById('total-order-price').textContent = `KES ${formatPrice(pricing.total_order_price)}`;
        document.getElementById('qty-display').textContent = quantity;

        // Render price breakdown
        renderPriceBreakdown(pricing.breakdown, pricing.final_price_kes);

    } catch (error) {
        console.error('❌ Error updating pricing:', error.message);
        document.getElementById('final-price-display').textContent = 'KES Error';
    }
}

/**
 * Render price breakdown table
 * @param {object} breakdown - Price breakdown components
 * @param {number} total - Total price
 */
function renderPriceBreakdown(breakdown, total) {
    const table = document.getElementById('price-breakdown-table');
    table.innerHTML = '';

    if (!breakdown || Object.keys(breakdown).length === 0) {
        return;
    }

    // Define breakdown order and labels
    const components = [
        { key: 'supplier_cost_kes', label: 'Supplier Cost (RMB→KES)' },
        { key: 'international_freight', label: 'International Freight' },
        { key: 'kra_duty', label: 'KRA Import Duty' },
        { key: 'vat', label: 'VAT (16%)' },
        { key: 'platform_fee', label: 'Platform Fee' },
        { key: 'markup', label: 'Margin' }
    ];

    components.forEach(comp => {
        const value = breakdown[comp.key];
        if (value !== undefined && value !== null) {
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="price-component-label">${comp.label}</td>
                <td class="price-component-value">KES ${formatPrice(value)}</td>
                <td class="price-component-percent">${percentage}%</td>
            `;
            table.appendChild(row);
        }
    });

    document.getElementById('breakdown-total').textContent = `KES ${formatPrice(total)}`;
}

/**
 * Download quote as PDF
 */
async function downloadQuote() {
    try {
        if (!window.currentProductId) {
            throw new Error('Product ID not found');
        }

        const quantity = parseInt(document.getElementById('quantity-input').value);
        const finalPrice = parseFloat(
            document.getElementById('final-price-display').textContent.replace(/[^0-9.]/g, '')
        );

        // Call n8n quote generation endpoint
        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/generate-quote`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    product_id: window.currentProductId,
                    product_name: window.currentProduct.product_name,
                    supplier_name: window.currentProduct.supplier_name,
                    quantity: quantity,
                    unit_price: finalPrice / quantity,
                    final_price_kes: finalPrice,
                    timestamp: new Date().toISOString()
                })
            }
        );

        if (!response.ok) {
            throw new Error('Failed to generate quote');
        }

        const data = await response.json();

        // Handle PDF download
        if (data.pdf_url) {
            const link = document.createElement('a');
            link.href = data.pdf_url;
            link.download = `quote-${window.currentProductId}-${Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else if (data.sheet_url) {
            // Or open Google Sheet
            window.open(data.sheet_url, '_blank');
        }

        console.log('✅ Quote generated successfully');

    } catch (error) {
        console.error('❌ Error downloading quote:', error.message);
        alert('Failed to generate quote. Please try again.');
    }
}

/**
 * Request product sample
 */
async function requestSample() {
    try {
        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/request-sample`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    product_id: window.currentProductId,
                    product_name: window.currentProduct.product_name,
                    timestamp: new Date().toISOString()
                })
            }
        );

        if (!response.ok) {
            throw new Error('Failed to request sample');
        }

        alert('✅ Sample request sent! The supplier will contact you soon.');

    } catch (error) {
        console.error('❌ Error requesting sample:', error.message);
        alert('Failed to request sample. Please try again.');
    }
}

// ========================================
// PRODUCT DETAIL EVENT LISTENERS
// ========================================

// ========================================
// AUTHENTICATION & LOGIN PAGE LOGIC
// ========================================

/**
 * Check if user is already logged in
 * @returns {string|null} User ID if logged in
 */
function checkUserSession() {
    return localStorage.getItem('user_id') || sessionStorage.getItem('user_id');
}

/**
 * Save user session
 * @param {string} userId - User ID
 * @param {object} userData - User data
 */
function saveUserSession(userId, userData) {
    localStorage.setItem('user_id', userId);
    localStorage.setItem('user_data', JSON.stringify(userData));
    sessionStorage.setItem('user_id', userId);
}

/**
 * Get user data from storage
 * @returns {object|null} User data
 */
function getUserData() {
    const data = localStorage.getItem('user_data');
    return data ? JSON.parse(data) : null;
}

/**
 * Clear user session
 */
function clearUserSession() {
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_data');
    sessionStorage.removeItem('user_id');
}

/**
 * Validate phone number format (9 digits)
 * @param {string} phone - Phone number without country code
 * @returns {boolean} Valid format
 */
function validatePhone(phone) {
    const phoneRegex = /^[0-9]{9}$/;
    return phoneRegex.test(phone);
}

/**
 * Validate KRA PIN format (A1234567B)
 * @param {string} pin - KRA PIN
 * @returns {boolean} Valid format
 */
function validateKraPin(pin) {
    const pinRegex = /^[A-Z0-9]{9}$/;
    return pinRegex.test(pin.toUpperCase());
}

/**
 * Validate business name
 * @param {string} name - Business name
 * @returns {boolean} Valid
 */
function validateBusinessName(name) {
    return name.trim().length >= 3 && name.trim().length <= 100;
}

/**
 * Initialize login page
 */
function initializeLoginPage() {
    // Check if user already logged in
    if (checkUserSession()) {
        redirectToDashboard();
        return;
    }

    // Setup event listeners
    setupLoginEventListeners();
}

/**
 * Setup login/register event listeners
 */
function setupLoginEventListeners() {
    // Tab switching
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    
    if (loginTab && registerTab) {
        loginTab.addEventListener('click', switchToLogin);
        registerTab.addEventListener('click', switchToRegister);
    }

    // Form submissions
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLoginSubmit);
    }
    
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegisterSubmit);
    }

    // Phone input formatting
    const loginPhone = document.getElementById('login-phone');
    const registerPhone = document.getElementById('register-phone');
    const loginPin = document.getElementById('login-pin');
    const registerPin = document.getElementById('register-pin');

    if (loginPhone) {
        loginPhone.addEventListener('input', formatPhoneInput);
    }
    if (registerPhone) {
        registerPhone.addEventListener('input', formatPhoneInput);
    }
    if (loginPin) {
        loginPin.addEventListener('input', formatPinInput);
    }
    if (registerPin) {
        registerPin.addEventListener('input', formatPinInput);
    }
}

/**
 * Switch to login form
 */
function switchToLogin() {
    document.getElementById('login-tab').classList.add('active');
    document.getElementById('register-tab').classList.remove('active');
    document.getElementById('login-form').classList.add('active');
    document.getElementById('register-form').classList.remove('active');
    hideError('login');
}

/**
 * Switch to register form
 */
function switchToRegister() {
    document.getElementById('register-tab').classList.add('active');
    document.getElementById('login-tab').classList.remove('active');
    document.getElementById('register-form').classList.add('active');
    document.getElementById('login-form').classList.remove('active');
    hideError('register');
}

/**
 * Format phone input (numbers only)
 * @param {event} e - Input event
 */
function formatPhoneInput(e) {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (e.target.value.length > 9) {
        e.target.value = e.target.value.slice(0, 9);
    }
}

/**
 * Format PIN input (uppercase)
 * @param {event} e - Input event
 */
function formatPinInput(e) {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (e.target.value.length > 9) {
        e.target.value = e.target.value.slice(0, 9);
    }
}

/**
 * Handle login form submission
 * @param {event} e - Form event
 */
async function handleLoginSubmit(e) {
    e.preventDefault();

    try {
        const phone = document.getElementById('login-phone').value.trim();
        const pin = document.getElementById('login-pin').value.trim();

        // Validate inputs
        if (!validatePhone(phone)) {
            showError('login', 'Invalid phone number format (9 digits required)');
            return;
        }

        if (!validateKraPin(pin)) {
            showError('login', 'Invalid KRA PIN format (A1234567B)');
            return;
        }

        // Show loading state
        showAuthOverlay();
        document.getElementById('login-submit').disabled = true;

        // Send login request to n8n
        const fullPhone = `254${phone}`;
        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/auth`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    action: 'login',
                    phone_number: fullPhone,
                    kra_pin: pin,
                    timestamp: new Date().toISOString()
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Auth error: ${response.status}`);
        }

        const data = await response.json();

        // Check if login was successful
        if (!data.success) {
            throw new Error(data.message || 'Login failed');
        }

        // Save session
        saveUserSession(data.user_id, {
            phone: fullPhone,
            business_name: data.business_name,
            kra_pin: pin
        });

        console.log('✅ Login successful');

        // Show success message
        showAuthSuccess('Welcome back! Redirecting...');

        // Redirect to marketplace
        setTimeout(() => {
            redirectToDashboard();
        }, 1500);

    } catch (error) {
        console.error('❌ Login error:', error.message);
        document.getElementById('login-submit').disabled = false;
        hideAuthOverlay();
        showError('login', error.message || 'Login failed. Please check your credentials.');
    }
}

/**
 * Handle register form submission
 * @param {event} e - Form event
 */
async function handleRegisterSubmit(e) {
    e.preventDefault();

    try {
        const businessName = document.getElementById('register-business').value.trim();
        const phone = document.getElementById('register-phone').value.trim();
        const pin = document.getElementById('register-pin').value.trim();
        const termsCheckbox = document.getElementById('register-terms');

        // Validate inputs
        if (!validateBusinessName(businessName)) {
            showError('register', 'Business name must be 3-100 characters');
            return;
        }

        if (!validatePhone(phone)) {
            showError('register', 'Invalid phone number format (9 digits required)');
            return;
        }

        if (!validateKraPin(pin)) {
            showError('register', 'Invalid KRA PIN format (A1234567B)');
            return;
        }

        if (!termsCheckbox.checked) {
            showError('register', 'Please accept the terms and conditions');
            return;
        }

        // Show loading state
        showAuthOverlay();
        document.getElementById('register-submit').disabled = true;

        // Send register request to n8n
        const fullPhone = `254${phone}`;
        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/auth`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    action: 'register',
                    business_name: businessName,
                    phone_number: fullPhone,
                    kra_pin: pin,
                    timestamp: new Date().toISOString()
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Registration error: ${response.status}`);
        }

        const data = await response.json();

        // Check if registration was successful
        if (!data.success) {
            throw new Error(data.message || 'Registration failed');
        }

        // Save session
        saveUserSession(data.user_id, {
            phone: fullPhone,
            business_name: businessName,
            kra_pin: pin
        });

        console.log('✅ Registration successful');

        // Show success message
        showAuthSuccess('Account created! Redirecting...');

        // Redirect to marketplace
        setTimeout(() => {
            redirectToDashboard();
        }, 1500);

    } catch (error) {
        console.error('❌ Registration error:', error.message);
        document.getElementById('register-submit').disabled = false;
        hideAuthOverlay();
        showError('register', error.message || 'Registration failed. Please try again.');
    }
}

/**
 * Show error message
 * @param {string} form - Form type ('login' or 'register')
 * @param {string} message - Error message
 */
function showError(form, message) {
    const errorEl = document.getElementById(`${form}-error`);
    const errorText = document.getElementById(`${form}-error-text`);
    
    if (errorEl && errorText) {
        errorText.textContent = message;
        errorEl.classList.add('show');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideError(form);
        }, 5000);
    }
}

/**
 * Hide error message
 * @param {string} form - Form type
 */
function hideError(form) {
    const errorEl = document.getElementById(`${form}-error`);
    if (errorEl) {
        errorEl.classList.remove('show');
    }
}

/**
 * Show auth overlay
 */
function showAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

/**
 * Hide auth overlay
 */
function hideAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

/**
 * Show success message
 * @param {string} message - Success message
 */
function showAuthSuccess(message) {
    hideAuthOverlay();
    const successEl = document.createElement('div');
    successEl.className = 'fixed top-4 right-4 auth-success bg-green-100 text-green-800 px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3';
    successEl.innerHTML = `
        <span>✅</span>
        <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(successEl);
}

/**
 * Redirect to dashboard/marketplace
 */
function redirectToDashboard() {
    window.location.href = 'index.html';
}

/**
 * Check if on login page and initialize
 */
function setupAuthPage() {
    // Only run if we have login form on page
    if (document.getElementById('login-form')) {
        initializeLoginPage();
    }
}

/**
 * Get cart data from localStorage or sessionStorage
 * @returns {array} Cart items
 */
function getCartFromSession() {
    try {
        const cart = sessionStorage.getItem('cart') || localStorage.getItem('cart');
        return cart ? JSON.parse(cart) : [];
    } catch (error) {
        console.error('❌ Error retrieving cart:', error);
        return [];
    }
}

/**
 * Save cart to session storage
 * @param {array} cart - Cart items
 */
function saveCartToSession(cart) {
    try {
        sessionStorage.setItem('cart', JSON.stringify(cart));
    } catch (error) {
        console.error('❌ Error saving cart:', error);
    }
}

/**
 * Initialize checkout page
 */
function initializeCheckout() {
    try {
        const cart = getCartFromSession();

        if (!cart || cart.length === 0) {
            showCheckoutError('Your cart is empty');
            return;
        }

        // Render order items and calculate totals
        renderOrderItems(cart);
        calculateTotals(cart);

        // Attach event listeners
        setupCheckoutEventListeners();

        console.log('✅ Checkout initialized with', cart.length, 'items');

    } catch (error) {
        console.error('❌ Error initializing checkout:', error);
        showCheckoutError('Failed to load checkout page');
    }
}

/**
 * Render order items in summary
 * @param {array} cart - Cart items
 */
function renderOrderItems(cart) {
    const container = document.getElementById('order-items');
    if (!container) return;

    container.innerHTML = '';

    cart.forEach((item, index) => {
        const itemTotal = (item.final_price_kes || 0) * (item.quantity || 1);
        
        const itemElement = document.createElement('div');
        itemElement.className = 'order-item';
        itemElement.innerHTML = `
            <img 
                src="${escapeHtml(item.image_url || '')}" 
                alt="Product" 
                class="order-item-image"
                onerror="this.src='https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100&h=100&fit=crop'"
            >
            <div class="order-item-details">
                <div class="order-item-name">${escapeHtml(item.product_name || 'Unknown Product')}</div>
                <div class="order-item-supplier">${escapeHtml(item.supplier_name || 'Unknown Supplier')}</div>
                <div class="text-xs text-gray-600 mb-1">Qty: <span class="font-semibold">${item.quantity || 1} units</span></div>
                <div class="order-item-price">KES ${formatPrice((item.final_price_kes || 0) * (item.quantity || 1))}</div>
            </div>
        `;
        container.appendChild(itemElement);
    });
}

/**
 * Calculate and display order totals
 * @param {array} cart - Cart items
 */
function calculateTotals(cart) {
    let subtotal = 0;
    let shipping = 0;
    let taxes = 0;
    let fees = 0;

    // Calculate totals from cart items
    cart.forEach(item => {
        const itemTotal = (item.final_price_kes || 0) * (item.quantity || 1);
        
        // Break down components (estimate based on price)
        subtotal += (item.supplier_cost || 0) * (item.quantity || 1);
        shipping += (item.international_freight || 0) * (item.quantity || 1);
        taxes += (item.kra_duty || 0) * (item.quantity || 1);
        taxes += (item.vat || 0) * (item.quantity || 1);
        fees += (item.platform_fee || 0) * (item.quantity || 1);
    });

    const total = subtotal + shipping + taxes + fees;

    // Update display
    document.getElementById('subtotal-display').textContent = `KES ${formatPrice(subtotal)}`;
    document.getElementById('shipping-display').textContent = `KES ${formatPrice(shipping)}`;
    document.getElementById('taxes-display').textContent = `KES ${formatPrice(taxes)}`;
    document.getElementById('fee-display').textContent = `KES ${formatPrice(fees)}`;
    document.getElementById('total-display').textContent = `KES ${formatPrice(total)}`;
    document.getElementById('pay-amount').textContent = formatPrice(total);

    // Store total for payment
    window.orderTotal = total;
    window.cartItems = cart;
}

/**
 * Validate phone number format
 * @param {string} phone - Phone number (without +254)
 * @returns {boolean} Valid format
 */
function validatePhoneNumber(phone) {
    const phoneRegex = /^[0-9]{9}$/;
    return phoneRegex.test(phone);
}

/**
 * Format phone number for M-Pesa (add country code)
 * @param {string} phone - Phone number without country code
 * @returns {string} Full phone number with +254
 */
function formatPhoneNumber(phone) {
    return `254${phone}`;
}

/**
 * Initiate M-Pesa STK Push payment
 */
async function initiatePayment(event) {
    event.preventDefault();

    try {
        // Validate form
        const phoneInput = document.getElementById('phone-input');
        const termsCheckbox = document.getElementById('terms-checkbox');
        const payButton = document.getElementById('pay-button');

        const phone = phoneInput.value.trim();
        
        if (!validatePhoneNumber(phone)) {
            showPhoneError('Please enter a valid 9-digit phone number');
            return;
        }

        if (!termsCheckbox.checked) {
            alert('Please agree to the terms and conditions');
            return;
        }

        // Disable button to prevent double-click
        payButton.disabled = true;
        payButton.textContent = '💰 Processing...';

        // Show payment overlay
        showPaymentOverlay();

        // Format phone number with country code
        const fullPhone = formatPhoneNumber(phone);

        // Prepare payload
        const payload = {
            user_id: getUserId(),
            phone_number: fullPhone,
            amount: Math.round(window.orderTotal),
            cart_items: window.cartItems.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.final_price_kes,
                total: (item.final_price_kes || 0) * (item.quantity || 1)
            })),
            timestamp: new Date().toISOString()
        };

        // Send to n8n checkout endpoint
        const response = await fetch(
            `${CONFIG.API_BASE_URL}/webhook/checkout`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.API_KEY
                },
                body: JSON.stringify(payload)
            }
        );

        if (!response.ok) {
            throw new Error(`Checkout API Error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.checkout_request_id) {
            throw new Error('No checkout request ID received');
        }

        // Store checkout request ID for polling
        window.checkoutRequestId = data.checkout_request_id;
        window.transactionPhone = fullPhone;

        console.log('✅ STK Push initiated. Request ID:', data.checkout_request_id);

        // Start polling for payment status
        pollPaymentStatus(data.checkout_request_id);

    } catch (error) {
        console.error('❌ Error initiating payment:', error.message);
        hidePaymentOverlay();
        document.getElementById('pay-button').disabled = false;
        document.getElementById('pay-button').textContent = '💰 Pay KES ' + document.getElementById('pay-amount').textContent;
        alert('Failed to initiate payment. Please try again.');
    }
}

/**
 * Poll payment status from n8n
 * @param {string} checkoutRequestId - M-Pesa checkout request ID
 */
async function pollPaymentStatus(checkoutRequestId) {
    const maxAttempts = 30;
    const pollInterval = 2000; // 2 seconds
    let attempts = 0;

    const pollTimer = setInterval(async () => {
        attempts++;

        try {
            // Query payment status
            const response = await fetch(
                `${CONFIG.API_BASE_URL}/webhook/payment-status?request_id=${checkoutRequestId}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': CONFIG.API_KEY
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Status check failed: ${response.status}`);
            }

            const data = await response.json();

            // Check payment status
            if (data.status === 'SUCCESS') {
                clearInterval(pollTimer);
                handlePaymentSuccess(data);
                return;
            } else if (data.status === 'FAILED') {
                clearInterval(pollTimer);
                handlePaymentFailure(data.error || 'Payment was declined');
                return;
            } else if (data.status === 'CANCELLED') {
                clearInterval(pollTimer);
                handlePaymentFailure('Payment was cancelled');
                return;
            }

            // Update countdown
            const timeLeft = Math.max(0, maxAttempts - attempts);
            document.getElementById('countdown-timer').textContent = 
                `Waiting... (${timeLeft}s remaining)`;

        } catch (error) {
            console.error('❌ Error polling payment status:', error.message);
        }

        // Stop polling after max attempts
        if (attempts >= maxAttempts) {
            clearInterval(pollTimer);
            handlePaymentFailure('Payment confirmation timeout. Please check your M-Pesa inbox.');
        }

    }, pollInterval);
}

/**
 * Handle successful payment
 * @param {object} data - Payment response data
 */
async function handlePaymentSuccess(data) {
    try {
        console.log('✅ Payment successful!', data);

        // Clear cart
        sessionStorage.removeItem('cart');
        localStorage.removeItem('cart');

        // Hide overlay
        hidePaymentOverlay();

        // Show success message
        const successMsg = document.createElement('div');
        successMsg.className = 'fixed top-4 right-4 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3';
        successMsg.innerHTML = `
            <span>✅</span>
            <span>Payment successful! Order confirmed.</span>
        `;
        document.body.appendChild(successMsg);

        // Redirect to tracking dashboard after 2 seconds
        setTimeout(() => {
            window.location.href = '/tracking?order_id=' + (data.order_id || data.merchant_request_id);
        }, 2000);

    } catch (error) {
        console.error('❌ Error handling success:', error);
        handlePaymentFailure('Order confirmation failed');
    }
}

/**
 * Handle payment failure
 * @param {string} errorMessage - Error message
 */
function handlePaymentFailure(errorMessage) {
    try {
        console.error('❌ Payment failed:', errorMessage);

        // Hide overlay
        hidePaymentOverlay();

        // Reset button
        const payButton = document.getElementById('pay-button');
        payButton.disabled = false;
        payButton.textContent = '💰 Pay KES ' + document.getElementById('pay-amount').textContent;

        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg z-50 flex items-center gap-3';
        errorMsg.innerHTML = `
            <span>❌</span>
            <span>${escapeHtml(errorMessage)}</span>
        `;
        document.body.appendChild(errorMsg);

        // Remove error message after 5 seconds
        setTimeout(() => {
            errorMsg.remove();
        }, 5000);

    } catch (error) {
        console.error('❌ Error handling failure:', error);
        alert('An unexpected error occurred. Please try again.');
    }
}

/**
 * Get or create user ID
 * @returns {string} User ID
 */
function getUserId() {
    let userId = sessionStorage.getItem('user_id');
    if (!userId) {
        userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('user_id', userId);
    }
    return userId;
}

/**
 * Show payment processing overlay
 */
function showPaymentOverlay() {
    const overlay = document.getElementById('payment-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

/**
 * Hide payment processing overlay
 */
function hidePaymentOverlay() {
    const overlay = document.getElementById('payment-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

/**
 * Show phone number error
 * @param {string} message - Error message
 */
function showPhoneError(message) {
    const input = document.getElementById('phone-input');
    input.classList.add('error');
    
    let errorDiv = input.nextElementSibling;
    if (!errorDiv || !errorDiv.classList.contains('form-error')) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'form-error';
        input.after(errorDiv);
    }
    
    errorDiv.textContent = message;
    errorDiv.classList.add('show');

    // Remove error after 3 seconds
    setTimeout(() => {
        input.classList.remove('error');
        errorDiv.classList.remove('show');
    }, 3000);
}

/**
 * Show checkout error
 * @param {string} message - Error message
 */
function showCheckoutError(message) {
    const main = document.querySelector('main');
    if (main) {
        main.innerHTML = `
            <div class="text-center py-20">
                <p class="text-red-600 text-lg font-semibold mb-4">⚠ ${escapeHtml(message)}</p>
                <a href="/" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700">
                    ← Back to Marketplace
                </a>
            </div>
        `;
    }
}

/**
 * Setup event listeners for checkout
 */
function setupCheckoutEventListeners() {
    // Payment form submission
    const paymentForm = document.getElementById('payment-form');
    if (paymentForm) {
        paymentForm.addEventListener('submit', initiatePayment);
    }

    // Cancel payment button
    const cancelBtn = document.getElementById('cancel-payment-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hidePaymentOverlay();
            document.getElementById('pay-button').disabled = false;
            document.getElementById('pay-button').textContent = '💰 Pay KES ' + document.getElementById('pay-amount').textContent;
        });
    }

    // Phone input validation on input
    const phoneInput = document.getElementById('phone-input');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            // Remove any non-digit characters
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
            
            // Limit to 9 digits
            if (e.target.value.length > 9) {
                e.target.value = e.target.value.slice(0, 9);
            }
        });
    }
}
    // Quantity input change
    document.getElementById('quantity-input').addEventListener('change', (e) => {
        const quantity = parseInt(e.target.value) || 1;
        const moq = window.minOrderQuantity || 1;

        if (quantity < moq) {
            e.target.value = moq;
            updatePricing(window.currentProductId, moq);
        } else {
            updatePricing(window.currentProductId, quantity);
        }
    });

    // Quantity increase/decrease buttons
    document.getElementById('qty-increase')?.addEventListener('click', () => {
        const input = document.getElementById('quantity-input');
        input.value = parseInt(input.value) + 1;
        input.dispatchEvent(new Event('change'));
    });

    document.getElementById('qty-decrease')?.addEventListener('click', () => {
        const input = document.getElementById('quantity-input');
        const moq = window.minOrderQuantity || 1;
        const newValue = Math.max(moq, parseInt(input.value) - 1);
        input.value = newValue;
        input.dispatchEvent(new Event('change'));
    });

    // Download quote button
    document.getElementById('download-quote-btn')?.addEventListener('click', downloadQuote);

    // Request sample button
    document.getElementById('request-sample-btn')?.addEventListener('click', requestSample);

    // Contact supplier button
    document.getElementById('contact-supplier-btn')?.addEventListener('click', () => {
        alert('📧 Supplier contact form would open here');
    });
}