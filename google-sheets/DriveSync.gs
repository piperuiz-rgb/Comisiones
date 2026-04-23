// ============================================================
// DriveSync.gs — Sincronización automática desde carpetas de Drive
//
// REQUISITO: Activar el servicio avanzado "Drive API" en Apps Script:
//   Editor → Servicios (icono "+") → Drive API → Añadir
//
// Estructura esperada en Google Drive (ya creada por el usuario):
//
//   📁 Comisiones Showrooms/      ← carpeta que contiene este Google Sheet
//      ├── 📊 [Este Google Sheet]
//      ├── 📁 Showrooms/          ← sube aquí los Excel de showrooms
//      ├── 📁 Clientes/
//      ├── 📁 Pedidos/
//      ├── 📁 Facturas/
//      └── 📁 Cobros/
//
// Flujo de uso:
//   1. Exporta desde Gextia → guarda el .xlsx en la subcarpeta correspondiente
//   2. El script procesará los archivos esa noche a las 2:00 AM
//      (o ejecútalo manualmente: Comisiones CRI → ☁️ Sincronizar desde Drive)
//   3. Los archivos se eliminan automáticamente tras procesarlos
//
// La primera vez ejecuta "Configurar sincronización con Drive" desde el menú.
// ============================================================

var PROP = {
  CONFIGURADO: 'DRIVE_SYNC_CONFIGURADO',
  SHOWROOMS:   'CARPETA_SHOWROOMS_ID',
  CLIENTES:    'CARPETA_CLIENTES_ID',
  PEDIDOS:     'CARPETA_PEDIDOS_ID',
  FACTURAS:    'CARPETA_FACTURAS_ID',
  COBROS:      'CARPETA_COBROS_ID'
};

// ---- Configuración inicial (una sola vez) ----

function configurarDriveSync() {
  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  // Localizar la carpeta padre del Google Sheet actual
  var ssFile  = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  var parents = ssFile.getParents();
  if (!parents.hasNext()) {
    ui.alert('Error', 'No se pudo determinar la carpeta del Google Sheet.\nAsegúrate de que el archivo está dentro de una carpeta en Drive.', ui.ButtonSet.OK);
    return;
  }
  var raiz = parents.next();

  // Buscar o crear las subcarpetas de cada entidad
  var entidades = ['Showrooms', 'Clientes', 'Pedidos', 'Facturas', 'Cobros'];
  var carpetasEncontradas = {};
  var creadas = [];

  entidades.forEach(function(nombre) {
    var iter = raiz.getFoldersByName(nombre);
    if (iter.hasNext()) {
      carpetasEncontradas[nombre] = iter.next();
    } else {
      carpetasEncontradas[nombre] = raiz.createFolder(nombre);
      creadas.push(nombre);
    }
  });

  // Guardar IDs en Properties
  var propMap = {};
  propMap[PROP.CONFIGURADO] = 'true';
  propMap[PROP.SHOWROOMS]   = carpetasEncontradas['Showrooms'].getId();
  propMap[PROP.CLIENTES]    = carpetasEncontradas['Clientes'].getId();
  propMap[PROP.PEDIDOS]     = carpetasEncontradas['Pedidos'].getId();
  propMap[PROP.FACTURAS]    = carpetasEncontradas['Facturas'].getId();
  propMap[PROP.COBROS]      = carpetasEncontradas['Cobros'].getId();
  props.setProperties(propMap);

  _activarTriggerNocturno();

  var msg = '✅ Sincronización configurada.\n\n';
  msg += 'Carpeta raíz: "' + raiz.getName() + '"\n\n';
  msg += 'Subcarpetas:\n';
  entidades.forEach(function(n) {
    msg += (creadas.indexOf(n) !== -1 ? '  ✨ ' : '  ✅ ') + n + '\n';
  });
  if (creadas.length > 0) msg += '\n(Las marcadas con ✨ se han creado porque no existían.)';
  msg += '\n\n🕑 Sincronización automática: cada noche a las 2:00 AM.\n';
  msg += 'Los archivos Excel se borran automáticamente al procesarse.';

  ui.alert('Sincronización con Drive', msg, ui.ButtonSet.OK);
}

// ---- Sincronización (llamada por el trigger o por el menú) ----

function sincronizarDesdeDrive() {
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(PROP.CONFIGURADO)) {
    try {
      SpreadsheetApp.getUi().alert(
        'Sin configurar',
        'Primero configura la sincronización:\nComisiones CRI → ⚙️ Configuración → Configurar sincronización con Drive',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch(e) { Logger.log('Drive sync: sin configurar.'); }
    return;
  }

  var entidades = [
    { nombre: 'Showrooms', propId: PROP.SHOWROOMS, procesarFn: _procesarShowrooms },
    { nombre: 'Clientes',  propId: PROP.CLIENTES,  procesarFn: _procesarClientes  },
    { nombre: 'Pedidos',   propId: PROP.PEDIDOS,   procesarFn: _procesarPedidos   },
    { nombre: 'Facturas',  propId: PROP.FACTURAS,  procesarFn: _procesarFacturas  },
    { nombre: 'Cobros',    propId: PROP.COBROS,    procesarFn: _procesarCobros    }
  ];

  var lineasResumen = [];
  var totalArchivos = 0;

  entidades.forEach(function(entidad) {
    var carpetaId = props.getProperty(entidad.propId);
    if (!carpetaId) return;

    var carpeta, archivos;
    try {
      carpeta  = DriveApp.getFolderById(carpetaId);
      archivos = _obtenerExcels(carpeta);
    } catch(e) {
      lineasResumen.push('❌ Carpeta ' + entidad.nombre + ': no se pudo acceder — ' + e.message);
      Logger.log('Error accediendo a carpeta ' + entidad.nombre + ' (' + carpetaId + '): ' + e.message);
      return;
    }

    archivos.forEach(function(archivo) {
      if (totalArchivos > 0) Utilities.sleep(2000); // pausa entre archivos para evitar rate limit
      totalArchivos++;
      var nombreOriginal = archivo.getName();
      try {
        var filas = _leerExcelDesdeDrive(archivo.getId());

        // Borrar el Excel haya o no datos (ya fue leído)
        try { archivo.setTrashed(true); } catch(eDel) { Logger.log('No se pudo borrar ' + nombreOriginal + ': ' + eDel.message); }

        if (!filas || filas.length < 2) {
          lineasResumen.push('⚠️ ' + nombreOriginal + ': vacío, omitido.');
          return;
        }

        var resultado = entidad.procesarFn(filas);
        lineasResumen.push(
          entidad.nombre + ' · ' + nombreOriginal + ':\n' +
          '    ✅ ' + resultado.nuevos       + ' nuevos  ' +
          '🔄 ' + resultado.actualizados + ' actualizados  ' +
          '— '  + resultado.sinCambios   + ' sin cambios'
        );
        if ((resultado.errores || []).length > 0) {
          lineasResumen.push('    ⚠️ ' + resultado.errores.slice(0, 3).join('\n    ⚠️ '));
        }

      } catch(e) {
        lineasResumen.push('❌ ' + nombreOriginal + ': ERROR — ' + e.message);
        Logger.log('Error procesando ' + nombreOriginal + ': ' + e.message + '\n' + e.stack);
      }
    });
  });

  var msg;
  if (totalArchivos === 0) {
    msg = 'No se encontraron archivos Excel en las carpetas.\n\nSube los .xlsx exportados de Gextia a las subcarpetas correspondientes.';
  } else {
    msg = 'Archivos procesados: ' + totalArchivos + '\n\n' + lineasResumen.join('\n\n');
  }

  Logger.log('DriveSync completado: ' + msg);

  // Actualizar resumen de pedidos si se procesaron archivos
  if (totalArchivos > 0) {
    try { actualizarResumenPedidos(); } catch(e) { Logger.log('actualizarResumenPedidos: ' + e.message); }
  }

  try {
    SpreadsheetApp.getUi().alert('☁️ Sincronización completada', msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch(e) {
    // Ejecutado desde trigger, sin UI — OK
  }
}

// ---- Leer archivo Excel de Drive ----

function _leerExcelDesdeDrive(fileId) {
  var archivo = DriveApp.getFileById(fileId);
  var blob    = archivo.getBlob();

  Logger.log('Convirtiendo: ' + archivo.getName() + ' (' + Math.round(blob.getBytes().length / 1024) + ' KB)');

  // Convertir xlsx a Google Sheets (Drive API v3) — hasta 3 intentos con pausa
  var convertido;
  for (var intento = 1; intento <= 3; intento++) {
    try {
      convertido = Drive.Files.create(
        { name: 'TEMP_CRI_' + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS },
        blob
      );
      break;
    } catch(e) {
      Logger.log('Conversión intento ' + intento + ' fallido (' + archivo.getName() + '): ' + e.message);
      if (intento < 3) {
        Utilities.sleep(4000 * intento); // 4s, luego 8s
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
    try { DriveApp.getFileById(convertido.id).setTrashed(true); } catch(eTmp) {}
  }
}

// ---- Obtener archivos Excel de una carpeta ----

function _obtenerExcels(carpeta) {
  var resultado = [];
  var vistos    = {};

  var iter = carpeta.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (iter.hasNext()) {
    var f = iter.next();
    vistos[f.getId()] = true;
    resultado.push(f);
  }

  // También buscar por nombre por si el MIME no coincide exactamente
  var todos = carpeta.getFiles();
  while (todos.hasNext()) {
    var f = todos.next();
    if (vistos[f.getId()]) continue;
    var nombre = f.getName().toLowerCase();
    if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
      resultado.push(f);
    }
  }

  return resultado;
}

// ---- Gestión del trigger nocturno ----

function _activarTriggerNocturno() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarDesdeDrive') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sincronizarDesdeDrive')
    .timeBased()
    .everyDays(1)
    .atHour(2)
    .create();
}

function desactivarSyncAutomatica() {
  var eliminados = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarDesdeDrive') {
      ScriptApp.deleteTrigger(t);
      eliminados++;
    }
  });
  SpreadsheetApp.getUi().alert(
    eliminados > 0
      ? '✅ Sincronización automática desactivada.\nPuedes reactivarla desde Configurar sincronización con Drive.'
      : 'No había ningún trigger activo.'
  );
}

// ---- Estado de la configuración ----

function verEstadoSync() {
  var props = PropertiesService.getScriptProperties();
  var ui    = SpreadsheetApp.getUi();

  if (!props.getProperty(PROP.CONFIGURADO)) {
    ui.alert('Sin configurar', 'La sincronización con Drive no está configurada.\n\nEjecuta: ⚙️ Configuración → Configurar sincronización con Drive', ui.ButtonSet.OK);
    return;
  }

  var triggerActivo = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'sincronizarDesdeDrive';
  });

  var entidades = [
    { nombre: 'Showrooms', prop: PROP.SHOWROOMS },
    { nombre: 'Clientes',  prop: PROP.CLIENTES  },
    { nombre: 'Pedidos',   prop: PROP.PEDIDOS   },
    { nombre: 'Facturas',  prop: PROP.FACTURAS  },
    { nombre: 'Cobros',    prop: PROP.COBROS    }
  ];

  var lineas = entidades.map(function(e) {
    var id = props.getProperty(e.prop);
    if (!id) return '  ' + e.nombre + ': ⚠️ no configurada';
    try {
      var archivos = _obtenerExcels(DriveApp.getFolderById(id));
      return '  ' + e.nombre + ': ' +
             (archivos.length > 0 ? archivos.length + ' archivo(s) pendiente(s)' : 'sin archivos');
    } catch(ex) {
      return '  ' + e.nombre + ': ⚠️ error accediendo a la carpeta';
    }
  });

  ui.alert(
    '☁️ Estado de la sincronización',
    'Trigger nocturno (2:00 AM): ' + (triggerActivo ? '✅ activo' : '❌ inactivo') + '\n\n' +
    'Archivos pendientes:\n' + lineas.join('\n') + '\n\n' +
    'Los archivos se borran automáticamente al procesarse.',
    ui.ButtonSet.OK
  );
}
