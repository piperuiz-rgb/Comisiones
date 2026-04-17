// ============================================================
// DriveSync.gs — Sincronización automática desde carpetas de Drive
//
// REQUISITO: Activar el servicio avanzado "Drive API" en Apps Script:
//   Editor → Servicios (icono "+") → Drive API → Añadir
//
// Estructura de carpetas que se crea automáticamente en tu Drive:
//
//   📁 Comisiones_CRI_Import/
//      ├── 📁 Showrooms/     ← sube aquí los Excel de showrooms
//      ├── 📁 Clientes/      ← sube aquí los Excel de clientes
//      ├── 📁 Pedidos/
//      ├── 📁 Facturas/
//      ├── 📁 Cobros/
//      └── 📁 Procesados/    ← el script mueve aquí los archivos ya procesados
//             ├── 📁 Showrooms/
//             ├── 📁 Clientes/
//             ├── 📁 Pedidos/
//             ├── 📁 Facturas/
//             └── 📁 Cobros/
//
// El script se ejecuta automáticamente cada noche a las 2:00 AM.
// También puedes ejecutarlo manualmente: Comisiones CRI → ☁️ Sincronizar ahora
// ============================================================

// Claves de PropertiesService para persistir los IDs de carpeta
var PROP = {
  CONFIGURADO: 'DRIVE_SYNC_CONFIGURADO',
  SHOWROOMS:   'CARPETA_SHOWROOMS_ID',
  CLIENTES:    'CARPETA_CLIENTES_ID',
  PEDIDOS:     'CARPETA_PEDIDOS_ID',
  FACTURAS:    'CARPETA_FACTURAS_ID',
  COBROS:      'CARPETA_COBROS_ID',
  PROC_SR:     'CARPETA_PROC_SHOWROOMS_ID',
  PROC_CL:     'CARPETA_PROC_CLIENTES_ID',
  PROC_PE:     'CARPETA_PROC_PEDIDOS_ID',
  PROC_FA:     'CARPETA_PROC_FACTURAS_ID',
  PROC_CO:     'CARPETA_PROC_COBROS_ID'
};

// ---- Configuración inicial (una sola vez) ----

function configurarDriveSync() {
  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  if (props.getProperty(PROP.CONFIGURADO)) {
    var resp = ui.alert(
      'Ya configurado',
      'La sincronización con Drive ya está activa.\n\n' +
      '¿Quieres reconfigurar y crear una nueva estructura de carpetas?\n' +
      '(Las carpetas antiguas no se eliminarán.)',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  // Crear estructura de carpetas en la raíz de Drive
  var raiz        = DriveApp.createFolder('Comisiones_CRI_Import');
  var procesados  = raiz.createFolder('Procesados');

  var carpetas = {
    showrooms: raiz.createFolder('Showrooms'),
    clientes:  raiz.createFolder('Clientes'),
    pedidos:   raiz.createFolder('Pedidos'),
    facturas:  raiz.createFolder('Facturas'),
    cobros:    raiz.createFolder('Cobros')
  };

  var procCarpetas = {
    showrooms: procesados.createFolder('Showrooms'),
    clientes:  procesados.createFolder('Clientes'),
    pedidos:   procesados.createFolder('Pedidos'),
    facturas:  procesados.createFolder('Facturas'),
    cobros:    procesados.createFolder('Cobros')
  };

  // Guardar IDs en Properties para que persistan aunque se cierre el script
  props.setProperties({
    DRIVE_SYNC_CONFIGURADO:    'true',
    CARPETA_SHOWROOMS_ID:      carpetas.showrooms.getId(),
    CARPETA_CLIENTES_ID:       carpetas.clientes.getId(),
    CARPETA_PEDIDOS_ID:        carpetas.pedidos.getId(),
    CARPETA_FACTURAS_ID:       carpetas.facturas.getId(),
    CARPETA_COBROS_ID:         carpetas.cobros.getId(),
    CARPETA_PROC_SHOWROOMS_ID: procCarpetas.showrooms.getId(),
    CARPETA_PROC_CLIENTES_ID:  procCarpetas.clientes.getId(),
    CARPETA_PROC_PEDIDOS_ID:   procCarpetas.pedidos.getId(),
    CARPETA_PROC_FACTURAS_ID:  procCarpetas.facturas.getId(),
    CARPETA_PROC_COBROS_ID:    procCarpetas.cobros.getId()
  });

  // Activar el trigger nocturno
  _activarTriggerNocturno();

  ui.alert(
    '✅ Configuración completada',
    'Carpetas creadas en tu Google Drive:\n\n' +
    '📁 Comisiones_CRI_Import/\n' +
    '   ├── Showrooms/\n' +
    '   ├── Clientes/\n' +
    '   ├── Pedidos/\n' +
    '   ├── Facturas/\n' +
    '   ├── Cobros/\n' +
    '   └── Procesados/\n\n' +
    '🕑 El script sincronizará automáticamente cada noche a las 2:00 AM.\n\n' +
    'Flujo de uso:\n' +
    '1. Exporta desde Odoo → guarda el .xlsx en la carpeta correspondiente de Drive\n' +
    '2. El script lo procesará esa noche (o ejecuta "Sincronizar ahora" manualmente)\n' +
    '3. El archivo procesado se moverá a Procesados/ automáticamente',
    ui.ButtonSet.OK
  );
}

// ---- Sincronización (llamada por el trigger o por el menú) ----

function sincronizarDesdeDrive() {
  var props = PropertiesService.getScriptProperties();

  if (!props.getProperty(PROP.CONFIGURADO)) {
    try {
      SpreadsheetApp.getUi().alert(
        'Sin configurar',
        'Primero configura la sincronización:\nComisiones CRI → ☁️ Configurar sincronización con Drive',
        SpreadsheetApp.getUi().ButtonSet.OK
      );
    } catch(e) { Logger.log('Drive sync: sin configurar.'); }
    return;
  }

  var entidades = [
    { nombre: 'Showrooms', propCarpeta: PROP.SHOWROOMS, propProc: PROP.PROC_SR, procesarFn: _procesarShowrooms },
    { nombre: 'Clientes',  propCarpeta: PROP.CLIENTES,  propProc: PROP.PROC_CL, procesarFn: _procesarClientes  },
    { nombre: 'Pedidos',   propCarpeta: PROP.PEDIDOS,   propProc: PROP.PROC_PE, procesarFn: _procesarPedidos   },
    { nombre: 'Facturas',  propCarpeta: PROP.FACTURAS,  propProc: PROP.PROC_FA, procesarFn: _procesarFacturas  },
    { nombre: 'Cobros',    propCarpeta: PROP.COBROS,    propProc: PROP.PROC_CO, procesarFn: _procesarCobros    }
  ];

  var lineasResumen = [];
  var totalArchivos = 0;
  var timestamp     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');

  entidades.forEach(function(entidad) {
    var carpetaId    = props.getProperty(entidad.propCarpeta);
    var procesadosId = props.getProperty(entidad.propProc);
    if (!carpetaId || !procesadosId) return;

    var carpeta   = DriveApp.getFolderById(carpetaId);
    var procesados = DriveApp.getFolderById(procesadosId);
    var archivos  = _obtenerExcels(carpeta);

    archivos.forEach(function(archivo) {
      totalArchivos++;
      var nombreOriginal = archivo.getName();
      try {
        var filas = _leerExcelDesdeDrive(archivo.getId());
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

        // Mover a Procesados con timestamp en el nombre para evitar colisiones
        var nuevoNombre = nombreOriginal.replace(/\.xlsx?$/i, '') + '_' + timestamp + '.xlsx';
        archivo.setName(nuevoNombre);
        archivo.moveTo(procesados);

      } catch(e) {
        lineasResumen.push('❌ ' + nombreOriginal + ': ERROR — ' + e.message);
        Logger.log('Error procesando ' + nombreOriginal + ': ' + e.message);
      }
    });
  });

  var msg;
  if (totalArchivos === 0) {
    msg = 'No se encontraron archivos Excel en las carpetas de Drive.\n\nSube los .xlsx exportados de Odoo a las carpetas correspondientes.';
  } else {
    msg = 'Archivos procesados: ' + totalArchivos + '\n\n' + lineasResumen.join('\n\n');
  }

  Logger.log('DriveSync completado: ' + msg);

  // Mostrar resumen si hay UI disponible (no cuando se ejecuta desde trigger)
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

  // Convertir xlsx a Google Sheets temporalmente usando Drive API (servicio avanzado)
  var recurso = {
    title:    'TEMP_CRI_' + new Date().getTime(),
    mimeType: MimeType.GOOGLE_SHEETS
  };
  var convertido = Drive.Files.insert(recurso, blob, { convert: true });

  try {
    var ss    = SpreadsheetApp.openById(convertido.id);
    var sheet = ss.getSheets()[0];
    var data  = sheet.getDataRange().getValues();
    return data;
  } finally {
    // Borrar siempre la copia temporal, haya error o no
    DriveApp.getFileById(convertido.id).setTrashed(true);
  }
}

// ---- Obtener archivos Excel de una carpeta ----

function _obtenerExcels(carpeta) {
  var resultado = [];
  var vistos    = {};

  // Buscar por tipo MIME oficial de Excel
  var iter = carpeta.getFilesByType(MimeType.MICROSOFT_EXCEL);
  while (iter.hasNext()) {
    var f = iter.next();
    vistos[f.getId()] = true;
    resultado.push(f);
  }

  // También buscar .xlsx/.xls por nombre (por si el MIME no coincide exactamente)
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
  // Eliminar triggers existentes para esta función antes de crear uno nuevo
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'sincronizarDesdeDrive') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sincronizarDesdeDrive')
    .timeBased()
    .everyDays(1)
    .atHour(2)   // 2:00 AM en la zona horaria del script
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
    ui.alert('Sin configurar', 'La sincronización con Drive no está configurada todavía.', ui.ButtonSet.OK);
    return;
  }

  var triggerActivo = ScriptApp.getProjectTriggers().some(function(t) {
    return t.getHandlerFunction() === 'sincronizarDesdeDrive';
  });

  var entidades = ['Showrooms', 'Clientes', 'Pedidos', 'Facturas', 'Cobros'];
  var lineas = entidades.map(function(nombre) {
    var propKey = 'CARPETA_' + nombre.toUpperCase() + '_ID';
    var id = props.getProperty(propKey);
    if (!id) return '  ' + nombre + ': ⚠️ carpeta no encontrada';
    try {
      var carpeta  = DriveApp.getFolderById(id);
      var archivos = _obtenerExcels(carpeta);
      return '  ' + nombre + ': ' + archivos.length + ' archivo(s) pendiente(s)';
    } catch(e) {
      return '  ' + nombre + ': ⚠️ error accediendo a la carpeta';
    }
  });

  ui.alert(
    '☁️ Estado de la sincronización',
    'Trigger nocturno (2:00 AM): ' + (triggerActivo ? '✅ activo' : '❌ inactivo') + '\n\n' +
    'Archivos pendientes en Drive:\n' + lineas.join('\n'),
    ui.ButtonSet.OK
  );
}
