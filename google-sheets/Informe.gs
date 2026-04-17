// ============================================================
// Informe.gs — Escritura del informe de comisiones en Sheets
// ============================================================

var COLORES = {
  ENCABEZADO:  '#1a1a2e',
  SUBENCABEZADO: '#16213e',
  SHOWROOM:    '#0f3460',
  FACTURA:     '#ffffff',
  ABONO:       '#fff3cd',
  TOTAL:       '#e8f5e9',
  TEXTO_BLANCO:'#ffffff',
  TEXTO_OSCURO:'#212121',
  BORDE:       '#cccccc'
};

function escribirInformeCompleto(resultado, params) {
  escribirResumen(resultado.porShowroom, params);
  escribirDetalle(resultado.items, params);
}

// ---- Hoja de resumen ----

function escribirResumen(porShowroom, params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.RESUMEN);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.RESUMEN);
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  var fechaIni = toDateStr(params.fechaInicio);
  var fechaFin = toDateStr(params.fechaFin);

  // Título
  sheet.getRange('A1:E1').merge()
    .setValue('INFORME DE COMISIONES DE SHOWROOMS')
    .setBackground(COLORES.ENCABEZADO)
    .setFontColor(COLORES.TEXTO_BLANCO)
    .setFontSize(14)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  sheet.getRange('A2:E2').merge()
    .setValue('Charo Ruiz Ibiza')
    .setBackground(COLORES.SUBENCABEZADO)
    .setFontColor(COLORES.TEXTO_BLANCO)
    .setFontSize(11)
    .setHorizontalAlignment('center');

  sheet.getRange('A3:E3').merge()
    .setValue('Periodo: ' + fechaIni + ' — ' + fechaFin)
    .setBackground(COLORES.SUBENCABEZADO)
    .setFontColor(COLORES.TEXTO_BLANCO)
    .setHorizontalAlignment('center');

  sheet.getRange('A4:E4').merge()
    .setValue('Generado: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#666666')
    .setFontStyle('italic')
    .setHorizontalAlignment('center');

  // Encabezados de tabla
  var cabeceras = ['Showroom', 'Moneda', 'Total Facturado', '% Comisión', 'Comisión Total'];
  var rangoCab = sheet.getRange(6, 1, 1, cabeceras.length);
  rangoCab.setValues([cabeceras])
    .setBackground(COLORES.SHOWROOM)
    .setFontColor(COLORES.TEXTO_BLANCO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var fila = 7;
  var totalesGenerales = {};
  var numeros = ['EUR', 'USD'];

  Object.keys(porShowroom).forEach(function(nombre) {
    var datos = porShowroom[nombre];
    numeros.forEach(function(moneda) {
      var t = datos.totalesPorMoneda[moneda];
      if (!t) return;
      sheet.getRange(fila, 1, 1, 5).setValues([[
        datos.showroomNombre,
        moneda,
        t.facturado,
        datos.comisionPct + '%',
        t.comision
      ]]);
      sheet.getRange(fila, 3).setNumberFormat('#,##0.00');
      sheet.getRange(fila, 5).setNumberFormat('#,##0.00');
      if (!totalesGenerales[moneda]) totalesGenerales[moneda] = { facturado: 0, comision: 0 };
      totalesGenerales[moneda].facturado = redondear2(totalesGenerales[moneda].facturado + t.facturado);
      totalesGenerales[moneda].comision  = redondear2(totalesGenerales[moneda].comision  + t.comision);
      fila++;
    });
  });

  // Fila de totales generales
  fila++;
  numeros.forEach(function(moneda) {
    var t = totalesGenerales[moneda];
    if (!t || (t.facturado === 0 && t.comision === 0)) return;
    var rangoTotal = sheet.getRange(fila, 1, 1, 5);
    rangoTotal.setValues([['TOTAL GENERAL', moneda, t.facturado, '', t.comision]])
      .setBackground(COLORES.TOTAL)
      .setFontWeight('bold');
    sheet.getRange(fila, 3).setNumberFormat('#,##0.00');
    sheet.getRange(fila, 5).setNumberFormat('#,##0.00');
    fila++;
  });

  sheet.autoResizeColumns(1, 5);
  sheet.setFrozenRows(6);
}

// ---- Hoja de detalle ----

function escribirDetalle(items, params) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.DETALLE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAMES.DETALLE);
  } else {
    sheet.clearContents();
    sheet.clearFormats();
  }

  var fechaIni = toDateStr(params.fechaInicio);
  var fechaFin = toDateStr(params.fechaFin);

  // Título
  sheet.getRange('A1:K1').merge()
    .setValue('DETALLE DE COMISIONES — Periodo: ' + fechaIni + ' — ' + fechaFin)
    .setBackground(COLORES.ENCABEZADO)
    .setFontColor(COLORES.TEXTO_BLANCO)
    .setFontSize(12)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  var cabeceras = [
    'Showroom', 'Tipo', 'Nº Factura', 'Cliente',
    'Pedidos Ref', 'Fecha Emisión', 'Fecha Cobro 100%',
    'Moneda', 'Importe', '% Com.', 'Comisión'
  ];
  sheet.getRange(2, 1, 1, cabeceras.length).setValues([cabeceras])
    .setBackground(COLORES.SHOWROOM)
    .setFontColor(COLORES.TEXTO_BLANCO)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  if (items.length === 0) {
    sheet.getRange('A3').setValue('Sin datos para el período seleccionado.');
    return;
  }

  // Agrupar items por showroom para pintar separadores
  var showroomsOrden = [];
  var porShowroomItems = {};
  items.forEach(function(item) {
    if (!porShowroomItems[item.showroomNombre]) {
      showroomsOrden.push(item.showroomNombre);
      porShowroomItems[item.showroomNombre] = [];
    }
    porShowroomItems[item.showroomNombre].push(item);
  });

  var fila = 3;

  showroomsOrden.forEach(function(nombre) {
    var grupoItems = porShowroomItems[nombre];

    // Encabezado de showroom
    sheet.getRange(fila, 1, 1, cabeceras.length).merge()
      .setValue('▶ ' + nombre)
      .setBackground(COLORES.SHOWROOM)
      .setFontColor(COLORES.TEXTO_BLANCO)
      .setFontWeight('bold');
    fila++;

    var subtotalesPorMoneda = {};

    grupoItems.forEach(function(item) {
      var tipo = item.esAbono ? 'ABONO' : 'FACTURA';
      var color = item.esAbono ? COLORES.ABONO : COLORES.FACTURA;

      sheet.getRange(fila, 1, 1, cabeceras.length).setValues([[
        item.showroomNombre,
        tipo,
        item.numero,
        item.clienteNombre,
        item.pedidosRef,
        item.fechaEmision,
        item.fechaCobro100,
        item.moneda,
        item.importe,
        item.comisionPct + '%',
        item.comision
      ]]).setBackground(color);

      sheet.getRange(fila, 9).setNumberFormat('#,##0.00');
      sheet.getRange(fila, 11).setNumberFormat('#,##0.00');

      var moneda = item.moneda || 'EUR';
      if (!subtotalesPorMoneda[moneda]) subtotalesPorMoneda[moneda] = { facturado: 0, comision: 0 };
      subtotalesPorMoneda[moneda].facturado = redondear2(subtotalesPorMoneda[moneda].facturado + item.importe);
      subtotalesPorMoneda[moneda].comision  = redondear2(subtotalesPorMoneda[moneda].comision  + item.comision);

      fila++;
    });

    // Subtotal por showroom
    ['EUR', 'USD'].forEach(function(moneda) {
      var t = subtotalesPorMoneda[moneda];
      if (!t || (t.facturado === 0 && t.comision === 0)) return;
      sheet.getRange(fila, 1, 1, cabeceras.length).setValues([[
        'Subtotal ' + nombre, moneda, '', '', '', '', '', moneda, t.facturado, '', t.comision
      ]]).setBackground(COLORES.TOTAL).setFontWeight('bold');
      sheet.getRange(fila, 9).setNumberFormat('#,##0.00');
      sheet.getRange(fila, 11).setNumberFormat('#,##0.00');
      fila++;
    });

    fila++; // línea en blanco entre showrooms
  });

  sheet.autoResizeColumns(1, cabeceras.length);
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(5, 120);
}
