// ============================================================
// Importador.gs — Importación upsert desde exportación Odoo
//
// Odoo exporta con la opción "Compatible con importación", que incluye
// una columna "id" (ID externo de Odoo) en primera posición. Este ID
// es la clave para detectar registros nuevos vs actualizados.
//
// Flujo de uso:
// 1. En Odoo: Lista → Acción → Exportar → marcar "Compatible con importación"
//    → seleccionar campos → Exportar a Excel.
// 2. Abre el Excel, copia TODOS los datos (incluyendo fila de cabeceras).
// 3. Ve a la hoja TEMP_Import y pega (Ctrl+V).
// 4. Ejecuta: Comisiones CRI → Importar datos → Importar [entidad].
// 5. La hoja TEMP_Import se limpia automáticamente.
//
// Resultado por importación:
//   ✅ X nuevos  |  🔄 Y actualizados  |  — Z sin cambios
// ============================================================

// ============================================================
// COLUMNAS ESPERADAS POR ENTIDAD (en el Excel de Odoo)
// La primera columna siempre es el ID externo de Odoo ("id")
// ============================================================
//
// SHOWROOMS (ej: contactos con categoría Showroom en Odoo)
//   id | name | x_comision_pct | lang
//   (col 0)  (1)        (2)         (3)
//
// CLIENTES
//   id | name | parent_id/name | email | phone
//   (col 0)  (1)      (2)          (3)    (4)
//
// PEDIDOS (sale.order)
//   id | name | partner_id/name | date_order | currency_id/name | amount_total
//   (0)   (1)        (2)             (3)             (4)              (5)
//
// FACTURAS (account.move — facturas y notas de crédito)
//   id | name | partner_id/name | invoice_origin | invoice_date | invoice_date_due | currency_id/name | amount_total | move_type | reversed_entry_id/name | narration
//   (0)   (1)        (2)               (3)               (4)            (5)                 (6)              (7)          (8)               (9)                   (10)
//   move_type: 'out_invoice'=factura normal, 'out_refund'=abono
//
// COBROS (account.payment)
//   id | name | reconciled_invoice_ids/name | sale_id/name | date | currency_id/name | amount | is_matched
//   (0)   (1)              (2)                    (3)         (4)         (5)           (6)        (7)
// ============================================================

// ---- Showrooms ----

function importarShowrooms() {
  var filas = _leerTemp();
  if (!filas) return;

  var resultado = _upsertEnSheet(
    SHEET_NAMES.SHOWROOMS,
    filas,
    function(fila) { return String(fila[0] || '').trim(); },
    function(fila) {
      return [
        String(fila[0] || '').trim(),                    // ID_Odoo
        String(fila[1] || '').trim(),                    // Nombre
        parseFloat(fila[2]) || 0,                        // Comision_Pct
        String(fila[3] || 'es').trim().toLowerCase(),    // Idioma
        new Date()                                        // Ultima_Actualizacion
      ];
    },
    function(fila) { return !String(fila[1] || '').trim(); } // skip si sin nombre
  );

  _limpiarTemp();
  _mostrarResultado('Showrooms', resultado);
}

// ---- Clientes ----

function importarClientes() {
  var filas = _leerTemp();
  if (!filas) return;

  var showrooms = getSheetData(SHEET_NAMES.SHOWROOMS);
  var showroomNombres = {};
  showrooms.forEach(function(s) { showroomNombres[String(s.Nombre || '')] = true; });

  var erroresValidacion = [];

  var resultado = _upsertEnSheet(
    SHEET_NAMES.CLIENTES,
    filas,
    function(fila) { return String(fila[0] || '').trim(); },
    function(fila) {
      var showroomNombre = String(fila[2] || '').trim();
      if (!showroomNombres[showroomNombre]) {
        erroresValidacion.push('Cliente "' + fila[1] + '": showroom "' + showroomNombre + '" no encontrado en Showrooms.');
      }
      return [
        String(fila[0] || '').trim(),   // ID_Odoo
        String(fila[1] || '').trim(),   // Nombre
        showroomNombre,                  // Showroom_Nombre
        String(fila[3] || '').trim(),   // Email
        String(fila[4] || '').trim(),   // Telefono
        new Date()                       // Ultima_Actualizacion
      ];
    },
    function(fila) { return !String(fila[1] || '').trim(); }
  );

  _limpiarTemp();
  _mostrarResultado('Clientes', resultado, erroresValidacion);
}

// ---- Pedidos ----

function importarPedidos() {
  var filas = _leerTemp();
  if (!filas) return;

  var resultado = _upsertEnSheet(
    SHEET_NAMES.PEDIDOS,
    filas,
    function(fila) { return String(fila[0] || '').trim(); },
    function(fila) {
      return [
        String(fila[0] || '').trim(),                              // ID_Odoo
        String(fila[1] || '').trim(),                              // Numero
        String(fila[2] || '').trim(),                              // Cliente_Nombre
        _parseFecha(fila[3]),                                       // Fecha
        String(fila[4] || 'EUR').trim().toUpperCase(),             // Moneda
        parseFloat(fila[5]) || 0,                                  // Importe
        new Date()                                                  // Ultima_Actualizacion
      ];
    },
    function(fila) { return !String(fila[1] || '').trim(); }
  );

  _limpiarTemp();
  _mostrarResultado('Pedidos', resultado);
}

// ---- Facturas ----
// Odoo exporta facturas y abonos en la misma lista (account.move).
// Se detectan como abono cuando move_type = 'out_refund' o el importe es negativo.

function importarFacturas() {
  var filas = _leerTemp();
  if (!filas) return;

  var resultado = _upsertEnSheet(
    SHEET_NAMES.FACTURAS,
    filas,
    function(fila) { return String(fila[0] || '').trim(); },
    function(fila) {
      var moveType = String(fila[8] || '').trim().toLowerCase();
      var esAbono  = moveType === 'out_refund' || moveType === 'credit_note' ||
                     moveType === 'nota de crédito' ||
                     _parseBool(fila[8]);

      // Si Odoo exporta el importe siempre positivo, lo negamos para abonos
      var importe = parseFloat(fila[7]) || 0;
      if (esAbono && importe > 0) importe = -importe;

      // Facturas_Abonadas: en Odoo viene como el nombre de la factura revertida
      var facturasAbonadas = String(fila[9] || '').trim();

      return [
        String(fila[0]  || '').trim(),                              // ID_Odoo
        String(fila[1]  || '').trim(),                              // Numero
        String(fila[2]  || '').trim(),                              // Cliente_Nombre
        String(fila[3]  || '').trim(),                              // Pedidos_Ref (invoice_origin)
        _parseFecha(fila[4]),                                        // Fecha
        _parseFecha(fila[5]),                                        // Vencimiento
        String(fila[6]  || 'EUR').trim().toUpperCase(),             // Moneda
        importe,                                                      // Importe
        esAbono,                                                      // Es_Abono
        facturasAbonadas,                                             // Facturas_Abonadas
        String(fila[10] || '').trim(),                              // Notas
        new Date()                                                    // Ultima_Actualizacion
      ];
    },
    function(fila) { return !String(fila[1] || '').trim(); }
  );

  _limpiarTemp();
  _mostrarResultado('Facturas', resultado);
}

// ---- Cobros ----
// En Odoo los pagos se exportan desde account.payment.
// La relación con la factura puede venir via reconciled_invoice_ids/name.

function importarCobros() {
  var filas = _leerTemp();
  if (!filas) return;

  var erroresValidacion = [];
  var facturas = getSheetData(SHEET_NAMES.FACTURAS);
  var facturaNums = {};
  facturas.forEach(function(f) { facturaNums[String(f.Numero || '').toLowerCase()] = true; });

  var resultado = _upsertEnSheet(
    SHEET_NAMES.COBROS,
    filas,
    function(fila) { return String(fila[0] || '').trim(); },
    function(fila) {
      var facturaRef = String(fila[2] || '').trim();
      var pedidoRef  = String(fila[3] || '').trim();
      var importe    = parseFloat(fila[6]) || 0;

      if (facturaRef && !facturaNums[facturaRef.toLowerCase()]) {
        erroresValidacion.push('Cobro "' + fila[1] + '": factura "' + facturaRef + '" no encontrada.');
      }
      if (importe < 0) importe = Math.abs(importe); // Odoo a veces exporta cobros con signo negativo

      return [
        String(fila[0] || '').trim(),                    // ID_Odoo
        facturaRef,                                       // Factura_Ref
        pedidoRef,                                        // Pedido_Ref
        _parseFecha(fila[4]),                             // Fecha
        String(fila[5] || 'EUR').trim().toUpperCase(),   // Moneda
        importe,                                          // Importe
        _parseBool(fila[7]),                              // Es_Ajuste
        new Date()                                        // Ultima_Actualizacion
      ];
    },
    function(fila) {
      // Saltar si no hay referencia a factura ni a pedido
      return !String(fila[2] || '').trim() && !String(fila[3] || '').trim();
    }
  );

  _limpiarTemp();
  _mostrarResultado('Cobros', resultado, erroresValidacion);
}

// ============================================================
// Motor de upsert — función genérica para todas las entidades
// ============================================================

/**
 * Inserta o actualiza registros en una hoja basándose en ID_Odoo (primera columna).
 *
 * @param {string}   sheetName   Nombre de la hoja destino
 * @param {Array}    filas       Datos de TEMP_Import (primera fila = cabeceras)
 * @param {Function} getIdFn     Extrae el ID_Odoo de una fila raw de TEMP_Import
 * @param {Function} buildFila   Convierte una fila raw en el array para la hoja destino
 * @param {Function} skipFn      Devuelve true si la fila debe omitirse
 * @returns {{nuevos, actualizados, sinCambios, omitidos}}
 */
function _upsertEnSheet(sheetName, filas, getIdFn, buildFila, skipFn) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la hoja: ' + sheetName);

  var numCols  = sheet.getLastColumn() || 1;
  var lastRow  = sheet.getLastRow();

  // Leer todos los datos existentes de una vez (una sola llamada a la API → rápido)
  var existingByIdOdoo = {};  // ID_Odoo → numero de fila real en la hoja (1-based)
  var existingValues   = {};  // ID_Odoo → array de valores

  if (lastRow > 1) {
    var allData = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
    allData.forEach(function(row, i) {
      var id = String(row[0] || '').trim();
      if (id) {
        existingByIdOdoo[id] = i + 2; // fila real (+1 por índice base 0, +1 por la cabecera)
        existingValues[id]   = row;
      }
    });
  }

  var nuevos = 0, actualizados = 0, sinCambios = 0, omitidos = 0;
  var filasNuevas = []; // acumulamos inserts para hacerlos en bloque al final

  // Procesar desde fila 1 (saltamos la cabecera de Odoo en índice 0)
  for (var i = 1; i < filas.length; i++) {
    var filaRaw = filas[i];

    if (skipFn && skipFn(filaRaw)) {
      omitidos++;
      continue;
    }

    var idOdoo = getIdFn(filaRaw);
    if (!idOdoo) { omitidos++; continue; }

    var nuevaFila = buildFila(filaRaw);

    if (existingByIdOdoo[idOdoo] !== undefined) {
      // ---- Registro existente: comparar para detectar cambios ----
      var existente = existingValues[idOdoo];
      var hayCambios = false;

      // Comparar todos los campos excepto ID_Odoo (col 0) y Ultima_Actualizacion (última col)
      for (var c = 1; c < nuevaFila.length - 1; c++) {
        var valorNuevo    = String(nuevaFila[c]   !== null && nuevaFila[c]   !== undefined ? nuevaFila[c]   : '').trim();
        var valorExistente= String(existente[c]   !== null && existente[c]   !== undefined ? existente[c]   : '').trim();
        if (valorNuevo !== valorExistente) {
          hayCambios = true;
          break;
        }
      }

      if (hayCambios) {
        // Actualizar la fila en la hoja (la Ultima_Actualizacion ya viene como new Date() en buildFila)
        sheet.getRange(existingByIdOdoo[idOdoo], 1, 1, nuevaFila.length).setValues([nuevaFila]);
        actualizados++;
      } else {
        sinCambios++;
      }
    } else {
      // ---- Registro nuevo: acumular para insertar en bloque ----
      filasNuevas.push(nuevaFila);
      nuevos++;
    }
  }

  // Insertar todos los nuevos de golpe (mucho más rápido que appendRow uno a uno)
  if (filasNuevas.length > 0) {
    var primeraFilaLibre = sheet.getLastRow() + 1;
    sheet.getRange(primeraFilaLibre, 1, filasNuevas.length, filasNuevas[0].length)
         .setValues(filasNuevas);
  }

  return { nuevos: nuevos, actualizados: actualizados, sinCambios: sinCambios, omitidos: omitidos };
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
      'La hoja "' + SHEET_NAMES.TEMP + '" está vacía o solo tiene la cabecera.\n\n' +
      'Copia el Excel de Odoo (con cabeceras) y pégalo en esa hoja.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return null;
  }

  // Verificar que la primera columna de la cabecera sea "id" (exportación Odoo)
  var primeraCol = String(data[0][0] || '').trim().toLowerCase();
  if (primeraCol !== 'id' && primeraCol !== 'id_odoo' && primeraCol !== 'external id') {
    var ui = SpreadsheetApp.getUi();
    var resp = ui.alert(
      'Advertencia: columna ID no detectada',
      'La primera columna de los datos pegados es "' + data[0][0] + '" en lugar de "id".\n\n' +
      'Asegúrate de exportar desde Odoo con la opción "Compatible con importación" marcada, ' +
      'que añade automáticamente la columna "id" en primera posición.\n\n' +
      '¿Continuar igualmente?',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return null;
  }

  return data;
}

function _limpiarTemp() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.TEMP);
  if (sheet) sheet.clearContents();
}

function _mostrarResultado(entidad, resultado, erroresValidacion) {
  var msg = '';
  msg += '✅ ' + resultado.nuevos      + ' nuevos\n';
  msg += '🔄 ' + resultado.actualizados + ' actualizados\n';
  msg += '—  ' + resultado.sinCambios   + ' sin cambios\n';
  if (resultado.omitidos > 0) {
    msg += '⏭  ' + resultado.omitidos + ' omitidos (filas vacías)\n';
  }

  if (erroresValidacion && erroresValidacion.length > 0) {
    msg += '\n⚠️ Advertencias (' + erroresValidacion.length + '):\n';
    msg += erroresValidacion.slice(0, 10).join('\n');
    if (erroresValidacion.length > 10) {
      msg += '\n... y ' + (erroresValidacion.length - 10) + ' más.';
    }
  }

  SpreadsheetApp.getUi().alert('Importación ' + entidad + ' completada', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

function _parseFecha(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(val).trim();
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
