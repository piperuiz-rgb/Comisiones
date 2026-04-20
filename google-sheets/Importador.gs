// ============================================================
// Importador.gs — Importación upsert desde exportación Odoo
//
// Soporta dos orígenes de datos:
//   A) TEMP_Import: copia y pega desde Excel → ejecuta desde el menú
//   B) Drive:       sube el Excel a la carpeta de Drive → se procesa automáticamente
//
// El motor de upsert es el mismo en ambos casos.
//
// Odoo: exportar con "Compatible con importación" → incluye columna "id" en col 0.
//
// COLUMNAS ESPERADAS POR ENTIDAD (en el Excel de Odoo):
//
//   SHOWROOMS:  id | name | x_comision_pct | lang
//   CLIENTES:   id | name | parent_id/name | email | phone
//   PEDIDOS:    id | name | partner_id/name | date_order | currency_id/name | amount_total
//   FACTURAS:   id | name | partner_id/name | invoice_origin | invoice_date |
//               invoice_date_due | currency_id/name | amount_total | move_type |
//               reversed_entry_id/name | narration
//               (move_type: 'out_invoice'=factura, 'out_refund'=abono)
//   COBROS:     id | name | reconciled_invoice_ids/name | sale_id/name |
//               date | currency_id/name | amount | is_matched
// ============================================================

// ---- Puntos de entrada desde el menú (TEMP_Import) ----

function importarShowrooms() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarShowrooms(filas);
  _limpiarTemp();
  _mostrarResultado('Showrooms', resultado);
}

function importarClientes() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarClientes(filas);
  _limpiarTemp();
  _mostrarResultado('Clientes', resultado);
}

function importarPedidos() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarPedidos(filas);
  _limpiarTemp();
  _mostrarResultado('Pedidos', resultado);
}

function importarFacturas() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarFacturas(filas);
  _limpiarTemp();
  _mostrarResultado('Facturas', resultado);
}

function importarCobros() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarCobros(filas);
  _limpiarTemp();
  _mostrarResultado('Cobros', resultado);
}

// ============================================================
// Procesadores por entidad — llamables desde menú O desde Drive
// Reciben el array de filas (fila 0 = cabeceras, fila 1+ = datos)
// Devuelven { nuevos, actualizados, sinCambios, omitidos, errores[] }
// ============================================================

function _procesarShowrooms(filas) {
  return _upsertEnSheet(
    SHEET_NAMES.SHOWROOMS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      return [
        String(f[0] || '').trim(),
        String(f[1] || '').trim(),
        parseFloat(f[2]) || 0,
        String(f[3] || 'es').trim().toLowerCase(),
        new Date()
      ];
    },
    function(f) { return !String(f[1] || '').trim(); }
  );
}

function _procesarClientes(filas) {
  var showrooms = getSheetData(SHEET_NAMES.SHOWROOMS);
  var showroomNombres = {};
  showrooms.forEach(function(s) { showroomNombres[String(s.Nombre || '')] = true; });

  var errores = [];

  // Expandir filas con múltiples showrooms (separados por coma en agent_ids/name).
  // Ejemplo: "(Showroom A) Empresa A,(Showroom B) Empresa B"
  // → dos filas: misma cliente, distinto showroom.
  // El ID de la segunda fila lleva sufijo "_sr2", "_sr3"... para que el upsert
  // las trate como registros independientes.
  var filasExpandidas = [filas[0]]; // conservar fila de cabeceras
  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    if (!String(fila[1] || '').trim()) continue;

    var agentField = String(fila[2] || '').trim();
    // Partir por coma SOLO fuera de paréntesis para no romper "(Nombre, con coma) Empresa"
    var agentes = _splitAgentes(agentField);

    if (agentes.length <= 1) {
      filasExpandidas.push(fila);
    } else {
      agentes.forEach(function(agente, idx) {
        var filaCopia  = fila.slice();
        filaCopia[0]   = String(fila[0]) + (idx === 0 ? '' : '_sr' + (idx + 1));
        filaCopia[2]   = agente;
        filasExpandidas.push(filaCopia);
      });
    }
  }

  var resultado = _upsertEnSheet(
    SHEET_NAMES.CLIENTES,
    filasExpandidas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      var showroomNombre = String(f[2] || '').trim();
      if (showroomNombre && !showroomNombres[showroomNombre]) {
        errores.push('Cliente "' + f[1] + '": showroom "' + showroomNombre + '" no encontrado en Showrooms.');
      }
      return [
        String(f[0] || '').trim(),
        String(f[1] || '').trim(),
        showroomNombre,
        String(f[3] || '').trim(),
        String(f[4] || '').trim(),
        new Date()
      ];
    },
    function(f) { return !String(f[1] || '').trim(); }
  );
  resultado.errores = errores;
  return resultado;
}

// Divide "Agent A,Agent B" respetando comas dentro de paréntesis.
// "(Showroom A) Emp A,(Showroom B) Emp B" → ["(Showroom A) Emp A", "(Showroom B) Emp B"]
function _splitAgentes(str) {
  var resultado = [];
  var actual = '';
  var nivel  = 0;
  for (var i = 0; i < str.length; i++) {
    var c = str[i];
    if      (c === '(') { nivel++; actual += c; }
    else if (c === ')') { nivel--; actual += c; }
    else if (c === ',' && nivel === 0) {
      var trim = actual.trim();
      if (trim) resultado.push(trim);
      actual = '';
    } else {
      actual += c;
    }
  }
  var trim = actual.trim();
  if (trim) resultado.push(trim);
  return resultado;
}

function _procesarPedidos(filas) {
  return _upsertEnSheet(
    SHEET_NAMES.PEDIDOS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      return [
        String(f[0] || '').trim(),
        String(f[1] || '').trim(),
        String(f[2] || '').trim(),
        _parseFecha(f[3]),
        String(f[4] || 'EUR').trim().toUpperCase(),
        parseFloat(f[5]) || 0,
        new Date()
      ];
    },
    function(f) { return !String(f[1] || '').trim(); }
  );
}

function _procesarFacturas(filas) {
  return _upsertEnSheet(
    SHEET_NAMES.FACTURAS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      var moveType = String(f[8] || '').trim().toLowerCase();
      var esAbono  = moveType === 'out_refund' || moveType === 'credit_note' ||
                     moveType === 'nota de crédito' || _parseBool(f[8]);

      var importe = parseFloat(f[7]) || 0;
      if (esAbono && importe > 0) importe = -importe;

      return [
        String(f[0]  || '').trim(),
        String(f[1]  || '').trim(),
        String(f[2]  || '').trim(),
        String(f[3]  || '').trim(),
        _parseFecha(f[4]),
        _parseFecha(f[5]),
        String(f[6]  || 'EUR').trim().toUpperCase(),
        importe,
        esAbono,
        String(f[9]  || '').trim(),
        String(f[10] || '').trim(),
        new Date()
      ];
    },
    function(f) { return !String(f[1] || '').trim(); }
  );
}

function _procesarCobros(filas) {
  var facturas = getSheetData(SHEET_NAMES.FACTURAS);
  var facturaNums = {};
  facturas.forEach(function(f) { facturaNums[String(f.Numero || '').toLowerCase()] = true; });

  var errores = [];
  var resultado = _upsertEnSheet(
    SHEET_NAMES.COBROS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      var facturaRef = String(f[2] || '').trim();
      var pedidoRef  = String(f[3] || '').trim();
      var importe    = parseFloat(f[6]) || 0;
      if (importe < 0) importe = Math.abs(importe);

      if (facturaRef && !facturaNums[facturaRef.toLowerCase()]) {
        errores.push('Cobro "' + f[1] + '": factura "' + facturaRef + '" no encontrada.');
      }
      return [
        String(f[0] || '').trim(),
        facturaRef,
        pedidoRef,
        _parseFecha(f[4]),
        String(f[5] || 'EUR').trim().toUpperCase(),
        importe,
        _parseBool(f[7]),
        new Date()
      ];
    },
    function(f) {
      return !String(f[2] || '').trim() && !String(f[3] || '').trim();
    }
  );
  resultado.errores = errores;
  return resultado;
}

// ============================================================
// Motor de upsert genérico
// ============================================================

function _upsertEnSheet(sheetName, filas, getIdFn, buildFila, skipFn) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la hoja: ' + sheetName);

  var numCols = sheet.getLastColumn() || 1;
  var lastRow = sheet.getLastRow();

  // Leer todos los datos existentes de una sola llamada a la API (rendimiento)
  var existingByIdOdoo = {};
  var existingValues   = {};

  if (lastRow > 1) {
    var allData = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    allData.forEach(function(row, i) {
      var id = String(row[0] || '').trim();
      if (id) {
        existingByIdOdoo[id] = i + 2;
        existingValues[id]   = row;
      }
    });
  }

  var nuevos = 0, actualizados = 0, sinCambios = 0, omitidos = 0;
  var filasNuevas = [];

  for (var i = 1; i < filas.length; i++) {
    var filaRaw = filas[i];
    if (skipFn && skipFn(filaRaw)) { omitidos++; continue; }

    var idOdoo = getIdFn(filaRaw);
    if (!idOdoo) { omitidos++; continue; }

    var nuevaFila = buildFila(filaRaw);

    if (existingByIdOdoo[idOdoo] !== undefined) {
      var existente  = existingValues[idOdoo];
      var hayCambios = false;
      // Comparar todos los campos excepto ID_Odoo (col 0) y Ultima_Actualizacion (última)
      for (var c = 1; c < nuevaFila.length - 1; c++) {
        var vNuevo = String(nuevaFila[c]  !== null && nuevaFila[c]  !== undefined ? nuevaFila[c]  : '').trim();
        var vActual= String(existente[c]  !== null && existente[c]  !== undefined ? existente[c]  : '').trim();
        if (vNuevo !== vActual) { hayCambios = true; break; }
      }
      if (hayCambios) {
        sheet.getRange(existingByIdOdoo[idOdoo], 1, 1, nuevaFila.length).setValues([nuevaFila]);
        actualizados++;
      } else {
        sinCambios++;
      }
    } else {
      filasNuevas.push(nuevaFila);
      nuevos++;
    }
  }

  // Insertar todos los nuevos de golpe
  if (filasNuevas.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, filasNuevas.length, filasNuevas[0].length)
         .setValues(filasNuevas);
  }

  return { nuevos: nuevos, actualizados: actualizados, sinCambios: sinCambios, omitidos: omitidos, errores: [] };
}

// ============================================================
// Utilidades privadas
// ============================================================

function _leerTemp() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.TEMP);
  if (!sheet) {
    SpreadsheetApp.getUi().alert(
      'Hoja no encontrada',
      'No existe la hoja "' + SHEET_NAMES.TEMP + '".\nEjecuta Comisiones CRI → Crear estructura de hojas primero.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    SpreadsheetApp.getUi().alert(
      'Sin datos',
      'La hoja "' + SHEET_NAMES.TEMP + '" está vacía.\n\nCopia el Excel de Odoo (con cabeceras) y pégalo en esa hoja.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  var primeraCol = String(data[0][0] || '').trim().toLowerCase();
  if (primeraCol !== 'id' && primeraCol !== 'id_odoo' && primeraCol !== 'external id') {
    var resp = SpreadsheetApp.getUi().alert(
      'Advertencia: columna "id" no detectada',
      'La primera columna es "' + data[0][0] + '" en lugar de "id".\n\n' +
      'Asegúrate de exportar desde Odoo con "Compatible con importación" marcado.\n\n¿Continuar igualmente?',
      SpreadsheetApp.getUi().ButtonSet.YES_NO
    );
    if (resp !== SpreadsheetApp.getUi().Button.YES) return null;
  }

  return data;
}

function _limpiarTemp() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.TEMP);
  if (sheet) sheet.clearContents();
}

function _mostrarResultado(entidad, resultado) {
  var errores = resultado.errores || [];
  var msg = '✅ ' + resultado.nuevos       + ' nuevos\n' +
            '🔄 ' + resultado.actualizados + ' actualizados\n' +
            '—  ' + resultado.sinCambios   + ' sin cambios';
  if (resultado.omitidos > 0) msg += '\n⏭  ' + resultado.omitidos + ' omitidos (filas vacías)';
  if (errores.length > 0) {
    msg += '\n\n⚠️ ' + errores.length + ' advertencia(s):\n' +
           errores.slice(0, 10).join('\n') +
           (errores.length > 10 ? '\n... y ' + (errores.length - 10) + ' más.' : '');
  }
  SpreadsheetApp.getUi().alert('Importación ' + entidad, msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function _parseFecha(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var s = String(val).trim();
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(s)) {
    var p = s.split(/[\/\-]/); return p[2] + '-' + p[1] + '-' + p[0];
  }
  return s.substring(0, 10);
}

function _parseBool(val) {
  if (val === true || val === 1) return true;
  var s = String(val || '').trim().toLowerCase();
  return s === 'true' || s === 'sí' || s === 'si' || s === '1' || s === 'yes';
}
