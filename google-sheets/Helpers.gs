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

// ============================================================
// Resumen de pedidos — añade sub-filas de cobros y facturas
// bajo cada fila de pedido, y actualiza las columnas derivadas
// Total_Cobrado y Facturas_Ref.
//
// Las sub-filas tienen col0 vacío, por lo que getSheetData()
// y _upsertEnSheet() las ignoran automáticamente.
// Se llama al importar Pedidos, Facturas o Cobros.
// ============================================================

var PEDIDOS_NUM_COLS = 11; // 9 originales + Total_Cobrado + Facturas_Ref

function actualizarResumenPedidos() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.PEDIDOS);
  if (!sheet || sheet.getLastRow() < 2) return;

  // Asegurar que las nuevas cabeceras existen
  var maxSheetCols = Math.max(sheet.getLastColumn(), PEDIDOS_NUM_COLS);
  var headerRow = sheet.getRange(1, 1, 1, maxSheetCols).getValues()[0];
  if (!headerRow[9]) {
    sheet.getRange(1, 10).setValue('Total_Cobrado')
         .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setColumnWidth(10, 110);
  }
  if (!headerRow[10]) {
    sheet.getRange(1, 11).setValue('Facturas_Ref')
         .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
    sheet.setColumnWidth(11, 200);
  }

  // Datos relacionados (getSheetData filtra sub-filas por col0 vacío)
  var cobros       = getSheetData(SHEET_NAMES.COBROS);
  var facturasNorm = getSheetData(SHEET_NAMES.FACTURAS).filter(function(f) {
    return !(f.Es_Abono === true || f.Es_Abono === 'TRUE' || f.Es_Abono === 'true');
  });

  var cobrosDirectosPorPedido = groupBy(
    cobros.filter(function(c) { return !String(c.Factura_Ref || '').trim(); }),
    'Pedido_Ref'
  );
  var cobrosParaFactura  = groupBy(cobros, 'Factura_Ref');
  var facturasParaPedido = groupBy(facturasNorm, 'Pedidos_Ref');

  // Leer todas las filas de la hoja (include sub-filas existentes)
  var lastRow = sheet.getLastRow();
  var allData = sheet.getRange(2, 1, lastRow - 1, maxSheetCols).getValues();

  // Solo filas principales (col0 no vacío)
  var filasPrincipales = allData.filter(function(row) {
    return String(row[0] || '').trim() !== '';
  });
  if (filasPrincipales.length === 0) return;

  // Construir nuevo contenido: principales + sub-filas
  var resultado = [];

  filasPrincipales.forEach(function(pedidoRow) {
    var numPedido = String(pedidoRow[0] || '').trim();

    var facturasDelPedido = (facturasParaPedido[numPedido] || []).slice()
      .sort(function(a, b) { return toDateStr(a.Fecha) < toDateStr(b.Fecha) ? -1 : 1; });

    var cobrosDirectos = (cobrosDirectosPorPedido[numPedido] || []).slice()
      .sort(function(a, b) { return toDateStr(a.Fecha) < toDateStr(b.Fecha) ? -1 : 1; });

    // Total cobrado: anticipos directos + cobros sobre facturas del pedido
    var totalCobrado = 0;
    cobrosDirectos.forEach(function(c) { totalCobrado += parseFloat(c.Importe) || 0; });
    facturasDelPedido.forEach(function(f) {
      (cobrosParaFactura[String(f.Numero || '').trim()] || [])
        .forEach(function(c) { totalCobrado += parseFloat(c.Importe) || 0; });
    });
    totalCobrado = redondear2(totalCobrado);

    var facturasRef = facturasDelPedido.map(function(f) { return f.Numero; }).join(', ');

    // Fila principal con columnas derivadas
    resultado.push({ tipo: 'principal', fila: [
      pedidoRow[0] || '', pedidoRow[1] || '', pedidoRow[2] || '', pedidoRow[3] || '',
      pedidoRow[4] || '', pedidoRow[5] || '', pedidoRow[6] || '', pedidoRow[7] || '',
      pedidoRow[8] || '',
      totalCobrado !== 0 ? totalCobrado : '',
      facturasRef
    ]});

    // Sub-filas: cobros directos (anticipos sin factura)
    cobrosDirectos.forEach(function(c) {
      resultado.push({ tipo: 'cobro', fila: _subfilaCobro(c) });
    });

    // Sub-filas: cada factura y sus cobros
    facturasDelPedido.forEach(function(factura) {
      resultado.push({ tipo: 'factura', fila: _subfilaFactura(factura) });
      (cobrosParaFactura[String(factura.Numero || '').trim()] || []).slice()
        .sort(function(a, b) { return toDateStr(a.Fecha) < toDateStr(b.Fecha) ? -1 : 1; })
        .forEach(function(c) {
          resultado.push({ tipo: 'cobro', fila: _subfilaCobro(c) });
        });
    });
  });

  // Asegurar que la hoja tiene filas suficientes
  var totalFilas = resultado.length;
  if (totalFilas + 1 > sheet.getMaxRows()) {
    sheet.insertRowsAfter(sheet.getMaxRows(), totalFilas + 1 - sheet.getMaxRows());
  }

  // Limpiar contenido y formato de filas de datos
  sheet.getRange(2, 1, lastRow - 1, maxSheetCols).clearContent().clearFormat();

  // Escribir todo en bloque
  var matrix = resultado.map(function(item) { return item.fila; });
  sheet.getRange(2, 1, totalFilas, PEDIDOS_NUM_COLS).setValues(matrix);

  // Eliminar filas sobrantes
  if (lastRow - 1 > totalFilas) {
    sheet.deleteRows(totalFilas + 2, lastRow - 1 - totalFilas);
  }

  // Formato en bloque con getRangeList (una sola llamada por tipo)
  var cobroA1 = [], facturaA1 = [], importeA1 = [], totalA1 = [];
  resultado.forEach(function(item, i) {
    var r = i + 2;
    if (item.tipo === 'cobro')    cobroA1.push('A' + r + ':K' + r);
    if (item.tipo === 'factura')  facturaA1.push('A' + r + ':K' + r);
    importeA1.push('G' + r);
    if (item.tipo === 'principal') totalA1.push('J' + r);
  });

  if (cobroA1.length)   sheet.getRangeList(cobroA1).setBackground('#f0f7f0').setFontColor('#2e7d32').setFontSize(9);
  if (facturaA1.length) sheet.getRangeList(facturaA1).setBackground('#e8f0fe').setFontColor('#1a237e').setFontSize(9);
  if (importeA1.length) sheet.getRangeList(importeA1).setNumberFormat('#,##0.00');
  if (totalA1.length)   sheet.getRangeList(totalA1).setNumberFormat('#,##0.00');
}

function _subfilaCobro(cobro) {
  var f = ['', '', '', '', '', '', '', '', '', '', ''];
  f[1] = '  ↳ Cobro';
  f[2] = String(cobro.ID_Odoo || '');
  f[4] = toDateStr(cobro.Fecha);
  f[5] = String(cobro.Moneda || 'EUR');
  f[6] = parseFloat(cobro.Importe) || 0;
  return f;
}

function _subfilaFactura(factura) {
  var f = ['', '', '', '', '', '', '', '', '', '', ''];
  f[1] = '  ↳ Factura';
  f[2] = String(factura.Numero || '');
  f[4] = toDateStr(factura.Fecha);
  f[5] = String(factura.Moneda || 'EUR');
  f[6] = parseFloat(factura.Importe) || 0;
  f[7] = toDateStr(factura.Vencimiento);
  return f;
}

// Migración: añade las columnas nuevas de Facturas si no existen todavía.
// Si Ultima_Actualizacion está al final, inserta antes de ella; si no, añade al final.
function _asegurarColumnasFacturas() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.FACTURAS);
  if (!sheet || sheet.getLastColumn() < 1) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h || '').trim(); });

  var needed  = ['Tracking_DHL', 'Tracking_Seguimiento', 'Tracking_Envio', 'Modo_Pago'];
  var missing = needed.filter(function(h) { return headers.indexOf(h) === -1; });
  if (missing.length === 0) return;

  var ultimaIdx = headers.indexOf('Ultima_Actualizacion');
  var ultimaEsUltima = ultimaIdx !== -1 && ultimaIdx === headers.length - 1;

  if (ultimaEsUltima) {
    // Insertar antes de Ultima_Actualizacion (1-based col)
    var insertCol = ultimaIdx + 1;
    sheet.insertColumnsBefore(insertCol, missing.length);
    missing.forEach(function(nombre, i) {
      sheet.getRange(1, insertCol + i)
        .setValue(nombre)
        .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setColumnWidth(insertCol + i, nombre === 'Modo_Pago' ? 120 : 150);
    });
  } else {
    // Añadir al final
    missing.forEach(function(nombre) {
      var col = sheet.getLastColumn() + 1;
      sheet.getRange(1, col)
        .setValue(nombre)
        .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold');
      sheet.setColumnWidth(col, nombre === 'Modo_Pago' ? 120 : 150);
    });
  }
}
