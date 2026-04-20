// ============================================================
// Importador.gs — Importación upsert desde exportación Gextia/Odoo
//
// Soporta dos orígenes de datos:
//   A) TEMP_Import: copia y pega desde Excel → ejecuta desde el menú
//   B) Drive:       sube el Excel a la carpeta de Drive → se procesa automáticamente
//
// COLUMNAS ESPERADAS POR ENTIDAD (en el Excel de Gextia):
//
//   SHOWROOMS:  agent_ids/name
//               (sin columna id; se usa el nombre completo como clave)
//
//   CLIENTES:   id | name | agent_ids/name
//               (email y teléfono no se exportan)
//
//   PEDIDOS:    Referencia del pedido | Cliente | Fecha de pedido |
//               Referencia del cliente | Total | Importe facturado |
//               Importe no facturado | Importe pendiente |
//               Importe total reembolsado | Condiciones de pago | Moneda
//               (sin columna id; se usa la referencia del pedido como clave)
//
//   FACTURAS:   id | name | ref | amount_total_in_currency_signed |
//               currency_id | invoice_date | invoice_payment_term_id |
//               partner_id | invoice_date_due | invoice_origin |
//               picking_ids/dhl_express_carrier_tracking_ref
//               (abonos: name empieza por RINV/ o importe negativo)
//
//   COBROS:     Cliente/Proveedor | Estado | Fecha |
//               Importe en moneda compañía | Importe firmado | Moneda |
//               Método de pago | Número | Facturas conciliadas
//               (sin columna id; se usa Número como clave;
//                solo se importan los cobros con Estado = posted)
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
  // Expandir filas con múltiples showrooms separados por coma
  // "(Showroom A) Emp A,(Showroom B) Emp B" → dos filas independientes
  var filasExpandidas = [filas[0]];
  for (var i = 1; i < filas.length; i++) {
    var agentField = String(filas[i][0] || '').trim();
    if (!agentField) continue;
    var agentes = _splitAgentes(agentField);
    agentes.forEach(function(agente) {
      filasExpandidas.push([agente]);
    });
  }

  return _upsertEnSheet(
    SHEET_NAMES.SHOWROOMS,
    filasExpandidas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      var nombre = String(f[0] || '').trim();
      return [
        nombre,    // ID_Odoo = nombre completo (clave natural)
        nombre,    // Nombre
        0,         // Comision_Pct — rellenar manualmente tras la importación
        'es',      // Idioma
        new Date()
      ];
    },
    function(f) { return !String(f[0] || '').trim(); }
  );
}

function _procesarClientes(filas) {
  var showrooms = getSheetData(SHEET_NAMES.SHOWROOMS);
  var showroomNombres = {};
  showrooms.forEach(function(s) { showroomNombres[String(s.Nombre || '')] = true; });

  var errores = [];

  // Expandir filas con múltiples showrooms en agent_ids/name (col2)
  var filasExpandidas = [filas[0]];
  for (var i = 1; i < filas.length; i++) {
    var fila = filas[i];
    if (!String(fila[1] || '').trim()) continue;

    var agentField = String(fila[2] || '').trim();
    var agentes = _splitAgentes(agentField);

    if (agentes.length <= 1) {
      filasExpandidas.push(fila);
    } else {
      agentes.forEach(function(agente, idx) {
        var filaCopia = fila.slice();
        filaCopia[0]  = String(fila[0]) + (idx === 0 ? '' : '_sr' + (idx + 1));
        filaCopia[2]  = agente;
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
        String(f[3] || '').trim(), // Email (puede estar vacío)
        String(f[4] || '').trim(), // Teléfono (puede estar vacío)
        new Date()
      ];
    },
    function(f) { return !String(f[1] || '').trim(); }
  );
  resultado.errores = errores;
  return resultado;
}

function _procesarPedidos(filas) {
  // Columnas Gextia:
  // col0: Referencia del pedido (clave)
  // col1: Cliente (formato "(Showroom) Nombre")
  // col2: Fecha de pedido
  // col4: Total
  // col10: Moneda
  return _upsertEnSheet(
    SHEET_NAMES.PEDIDOS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      return [
        String(f[0] || '').trim(),                   // ID_Odoo = referencia pedido
        String(f[0] || '').trim(),                   // Numero
        _extractNombre(f[1]),                        // Cliente_Nombre (sin prefijo showroom)
        _parseFecha(f[2]),                           // Fecha
        String(f[10] || 'EUR').trim().toUpperCase(), // Moneda
        parseFloat(f[4]) || 0,                      // Importe
        new Date()
      ];
    },
    function(f) { return !String(f[0] || '').trim(); }
  );
}

function _procesarFacturas(filas) {
  // Columnas Gextia:
  // col0: id (external id Odoo)
  // col1: name (INV/... o RINV/... para abonos)
  // col2: ref (referencia cliente; a veces "Reversión de: INV/...")
  // col3: amount_total_in_currency_signed (ya con signo: negativo para abonos)
  // col4: currency_id
  // col5: invoice_date
  // col7: partner_id (formato "(Showroom) Nombre" o solo "Nombre")
  // col8: invoice_date_due
  // col9: invoice_origin (referencia del pedido, p.ej. BVEJ3605)
  return _upsertEnSheet(
    SHEET_NAMES.FACTURAS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      var nombre  = String(f[1] || '').trim();
      var esAbono = nombre.toUpperCase().indexOf('RINV/') === 0 ||
                    (parseFloat(f[3]) || 0) < 0;

      var importe = parseFloat(f[3]) || 0;
      // Normalizar: abonos siempre negativos, facturas siempre positivas
      if (esAbono && importe > 0) importe = -importe;
      if (!esAbono && importe < 0) importe = Math.abs(importe);

      // Extraer factura vinculada del campo ref ("Reversión de: INV/...")
      var ref = String(f[2] || '').trim();
      var facturasAbonadas = '';
      if (esAbono && ref) {
        var m = ref.match(/[Rr]eversi[oó]n\s+de:\s*(.+)/);
        if (m) facturasAbonadas = m[1].trim();
      }

      return [
        String(f[0] || '').trim(),                  // ID_Odoo
        nombre,                                      // Numero
        _extractNombre(f[7]),                        // Cliente_Nombre
        String(f[9]  || '').trim(),                  // Pedidos_Ref (invoice_origin)
        _parseFecha(f[5]),                           // Fecha
        _parseFecha(f[8]),                           // Vencimiento
        String(f[4]  || 'EUR').trim().toUpperCase(), // Moneda
        importe,                                     // Importe
        esAbono,                                     // Es_Abono
        facturasAbonadas,                            // Facturas_Abonadas
        esAbono ? '' : ref,                          // Notas → ref cliente (PO Joor) para facturas normales
        new Date()
      ];
    },
    function(f) { return !String(f[0] || '').trim() || !String(f[1] || '').trim(); }
  );
}

function _procesarCobros(filas) {
  // Columnas Gextia:
  // col1: Estado (solo importar 'posted')
  // col2: Fecha
  // col4: Importe firmado (en la moneda del cobro)
  // col5: Moneda
  // col7: Número (clave única, p.ej. BNK8/2026/0296)
  // col8: Facturas conciliadas (p.ej. "INV/2026/000266 (19497895)")
  var facturas = getSheetData(SHEET_NAMES.FACTURAS);
  var facturaNums = {};
  facturas.forEach(function(f) { facturaNums[String(f.Numero || '').toLowerCase()] = true; });

  var errores = [];
  var resultado = _upsertEnSheet(
    SHEET_NAMES.COBROS,
    filas,
    function(f) { return String(f[7] || '').trim(); }, // Número como clave
    function(f) {
      var facturaRef = _extractFacturaConciliada(String(f[8] || ''));
      var importe    = Math.abs(parseFloat(f[4]) || 0);

      if (facturaRef && !facturaNums[facturaRef.toLowerCase()]) {
        errores.push('Cobro "' + f[7] + '": factura "' + facturaRef + '" no encontrada.');
      }
      // A partir de abril 2026 todo cobro posted debe tener factura conciliada
      var fechaCobro = _parseFecha(f[2]);
      if (!facturaRef && fechaCobro >= '2026-04-01') {
        errores.push('⚠️ Cobro "' + f[7] + '" (' + fechaCobro + '): sin factura conciliada — introduce la referencia manualmente en Gextia.');
      }
      return [
        String(f[7] || '').trim(),                   // ID_Odoo = Número
        facturaRef,                                   // Factura_Ref
        '',                                           // Pedido_Ref (no disponible)
        _parseFecha(f[2]),                            // Fecha
        String(f[5] || 'EUR').trim().toUpperCase(),  // Moneda
        importe,                                      // Importe
        false,                                        // Es_Ajuste
        new Date()
      ];
    },
    function(f) {
      // Omitir si no tiene número o si el estado no es 'posted'
      return !String(f[7] || '').trim() ||
             String(f[1] || '').trim().toLowerCase() !== 'posted';
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
      for (var c = 1; c < nuevaFila.length - 1; c++) {
        var vNuevo  = String(nuevaFila[c]  !== null && nuevaFila[c]  !== undefined ? nuevaFila[c]  : '').trim();
        var vActual = String(existente[c]  !== null && existente[c]  !== undefined ? existente[c]  : '').trim();
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
      'La hoja "' + SHEET_NAMES.TEMP + '" está vacía.\n\nCopia el Excel de Gextia (con cabeceras) y pégalo en esa hoja.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
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
  if (resultado.omitidos > 0) msg += '\n⏭  ' + resultado.omitidos + ' omitidos';
  if (errores.length > 0) {
    msg += '\n\n⚠️ ' + errores.length + ' advertencia(s):\n' +
           errores.slice(0, 10).join('\n') +
           (errores.length > 10 ? '\n... y ' + (errores.length - 10) + ' más.' : '');
  }
  SpreadsheetApp.getUi().alert('Importación ' + entidad, msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// Extrae el nombre legal de un campo con formato "(NombreDisplay) NombreLegal"
// "(Mint Showroom) 250W Fashion Group" → "250W Fashion Group"
// "VPR" → "VPR"
function _extractNombre(val) {
  var s = String(val || '').trim();
  var m = s.match(/^\([^)]+\)\s*(.+)/);
  return m ? m[1].trim() : s;
}

// Extrae el número de factura de "INV/2026/000266 (19497895)" → "INV/2026/000266"
function _extractFacturaConciliada(str) {
  var s = String(str || '').trim();
  if (!s) return '';
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Divide "Agent A,Agent B" respetando comas dentro de paréntesis
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
