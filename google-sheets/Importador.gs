// ============================================================
// Importador.gs — Importación de datos desde Excel via TEMP_Import
//
// Flujo de uso:
// 1. Abre tu Excel, selecciona todos los datos (incluyendo cabeceras), copia.
// 2. Ve a la hoja TEMP_Import y pega (Ctrl+V).
// 3. Ejecuta el importador desde el menú Comisiones CRI → Importar datos → ...
// 4. La hoja TEMP_Import se limpia automáticamente al terminar.
// ============================================================

// ---- Showrooms ----
// Columnas Excel esperadas: Nombre | Comision_Pct | Idioma

function importarShowrooms() {
  var filas = _leerTemp();
  if (!filas) return;

  var existentes = getSheetData(SHEET_NAMES.SHOWROOMS);
  var nombresExistentes = {};
  existentes.forEach(function(s) { nombresExistentes[String(s.Nombre || '').toLowerCase()] = true; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.SHOWROOMS);
  var importados = 0;
  var errores = [];

  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    var nombre = String(fila[0] || '').trim();
    if (!nombre) continue;
    if (nombresExistentes[nombre.toLowerCase()]) {
      errores.push('Fila ' + (i + 1) + ': showroom "' + nombre + '" ya existe, omitido.');
      continue;
    }
    var comisionPct = parseFloat(fila[1]) || 0;
    var idioma = String(fila[2] || 'es').trim().toLowerCase();
    sheet.appendRow([generarId(), nombre, comisionPct, idioma, new Date()]);
    importados++;
  }

  _limpiarTemp();
  _mostrarResultado('Showrooms', importados, errores);
}

// ---- Clientes ----
// Columnas Excel esperadas: Nombre | Showroom_Nombre | Email | Telefono

function importarClientes() {
  var filas = _leerTemp();
  if (!filas) return;

  var existentes = getSheetData(SHEET_NAMES.CLIENTES);
  var nombresExistentes = {};
  existentes.forEach(function(c) { nombresExistentes[String(c.Nombre || '').toLowerCase()] = true; });

  var showrooms = getSheetData(SHEET_NAMES.SHOWROOMS);
  var showroomNombres = {};
  showrooms.forEach(function(s) { showroomNombres[String(s.Nombre || '')] = true; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.CLIENTES);
  var importados = 0;
  var errores = [];

  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    var nombre = String(fila[0] || '').trim();
    if (!nombre) continue;
    if (nombresExistentes[nombre.toLowerCase()]) {
      errores.push('Fila ' + (i + 1) + ': cliente "' + nombre + '" ya existe, omitido.');
      continue;
    }
    var showroomNombre = String(fila[1] || '').trim();
    if (!showroomNombres[showroomNombre]) {
      errores.push('Fila ' + (i + 1) + ': cliente "' + nombre + '" — showroom "' + showroomNombre + '" no encontrado.');
      continue;
    }
    sheet.appendRow([generarId(), nombre, showroomNombre, String(fila[2] || ''), String(fila[3] || ''), new Date()]);
    importados++;
  }

  _limpiarTemp();
  _mostrarResultado('Clientes', importados, errores);
}

// ---- Pedidos ----
// Columnas Excel esperadas: Numero | Cliente_Nombre | Fecha | Moneda | Importe

function importarPedidos() {
  var filas = _leerTemp();
  if (!filas) return;

  var existentes = getSheetData(SHEET_NAMES.PEDIDOS);
  var numerosExistentes = {};
  existentes.forEach(function(p) { numerosExistentes[String(p.Numero || '').toLowerCase()] = true; });

  var clientes = getSheetData(SHEET_NAMES.CLIENTES);
  var clienteNombres = {};
  clientes.forEach(function(c) { clienteNombres[String(c.Nombre || '')] = true; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.PEDIDOS);
  var importados = 0;
  var errores = [];

  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    var numero = String(fila[0] || '').trim();
    if (!numero) continue;
    if (numerosExistentes[numero.toLowerCase()]) {
      errores.push('Fila ' + (i + 1) + ': pedido "' + numero + '" ya existe, omitido.');
      continue;
    }
    var clienteNombre = String(fila[1] || '').trim();
    if (!clienteNombres[clienteNombre]) {
      errores.push('Fila ' + (i + 1) + ': pedido "' + numero + '" — cliente "' + clienteNombre + '" no encontrado.');
      continue;
    }
    var fecha = _parseFecha(fila[2]);
    var moneda = String(fila[3] || 'EUR').trim().toUpperCase();
    var importe = parseFloat(fila[4]) || 0;
    sheet.appendRow([generarId(), numero, clienteNombre, fecha, moneda, importe, new Date()]);
    importados++;
  }

  _limpiarTemp();
  _mostrarResultado('Pedidos', importados, errores);
}

// ---- Facturas ----
// Columnas Excel esperadas:
// Numero | Cliente_Nombre | Pedidos_Ref | Fecha | Vencimiento | Moneda | Importe | Es_Abono | Facturas_Abonadas | Notas
// Es_Abono: TRUE/FALSE o 1/0 o "sí"/"no"
// Si Es_Abono=TRUE y el importe es positivo, se convierte a negativo automáticamente.

function importarFacturas() {
  var filas = _leerTemp();
  if (!filas) return;

  var existentes = getSheetData(SHEET_NAMES.FACTURAS);
  var numerosExistentes = {};
  existentes.forEach(function(f) { numerosExistentes[String(f.Numero || '').toLowerCase()] = true; });

  var clientes = getSheetData(SHEET_NAMES.CLIENTES);
  var clienteNombres = {};
  clientes.forEach(function(c) { clienteNombres[String(c.Nombre || '')] = true; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.FACTURAS);
  var importados = 0;
  var errores = [];

  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    var numero = String(fila[0] || '').trim();
    if (!numero) continue;
    if (numerosExistentes[numero.toLowerCase()]) {
      errores.push('Fila ' + (i + 1) + ': factura "' + numero + '" ya existe, omitida.');
      continue;
    }
    var clienteNombre = String(fila[1] || '').trim();
    if (!clienteNombres[clienteNombre]) {
      errores.push('Fila ' + (i + 1) + ': factura "' + numero + '" — cliente "' + clienteNombre + '" no encontrado.');
      continue;
    }
    var pedidosRef      = String(fila[2] || '').trim();
    var fecha           = _parseFecha(fila[3]);
    var vencimiento     = _parseFecha(fila[4]);
    var moneda          = String(fila[5] || 'EUR').trim().toUpperCase();
    var importe         = parseFloat(fila[6]) || 0;
    var esAbonoRaw      = fila[7];
    var esAbono         = _parseBool(esAbonoRaw);
    var facturasAbonadas= String(fila[8] || '').trim();
    var notas           = String(fila[9] || '').trim();

    // Si es abono y el importe viene positivo, lo convertimos a negativo
    if (esAbono && importe > 0) importe = -importe;

    sheet.appendRow([generarId(), numero, clienteNombre, pedidosRef, fecha, vencimiento, moneda, importe, esAbono, facturasAbonadas, notas, new Date()]);
    importados++;
  }

  _limpiarTemp();
  _mostrarResultado('Facturas', importados, errores);
}

// ---- Cobros ----
// Columnas Excel esperadas:
// Factura_Ref | Pedido_Ref | Fecha | Moneda | Importe | Es_Ajuste
// Factura_Ref o Pedido_Ref: uno de los dos debe estar relleno.

function importarCobros() {
  var filas = _leerTemp();
  if (!filas) return;

  var facturas = getSheetData(SHEET_NAMES.FACTURAS);
  var facturaNums = {};
  facturas.forEach(function(f) { facturaNums[String(f.Numero || '').toLowerCase()] = true; });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.COBROS);
  var importados = 0;
  var errores = [];

  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    var facturaRef = String(fila[0] || '').trim();
    var pedidoRef  = String(fila[1] || '').trim();
    if (!facturaRef && !pedidoRef) continue;

    var fecha    = _parseFecha(fila[2]);
    var moneda   = String(fila[3] || 'EUR').trim().toUpperCase();
    var importe  = parseFloat(fila[4]) || 0;
    var esAjuste = _parseBool(fila[5]);

    if (importe <= 0) {
      errores.push('Fila ' + (i + 1) + ': importe debe ser positivo (' + importe + '), omitido.');
      continue;
    }

    if (facturaRef && !facturaNums[facturaRef.toLowerCase()]) {
      errores.push('Fila ' + (i + 1) + ': factura "' + facturaRef + '" no encontrada (se importará igualmente).');
    }

    sheet.appendRow([generarId(), facturaRef, pedidoRef, fecha, moneda, importe, esAjuste, new Date()]);
    importados++;
  }

  _limpiarTemp();
  _mostrarResultado('Cobros', importados, errores);
}

// ---- Utilidades privadas ----

function _leerTemp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.TEMP);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      'Hoja no encontrada',
      'No existe la hoja "' + SHEET_NAMES.TEMP + '". Ejecuta Comisiones CRI → Crear estructura de hojas primero.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2 || (data[0][0] !== '' && data.length === 1)) {
    SpreadsheetApp.getUi().alert(
      'Sin datos',
      'La hoja "' + SHEET_NAMES.TEMP + '" está vacía o solo tiene la cabecera.\n\nCopia los datos de Excel (incluyendo fila de cabeceras) y pégalos en esa hoja.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  return data;
}

function _limpiarTemp() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.TEMP);
  if (sheet) sheet.clearContents();
}

function _mostrarResultado(entidad, importados, errores) {
  var msg = '✅ ' + importados + ' ' + entidad.toLowerCase() + ' importados correctamente.';
  if (errores.length > 0) {
    msg += '\n\n⚠️ ' + errores.length + ' advertencia(s):\n' + errores.slice(0, 10).join('\n');
    if (errores.length > 10) msg += '\n... y ' + (errores.length - 10) + ' más.';
  }
  SpreadsheetApp.getUi().alert('Importación completada', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function _parseFecha(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(val).trim();
  // dd/MM/yyyy o dd-MM-yyyy → yyyy-MM-dd
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)) {
    var p = s.split(/[\/\-]/);
    return p[2] + '-' + p[1] + '-' + p[0];
  }
  return s.substring(0, 10);
}

function _parseBool(val) {
  if (val === true || val === 1) return true;
  var s = String(val || '').trim().toLowerCase();
  return s === 'true' || s === 'sí' || s === 'si' || s === '1' || s === 'yes';
}
