// ============================================================
// EstadoCredito.gs — Actualización de decisión de crédito Hilldun
//
// Lee los archivos de credit status (XLS/XLSX) de las carpetas
// BASE DE DATOS/EURO y BASE DE DATOS/DOLAR, extrae la columna
// "decision" por número de PO ("ponumber") y actualiza la columna
// Hilldun_Decision en la pestaña Pedidos del sheet de Comisiones.
//
// Matching: ponumber (Hilldun) ↔ Referencia_Cliente (Comisiones Pedidos)
// Se prueba coincidencia exacta y, si no, por el último token del PO
// (p.ej. "PO JOOR CRIB363" → busca "CRIB363" en el mapa).
//
// Si hay varias entradas para el mismo ponumber (distintos archivos),
// se conserva la de fecha "start" más reciente.
// ============================================================

function actualizarDecisionCredito() {
  var tiempoInicio = new Date().getTime();
  var LIMITE_MS    = 4 * 60 * 1000;

  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(HILLDUN_PROP.CONFIGURADO)) {
    ui.alert('Sin configurar', 'Ejecuta primero: Hilldun → ⚙️ Configurar', ui.ButtonSet.OK);
    return;
  }

  var comisionesId = props.getProperty(HILLDUN_PROP.COMISIONES_ID);
  if (!comisionesId) {
    ui.alert(
      'Sin configurar',
      'Primero configura el enlace con la hoja Comisiones:\nHilldun → 🔗 Configurar enlace Comisiones',
      ui.ButtonSet.OK
    );
    return;
  }

  if (typeof Drive === 'undefined') {
    ui.alert(
      '⚠️ Drive API no activada',
      'Este script necesita el servicio avanzado "Drive API".\n\n'
      + '1. Abre el editor de Apps Script\n'
      + '2. Servicios → Drive API → Añadir\n'
      + '3. Guarda y vuelve a ejecutar',
      ui.ButtonSet.OK
    );
    return;
  }

  // ---- Leer archivos de credit status y extraer ponumber → decision ----

  var decisionMap   = {}; // clave (PO en mayúsculas) → { decision, start }
  var errores       = [];
  var resumenArchivos = [];

  [
    [HILLDUN_PROP.EURO_ID, 'EUR'],
    [HILLDUN_PROP.DOLAR_ID, 'USD']
  ].forEach(function(par) {
    var carpetaId = props.getProperty(par[0]);
    var moneda    = par[1];
    if (!carpetaId) return;

    var carpeta;
    try { carpeta = DriveApp.getFolderById(carpetaId); }
    catch(e) { errores.push('❌ Carpeta ' + moneda + ': ' + e.message); return; }

    var archivos = _obtenerExcels(carpeta);
    resumenArchivos.push(moneda + ': ' + archivos.length + ' archivo(s)');

    for (var ai = 0; ai < archivos.length; ai++) {
      if (new Date().getTime() - tiempoInicio > LIMITE_MS) {
        errores.push('⏱ ' + moneda + ': tiempo agotado — ejecuta de nuevo para continuar');
        break;
      }
      var archivo = archivos[ai];
      try {
        var filas = _leerExcelDesdeDrive(archivo.getId());
        if (!filas || filas.length < 2) continue;
        _extraerDecisiones(filas, decisionMap);
      } catch(e) {
        errores.push('❌ ' + archivo.getName() + ': ' + e.message);
      }
    }
  });

  var totalPOs = Object.keys(decisionMap).length;

  if (totalPOs === 0) {
    var msg = 'No se encontraron datos de decisión de crédito.\n\n'
      + 'Archivos en Drive:\n  ' + resumenArchivos.join('\n  ');
    if (errores.length > 0) msg += '\n\nErrores:\n' + errores.join('\n');
    ui.alert('Sin resultados', msg, ui.ButtonSet.OK);
    return;
  }

  // ---- Actualizar Pedidos en Comisiones ----

  var comisionesSs;
  try { comisionesSs = SpreadsheetApp.openById(comisionesId); }
  catch(e) {
    ui.alert('Error al abrir Comisiones', 'Error: ' + e.message, ui.ButtonSet.OK);
    return;
  }

  var pedidosSheet = comisionesSs.getSheetByName('Pedidos');
  if (!pedidosSheet) {
    ui.alert('Error', 'No se encontró la pestaña "Pedidos" en Comisiones.', ui.ButtonSet.OK);
    return;
  }

  var decCol = _asegurarColumnaDecision(pedidosSheet); // 1-based

  var lastRow = pedidosSheet.getLastRow();
  if (lastRow < 2) {
    ui.alert('Sin pedidos', 'La pestaña Pedidos está vacía.', ui.ButtonSet.OK);
    return;
  }

  // Localizar columna Referencia_Cliente
  var numCols = pedidosSheet.getLastColumn();
  var headers = pedidosSheet.getRange(1, 1, 1, numCols).getValues()[0]
    .map(function(h) { return String(h || '').trim(); });
  var refCol = headers.indexOf('Referencia_Cliente') + 1; // 1-based
  if (refCol === 0) {
    ui.alert('Error', 'No se encontró la columna Referencia_Cliente en Pedidos.', ui.ButtonSet.OK);
    return;
  }

  // Leer todas las referencias y escribir decisiones en bloque
  var allRefs   = pedidosSheet.getRange(2, refCol, lastRow - 1, 1).getValues();
  var decValues = allRefs.map(function(row) {
    return [_buscarDecision(String(row[0] || '').trim(), decisionMap)];
  });
  pedidosSheet.getRange(2, decCol, lastRow - 1, 1).setValues(decValues);

  var actualizados = decValues.filter(function(r) { return r[0] !== ''; }).length;

  var msg = '✅ ' + actualizados + ' pedido(s) con decisión actualizada\n'
    + '(de ' + (lastRow - 1) + ' filas en total)\n\n'
    + 'POs encontradas en archivos Hilldun: ' + totalPOs + '\n'
    + 'Archivos: ' + resumenArchivos.join(' · ');

  if (errores.length > 0) {
    msg += '\n\nAvisos:\n' + errores.slice(0, 5).join('\n');
  }

  ui.alert('🔍 Decisión de crédito actualizada', msg, ui.ButtonSet.OK);
}

// ---- Parsear ponumber + decision de un archivo de credit status ----

function _extraerDecisiones(filas, decisionMap) {
  // Localizar fila de cabecera
  var headerIdx = -1;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0] || '').toLowerCase().trim() === 'debtor') {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return;

  // Mapa de índices por nombre de cabecera (case-insensitive)
  var hdrs = filas[headerIdx];
  var idx  = {};
  hdrs.forEach(function(h, i) { idx[String(h || '').trim().toLowerCase()] = i; });

  var poIdx  = idx['ponumber'];
  var decIdx = idx['decision'];
  var stIdx  = idx['start'];

  if (poIdx === undefined || decIdx === undefined) return;

  for (var r = headerIdx + 1; r < filas.length; r++) {
    var f  = filas[r];
    var po = String(f[poIdx]  || '').trim().toUpperCase();
    var dc = String(f[decIdx] || '').trim();
    if (!po || !dc) continue;

    var st       = (stIdx !== undefined && typeof f[stIdx] === 'number') ? f[stIdx] : 0;
    var existing = decisionMap[po];
    if (!existing || st > existing.start) {
      decisionMap[po] = { decision: dc, start: st };
    }
  }
}

// ---- Asegurar que la columna Hilldun_Decision existe en la hoja ----
// Devuelve el número de columna 1-based.

function _asegurarColumnaDecision(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
        .map(function(h) { return String(h || '').trim(); })
    : [];

  var idx = headers.indexOf('Hilldun_Decision');
  if (idx !== -1) return idx + 1;

  var newCol = lastCol + 1;
  sheet.getRange(1, newCol)
    .setValue('Hilldun_Decision')
    .setBackground('#1a1a2e')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.setColumnWidth(newCol, 120);
  return newCol;
}

// ---- Buscar decisión por Referencia_Cliente ----

function _buscarDecision(refCliente, decisionMap) {
  if (!refCliente) return '';
  var s = refCliente.trim().toUpperCase();
  if (!s) return '';

  // 1. Coincidencia exacta
  if (decisionMap[s]) return decisionMap[s].decision;

  // 2. Coincidencia por el último token significativo
  //    (p.ej. "PO JOOR CRIB363" → busca "CRIB363")
  var tokens = s.split(/\s+/).filter(function(t) { return t.length >= 3; });
  if (tokens.length > 1) {
    var ultimo = tokens[tokens.length - 1];
    if (decisionMap[ultimo]) return decisionMap[ultimo].decision;
  }

  // 3. Cualquier token del ref que sea clave exacta en el mapa
  for (var ti = 0; ti < tokens.length; ti++) {
    if (decisionMap[tokens[ti]]) return decisionMap[tokens[ti]].decision;
  }

  return '';
}
