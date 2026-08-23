// Sample data for shops and stock
const shops = [
  {
    id: 1,
    name: "Shop A",
    stock: {
      "Apples": 10,
      "Bananas": 5,
      "Oranges": 8
    }
  },
  {
    id: 2,
    name: "Shop B",
    stock: {
      "Apples": 3,
      "Bananas": 12,
      "Oranges": 4
    }
  },
  {
    id: 3,
    name: "Shop C",
    stock: {
      "Apples": 0,
      "Bananas": 2,
      "Oranges": 6
    }
  }
];

const lowStockThreshold = 3;

let selectedShopId = null;
let selectedItem = null;

// Initialize system
function init() {
  renderShops();
  populateShopSelect();
  document.getElementById('shopSelect').addEventListener('change', populateItemSelect);
  populateItemSelect();
}

// Render shop stock levels
function renderShops() {
  const container = document.getElementById('shops-container');
  container.innerHTML = '';

  shops.forEach(shop => {
    const shopDiv = document.createElement('div');
    shopDiv.className = 'shop';

    let html = `<h3>${shop.name}</h3><ul>`;
    for (const [item, qty] of Object.entries(shop.stock)) {
      const lowStockClass = qty <= lowStockThreshold ? 'low-stock' : '';
      html += `<li class="${lowStockClass}">${item}: ${qty}</li>`;
    }
    html += '</ul></div>';

    container.appendChild(createShopDiv(shop, html));
  });
}

// Helper to create shop div with data
function createShopDiv(shop, innerHtml) {
  const div = document.createElement('div');
  div.innerHTML = innerHtml;
  return div;
}

// Populate shop dropdown
function populateShopSelect() {
  const select = document.getElementById('shopSelect');
  select.innerHTML = '';
  shops.forEach(shop => {
    const option = document.createElement('option');
    option.value = shop.id;
    option.text = shop.name;
    select.appendChild(option);
  });
  selectedShopId = shops[0].id;
  populateItemSelect();
}

// Populate items dropdown based on selected shop
function populateItemSelect() {
  const shopId = parseInt(document.getElementById('shopSelect').value);
  selectedShopId = shopId;
  const shop = shops.find(s => s.id === shopId);
  const itemSelect = document.getElementById('itemSelect');
  itemSelect.innerHTML = '';
  for (const item in shop.stock) {
    const option = document.createElement('option');
    option.value = item;
    option.text = item;
    itemSelect.appendChild(option);
  }
}

// Process purchase
function processPurchase(e) {
  e.preventDefault();
  const shopId = selectedShopId;
  const item = document.getElementById('itemSelect').value;
  const qty = parseInt(document.getElementById('quantity').value);
  const shop = shops.find(s => s.id === shopId);

  if (shop.stock[item] >= qty) {
    // Deduct stock
    shop.stock[item] -= qty;
    alert(`Please proceed to payment of $${qty * 10} for ${qty} ${item}(s).`);
    // Simulate payment process
    processPayment(shop.name, item, qty);
    // Update display
    renderShops();
    showNotification(`Purchased ${qty} ${item}(s) from ${shop.name}.`);
  } else {
    alert("Not enough stock to fulfill this order.");
  }
}

// Simulate payment prompt
function processPayment(shopName, item, qty) {
  const amount = qty * 10; // sample price
  const confirmPay = confirm(`Pay $${amount} for ${qty} ${item}(s) from ${shopName}?`);
  if (confirmPay) {
    alert("Payment successful! Thank you for your purchase.");
  } else {
    alert("Payment canceled.");
  }
}

// Show notifications for stock levels
function showNotification(message) {
  const notifDiv = document.getElementById('notifications');
  notifDiv.innerHTML += `<p>${message}</p>`;
}

// Check stock levels periodically
function checkStockLevels() {
  shops.forEach(shop => {
    for (const [item, qty] of Object.entries(shop.stock)) {
      if (qty <= lowStockThreshold) {
        showNotification(`Alert: Low stock on ${item} in ${shop.name} (${qty} left).`);
      }
    }
  });
}

// Initialize
init();
setInterval(checkStockLevels, 30000); // check every 30 seconds
