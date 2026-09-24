const products = [];
const sales = [];
const expiries = [];
const saleCart = [];
const sheetUrl = 'https://docs.google.com/spreadsheets/d/1KCWzoWsN2wbtAgPqNwU3o0iCO18OT-L3karqfRDcNUY/edit?usp=sharing';
const apiUrl = 'https://script.google.com/macros/s/AKfycbws2H8kVv_9lOoMBgxzD4OojmPpFWFqy4F9TDLBZ8x-SwtBbkgycVyInO5NXOlTwGIo_Q/exec';
const defaultApiToken = '251372019d54420b835602be76029df8';
let apiToken = localStorage.getItem('chukytosApiToken') || defaultApiToken;
localStorage.setItem('chukytosApiToken', apiToken);
const $ = selector => document.querySelector(selector);
const money = value => `$ ${Number(value || 0).toLocaleString('es-AR')}`;
const cartButton = document.createElement('button');
cartButton.type = 'button';
cartButton.className = 'cart-button';
cartButton.title = 'Abrir carrito de venta';
cartButton.innerHTML = '🛒 <span id="cartCount">0</span>';
$('#sales .toolbar .controls').prepend(cartButton);
const salesCartPanel = document.createElement('section');
salesCartPanel.className = 'panel sales-cart-panel';
salesCartPanel.hidden = true;
salesCartPanel.innerHTML = '<div class="panel-head"><div><h3>Carrito de venta</h3><span class="panel-sub">Productos agregados manualmente o por escáner</span></div><button class="outline" id="continueSaleBtn" type="button">+ Agregar producto</button></div><div id="salesCartLines" class="sales-cart-lines"></div><div class="sales-cart-footer"><span>Total del carrito</span><strong id="salesCartTotal">$ 0</strong><button class="primary" id="finishSaleViewBtn" type="button">Terminar venta</button></div>';
$('#sales .sales-summary').after(salesCartPanel);
const quickSaleBar = document.createElement('div');
quickSaleBar.className = 'quick-sale-bar';
quickSaleBar.innerHTML = '<div><strong>Armar carrito</strong><small>Escaneá o escribí el código y la cantidad</small></div><input id="quickBarcode" placeholder="Código de barras" inputmode="numeric" autocomplete="off"><span id="quickProductInfo" class="quick-product-info">Producto pendiente</span><input id="quickQuantity" type="number" min="1" value="1" aria-label="Cantidad"><button class="primary" id="quickAddBtn" type="button">Enter</button><button class="outline" id="quickCameraBtn" type="button">Escanear con cámara</button>';
salesCartPanel.before(quickSaleBar);

const quickCameraModal = document.createElement('div');
quickCameraModal.className = 'camera-scan-modal';
quickCameraModal.innerHTML = '<div class="camera-scan-panel"><div class="camera-scan-header"><strong>Escaneo por cámara</strong><button type="button" id="closeCameraScan" class="close-camera-scan">×</button></div><video id="cameraScannerVideo" autoplay playsinline muted></video><p id="cameraScanStatus">Ajustá la cámara sobre el código de barras.</p></div>';
document.body.appendChild(quickCameraModal);

let quickCameraStream = null;
let quickCameraLoop = null;

function stopQuickCamera() {
  if (quickCameraLoop) { clearInterval(quickCameraLoop); quickCameraLoop = null; }
  if (quickCameraStream) {
    quickCameraStream.getTracks().forEach(track => track.stop());
    quickCameraStream = null;
  }
  const video = $('#cameraScannerVideo');
  if (video) video.srcObject = null;
  quickCameraModal.classList.remove('open');
}

async function openQuickCameraScanner() {
  const quickBarcode = $('#quickBarcode');
  if (!quickBarcode) return;
  const status = $('#cameraScanStatus');
  const video = $('#cameraScannerVideo');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = 'Tu navegador no admite acceso a cámara.';
    quickCameraModal.classList.add('open');
    return;
  }
  if (!('BarcodeDetector' in window)) {
    status.textContent = 'Tu navegador no soporta escaneo por cámara. Podés escribir o usar un escáner externo.';
    quickCameraModal.classList.add('open');
    return;
  }
  try {
    quickCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = quickCameraStream;
    await video.play();
    quickCameraModal.classList.add('open');
    status.textContent = 'Escaneando... mantén el código dentro del cuadro.';
    const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'] });
    quickCameraLoop = setInterval(async () => {
      if (!quickCameraModal.classList.contains('open')) return;
      try {
        const barcodes = await detector.detect(video);
        const found = barcodes.find(item => item.rawValue && item.rawValue.trim());
        if (!found) return;
        const code = String(found.rawValue).trim().replace(/\s+/g, '');
        if (!code) return;
        quickBarcode.value = code;
        stopQuickCamera();
        addQuickSaleLine();
      } catch (error) {
        status.textContent = 'No se pudo leer el código. Ajustá la cámara y probá otra vez.';
      }
    }, 500);
  } catch (error) {
    status.textContent = 'No se pudo acceder a la cámara. Permití el uso y probá nuevamente.';
    quickCameraModal.classList.add('open');
  }
}

function focusQuickBarcode() {
  const quickBarcode = $('#quickBarcode');
  if (!quickBarcode) return;
  setTimeout(() => {
    quickBarcode.focus();
    quickBarcode.select();
  }, 80);
}
let quickBarcodeTimer = null;
function submitQuickBarcodeIfReady() {
  const quickBarcode = $('#quickBarcode');
  if (!quickBarcode) return;
  const value = quickBarcode.value.trim().replace(/\s+/g, '');
  if (!value) return;
  clearTimeout(quickBarcodeTimer);
  quickBarcodeTimer = setTimeout(() => {
    const current = $('#quickBarcode')?.value.trim().replace(/\s+/g, '');
    if (current && current === value && !$('#quickAddBtn').disabled) {
      addQuickSaleLine();
    }
  }, 180);
}
const calculator = document.createElement('aside');
calculator.className = 'sales-calculator';
calculator.innerHTML = '<div class="calculator-head"><div><strong>Calculadora</strong><small>Operación rápida</small></div><button type="button" id="clearCalculator">C</button></div><input id="calculatorDisplay" value="0" readonly><div class="calculator-grid"><button data-calc="7">7</button><button data-calc="8">8</button><button data-calc="9">9</button><button data-calc="/">÷</button><button data-calc="4">4</button><button data-calc="5">5</button><button data-calc="6">6</button><button data-calc="*">×</button><button data-calc="1">1</button><button data-calc="2">2</button><button data-calc="3">3</button><button data-calc="-">−</button><button data-calc="0">0</button><button data-calc=".">.</button><button data-calc="=">=</button><button data-calc="+">+</button></div></aside>';
$('.sidebar').insertBefore(calculator, $('.side-bottom'));
let calculatorExpression = '';
calculator.querySelectorAll('[data-calc]').forEach(button => button.addEventListener('click', () => { const value = button.dataset.calc; if (value === '=') { try { calculatorExpression = String(Function(`return ${calculatorExpression || 0}`)()); } catch { calculatorExpression = '0'; } } else calculatorExpression += value; $('#calculatorDisplay').value = calculatorExpression || '0'; }));
$('#clearCalculator').addEventListener('click', () => { calculatorExpression = ''; $('#calculatorDisplay').value = '0'; });
$('#descriptionInput').previousElementSibling.textContent = 'Nombre / descripción del producto';
$('#descriptionInput').placeholder = 'Ej.: Galletitas de chocolate 170 g';
$('#descriptionInput').required = true;
const barcodeEntry = $('#barcodeInput').parentElement;
barcodeEntry.classList.add('barcode-entry');
const manualBarcodeBtn = document.createElement('button');
manualBarcodeBtn.type = 'button';
manualBarcodeBtn.className = 'outline manual-barcode-btn';
manualBarcodeBtn.textContent = 'Enter';
manualBarcodeBtn.title = 'Registrar código manualmente';
const entryGrid = $('#barcodeInput').closest('.form-grid');
const categoryField = document.createElement('div');
categoryField.className = 'field entry-only';
categoryField.innerHTML = '<label>Categoría</label><select id="categoryInput" required><option value="">Seleccionar categoría</option><option>Almacén general</option><option>Bebidas</option><option>Lácteos</option><option>Fiambres y quesos</option><option>Carnes</option><option>Frutas y verduras</option><option>Panadería</option><option>Pastelería</option><option>Congelados</option><option>Conservas</option><option>Legumbres y cereales</option><option>Arroz, pastas y harinas</option><option>Aceites, aderezos y condimentos</option><option>Desayuno y merienda</option><option>Infusiones</option><option>Snacks, golosinas y galletitas</option><option>Alimentos saludables</option><option>Dietética</option><option>Otros o varios</option></select>';
const minimumField = document.createElement('div');
minimumField.className = 'field entry-only';
minimumField.innerHTML = '<label>Stock mínimo</label><input id="minimumInput" type="number" min="0" value="0" placeholder="0" />';
entryGrid.append(categoryField, minimumField);

function productRow(product, compact = false) {
  const percentage = Math.min(100, Math.round(product.stock / (product.min * 2) * 100));
  const stock = `<strong>${product.stock} u.</strong><div class="stock-bar"><div class="stock-fill ${product.status === 'low' ? 'low' : ''}" style="width:${percentage}%"></div></div>`;
  const state = `<span class="badge ${product.status === 'low' ? 'warn' : 'ok'}">${product.status === 'low' ? 'Reponer' : 'Normal'}</span>`;
  return `<tr><td><div class="product"><span class="product-icon">${product.icon}</span><div>${product.name}<div class="product-code">${product.code}</div></div></div></td>${compact ? `<td>${stock}</td><td>${state}</td>` : `<td>${product.category}</td><td>${stock}</td><td>${product.min} u.</td><td>${product.expiry}</td><td>${state}</td>`}</tr>`;
}
function renderInventory() { const term = ($('#inventorySearch')?.value || '').toLowerCase(); const filter = $('#stockFilter')?.value || 'all'; const list = products.filter(p => (p.name + p.code).toLowerCase().includes(term) && (filter === 'all' || p.status === filter)); $('#inventoryBody').innerHTML = list.map(p => productRow(p)).join(''); $('#inventoryCount').textContent = `${list.length} productos activos`; }
function renderDashboard() { const low = products.filter(p => p.status === 'low'); const totalStock = products.reduce((sum, p) => sum + Number(p.stock || 0), 0); $('#lowStockBody').innerHTML = low.slice(0, 4).map(p => productRow(p, true)).join(''); $('#expiryPreview').innerHTML = expiries.slice(0, 3).map(e => `<div class="expiry-item"><div class="expiry-date"><strong>${e[3].split(' ')[0]}</strong><small>días</small></div><div><p>${e[0]}</p><small>Vence el ${e[2]} · ${e[4]} en stock</small></div></div>`).join(''); $('#stockMetric').textContent = totalStock.toLocaleString('es-AR'); $('#lowStockMetric').textContent = low.length ? `${low.length} necesitan reposición` : 'Sin alertas de stock'; $('#expiryMetric').textContent = `${expiries.length} lotes`; }
function renderSales() { const term = ($('#salesSearch')?.value || '').toLowerCase(); const visibleSales = sales.filter(row => row.join(' ').toLowerCase().includes(term)); $('#salesBody').innerHTML = visibleSales.map(row => `<tr><td><strong>${row[0]}</strong></td><td>${row[1]}</td><td>${row[2]}</td><td><strong>${row[3]}</strong></td><td>${row[4]}</td><td><span class="badge ok">${row[5]}</span></td></tr>`).join(''); const total = sales.reduce((sum, row) => sum + Number(String(row[3]).replace(/[^0-9,-]/g, '').replace('.', '').replace(',', '.') || 0), 0); const mercado = sales.filter(row => row[4] === 'Mercado Pago').length; $('#periodSalesMetric').textContent = money(total); $('#transactionsMetric').textContent = sales.length; $('#mercadoPagoMetric').textContent = sales.length ? `${Math.round(mercado / sales.length * 100)}%` : '0%'; }
function renderExpiry() { $('#expiryBody').innerHTML = expiries.map(e => `<tr><td><strong>${e[0]}</strong></td><td>${e[1]}</td><td>${e[2]}</td><td><span class="badge ${parseInt(e[3]) < 7 ? 'danger' : 'warn'}">${e[3]}</span></td><td>${e[4]}</td><td><button class="text-btn">Ver lote →</button></td></tr>`).join(''); }
function openView(id) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === id)); document.querySelectorAll('.nav button[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === id)); const titles = {dashboard:'Buenos días, equipo', inventory:'Inventario', sales:'Ventas', expiry:'Control de vencimientos', integrations:'Integraciones'}; $('#pageTitle').textContent = titles[id] || 'Buenos días, equipo'; if (id === 'inventory') { renderInventory(); syncInventoryFromSheet(); } if (id === 'sales') { renderSales(); syncSalesFromSheet(); focusQuickBarcode(); } }
let lookupRequestId = 0;
async function lookupPrice() { const requestId = ++lookupRequestId; const code = $('#barcodeInput').value.trim(); const normalizedCode = code.replace(/\s+/g, ''); const result = $('#priceResult'); if (!normalizedCode) { result.hidden = false; result.innerHTML = '<span>Ingresá un código de barras.</span><strong>!</strong>'; return false; } let found = products.find(product => String(product.code).replace(/\s+/g, '') === normalizedCode); const selling = !$('#saleDetails').hidden; const needsSheetData = !found || (selling && (!Array.isArray(found.lots) || !found.lots.length)); if (needsSheetData && apiToken) { result.hidden = false; result.innerHTML = '<span>Consultando catálogo y lotes...</span><strong>...</strong>'; await syncInventoryFromSheet(); if (requestId !== lookupRequestId || $('#barcodeInput').value.trim().replace(/\s+/g, '') !== normalizedCode) return false; found = products.find(product => String(product.code).replace(/\s+/g, '') === normalizedCode); } if (requestId !== lookupRequestId) return false; result.hidden = false; if (found) { result.innerHTML = `<span>${found.icon} ${found.name}</span><strong>${money(found.price)}</strong>`; $('#descriptionInput').value = found.name; $('#descriptionInput').readOnly = selling; $('#saleInput').value = found.price; $('#salePrice').value = found.price; updateSaleTotal(); return true; } $('#descriptionInput').value = ''; $('#descriptionInput').readOnly = false; result.innerHTML = '<span>Código no encontrado en Google Sheets</span><strong>--</strong>'; return false; }
function updateSaleTotal() { const qty = parseInt($('#saleQty').value) || 0; const price = parseFloat($('#salePrice').value) || 0; $('#saleTotal').textContent = money(qty * price); }
function renderSaleCart() { const total = saleCart.reduce((sum, item) => sum + item.quantity * item.price, 0); const lines = $('#saleDetails .lot-lines'); if (lines) { lines.innerHTML = '<div class="lot-line"><strong>Producto</strong><strong>Cant.</strong><strong>Precio</strong><span></span></div>' + (saleCart.length ? saleCart.map((item, index) => `<div class="lot-line"><span>${item.name}</span><input class="cart-qty" data-index="${index}" type="number" min="1" value="${item.quantity}"><strong>${money(item.price)}</strong><button class="remove-line" data-index="${index}" type="button">×</button></div>`).join('') : '<div class="cart-empty">Ingresá un código y presioná Enter para agregar productos.</div>'); lines.querySelectorAll('.cart-qty').forEach(input => input.addEventListener('input', event => { const item = saleCart[Number(event.target.dataset.index)]; item.quantity = Math.max(1, Number(event.target.value) || 1); renderSaleCart(); })); lines.querySelectorAll('.remove-line').forEach(button => button.addEventListener('click', event => { saleCart.splice(Number(event.target.dataset.index), 1); renderSaleCart(); })); } const viewLines = $('#salesCartLines'); if (viewLines) viewLines.innerHTML = saleCart.length ? saleCart.map((item, index) => `<div class="sales-cart-row"><span>${item.name}<small>Código ${item.code}</small></span><input class="view-cart-qty" data-index="${index}" type="number" min="1" value="${item.quantity}"><strong>${money(item.quantity * item.price)}</strong><button class="remove-line view-remove-line" data-index="${index}" type="button">×</button></div>`).join('') : '<div class="cart-empty">El carrito está vacío. Agregá productos desde Nueva venta.</div>'; if (viewLines) { viewLines.querySelectorAll('.view-cart-qty').forEach(input => input.addEventListener('input', event => { const item = saleCart[Number(event.target.dataset.index)]; item.quantity = Math.max(1, Number(event.target.value) || 1); renderSaleCart(); })); viewLines.querySelectorAll('.view-remove-line').forEach(button => button.addEventListener('click', event => { saleCart.splice(Number(event.target.dataset.index), 1); renderSaleCart(); })); } $('#saleTotal').textContent = money(total); $('#salesCartTotal').textContent = money(total); $('#cartCount').textContent = saleCart.reduce((sum, item) => sum + item.quantity, 0); }
async function addQuickSaleLine() { const code = $('#quickBarcode').value.trim().replace(/\s+/g, ''); const quantity = Math.max(1, Number($('#quickQuantity').value) || 1); if (!code) { $('#quickBarcode').focus(); return; } $('#quickAddBtn').disabled = true; $('#quickAddBtn').textContent = '...'; await syncInventoryFromSheet(10000); const found = products.find(product => String(product.code).replace(/\s+/g, '') === code); const lot = found?.lots?.find(item => Number(item.CANTIDAD_DISPONIBLE) > 0); if (!found) { $('#quickProductInfo').textContent = 'Código no encontrado en Google Sheets'; $('#quickAddBtn').disabled = false; $('#quickAddBtn').textContent = 'Enter'; return; } $('#quickProductInfo').textContent = `${found.name} · ${money(found.price)}`; if (!lot) { $('#quickProductInfo').textContent += ' · Sin stock'; $('#quickAddBtn').disabled = false; $('#quickAddBtn').textContent = 'Enter'; return; } const existing = saleCart.find(item => item.code === code && item.lotId === lot.LOTE_ID); if (existing) existing.quantity += quantity; else saleCart.push({code:found.code, name:found.name, price:Number(found.price) || 0, quantity, lotId:lot.LOTE_ID, available:Number(lot.CANTIDAD_DISPONIBLE)}); renderSaleCart(); $('#quickBarcode').value = ''; $('#quickQuantity').value = 1; $('#quickProductInfo').textContent = `${found.name} agregado`; $('#quickAddBtn').disabled = false; $('#quickAddBtn').textContent = 'Enter'; $('#quickBarcode').focus(); }
async function addManualSaleLine() {
  const code = $('#barcodeInput').value.trim().replace(/\s+/g, '');
  if (!code) return;
  $('#priceResult').hidden = false;
  $('#priceResult').innerHTML = '<span>Agregando producto...</span><strong>...</strong>';
  let found = products.find(product => String(product.code).replace(/\s+/g, '') === code);
  if (!found || !found.lots?.length) await syncInventoryFromSheet(1500);
  found = products.find(product => String(product.code).replace(/\s+/g, '') === code);
  const manualName = $('#descriptionInput').value.trim();
  const manualPrice = Number($('#salePrice').value || $('#saleInput').value || 0);
  if (!found && manualName && manualPrice > 0) found = {code, name:manualName, price:manualPrice, lots:[{LOTE_ID:`MANUAL-${code}`, CANTIDAD_DISPONIBLE:999999}]};
  if (!found) { $('#priceResult').innerHTML = '<span>Ingresá descripción y precio para agregarlo manualmente, o verificá la conexión con Google Sheets.</span><strong>!</strong>'; return; }
  const lot = (found.lots || []).find(item => Number(item.CANTIDAD_DISPONIBLE) > 0);
  if (!lot) { $('#priceResult').innerHTML = '<span>El producto no tiene stock disponible.</span><strong>!</strong>'; return; }
  const quantity = Math.max(1, Number($('#saleQty').value) || Number($('#quantityInput').value) || 1);
  const existing = saleCart.find(item => item.code === code && item.lotId === lot.LOTE_ID);
  const currentQuantity = existing ? existing.quantity : 0;
  if (currentQuantity + quantity > Number(lot.CANTIDAD_DISPONIBLE)) { $('#priceResult').innerHTML = `<span>Stock disponible: ${lot.CANTIDAD_DISPONIBLE} unidades.</span><strong>!</strong>`; return; }
  if (existing) existing.quantity += quantity;
  else saleCart.push({code:found.code, name:found.name, price:Number(found.price) || manualPrice, quantity, lotId:lot.LOTE_ID, available:Number(lot.CANTIDAD_DISPONIBLE), manual:lot.LOTE_ID.startsWith('MANUAL-')});
  $('#descriptionInput').value = found.name;
  $('#salePrice').value = found.price;
  renderSaleCart();
  $('#barcodeInput').value = '';
  $('#saleQty').value = 1;
  $('#priceResult').hidden = true;
  $('#barcodeInput').focus();
}
function applyInventory(data) { products.splice(0, products.length, ...data.map(item => ({icon:'📦', name:item.name, code:String(item.barcode || '').trim(), category:item.category, price:item.price, stock:item.stock, min:item.minimum, lots:Array.isArray(item.lots) ? item.lots : [], expiry:item.lots?.[0]?.VENCIMIENTO || '', status:item.stock < item.minimum ? 'low' : 'ok'}))); renderDashboard(); renderInventory(); }
async function syncInventoryFromSheet(timeoutMs = 10000) { if (!apiToken) return false; $('#inventoryCount').textContent = 'Consultando Google Sheets...'; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetch(`${apiUrl}?action=inventory&token=${encodeURIComponent(apiToken)}`, {signal:controller.signal}); const result = await response.json(); if (!result.ok) throw new Error(result.error || 'No se pudo consultar Google Sheets.'); applyInventory(result.data); sessionStorage.setItem('chukytosInventoryCache', JSON.stringify(result.data)); $('#inventoryCount').textContent = `${result.data.length} productos activos · actualizado ahora`; return true; } catch (error) { $('#inventoryCount').textContent = error.name === 'AbortError' ? 'Google Sheets tardó demasiado en responder.' : `No se pudo actualizar: ${error.message}`; return false; } finally { clearTimeout(timeout); } }
async function syncSalesFromSheet(timeoutMs = 10000) { if (!apiToken) return false; const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs); try { const response = await fetch(`${apiUrl}?action=sales&limit=100&token=${encodeURIComponent(apiToken)}`, {signal:controller.signal}); const result = await response.json(); if (!result.ok) throw new Error(result.error || 'No se pudo consultar ventas.'); sales.splice(0, sales.length, ...result.data.map(row => [row.VENTA_ID || '', formatSaleDate(row.FECHA_HORA), row.OBSERVACIONES || 'Venta registrada', money(row.TOTAL), row.MEDIO_PAGO || '', row.ESTADO_VENTA || row.ESTADO_PAGO || ''])); renderSales(); return true; } catch (error) { return false; } finally { clearTimeout(timeout); } }
function formatSaleDate(value) { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-AR'); }

const modal = $('#modalWrap');
const priceResult = $('#priceResult') || document.createElement('div');
priceResult.id = 'priceResult';
priceResult.className = 'price-result';
priceResult.hidden = true;
if (!priceResult.parentElement) { priceResult.innerHTML = '<span>Ingrese un código para consultar</span><strong>--</strong>'; $('#saleDetails').parentElement.insertBefore(priceResult, $('#saleDetails')); }
function openModal(title = 'Registrar mercadería', preserveCart = false) { const isSale = title.includes('Nueva venta'); $('#modalTitle').textContent = title; $('#saleDetails').hidden = !isSale; $('#confirmScan').hidden = isSale; $('#confirmSale').hidden = !isSale; document.querySelectorAll('.entry-only').forEach(field => field.hidden = isSale); if (isSale) barcodeEntry.appendChild(manualBarcodeBtn); else manualBarcodeBtn.remove(); if (!preserveCart) saleCart.splice(0, saleCart.length); if (isSale) salesCartPanel.hidden = false; $('#barcodeInput').value = ''; $('#descriptionInput').value = ''; $('#descriptionInput').readOnly = false; $('#categoryInput').value = ''; $('#minimumInput').value = '0'; $('#quantityInput').value = 1; $('#costInput').value = ''; $('#saleInput').value = ''; $('#expiryInput').value = ''; $('#priceResult').hidden = true; if (isSale) { renderSaleCart(); syncInventoryFromSheet(); } modal.classList.add('open'); setTimeout(() => $('#barcodeInput').focus(), 100); }
function closeModal() { modal.classList.remove('open'); }

document.querySelectorAll('.nav button[data-view]').forEach(btn => btn.addEventListener('click', () => openView(btn.dataset.view)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => openView(btn.dataset.go)));
$('#inventorySearch').addEventListener('input', renderInventory); $('#stockFilter').addEventListener('change', renderInventory); $('#salesSearch').addEventListener('input', renderSales);
$('#barcodeInput').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'NumpadEnter') { event.preventDefault(); if (!$('#saleDetails').hidden) addManualSaleLine(); else lookupPrice(); } }); manualBarcodeBtn.addEventListener('click', addManualSaleLine); $('#saleQty').addEventListener('input', updateSaleTotal); $('#salePrice').addEventListener('input', updateSaleTotal);
$('#quickBarcode').addEventListener('input', submitQuickBarcodeIfReady);
$('#quickBarcode').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'NumpadEnter') { event.preventDefault(); addQuickSaleLine(); } }); $('#quickAddBtn').addEventListener('click', addQuickSaleLine); $('#quickCameraBtn').addEventListener('click', openQuickCameraScanner); $('#closeCameraScan').addEventListener('click', stopQuickCamera); quickCameraModal.addEventListener('click', event => { if (event.target === quickCameraModal) stopQuickCamera(); });
$('#openScan').addEventListener('click', () => openModal()); $('#openSale').addEventListener('click', () => { closeModal(); openView('sales'); salesCartPanel.hidden = false; focusQuickBarcode(); }); cartButton.addEventListener('click', () => { closeModal(); openView('sales'); salesCartPanel.hidden = false; focusQuickBarcode(); }); $('#continueSaleBtn').addEventListener('click', () => { closeModal(); focusQuickBarcode(); }); $('#finishSaleViewBtn').addEventListener('click', () => $('#confirmSale').click()); $('#scanNav').addEventListener('click', () => openModal()); $('#closeModal').addEventListener('click', closeModal); $('#cancelModal').addEventListener('click', closeModal); modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
$('#confirmScan').addEventListener('click', async event => { const barcode = $('#barcodeInput').value.trim(); const description = $('#descriptionInput').value.trim(); const category = $('#categoryInput').value.trim(); const quantity = Number($('#quantityInput').value); const minimum = Number($('#minimumInput').value); const cost = Number($('#costInput').value); const salePrice = Number($('#saleInput').value); const expiry = $('#expiryInput').value; if (!barcode || !description || !category || quantity < 1 || minimum < 0 || cost < 0 || salePrice < 0 || !expiry) { $('#priceResult').hidden = false; $('#priceResult').innerHTML = '<span>Completá código, descripción, categoría, stock mínimo, cantidad, precios y vencimiento.</span><strong>!</strong>'; return; } event.target.disabled = true; event.target.textContent = 'Guardando...'; try { const response = await fetch(apiUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({action:'stockEntry', token:apiToken, lot:{barcode:barcode, description:description, category:category, quantity:quantity, minimum:minimum, cost:cost, salePrice:salePrice, expiry:expiry}, user:sessionStorage.getItem('chukytosSeller') || ''})}); const result = await response.json(); if (!result.ok) throw new Error(result.error || 'No se pudo guardar la mercadería.'); closeModal(); await syncInventoryFromSheet(); } catch (error) { $('#priceResult').hidden = false; $('#priceResult').innerHTML = `<span>${error.message}</span><strong>!</strong>`; } finally { event.target.disabled = false; event.target.textContent = 'Guardar mercadería'; } });
$('#confirmSale').addEventListener('click', async event => { if (!saleCart.length) { $('#priceResult').hidden = false; $('#priceResult').innerHTML = '<span>Agregá al menos un producto al carrito.</span><strong>!</strong>'; return; } event.target.disabled = true; event.target.textContent = 'Registrando...'; try { const payload = {action:'registerSale', token:apiToken, sale:{seller:sessionStorage.getItem('chukytosSeller') || '', paymentMethod:$('#paymentMethod').value, paymentStatus:'ABONADO', lines:saleCart.map(item => ({lotId:item.lotId, quantity:item.quantity, unitPrice:item.price}))}}; const response = await fetch(apiUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload)}); const result = await response.json(); if (!result.ok) throw new Error(result.error || 'No se pudo registrar la venta.'); saleCart.splice(0, saleCart.length); renderSaleCart(); closeModal(); await syncInventoryFromSheet(); openView('sales'); } catch (error) { $('#priceResult').hidden = false; $('#priceResult').innerHTML = `<span>${error.message}</span><strong>!</strong>`; } finally { event.target.disabled = false; event.target.textContent = 'Registrar pago'; } });
let registerMode = false;
$('#toggleRegister').addEventListener('click', () => { registerMode = !registerMode; document.querySelectorAll('.register-only').forEach(field => { field.hidden = !registerMode; field.querySelector('input').required = registerMode; }); $('#authTitle').textContent = registerMode ? 'Crear cuenta' : 'Iniciar sesión'; $('#authCopy').textContent = registerMode ? 'Registrá tus datos para acceder como vendedor.' : 'Accede con tu usuario de vendedor para registrar movimientos y ventas.'; $('#authSubmit').textContent = registerMode ? 'Registrar vendedor' : 'Ingresar al sistema'; $('#switchText').textContent = registerMode ? '¿Ya tenés una cuenta?' : '¿Es tu primer ingreso?'; $('#toggleRegister').textContent = registerMode ? 'Volver a iniciar sesión' : 'Crear cuenta de vendedor'; $('#loginError').textContent = ''; });
$('#loginForm').addEventListener('submit', async event => { event.preventDefault(); const user = $('#loginUser').value.trim(); const password = $('#loginPassword').value; apiToken = localStorage.getItem('chukytosApiToken') || ''; $('#loginError').textContent = registerMode ? 'Registrando...' : 'Validando...'; try { if (!apiToken) throw new Error('Configura el token API en Integraciones.'); if (registerMode && password !== $('#registerPasswordConfirm').value) throw new Error('Las contraseñas no coinciden.'); const payload = registerMode ? {action:'registerUser', token:apiToken, username:user, name:$('#registerName').value.trim(), password:password} : {action:'login', token:apiToken, username:user, password:password}; const response = await fetch(apiUrl, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload)}); const result = await response.json(); if (!result.ok) throw new Error(result.error || 'No se pudo completar la operación.'); if (registerMode) { registerMode = false; $('#toggleRegister').click(); $('#loginUser').value = user; $('#loginError').textContent = 'Cuenta creada. Ya podés iniciar sesión.'; return; } $('#sellerName').textContent = result.name; $('#sellerAvatar').textContent = result.name.split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase(); $('#loginWrap').classList.add('hidden'); sessionStorage.setItem('chukytosSession', 'active'); sessionStorage.setItem('chukytosSeller', result.username); $('#loginError').textContent = ''; } catch (error) { $('#loginError').textContent = error.message; } });
$('#configureLoginApi').addEventListener('click', () => { const value = prompt('Pegá el token API generado por setup() en Apps Script:'); if (value && value.trim()) { apiToken = value.trim(); localStorage.setItem('chukytosApiToken', apiToken); $('#loginError').textContent = 'Token guardado. Intentá iniciar sesión nuevamente.'; } });
$('#logoutBtn').addEventListener('click', () => { sessionStorage.removeItem('chukytosSession'); $('#loginWrap').classList.remove('hidden'); $('#loginPassword').value = ''; $('#loginUser').focus(); }); if (sessionStorage.getItem('chukytosSession') === 'active') $('#loginWrap').classList.add('hidden');
$('#sheetOpenLink').href = sheetUrl; $('#apiOpenLink').href = apiUrl; $('#apiTokenInput').value = apiToken; $('#saveApiTokenBtn').addEventListener('click', () => { const value = $('#apiTokenInput').value.trim(); if (!value) { $('#apiStatusText').textContent = 'Ingresá un token API válido.'; return; } apiToken = value; localStorage.setItem('chukytosApiToken', value); $('#apiStatusBadge').textContent = 'TOKEN GUARDADO'; $('#apiStatusBadge').className = 'badge ok'; $('#apiStatusText').textContent = 'Token actualizado. Probá sincronizar o iniciar sesión.'; });
$('#syncBtn').addEventListener('click', async event => { if (!apiToken) { $('#apiStatusText').textContent = 'Falta el token API generado por setup()'; event.target.textContent = 'Token requerido'; return; } event.target.textContent = 'Sincronizando...'; try { const response = await fetch(`${apiUrl}?action=inventory&token=${encodeURIComponent(apiToken)}`); const result = await response.json(); if (!result.ok) throw new Error(result.error || 'No se pudo sincronizar'); applyInventory(result.data); $('#apiStatusBadge').textContent = 'SINCRONIZADA'; $('#apiStatusBadge').className = 'badge ok'; $('#apiStatusText').textContent = `${result.data.length} productos recibidos desde Google Sheets`; $('#lastSync').textContent = 'Ahora mismo'; $('#sheetActivityTime').textContent = 'Ahora mismo'; event.target.textContent = 'Sincronizado ✓'; } catch (error) { $('#apiStatusText').textContent = error.message; event.target.textContent = 'Reintentar sincronización'; } });
$('#connectBtn').addEventListener('click', event => { event.target.textContent = 'Cuenta conectada ✓'; });
$('#exportBtn').addEventListener('click', () => { const csv = 'Producto,Codigo,Categoria,Precio,Stock,Minimo,Vencimiento\n' + products.map(p => `${p.name},${p.code},${p.category},${p.price},${p.stock},${p.min},${p.expiry}`).join('\n'); const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'chukytos-inventario.csv'; link.click(); URL.revokeObjectURL(url); });

renderDashboard(); renderInventory(); renderSales(); renderExpiry();
