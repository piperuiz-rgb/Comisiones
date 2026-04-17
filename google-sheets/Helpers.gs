// ============================================================
// Helpers.gs — Utilidades y acceso a datos de Google Sheets
// ============================================================

var SHEET_NAMES = {
  SHOWROOMS:    'Showrooms',
  CLIENTES:     'Clientes',
  PEDIDOS:      'Pedidos',
  FACTURAS:     'Facturas',
  COBROS:       'Cobros',
  LIQUIDACIONES:'Liquidaciones',
  PARAMS:       'Informe_Parametros',
  RESUMEN:      'Informe_Resumen',
  DETALLE:      'Informe_Detalle',
  HISTORICO:    'Historico_Informes',
  TEMP:         'TEMP_Import'
};

// ---- Lectura de datos ----

function getSheetData(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la hoja: ' + sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1)
    .filter(function(row) { return row[0] !== '' && row[0] !== null; })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
}

function cargarTodosLosDatos() {
  return {
    showrooms:  getSheetData(SHEET_NAMES.SHOWROOMS),
    clientes:   getSheetData(SHEET_NAMES.CLIENTES),
    facturas:   getSheetData(SHEET_NAMES.FACTURAS),
    cobros:     getSheetData(SHEET_NAMES.COBROS)
  };
}

function leerParametrosInforme() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.PARAMS);
  if (!sheet) throw new Error('No se encontró la hoja: ' + SHEET_NAMES.PARAMS);
  return {
    fechaInicio:     sheet.getRange('C2').getValue(),
    fechaFin:        sheet.getRange('C3').getValue(),
    showroomNombre:  sheet.getRange('C4').getValue() || null
  };
}

function agregarHistoricoInforme(resumen) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.HISTORICO);
  if (!sheet) return;
  sheet.appendRow([
    new Date(),
    resumen.periodoInicio,
    resumen.periodoFin,
    resumen.showroomFiltro || 'Todos',
    resumen.totalEURFacturado,
    resumen.totalEURComision,
    resumen.totalUSDFacturado,
    resumen.totalUSDComision,
    resumen.numFacturas
  ]);
}

// ---- Escritura de datos ----

function escribirSheetData(sheetName, registros) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la hoja: ' + sheetName);

  var encabezados = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var filas = registros.map(function(r) {
    return encabezados.map(function(h) { return r[h] !== undefined ? r[h] : ''; });
  });

  // Borrar filas de datos (mantener encabezados)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }

  if (filas.length > 0) {
    sheet.getRange(2, 1, filas.length, encabezados.length).setValues(filas);
  }
}

// ---- Utilidades de fecha ----

// Normaliza cualquier valor a string 'yyyy-MM-dd'. Crítico: Apps Script devuelve
// objetos Date desde las celdas, no strings.
function toDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  // Soportar formatos dd/MM/yyyy y dd-MM-yyyy además de yyyy-MM-dd
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)) {
    var parts = s.split(/[\/\-]/);
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }
  return s.substring(0, 10);
}

function fechaEnRango(fechaStr, inicioStr, finStr) {
  if (!fechaStr || !inicioStr || !finStr) return false;
  return fechaStr >= inicioStr && fechaStr <= finStr;
}

// ---- Utilidades numéricas ----

function redondear2(valor) {
  return Math.round(valor * 100) / 100;
}

// ---- Utilidades de lookup ----

function buildMap(arr, keyField) {
  var map = {};
  arr.forEach(function(item) {
    var k = String(item[keyField] || '').trim();
    if (k) map[k] = item;
  });
  return map;
}

function buildMapCI(arr, keyField) {
  // Case-insensitive map
  var map = {};
  arr.forEach(function(item) {
    var k = String(item[keyField] || '').trim().toLowerCase();
    if (k) map[k] = item;
  });
  return map;
}

function groupBy(arr, keyField) {
  var map = {};
  arr.forEach(function(item) {
    var k = String(item[keyField] || '').trim();
    if (!map[k]) map[k] = [];
    map[k].push(item);
  });
  return map;
}

function splitRefs(str) {
  return String(str || '').split(',').map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

// ---- Generador de ID ----

function generarId() {
  return Utilities.getUuid().replace(/-/g, '').substring(0, 12);
}

// ---- Formateo de números ----

function formatMoneda(valor, moneda) {
  var abs = Math.abs(valor).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  abs = abs.replace('.', 'TEMP').replace(/\./g, ',').replace('TEMP', '.');
  return (valor < 0 ? '-' : '') + (moneda === 'USD' ? '$' + abs : abs + ' €');
}
