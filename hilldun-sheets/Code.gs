// ============================================================
// Code.gs — Hilldun Google Sheet — Punto de entrada y constantes
//
// REQUISITO: Activar el servicio avanzado "Drive API" en Apps Script:
//   Editor → Servicios (icono "+") → Drive API → Añadir
// ============================================================

var HILLDUN_SHEETS = {
  CLIENTES: 'Clientes'
};

var HILLDUN_PROP = {
  CONFIGURADO:    'HILLDUN_CONFIGURADO',
  BASE_DATOS_ID:  'HILLDUN_BASE_DATOS_ID',
  EURO_ID:        'HILLDUN_EURO_ID',
  DOLAR_ID:       'HILLDUN_DOLAR_ID',
  GEXTIA_FILE_ID: 'HILLDUN_GEXTIA_FILE_ID'
};

// Columnas de la pestaña Clientes (orden fijo — no cambiar sin actualizar los índices)
var HILLDUN_CLIENTES_COLS = [
  'Hilldun_Code',         // A  ← clave única, no editar
  'Hilldun_Nombre',       // B
  'Gextia_Nombre',        // C  ← editable: nombre exacto del cliente en Gextia/Facturas
  'Direccion1',           // D
  'Direccion2',           // E
  'Ciudad',               // F
  'Estado',               // G
  'CP',                   // H  ← añadir manualmente (no está en los archivos Hilldun)
  'Pais',                 // I
  'Telefono',             // J  ← añadir manualmente
  'Terminos',             // K  (NET30 / NET60 / …)
  'Monedas',              // L  (EUR / USD / EUR+USD)
  'Activo',               // M  (checkbox)
  'Notas',                // N  ← editable
  'Ultima_Actualizacion'  // O
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Hilldun')
    .addItem('⚙️ Configurar', 'configurarHilldun')
    .addSeparator()
    .addItem('🔄 Actualizar Clientes desde Drive', 'actualizarClientesDesdeDrive')
    .addItem('📊 Ver estado', 'verEstadoHilldun')
    .addSeparator()
    .addItem('📄 Generar archivo de Facturas', 'generarArchivoFacturas')
    .addToUi();
}

function verEstadoHilldun() {
  var props = PropertiesService.getScriptProperties();
  var ui    = SpreadsheetApp.getUi();

  if (!props.getProperty(HILLDUN_PROP.CONFIGURADO)) {
    ui.alert('Sin configurar', 'Ejecuta primero: Hilldun → ⚙️ Configurar', ui.ButtonSet.OK);
    return;
  }

  var sheet    = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HILLDUN_SHEETS.CLIENTES);
  var nClients = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;

  var euroId  = props.getProperty(HILLDUN_PROP.EURO_ID);
  var dolarId = props.getProperty(HILLDUN_PROP.DOLAR_ID);

  var euroFiles = 0, dolarFiles = 0;
  try { if (euroId)  euroFiles  = _obtenerExcels(DriveApp.getFolderById(euroId)).length;  } catch(e) {}
  try { if (dolarId) dolarFiles = _obtenerExcels(DriveApp.getFolderById(dolarId)).length; } catch(e) {}

  var gextiaOk = !!props.getProperty(HILLDUN_PROP.GEXTIA_FILE_ID);

  ui.alert(
    '📊 Estado Hilldun',
    'Clientes en base de datos: ' + nClients + '\n\n'
    + 'Archivos en Drive:\n'
    + '  BASE DE DATOS/EURO:  ' + euroFiles  + ' archivo(s)\n'
    + '  BASE DE DATOS/DOLAR: ' + dolarFiles + ' archivo(s)\n\n'
    + 'Clientes Gextia: ' + (gextiaOk ? '✅ configurado' : '⚠️ no encontrado\n   (sube el Excel de clientes de Gextia a la carpeta BASE DE DATOS)'),
    ui.ButtonSet.OK
  );
}

function generarArchivoFacturas() {
  SpreadsheetApp.getUi().alert(
    'Próximamente',
    'La generación del archivo de Facturas para Hilldun está en desarrollo.\n\n'
    + 'Asegúrate primero de que la base de datos de clientes está completa:\n'
    + '  • Todos los clientes tienen Gextia_Nombre rellenado\n'
    + '  • CP y Teléfono añadidos donde sea necesario',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
