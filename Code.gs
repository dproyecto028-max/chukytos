/**
 * CHUKYTOS MARKET - Google Apps Script API
 *
 * 1. Pegar este archivo en Extensiones > Apps Script.
 * 2. Ejecutar setup() una sola vez y autorizar.
 * 3. En Implementar > Nueva implementacion elegir "Aplicacion web".
 * 4. Ejecutar como: tu cuenta. Acceso: quien tenga el enlace.
 * 5. Copiar la URL /exec y usarla como API_URL en la app.
 *
 * Las contrasenas no se guardan en texto plano.
 * No se cargan productos ni usuarios de ejemplo automaticamente.
 * Para crear un vendedor de prueba ejecutar, por ejemplo:
 * crearUsuarioPrueba('maria', 'Maria Rodriguez', 'una-clave-de-prueba', 'VENDEDOR');
 */

const SHEETS = {
  CONFIG: 'CONFIG',
  PRODUCTOS: 'PRODUCTOS',
  LOTES: 'LOTES',
  VENTAS: 'VENTAS',
  DETALLE: 'DETALLE_VENTAS',
  MOVIMIENTOS: 'MOVIMIENTOS',
  USUARIOS: 'USUARIOS'
};

const HEADERS = {
  CONFIG: ['CLAVE', 'VALOR'],
  PRODUCTOS: ['PRODUCTO_ID', 'CODIGO_BARRAS', 'NOMBRE', 'CATEGORIA', 'PRECIO_VENTA', 'STOCK_MINIMO', 'ACTIVO'],
  LOTES: ['LOTE_ID', 'PRODUCTO_ID', 'CODIGO_BARRAS', 'VENCIMIENTO', 'CANTIDAD_INICIAL', 'CANTIDAD_DISPONIBLE', 'COSTO_UNITARIO', 'ACTIVO'],
  VENTAS: ['VENTA_ID', 'FECHA_HORA', 'VENDEDOR', 'TOTAL', 'MEDIO_PAGO', 'ESTADO_PAGO', 'ESTADO_VENTA', 'OBSERVACIONES'],
  DETALLE: ['DETALLE_ID', 'VENTA_ID', 'LOTE_ID', 'PRODUCTO_ID', 'CANTIDAD', 'PRECIO_UNITARIO', 'IMPORTE'],
  MOVIMIENTOS: ['MOVIMIENTO_ID', 'FECHA_HORA', 'TIPO', 'LOTE_ID', 'PRODUCTO_ID', 'CANTIDAD', 'REFERENCIA', 'USUARIO'],
  USUARIOS: ['USUARIO', 'NOMBRE', 'PASSWORD_SHA256', 'ROL', 'ACTIVO', 'ULTIMO_INGRESO']
};

function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function(key) {
    const sheet = getOrCreateSheet_(spreadsheet, SHEETS[key]);
    ensureHeaders_(sheet, HEADERS[key]);
    formatSheet_(sheet);
  });

  const config = spreadsheet.getSheetByName(SHEETS.CONFIG);
  if (config.getLastRow() < 2) {
    config.getRange(2, 1, 4, 2).setValues([
      ['NOMBRE_COMERCIO', 'CHUKYTOS MARKET'],
      ['MONEDA', 'ARS'],
      ['DIAS_ALERTA_VENCIMIENTO', '30'],
      ['API_VERSION', '1']
    ]);
  }

  const properties = PropertiesService.getScriptProperties();
  let apiToken = properties.getProperty('API_TOKEN');
  if (!apiToken) {
    apiToken = createToken_();
    properties.setProperty('API_TOKEN', apiToken);
  }
  Logger.log('Configuracion completa. Token API: ' + apiToken);
}

function limpiarDatosDeEjemplo() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  [SHEETS.PRODUCTOS, SHEETS.LOTES, SHEETS.VENTAS, SHEETS.DETALLE, SHEETS.MOVIMIENTOS, SHEETS.USUARIOS].forEach(function(name) {
    const sheet = spreadsheet.getSheetByName(name);
    if (sheet && sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  });
  Logger.log('Datos de ejemplo eliminados. Los encabezados fueron conservados.');
}

function crearUsuarioPrueba(username, name, password, role) {
  if (!username || !name || !password) throw new Error('Faltan usuario, nombre o contrasena.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.USUARIOS);
  if (!sheet) throw new Error('Ejecuta setup() primero.');
  if (findRow_(SHEETS.USUARIOS, 1, username)) throw new Error('El usuario ya existe.');
  sheet.appendRow([String(username).trim().toLowerCase(), name, sha256_(password), role || 'VENDEDOR', true, '']);
  Logger.log('Usuario creado: ' + username);
}

function cambiarContrasena(username, newPassword) {
  if (!username || !newPassword || String(newPassword).length < 6) throw new Error('Indica usuario y una contraseña de al menos 6 caracteres.');
  const row = findRow_(SHEETS.USUARIOS, 1, username);
  if (!row) throw new Error('El usuario no existe.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.USUARIOS);
  sheet.getRange(row.__row, 3).setValue(sha256_(String(newPassword)));
  Logger.log('Contraseña actualizada para: ' + username);
}

function doGet(e) {
  try {
    authorize_(e && e.parameter ? e.parameter.token : '');
    const action = (e && e.parameter && e.parameter.action) || 'health';
    if (action === 'health') return json_({ok: true, service: 'CHUKYTOS MARKET', timestamp: new Date()});
    if (action === 'inventory') return json_({ok: true, data: getInventory_()});
    if (action === 'sales') return json_({ok: true, data: getSales_(e.parameter.limit)});
    if (action === 'expiries') return json_({ok: true, data: getExpiries_()});
    throw new Error('Accion GET no reconocida.');
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}');
    authorize_(payload.token);
    if (payload.action === 'login') return json_(login_(payload));
    if (payload.action === 'registerUser') return json_(registerUser_(payload));
    if (payload.action === 'registerSale') return json_(registerSale_(payload));
    if (payload.action === 'stockEntry') return json_(stockEntry_(payload));
    throw new Error('Accion POST no reconocida.');
  } catch (error) {
    return json_({ok: false, error: error.message});
  }
}

function login_(payload) {
  const row = findRow_(SHEETS.USUARIOS, 1, String(payload.username || '').trim().toLowerCase());
  if (!row || row.ACTIVO !== true) throw new Error('Usuario inactivo o inexistente.');
  if (row.PASSWORD_SHA256 !== sha256_(String(payload.password || ''))) throw new Error('Usuario o contrasena incorrectos.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.USUARIOS);
  sheet.getRange(row.__row, 6).setValue(new Date());
  return {ok: true, username: row.USUARIO, name: row.NOMBRE, role: row.ROL};
}

function registerUser_(payload) {
  const username = String(payload.username || '').trim().toLowerCase();
  const name = String(payload.name || '').trim();
  const password = String(payload.password || '');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('El usuario debe tener entre 3 y 30 caracteres.');
  if (name.length < 3) throw new Error('Ingresá el nombre completo.');
  if (password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres.');
  if (findRow_(SHEETS.USUARIOS, 1, username)) throw new Error('El usuario ya existe.');
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.USUARIOS).appendRow([username, name, sha256_(password), 'VENDEDOR', true, '']);
  return {ok: true, username: username, name: name};
}

function registerSale_(payload) {
  if (!payload.sale || !Array.isArray(payload.sale.lines) || !payload.sale.lines.length) throw new Error('La venta debe tener al menos un lote.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const lotSheet = spreadsheet.getSheetByName(SHEETS.LOTES);
    const productSheet = spreadsheet.getSheetByName(SHEETS.PRODUCTOS);
    const lots = readObjects_(lotSheet);
    const products = readObjects_(productSheet);
    let total = 0;
    const details = [];

    payload.sale.lines.forEach(function(line) {
      const lot = lots.find(function(item) { return String(item.LOTE_ID).trim() === String(line.lotId).trim(); });
      if (!lot || !isActive_(lot.ACTIVO)) throw new Error('Lote inexistente o inactivo: ' + line.lotId);
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!quantity || quantity < 1 || quantity > Number(lot.CANTIDAD_DISPONIBLE)) throw new Error('Stock insuficiente en lote ' + line.lotId);
      const product = products.find(function(item) { return item.PRODUCTO_ID === lot.PRODUCTO_ID; });
      const amount = quantity * unitPrice;
      total += amount;
      details.push({lot: lot, product: product, quantity: quantity, unitPrice: unitPrice, amount: amount});
    });

    const saleId = nextId_('VTA');
    const now = new Date();
    const seller = payload.sale.seller || 'maria';
    const paymentStatus = payload.sale.paymentStatus || 'ABONADO';
    const saleStatus = paymentStatus === 'ABONADO' ? 'Venta registrada' : 'Pendiente de pago';
    spreadsheet.getSheetByName(SHEETS.VENTAS).appendRow([saleId, now, seller, total, payload.sale.paymentMethod || 'Mercado Pago', paymentStatus, saleStatus, payload.sale.notes || '']);

    const detailSheet = spreadsheet.getSheetByName(SHEETS.DETALLE);
    const movementSheet = spreadsheet.getSheetByName(SHEETS.MOVIMIENTOS);
    details.forEach(function(detail) {
      detailSheet.appendRow([nextId_('DET'), saleId, detail.lot.LOTE_ID, detail.product.PRODUCTO_ID, detail.quantity, detail.unitPrice, detail.amount]);
      updateLotStock_(lotSheet, detail.lot.__row, Number(detail.lot.CANTIDAD_DISPONIBLE) - detail.quantity);
      movementSheet.appendRow([nextId_('MOV'), now, 'VENTA', detail.lot.LOTE_ID, detail.product.PRODUCTO_ID, -detail.quantity, saleId, seller]);
    });
    return {ok: true, saleId: saleId, total: total, status: saleStatus};
  } finally {
    lock.releaseLock();
  }
}

function stockEntry_(payload) {
  const lot = payload.lot || {};
  const barcode = String(lot.barcode || '').trim();
  const description = String(lot.description || '').trim();
  const quantity = Number(lot.quantity);
  const cost = Number(lot.cost);
  const salePrice = Number(lot.salePrice);
  if (!barcode || !description || quantity < 1 || cost < 0 || salePrice < 0 || !lot.expiry) throw new Error('Faltan datos de la mercaderia.');
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const productSheet = spreadsheet.getSheetByName(SHEETS.PRODUCTOS);
  const existingProduct = readObjects_(productSheet).find(function(product) { return String(product.CODIGO_BARRAS) === barcode; });
  const productId = existingProduct ? existingProduct.PRODUCTO_ID : nextId_('PRD');
  if (existingProduct) {
    productSheet.getRange(existingProduct.__row, 3).setValue(description);
    productSheet.getRange(existingProduct.__row, 5).setValue(salePrice);
    productSheet.getRange(existingProduct.__row, 7).setValue(true);
  } else {
    productSheet.appendRow([productId, barcode, description, lot.category || 'Sin categoria', salePrice, Number(lot.minimum || 0), true]);
  }
  const lotId = nextId_('LOT');
  const lotSheet = spreadsheet.getSheetByName(SHEETS.LOTES);
  lotSheet.appendRow([lotId, productId, barcode, new Date(lot.expiry), quantity, quantity, cost, true]);
  spreadsheet.getSheetByName(SHEETS.MOVIMIENTOS).appendRow([nextId_('MOV'), new Date(), 'ENTRADA', lotId, productId, quantity, 'Carga de lote', payload.user || '']);
  return {ok: true, lotId: lotId, productId: productId};
}

function getInventory_() {
  const products = readObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.PRODUCTOS));
  const lots = readObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.LOTES));
  return products.filter(function(product) { return isActive_(product.ACTIVO); }).map(function(product) {
    const productLots = lots.filter(function(lot) { return String(lot.PRODUCTO_ID).trim() === String(product.PRODUCTO_ID).trim() && isActive_(lot.ACTIVO); });
    const stock = productLots.reduce(function(sum, lot) { return sum + Number(lot.CANTIDAD_DISPONIBLE || 0); }, 0);
    return {id: product.PRODUCTO_ID, barcode: product.CODIGO_BARRAS, name: product.NOMBRE, category: product.CATEGORIA, price: Number(product.PRECIO_VENTA), stock: stock, minimum: Number(product.STOCK_MINIMO), lots: productLots};
  });
}

function getSales_(limit) {
  const rows = readObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.VENTAS));
  return rows.slice(-(Number(limit) || 50)).reverse();
}

function getExpiries_() {
  const lots = readObjects_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.LOTES));
  return lots.filter(function(lot) { return isActive_(lot.ACTIVO) && Number(lot.CANTIDAD_DISPONIBLE) > 0; }).sort(function(a, b) { return new Date(a.VENCIMIENTO) - new Date(b.VENCIMIENTO); });
}

function getOrCreateSheet_(spreadsheet, name) { return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name); }
function ensureHeaders_(sheet, headers) { if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]); }
function formatSheet_(sheet) { sheet.setFrozenRows(1); sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#176b4b').setFontColor('#ffffff'); sheet.autoResizeColumns(1, Math.max(1, sheet.getLastColumn())); }
function readObjects_(sheet) { const values = sheet.getDataRange().getValues(); if (values.length < 2) return []; const headers = values[0]; return values.slice(1).filter(function(row) { return row.some(function(cell) { return cell !== ''; }); }).map(function(row, index) { const object = {__row: index + 2}; headers.forEach(function(header, column) { object[header] = row[column]; }); return object; }); }
function findRow_(sheetName, column, value) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const key = headers[column - 1];
  const rows = readObjects_(sheet);
  return rows.find(function(row) { return String(row[key]).toLowerCase() === String(value).toLowerCase(); });
}
function isActive_(value) { return value === true || String(value).trim().toUpperCase() === 'TRUE' || String(value).trim().toUpperCase() === 'SI' || String(value).trim() === '1'; }
function updateLotStock_(sheet, row, stock) { const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; sheet.getRange(row, headers.indexOf('CANTIDAD_DISPONIBLE') + 1).setValue(stock); }
function nextId_(prefix) { return prefix + '-' + Utilities.getUuid().slice(0, 8).toUpperCase(); }
function createToken_() { return Utilities.getUuid().replace(/-/g, ''); }
function authorize_(token) { const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN'); if (!expected || token !== expected) throw new Error('Token API invalido.'); }
function sha256_(value) { const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8); return digest.map(function(byte) { return ('0' + (byte < 0 ? byte + 256 : byte).toString(16)).slice(-2); }).join(''); }
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data, dateReplacer_())).setMimeType(ContentService.MimeType.JSON); }
function dateReplacer_() { return function(key, value) { return value instanceof Date ? value.toISOString() : value; }; }
