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
  try { actualizarResumenPedidos(); } catch(e) { Logger.log('actualizarResumenPedidos: ' + e.message); }
}

function importarFacturas() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarFacturas(filas);
  _limpiarTemp();
  _mostrarResultado('Facturas', resultado);
  try { actualizarResumenPedidos(); } catch(e) { Logger.log('actualizarResumenPedidos: ' + e.message); }
}

function importarCobros() {
  var filas = _leerTemp();
  if (!filas) return;
  var resultado = _procesarCobros(filas);
  _limpiarTemp();
  _mostrarResultado('Cobros', resultado);
  try { actualizarResumenPedidos(); } catch(e) { Logger.log('actualizarResumenPedidos: ' + e.message); }
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
  // col3: Referencia del cliente (PO Joor)
  // col4: Total
  // col5: Importe facturado
  // col6: Importe no facturado
  // col7: Importe pendiente
  // col8: Importe total reembolsado
  // col9: Condiciones de pago
  // col10: Moneda
  return _upsertEnSheet(
    SHEET_NAMES.PEDIDOS,
    filas,
    function(f) { return String(f[0] || '').trim(); },
    function(f) {
      return [
        String(f[0]  || '').trim(),                   // ID_Odoo = referencia pedido
        String(f[0]  || '').trim(),                   // Numero
        _extractNombre(f[1]),                         // Cliente_Nombre
        String(f[3]  || '').trim(),                   // Referencia_Cliente (PO Joor)
        _parseFecha(f[2]),                            // Fecha
        String(f[10] || 'EUR').trim().toUpperCase(),  // Moneda
        parseFloat(f[4]) || 0,                       // Importe (Total)
        String(f[9]  || '').trim(),                  // Condiciones_Pago (NET30, NET60...)
        new Date()
      ];
    },
    function(f) { return !String(f[0] || '').trim(); }
  );
}

function _procesarFacturas(filas) {
  // Lee las columnas del Excel de Gextia por nombre de cabecera (fila 0),
  // no por posición. Así el orden de columnas en el export no importa.
  // Cabeceras esperadas (nombres en español tal como exporta Gextia/Odoo):
  //   Número | Referencia | Total con signo en moneda | Moneda |
  //   Fecha de factura | Condiciones de pago | Empresa |
  //   Fecha de Vencimiento | Origen |
  //   Albaranes relacionados/DHL Express Tracking Reference |
  //   Albaranes relacionados/Número de seguimiento |
  //   Albaranes relacionados/Referencia de envío | Modo de pago

  _asegurarColumnasFacturas();

  // Mapa cabecera→índice del archivo de importación (insensible a mayúsculas)
  var importHeaders = filas[0] || [];
  var iIdx = {};
  importHeaders.forEach(function(h, i) {
    iIdx[String(h || '').trim().toLowerCase()] = i;
  });
  function g(f, name) {
    var idx = iIdx[name.toLowerCase()];
    return idx !== undefined ? f[idx] : '';
  }

  // Orden real de columnas en la hoja destino (para escribir en la posición correcta)
  var factSheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FACTURAS);
  var sheetCols  = factSheet
    .getRange(1, 1, 1, factSheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h || '').trim(); });

  return _upsertEnSheet(
    SHEET_NAMES.FACTURAS,
    filas,
    function(f) { return String(g(f, 'número') || g(f, 'name') || '').trim(); },
    function(f) {
      var nombre  = String(g(f, 'número') || g(f, 'name') || '').trim();
      var ref     = String(g(f, 'referencia') || '').trim();
      var importe = parseFloat(String(g(f, 'total con signo en moneda') || '').replace(',', '.')) || 0;
      var moneda  = String(g(f, 'moneda') || 'EUR').trim().toUpperCase();
      var fecha   = _parseFecha(g(f, 'fecha de factura'));
      var cliente = _extractNombre(g(f, 'empresa'));
      var venc    = _parseFecha(g(f, 'fecha de vencimiento'));
      var pedRef  = String(g(f, 'origen') || '').trim();
      var tDHL    = String(g(f, 'albaranes relacionados/dhl express tracking reference') || '').trim();
      var tNum    = String(g(f, 'albaranes relacionados/número de seguimiento') || '').trim();
      var tEnv    = String(g(f, 'albaranes relacionados/referencia de envío') || '').trim();
      var mPago   = String(g(f, 'modo de pago') || '').trim();

      var esAbono = nombre.toUpperCase().indexOf('RINV/') === 0 || importe < 0;
      if (esAbono && importe > 0) importe = -importe;
      if (!esAbono && importe < 0) importe = Math.abs(importe);

      var facturasAbonadas = '';
      if (esAbono && ref) {
        var m = ref.match(/[Rr]eversi[oó]n\s+de:\s*(.+)/);
        if (m) {
          var invRefs = m[1].match(/(?:RINV\/|INV\/)[\w\/]+/g);
          facturasAbonadas = invRefs ? invRefs.join(', ') : m[1].split(',')[0].trim();
        }
      }
      var notas = esAbono ? '' : ref.replace(/^PO:\s*/i, '').trim();

      // Mapa nombre_columna → valor
      var vals = {
        'ID_Odoo':              nombre,
        'Numero':               nombre,
        'Cliente_Nombre':       cliente,
        'Pedidos_Ref':          pedRef,
        'Fecha':                fecha,
        'Vencimiento':          venc,
        'Moneda':               moneda,
        'Importe':              importe,
        'Es_Abono':             esAbono,
        'Facturas_Abonadas':    facturasAbonadas,
        'Notas':                notas,
        'Tracking_DHL':         tDHL,
        'Tracking_Seguimiento': tNum,
        'Tracking_Envio':       tEnv,
        'Modo_Pago':            mPago,
        'Ultima_Actualizacion': new Date()
      };

      // Devuelve array en el orden real de columnas de la hoja
      return sheetCols.map(function(h) {
        return vals.hasOwnProperty(h) ? vals[h] : '';
      });
    },
    function(f) { return !String(g(f, 'número') || g(f, 'name') || '').trim(); }
  );
}

function _procesarCobros(filas) {
  // Columnas Gextia:
  // col0: Cliente/Proveedor (vacío en cobros de TPV/POS)
  // col1: Estado (solo importar 'posted')
  // col2: Fecha
  // col4: Importe firmado (en la moneda del cobro)
  // col5: Moneda
  // col7: Número (clave única, p.ej. BNK8/2026/0296)
  // col8: Facturas conciliadas (p.ej. "INV/2026/000266 (19497895)")
  // col9: Ventas — referencia del pedido si el pago es anticipo sobre pedido (p.ej. BVEJ3727)
  // col10: Referencia — texto libre; si col8 y col9 están vacíos se intenta extraer ref de aquí
  var facturas = getSheetData(SHEET_NAMES.FACTURAS);
  var facturaNums = {};
  var facturaPorOrigen = {}; // Pedidos_Ref → Numero de factura
  facturas.forEach(function(f) {
    var num    = String(f.Numero      || '').trim();
    var origen = String(f.Pedidos_Ref || '').trim().toLowerCase();
    if (num) facturaNums[num.toLowerCase()] = num;
    if (origen && num) facturaPorOrigen[origen] = num;
  });

  var errores = [];
  var resultado = _upsertEnSheet(
    SHEET_NAMES.COBROS,
    filas,
    function(f) { return String(f[7] || '').trim(); }, // Número como clave
    function(f) {
      var facturaRef = _extractFacturaConciliada(String(f[8] || ''));
      var pedidoRef  = String(f[9] || '').trim();
      var cliente    = String(f[0] || '').trim();
      var importe    = Math.abs(parseFloat(f[4]) || 0);
      var fechaCobro = _parseFecha(f[2]);

      // Si col8 y col9 están vacíos, intentar extraer referencia de col10 (Referencia)
      if (!facturaRef && !pedidoRef) {
        var refTexto    = String(f[10] || '').trim();
        var primerToken = refTexto ? refTexto.split(/\s+/)[0] : '';
        if (primerToken && primerToken.toLowerCase() !== 'combine') {
          var tokenLC = primerToken.toLowerCase();
          if (facturaNums[tokenLC]) {
            // Coincide exactamente con un Numero de factura
            facturaRef = facturaNums[tokenLC];
          } else if (facturaPorOrigen[tokenLC]) {
            // Coincide con el Pedidos_Ref de una factura → usar el Numero de esa factura
            facturaRef = facturaPorOrigen[tokenLC];
          } else {
            // Sin coincidencia: guardar el token como Factura_Ref para que sea visible
            facturaRef = primerToken;
            errores.push('⚠️ Cobro "' + f[7] + '": referencia "' + primerToken + '" (de col10) no encontrada en Facturas — revisa manualmente.');
          }
        }
      }

      if (facturaRef && !facturaNums[facturaRef.toLowerCase()]) {
        // Solo avisar si no vino de col10 (esos ya tienen su propio aviso arriba)
        if (_extractFacturaConciliada(String(f[8] || '')) === facturaRef) {
          errores.push('Cobro "' + f[7] + '": factura "' + facturaRef + '" no encontrada.');
        }
      }

      // Cobros de cliente sin ninguna referencia
      if (cliente && !facturaRef && !pedidoRef && fechaCobro >= '2026-04-01') {
        errores.push('⚠️ Cobro "' + f[7] + '" (' + fechaCobro + '): sin factura ni pedido — introduce la referencia manualmente en Gextia.');
      }

      return [
        String(f[7] || '').trim(),                   // ID_Odoo = Número
        facturaRef,                                   // Factura_Ref
        pedidoRef,                                    // Pedido_Ref (col9 Ventas)
        fechaCobro,                                   // Fecha
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
