// ============================================================
// Facturas.gs — Generador de archivo de facturas para Hilldun
//
// Lee facturas de la hoja Comisiones (pestaña "Facturas") donde
// Modo_Pago empieza por "Factoring", cruza con Pedidos para
// obtener la PO de Joor y con la pestaña Clientes (este mismo
// sheet) para los datos de dirección.
//
// Genera dos archivos en Drive (carpeta BASE DE DATOS/Salida):
//   · XLSX — formato PLANTILLA Hilldun (14 columnas)
//   · CSV  — mismo contenido, separado por comas
//
// PLANTILLA:
//   InvNum | PO | InvAmt | InvDate | InvTerms |
//   CustName | CustAdd1 | CustAdd2 | CustCity | CustState |
//   CustZip | Country | Carrier | Tracking
// ============================================================

var PLANTILLA_CABECERAS = [
  'InvNum', 'PO', 'InvAmt', 'InvDate', 'InvTerms',
  'CustName', 'CustAdd1', 'CustAdd2', 'CustCity', 'CustState',
  'CustZip', 'Country', 'Carrier', 'Tracking'
];

// ---- Configuración del enlace con la hoja Comisiones ----

function configurarComisionesLink() {
  var ui   = SpreadsheetApp.getUi();
  var resp = ui.prompt(
    'Enlace con Comisiones CRI',
    'Pega la URL completa o el ID del Google Sheet de Comisiones CRI:',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var input = resp.getResponseText().trim();
  if (!input) return;

  var id = input;
  var m  = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];

  try {
    var ss     = SpreadsheetApp.openById(id);
    var nombre = ss.getName();
    PropertiesService.getScriptProperties().setProperty(HILLDUN_PROP.COMISIONES_ID, id);
    ui.alert(
      '✅ Enlace configurado',
      'Conectado a: "' + nombre + '"\n\nID guardado correctamente.',
      ui.ButtonSet.OK
    );
  } catch(e) {
    ui.alert(
      'Error al conectar',
      'No se pudo abrir el archivo con ese ID/URL.\n\n'
      + 'Verifica que:\n'
      + '  • El ID es correcto\n'
      + '  • Tienes acceso al archivo\n\n'
      + 'Error: ' + e.message,
      ui.ButtonSet.OK
    );
  }
}

// ---- Generador principal ----

function generarArchivoFacturas() {
  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var comisionesId = props.getProperty(HILLDUN_PROP.COMISIONES_ID);
  if (!comisionesId) {
    ui.alert(
      'Sin configurar',
      'Primero configura el enlace con la hoja Comisiones:\n'
      + 'Hilldun → 🔗 Configurar enlace Comisiones',
      ui.ButtonSet.OK
    );
    return;
  }

  // Pedir rango de fechas
  var respDesde = ui.prompt(
    'Fecha inicio',
    'Introduce la fecha de inicio (yyyy-mm-dd):',
    ui.ButtonSet.OK_CANCEL
  );
  if (respDesde.getSelectedButton() !== ui.Button.OK) return;
  var desdeStr = _normalizarFechaStr(respDesde.getResponseText().trim());

  var respHasta = ui.prompt(
    'Fecha fin',
    'Introduce la fecha de fin (yyyy-mm-dd):',
    ui.ButtonSet.OK_CANCEL
  );
  if (respHasta.getSelectedButton() !== ui.Button.OK) return;
  var hastaStr = _normalizarFechaStr(respHasta.getResponseText().trim());

  if (!desdeStr || !hastaStr) {
    ui.alert('Error', 'Formato de fecha no reconocido. Usa yyyy-mm-dd.', ui.ButtonSet.OK);
    return;
  }

  // Abrir hoja Comisiones
  var comisionesSs;
  try {
    comisionesSs = SpreadsheetApp.openById(comisionesId);
  } catch(e) {
    ui.alert(
      'Error al abrir Comisiones',
      'No se puede abrir el archivo de Comisiones.\n\nError: ' + e.message,
      ui.ButtonSet.OK
    );
    return;
  }

  // Leer Facturas y Pedidos desde Comisiones
  var facturasSheet = comisionesSs.getSheetByName('Facturas');
  if (!facturasSheet) {
    ui.alert('Error', 'No se encontró la pestaña "Facturas" en el archivo Comisiones.', ui.ButtonSet.OK);
    return;
  }
  var todasFacturas = _leerHojaComoObjetos(facturasSheet);

  var pedidosSheet = comisionesSs.getSheetByName('Pedidos');
  var todosPedidos = pedidosSheet ? _leerHojaComoObjetos(pedidosSheet) : [];

  // Mapa Pedidos: Numero → registro completo
  var pedidosPorNumero = {};
  todosPedidos.forEach(function(p) {
    var num = String(p.Numero || p.ID_Odoo || '').trim();
    if (num) pedidosPorNumero[num] = p;
  });

  // Leer Clientes de este mismo sheet (Hilldun)
  var clientesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HILLDUN_SHEETS.CLIENTES);
  var hilldunClientes = clientesSheet ? _leerHojaComoObjetos(clientesSheet) : [];

  // Mapa Hilldun Clientes: Gextia_Nombre → registro
  var hilldunPorGextia = {};
  hilldunClientes.forEach(function(c) {
    var nombre = String(c.Gextia_Nombre || '').trim();
    if (nombre) hilldunPorGextia[nombre] = c;
  });

  // Filtrar facturas Hilldun: Modo_Pago empieza por "Factoring", en rango de fechas, no abonos
  var facturasHilldun = todasFacturas.filter(function(f) {
    var modoPago = String(f.Modo_Pago || '').trim().toUpperCase();
    var fecha    = _valorFechaStr(f.Fecha);
    var esAbono  = f.Es_Abono === true || String(f.Es_Abono || '').toLowerCase() === 'true';
    return modoPago.indexOf('FACTORING') === 0
      && !esAbono
      && fecha >= desdeStr
      && fecha <= hastaStr;
  });

  if (facturasHilldun.length === 0) {
    ui.alert(
      'Sin resultados',
      'No hay facturas Hilldun (Modo_Pago = "Factoring...") en el período\n'
      + desdeStr + ' → ' + hastaStr,
      ui.ButtonSet.OK
    );
    return;
  }

  // Construir filas de la PLANTILLA
  var filas = [];
  var sinCliente = [];

  facturasHilldun.forEach(function(factura) {
    var tracking = _extraerTracking(factura);

    // PO Joor: Pedidos_Ref → Pedidos.Referencia_Cliente
    var po = '';
    var pedidoRef = String(factura.Pedidos_Ref || '').trim();
    if (pedidoRef) {
      var primerRef = pedidoRef.split(',')[0].trim();
      var pedido    = pedidosPorNumero[primerRef];
      if (pedido) po = String(pedido.Referencia_Cliente || '').trim();
    }

    // Datos de dirección desde Hilldun Clientes
    var clienteNombre   = String(factura.Cliente_Nombre || '').trim();
    var hilldunCliente  = hilldunPorGextia[clienteNombre];
    if (!hilldunCliente) sinCliente.push(clienteNombre);
    var hc = hilldunCliente || {};

    filas.push([
      String(factura.Numero || '').trim(),                        // InvNum
      po,                                                          // PO
      parseFloat(factura.Importe) || 0,                           // InvAmt
      _valorFechaStr(factura.Fecha),                              // InvDate
      String(hc.Terminos    || '').trim(),                        // InvTerms
      String(hc.Hilldun_Nombre || clienteNombre).trim(),          // CustName
      String(hc.Direccion1  || '').trim(),                        // CustAdd1
      String(hc.Direccion2  || '').trim(),                        // CustAdd2
      String(hc.Ciudad      || '').trim(),                        // CustCity
      String(hc.Estado      || '').trim(),                        // CustState
      String(hc.CP          || '').trim(),                        // CustZip
      String(hc.Pais        || '').trim(),                        // Country
      tracking.carrier,                                            // Carrier
      tracking.numero                                              // Tracking
    ]);
  });

  // Obtener/crear carpeta Salida
  var baseDatosId = props.getProperty(HILLDUN_PROP.BASE_DATOS_ID);
  var salidaFolder;
  if (baseDatosId) {
    try {
      var baseDatos  = DriveApp.getFolderById(baseDatosId);
      var salidaIter = baseDatos.getFoldersByName('Salida');
      salidaFolder   = salidaIter.hasNext() ? salidaIter.next() : baseDatos.createFolder('Salida');
    } catch(e) {
      salidaFolder = DriveApp.getRootFolder();
    }
  } else {
    salidaFolder = DriveApp.getRootFolder();
  }

  var fechaSufijo  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
  var nombreBase   = 'Hilldun_' + desdeStr.replace(/-/g, '') + '_' + hastaStr.replace(/-/g, '') + '_' + fechaSufijo;

  var archivoXlsx = _generarXlsx(filas, PLANTILLA_CABECERAS, nombreBase + '.xlsx', salidaFolder);
  var archivoCsv  = _generarCsv(filas,  PLANTILLA_CABECERAS, nombreBase + '.csv',  salidaFolder);

  var carpetaNombre = baseDatosId ? 'BASE DE DATOS/Salida' : 'Google Drive (raíz)';
  var msg = '✅ ' + filas.length + ' factura(s) exportada(s)\n\n'
    + 'Archivos generados en ' + carpetaNombre + ':\n'
    + '  📊 ' + archivoXlsx.getName() + '\n'
    + '  📄 ' + archivoCsv.getName();

  if (sinCliente.length > 0) {
    var unicos = sinCliente.filter(function(v, i, a) { return a.indexOf(v) === i; });
    msg += '\n\n⚠️ ' + unicos.length + ' cliente(s) sin datos en la pestaña Clientes de Hilldun\n'
      + '(dirección y términos aparecerán vacíos):\n'
      + unicos.slice(0, 6).join('\n')
      + (unicos.length > 6 ? '\n... y ' + (unicos.length - 6) + ' más' : '');
  }

  ui.alert('Archivo de facturas generado', msg, ui.ButtonSet.OK);
}

// ---- Lógica de tracking ----

// Prioridad:
//   1. Tracking_Envio: si no vacío y no empieza por "CONSOL"
//      → formato "TRANSPORTISTA NUMEROSEGUIMIENTO FECHA..."
//      → primer token = carrier, segundo token = número
//   2. Tracking_DHL: si tiene datos → carrier = "DHL EXPRESS"
//   3. Tracking_Seguimiento: solo si empieza por "07" o "08"
function _extraerTracking(factura) {
  var envio  = String(factura.Tracking_Envio          || '').trim();
  var dhl    = String(factura.Tracking_DHL             || '').trim();
  var seguim = String(factura.Tracking_Seguimiento     || '').trim();

  if (envio && envio.toUpperCase().indexOf('CONSOL') !== 0) {
    var partes = envio.split(/\s+/);
    if (partes.length >= 2) {
      return { carrier: partes[0].toUpperCase(), numero: partes[1] };
    }
    return { carrier: '', numero: envio };
  }

  if (dhl) {
    return { carrier: 'DHL EXPRESS', numero: dhl };
  }

  if (seguim && (seguim.indexOf('07') === 0 || seguim.indexOf('08') === 0)) {
    return { carrier: '', numero: seguim };
  }

  return { carrier: '', numero: '' };
}

// ---- Generación de archivos ----

function _generarXlsx(filas, cabeceras, nombreArchivo, carpeta) {
  var tempSs = SpreadsheetApp.create('_hilldun_tmp_' + new Date().getTime());
  try {
    var sheet = tempSs.getActiveSheet();
    sheet.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]);
    if (filas.length > 0) {
      sheet.getRange(2, 1, filas.length, cabeceras.length).setValues(filas);
    }
    SpreadsheetApp.flush();

    var token = ScriptApp.getOAuthToken();
    var url   = 'https://docs.google.com/spreadsheets/d/' + tempSs.getId()
              + '/export?format=xlsx&id=' + tempSs.getId();
    var resp  = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      throw new Error('Error al exportar XLSX: HTTP ' + resp.getResponseCode());
    }

    var blob    = resp.getBlob().setName(nombreArchivo);
    var archivo = carpeta.createFile(blob);
    return archivo;
  } finally {
    try { DriveApp.getFileById(tempSs.getId()).setTrashed(true); } catch(e) {}
  }
}

function _generarCsv(filas, cabeceras, nombreArchivo, carpeta) {
  var lineas = [cabeceras.map(_csvEscape).join(',')];
  filas.forEach(function(fila) {
    lineas.push(fila.map(_csvEscape).join(','));
  });
  return carpeta.createFile(nombreArchivo, lineas.join('\r\n'), MimeType.PLAIN_TEXT);
}

function _csvEscape(val) {
  var s = String(val === null || val === undefined ? '' : val);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ---- Utilidades ----

// Lee una hoja y devuelve array de objetos {columna: valor}, filtrando filas con col0 vacío
function _leerHojaComoObjetos(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  return data.slice(1)
    .filter(function(row) { return row[0] !== '' && row[0] !== null && row[0] !== undefined; })
    .map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
}

// Normaliza un valor de fecha (Date o string) a 'yyyy-MM-dd'
function _valorFechaStr(val) {
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

// Normaliza input del usuario a 'yyyy-mm-dd'
// Acepta: "2026-04-01", "01/04/2026", "01-04-2026", "2026/04/01"
function _normalizarFechaStr(str) {
  if (!str) return '';
  str = str.trim();
  // yyyy-mm-dd o yyyy/mm/dd
  if (/^\d{4}[\-\/]\d{2}[\-\/]\d{2}$/.test(str)) {
    return str.replace(/\//g, '-');
  }
  // dd/mm/yyyy o dd-mm-yyyy
  if (/^\d{2}[\-\/]\d{2}[\-\/]\d{4}$/.test(str)) {
    var p = str.split(/[\-\/]/);
    return p[2] + '-' + p[1] + '-' + p[0];
  }
  return '';
}
