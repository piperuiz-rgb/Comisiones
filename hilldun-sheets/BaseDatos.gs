// ============================================================
// BaseDatos.gs — Gestión de la base de datos de clientes Hilldun
//
// Lee los archivos de "credit status" exportados desde Hilldun
// (carpetas BASE DE DATOS/EURO y BASE DE DATOS/DOLAR en Drive)
// y los consolida en la pestaña "Clientes".
//
// Los archivos XLS de Hilldun tienen el formato:
//   debtor | company | address | city | state | country |
//   refnumber | start | completion | terms | ponumber | amount | decision | clicompany
// ============================================================

// ---- Configuración inicial ----

function configurarHilldun() {
  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var ssFile  = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var parents = ssFile.getParents();
  if (!parents.hasNext()) {
    ui.alert('Error', 'No se encontró la carpeta del Google Sheet.\nAsegúrate de que el archivo está dentro de una carpeta en Drive.', ui.ButtonSet.OK);
    return;
  }
  var raiz = parents.next();

  // Buscar o crear estructura de carpetas
  var baseDatos = _getOrCreateFolder(raiz,      'BASE DE DATOS');
  var euro      = _getOrCreateFolder(baseDatos, 'EURO');
  var dolar     = _getOrCreateFolder(baseDatos, 'DOLAR');

  // Buscar archivo de clientes Gextia en BASE DE DATOS
  var gextiaFile = _buscarArchivoClientes(baseDatos);

  // Guardar IDs
  var propMap = {};
  propMap[HILLDUN_PROP.CONFIGURADO]   = 'true';
  propMap[HILLDUN_PROP.BASE_DATOS_ID] = baseDatos.getId();
  propMap[HILLDUN_PROP.EURO_ID]       = euro.getId();
  propMap[HILLDUN_PROP.DOLAR_ID]      = dolar.getId();
  if (gextiaFile) propMap[HILLDUN_PROP.GEXTIA_FILE_ID] = gextiaFile.getId();
  props.setProperties(propMap);

  _inicializarHojaClientes();

  var msg = '✅ Hilldun configurado.\n\n'
    + 'Carpeta raíz: "' + raiz.getName() + '"\n\n'
    + 'Carpetas verificadas:\n'
    + '  ✅ BASE DE DATOS\n'
    + '  ✅ BASE DE DATOS/EURO\n'
    + '  ✅ BASE DE DATOS/DOLAR\n\n'
    + 'Clientes Gextia: '
    + (gextiaFile
       ? '✅ ' + gextiaFile.getName()
       : '⚠️ no encontrado\n   (sube el Excel de clientes exportado de Gextia a la carpeta BASE DE DATOS)'
      )
    + '\n\nPestaña "Clientes" preparada.\n\n'
    + 'Siguiente paso:\n  Hilldun → 🔄 Actualizar Clientes desde Drive';

  ui.alert('Configuración Hilldun', msg, ui.ButtonSet.OK);
}

// ---- Actualizar clientes desde Drive ----

function actualizarClientesDesdeDrive() {
  var tiempoInicio = new Date().getTime();
  var LIMITE_MS    = 4 * 60 * 1000; // 4 minutos (Apps Script corta a los 6)

  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(HILLDUN_PROP.CONFIGURADO)) {
    SpreadsheetApp.getUi().alert(
      'Sin configurar',
      'Ejecuta primero: Hilldun → ⚙️ Configurar',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  // Verificar que Drive API está activada antes de empezar
  if (typeof Drive === 'undefined') {
    SpreadsheetApp.getUi().alert(
      '⚠️ Drive API no activada',
      'Este script necesita el servicio avanzado "Drive API".\n\n'
      + 'Cómo activarlo:\n'
      + '1. Abre el editor de Apps Script\n'
      + '2. Haz clic en el icono "+" junto a "Servicios"\n'
      + '3. Busca "Drive API" y pulsa "Añadir"\n'
      + '4. Guarda y vuelve a ejecutar esta función',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  // Cargar clientes Gextia para auto-matching (opcional)
  var clientesGextia = [];
  var gextiaFileId   = props.getProperty(HILLDUN_PROP.GEXTIA_FILE_ID);
  if (gextiaFileId) {
    try {
      clientesGextia = _leerClientesGextia(gextiaFileId);
      Logger.log('Clientes Gextia cargados para matching: ' + clientesGextia.length);
    } catch(e) {
      Logger.log('No se pudieron leer clientes Gextia: ' + e.message);
    }
  }

  // Leer archivos de credit status de EURO y DOLAR
  var debtors        = {};
  var errores        = [];
  var resumenArchivos = [];

  [
    [HILLDUN_PROP.EURO_ID, 'EUR'],
    [HILLDUN_PROP.DOLAR_ID, 'USD']
  ].forEach(function(par) {
    var carpetaId = props.getProperty(par[0]);
    var moneda    = par[1];
    if (!carpetaId) return;

    var carpeta;
    try {
      carpeta = DriveApp.getFolderById(carpetaId);
    } catch(e) {
      errores.push('❌ Carpeta ' + moneda + ': ' + e.message);
      return;
    }

    var archivos = _obtenerExcels(carpeta); // ya vienen ordenados del más reciente al más antiguo
    resumenArchivos.push(moneda + ': ' + archivos.length + ' archivo(s)');
    Logger.log('BASE DE DATOS/' + moneda + ': ' + archivos.length + ' archivo(s)');

    for (var ai = 0; ai < archivos.length; ai++) {
      // Parar si se acerca el límite de tiempo (quedan archivos para la próxima ejecución)
      if (new Date().getTime() - tiempoInicio > LIMITE_MS) {
        var restantes = archivos.length - ai;
        errores.push('⏱ ' + moneda + ': tiempo agotado, ' + restantes + ' archivo(s) sin procesar — ejecuta de nuevo para continuar');
        Logger.log('Tiempo agotado en carpeta ' + moneda + ' tras ' + ai + ' archivo(s)');
        break;
      }

      var archivo = archivos[ai];
      try {
        var filas = _leerExcelDesdeDrive(archivo.getId());
        if (!filas || filas.length < 2) {
          Logger.log('Archivo vacío omitido: ' + archivo.getName());
          continue;
        }
        var antesDebtors = Object.keys(debtors).length;
        _parsearCreditStatus(filas, moneda, debtors);
        var nuevosDebtors = Object.keys(debtors).length - antesDebtors;
        Logger.log(archivo.getName() + ': ' + nuevosDebtors + ' debtor(s) nuevos extraídos');
      } catch(e) {
        errores.push('❌ ' + archivo.getName() + ': ' + e.message);
        Logger.log('Error en ' + archivo.getName() + ': ' + e.message);
      }
    }
  });

  var totalDebtors = Object.keys(debtors).length;
  Logger.log('Total debtors extraídos: ' + totalDebtors);

  // Sin archivos en ninguna carpeta
  if (resumenArchivos.every(function(r) { return r.indexOf('0 archivo') !== -1; }) && errores.length === 0) {
    SpreadsheetApp.getUi().alert(
      'Sin archivos',
      'No se encontraron archivos Excel en las carpetas BASE DE DATOS/EURO ni BASE DE DATOS/DOLAR.\n\n'
      + 'Sube los archivos de credit status exportados de Hilldun a las subcarpetas correspondientes.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  // Archivos encontrados pero ningún debtor extraído → error de formato o Drive API
  if (totalDebtors === 0) {
    var msgError = 'Se encontraron archivos pero no se pudo extraer ningún cliente.\n\n';
    msgError += 'Archivos en Drive:\n  ' + resumenArchivos.join('\n  ') + '\n\n';
    if (errores.length > 0) {
      msgError += 'Errores:\n' + errores.join('\n') + '\n\n';
    }
    msgError += 'Causas posibles:\n'
      + '• Drive API no está activada (Servicios → Drive API → Añadir)\n'
      + '• Los archivos tienen un formato diferente al esperado\n'
      + '• Los archivos no son archivos de credit status de Hilldun';
    SpreadsheetApp.getUi().alert('Sin resultados', msgError, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var resultado = _upsertClientes(debtors, clientesGextia);

  var msg = 'Archivos procesados:\n  ' + resumenArchivos.join('\n  ') + '\n'
    + 'Clientes extraídos: ' + totalDebtors + '\n\n'
    + '✅ ' + resultado.nuevos + ' nuevos  '
    + '🔄 ' + resultado.actualizados + ' actualizados  '
    + '— ' + resultado.sinCambios + ' sin cambios';

  if (resultado.sinMatchGextia > 0) {
    msg += '\n\n⚠️ ' + resultado.sinMatchGextia
      + ' cliente(s) sin match automático en Gextia.\n'
      + 'Rellena la columna "Gextia_Nombre" manualmente.';
  }
  if (errores.length > 0) {
    msg += '\n\nAvisos:\n' + errores.join('\n');
  }

  SpreadsheetApp.getUi().alert('🔄 Clientes actualizados', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ---- Parsear archivo de credit status de Hilldun ----
// Formato: debtor | company | address | city | state | country |
//          refnumber | start | completion | terms | ponumber | amount | decision | clicompany

function _parsearCreditStatus(filas, moneda, debtors) {
  // Localizar fila de cabecera (col0 = "debtor") — buscar en todas las filas
  var startRow = -1;
  for (var i = 0; i < filas.length; i++) {
    if (String(filas[i][0] || '').toLowerCase().trim() === 'debtor') {
      startRow = i + 1;
      break;
    }
  }
  if (startRow === -1) {
    Logger.log('Cabecera "debtor" no encontrada en ' + filas.length + ' filas — archivo omitido.');
    return;
  }

  for (var r = startRow; r < filas.length; r++) {
    var f    = filas[r];
    var code = String(f[0] || '').trim();
    if (!code) continue;

    // "start" (col7) es un número de serie de fecha en Excel — mayor = más reciente
    var startSerial = (typeof f[7] === 'number') ? f[7] : 0;
    var existing    = debtors[code];

    if (!existing || startSerial > (existing._startSerial || 0)) {
      // Registro más reciente para este debtor → actualizar dirección y términos
      var monedasActuales = existing ? existing.monedas.slice() : [];
      if (monedasActuales.indexOf(moneda) === -1) monedasActuales.push(moneda);

      debtors[code] = {
        code:         code,
        nombre:       String(f[1] || '').trim(),
        dir1:         String(f[2] || '').trim(),
        dir2:         '',
        ciudad:       String(f[3] || '').trim(),
        estado:       String(f[4] || '').trim(),
        cp:           '',
        pais:         String(f[5] || '').trim(),
        terminos:     String(f[9] || '').trim(),
        monedas:      monedasActuales,
        _startSerial: startSerial
      };
    } else {
      // Mismo debtor, registro más antiguo — solo ampliar lista de monedas
      if (existing.monedas.indexOf(moneda) === -1) {
        existing.monedas.push(moneda);
      }
    }
  }
}

// ---- Upsert en hoja Clientes ----

function _upsertClientes(debtors, clientesGextia) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HILLDUN_SHEETS.CLIENTES);
  if (!sheet) {
    _inicializarHojaClientes();
    sheet = ss.getSheetByName(HILLDUN_SHEETS.CLIENTES);
  }

  var filas  = sheet.getDataRange().getValues();
  // Construir mapa: Hilldun_Code → índice en array filas (0-based, incluyendo header en [0])
  var existentes = {};
  for (var i = 1; i < filas.length; i++) {
    var c = String(filas[i][0] || '').trim();
    if (c) existentes[c] = i;
  }

  var nuevos = 0, actualizados = 0, sinCambios = 0, sinMatchGextia = 0;

  Object.keys(debtors).sort().forEach(function(code) {
    var d      = debtors[code];
    var match  = _autoMatchGextia(d.nombre, clientesGextia);
    var monStr = d.monedas.sort().join('+'); // "EUR" / "USD" / "EUR+USD"

    if (!match) sinMatchGextia++;

    var nuevaFila = [
      d.code,       // A Hilldun_Code
      d.nombre,     // B Hilldun_Nombre
      match || '',  // C Gextia_Nombre (auto-sugerido)
      d.dir1,       // D Direccion1
      d.dir2,       // E Direccion2
      d.ciudad,     // F Ciudad
      d.estado,     // G Estado
      d.cp,         // H CP
      d.pais,       // I Pais
      '',           // J Telefono (manual)
      d.terminos,   // K Terminos
      monStr,       // L Monedas
      true,         // M Activo
      '',           // N Notas
      new Date()    // O Ultima_Actualizacion
    ];

    if (existentes[code] !== undefined) {
      var idxFila     = existentes[code];       // índice en array filas (0-based)
      var sheetRowNum = idxFila + 1;            // número de fila en la hoja (1-based, header=1)
      var filaActual  = filas[idxFila];

      // Preservar campos editados por el usuario
      nuevaFila[2]  = String(filaActual[2] || '') || match || '';  // Gextia_Nombre
      nuevaFila[4]  = String(filaActual[4] || '');                  // Direccion2
      nuevaFila[7]  = String(filaActual[7] || '');                  // CP
      nuevaFila[9]  = String(filaActual[9] || '');                  // Telefono
      nuevaFila[13] = String(filaActual[13] || '');                 // Notas

      // Detectar cambios en datos técnicos (Hilldun)
      var hayCambios = (
        String(filaActual[1]  || '') !== d.nombre   ||
        String(filaActual[3]  || '') !== d.dir1     ||
        String(filaActual[5]  || '') !== d.ciudad   ||
        String(filaActual[6]  || '') !== d.estado   ||
        String(filaActual[8]  || '') !== d.pais     ||
        String(filaActual[10] || '') !== d.terminos ||
        String(filaActual[11] || '') !== monStr
      );

      if (hayCambios) {
        sheet.getRange(sheetRowNum, 1, 1, nuevaFila.length).setValues([nuevaFila]);
        actualizados++;
      } else {
        sinCambios++;
      }
    } else {
      sheet.appendRow(nuevaFila);
      nuevos++;
    }
  });

  SpreadsheetApp.flush(); // forzar escritura en la hoja antes de devolver

  return { nuevos: nuevos, actualizados: actualizados, sinCambios: sinCambios, sinMatchGextia: sinMatchGextia };
}

// ---- Auto-match con clientes Gextia ----

function _autoMatchGextia(hilldunNombre, clientes) {
  if (!clientes || clientes.length === 0 || !hilldunNombre) return '';

  var normH  = _normalizarNombre(hilldunNombre);
  var wordsH = normH.split(' ').filter(function(w) { return w.length >= 3; });
  if (wordsH.length === 0) return '';

  var mejor = { score: 0, nombre: '' };

  clientes.forEach(function(c) {
    var normC  = _normalizarNombre(c.name);
    var wordsC = normC.split(' ').filter(function(w) { return w.length >= 3; });
    if (wordsC.length === 0) return;

    var comunes = wordsH.filter(function(w) { return wordsC.indexOf(w) !== -1; });
    if (comunes.length === 0) return;

    // Score: palabras comunes / palabras del nombre más corto
    var score = comunes.length / Math.min(wordsH.length, wordsC.length);
    if (score > mejor.score) {
      mejor = { score: score, nombre: c.name };
    }
  });

  // Umbral 0.5 para evitar falsos positivos
  return mejor.score >= 0.5 ? mejor.nombre : '';
}

function _normalizarNombre(s) {
  if (!s) return '';
  return String(s)
    .replace(/\([^)]*\)/g, ' ')  // eliminar texto entre paréntesis (ej: "(London)", "(clifton)")
    .toLowerCase()
    .replace(/['\.\-,\/\(\)&]/g, ' ')
    .replace(/\b(srl|spa|ltd|llc|inc|gmbh|sa|sl|group|co|corp|corporation|the|net|a|of|pty)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- Leer clientes Gextia desde Excel ----
// Formato Gextia: id | name | agent_ids/name

function _leerClientesGextia(fileId) {
  var filas = _leerExcelDesdeDrive(fileId);
  if (!filas || filas.length < 2) return [];

  var clientes = [];
  for (var i = 1; i < filas.length; i++) {
    var nombre = String(filas[i][1] || '').trim();
    if (nombre) clientes.push({ name: nombre });
  }
  return clientes;
}

// ---- Inicializar hoja Clientes ----

function _inicializarHojaClientes() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HILLDUN_SHEETS.CLIENTES);

  if (!sheet) {
    sheet = ss.insertSheet(HILLDUN_SHEETS.CLIENTES);
  }

  if (sheet.getLastRow() > 0) return; // ya tiene datos → no tocar

  sheet.appendRow(HILLDUN_CLIENTES_COLS);

  // Formato del header
  var headerRange = sheet.getRange(1, 1, 1, HILLDUN_CLIENTES_COLS.length);
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Destacar en amarillo la columna Gextia_Nombre (C1) — indica que es editable
  sheet.getRange('C1').setBackground('#fbbc04').setFontColor('#202124');

  // Checkbox validation en columna Activo (M)
  var activoRange = sheet.getRange('M2:M1000');
  var cbRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  activoRange.setDataValidation(cbRule);

  // Anchos de columna
  var anchos = [110, 200, 200, 200, 120, 130, 80, 70, 130, 130, 70, 90, 60, 200, 150];
  anchos.forEach(function(w, i) { sheet.setColumnWidth(i + 1, w); });
}

// ---- Utilidades de Drive ----

function _getOrCreateFolder(parentFolder, nombre) {
  var iter = parentFolder.getFoldersByName(nombre);
  return iter.hasNext() ? iter.next() : parentFolder.createFolder(nombre);
}

function _buscarArchivoClientes(folder) {
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f      = files.next();
    var nombre = f.getName().toLowerCase();
    if ((nombre.indexOf('clientes') !== -1 || nombre.indexOf('partners') !== -1 || nombre.indexOf('gextia') !== -1)
        && (nombre.endsWith('.xlsx') || nombre.endsWith('.xls'))) {
      return f;
    }
  }
  return null;
}

function _obtenerExcels(carpeta) {
  var resultado = [];
  var vistos    = {};

  // .xls (formato antiguo)
  var iter = carpeta.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (iter.hasNext()) {
    var f = iter.next();
    vistos[f.getId()] = true;
    resultado.push(f);
  }

  // .xlsx (formato moderno — MIME type diferente, no cubierto por MimeType.MICROSOFT_EXCEL)
  var iterXlsx = carpeta.getFilesByType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  while (iterXlsx.hasNext()) {
    var f = iterXlsx.next();
    if (!vistos[f.getId()]) {
      vistos[f.getId()] = true;
      resultado.push(f);
    }
  }

  // Fallback: buscar por extensión por si el MIME no está bien asignado
  var todos = carpeta.getFiles();
  while (todos.hasNext()) {
    var f = todos.next();
    if (vistos[f.getId()]) continue;
    var nombre = f.getName().toLowerCase();
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
      vistos[f.getId()] = true;
      resultado.push(f);
    }
  }

  // Ordenar del más reciente al más antiguo para procesar primero los datos más actuales
  resultado.sort(function(a, b) {
    return b.getLastUpdated().getTime() - a.getLastUpdated().getTime();
  });

  return resultado;
}

function _leerExcelDesdeDrive(fileId) {
  var archivo = DriveApp.getFileById(fileId);
  var blob    = archivo.getBlob();

  Logger.log('Convirtiendo: ' + archivo.getName() + ' (' + Math.round(blob.getBytes().length / 1024) + ' KB)');

  var convertido;
  for (var intento = 1; intento <= 3; intento++) {
    try {
      convertido = Drive.Files.create(
        { name: 'TEMP_HILLDUN_' + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS },
        blob
      );
      break;
    } catch(e) {
      Logger.log('Conversión intento ' + intento + ' fallido (' + archivo.getName() + '): ' + e.message);
      if (intento < 3) {
        Utilities.sleep(4000 * intento);
      } else {
        throw new Error('No se pudo convertir "' + archivo.getName() + '" tras 3 intentos: ' + e.message);
      }
    }
  }

  try {
    var ss    = SpreadsheetApp.openById(convertido.id);
    var sheet = ss.getSheets()[0];
    return sheet.getDataRange().getValues();
  } finally {
    try { DriveApp.getFileById(convertido.id).setTrashed(true); } catch(e) {}
  }
}
