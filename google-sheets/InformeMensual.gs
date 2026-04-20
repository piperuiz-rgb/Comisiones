// ============================================================
// InformeMensual.gs — Generación del informe mensual de facturas cobradas
// ============================================================

var NOMBRES_MES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ---- Punto de entrada desde el menú ----

function generarInformeMensual() {
  var ui = SpreadsheetApp.getUi();

  // Mes anterior como valor por defecto
  var hoy      = new Date();
  var previo   = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  var defecto  = _pad2(previo.getMonth() + 1) + '/' + previo.getFullYear();

  var resp = ui.prompt(
    'Generar informe mensual',
    'Mes y año del informe (MM/YYYY):\n\nDeja vacío para el mes anterior (' + defecto + ')',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var input = resp.getResponseText().trim() || defecto;
  var match  = input.match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) {
    ui.alert('Formato incorrecto', 'Usa MM/YYYY, por ejemplo: 03/2025', ui.ButtonSet.OK);
    return;
  }

  var mes  = parseInt(match[1]);
  var anyo = parseInt(match[2]);
  if (mes < 1 || mes > 12) {
    ui.alert('Mes inválido', 'El mes debe estar entre 01 y 12.', ui.ButtonSet.OK);
    return;
  }

  var fechaInicio = anyo + '-' + _pad2(mes) + '-01';
  var fechaFin    = anyo + '-' + _pad2(mes) + '-' + new Date(anyo, mes, 0).getDate();

  var datos;
  try {
    datos = cargarTodosLosDatos();
  } catch(e) {
    ui.alert('Error cargando datos', e.message, ui.ButtonSet.OK);
    return;
  }

  var resultado = calcularComisionesEngine(datos, {
    fechaInicio: fechaInicio,
    fechaFin:    fechaFin,
    showroomNombre: null
  });

  if (resultado.items.length === 0) {
    ui.alert(
      'Sin resultados',
      'No hay facturas cobradas al 100% en ' + NOMBRES_MES[mes - 1] + ' ' + anyo + '.\n\n' +
      'Comprueba que los cobros de ese mes estén actualizados en la hoja Cobros.',
      ui.ButtonSet.OK
    );
    return;
  }

  var nombreTab = 'Informe_' + NOMBRES_MES[mes - 1] + '_' + anyo;
  var hoja      = _crearOLimpiarTab(nombreTab);

  _escribirTabMensual(hoja, resultado, mes, anyo);
  hoja.activate();

  var emailEnviado = false;
  try {
    _enviarEmailResumen(resultado, mes, anyo, nombreTab);
    emailEnviado = true;
  } catch(e) {
    Logger.log('Error enviando email: ' + e.message);
  }

  // Registrar en histórico
  agregarHistoricoInforme(resultado.resumenHistorico);

  var msg = '✅ Pestaña creada: ' + nombreTab;
  if (emailEnviado) msg += '\n📧 Email de resumen enviado a ' + Session.getActiveUser().getEmail();
  else              msg += '\n⚠️ No se pudo enviar el email (comprueba los permisos de Gmail).';
  ui.alert('Informe generado', msg, ui.ButtonSet.OK);
}

// ---- Crear o limpiar la pestaña del informe ----

function _crearOLimpiarTab(nombre) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(nombre);
  if (hoja) {
    hoja.clearContents();
    hoja.clearFormats();
  } else {
    hoja = ss.insertSheet(nombre);
    ss.setActiveSheet(hoja);
    ss.moveActiveSheet(2); // justo después de la primera pestaña
  }
  return hoja;
}

// ---- Escribir el contenido de la pestaña mensual ----

function _escribirTabMensual(hoja, resultado, mes, anyo) {
  var nombreMes = NOMBRES_MES[mes - 1];
  var NUM_COLS  = 6;

  // ── Título ──
  hoja.getRange(1, 1, 1, NUM_COLS).merge()
    .setValue('FACTURAS COBRADAS AL 100% — ' + nombreMes.toUpperCase() + ' ' + anyo)
    .setBackground('#1a1a2e')
    .setFontColor('#ffffff')
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  hoja.setRowHeight(1, 36);

  hoja.getRange(2, 1, 1, NUM_COLS).merge()
    .setValue('Generado: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#888888')
    .setFontStyle('italic')
    .setHorizontalAlignment('center');

  var CABECERAS = ['Nº Factura', 'Fecha cobro 100%', 'Cliente', 'Moneda', 'Importe factura', 'Total cobrado'];

  var fila = 4;
  var showroomsOrden = Object.keys(resultado.porShowroom);

  showroomsOrden.forEach(function(srNombre) {
    var grupo = resultado.porShowroom[srNombre];

    // ── Cabecera del showroom ──
    hoja.getRange(fila, 1, 1, NUM_COLS).merge()
      .setValue('▶  ' + srNombre)
      .setBackground('#0f3460')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(11);
    fila++;

    // ── Cabeceras de columnas ──
    hoja.getRange(fila, 1, 1, NUM_COLS)
      .setValues([CABECERAS])
      .setBackground('#dce6f1')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');
    fila++;

    var subtotalesPorMoneda = {};

    grupo.items.forEach(function(item) {
      var colorFila = item.esAbono ? '#fff3cd' : '#ffffff';
      // El total cobrado nunca puede superar el importe de la factura: si hay
      // anticipo de pedido el exceso queda como saldo a favor del cliente.
      var cobradoMostrar = item.esAbono ? '' : Math.min(item.totalCobrado, item.importe);
      hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
        item.numero,
        item.fechaCobro100,
        item.clienteNombre,
        item.moneda,
        item.importe,
        cobradoMostrar
      ]]).setBackground(colorFila);

      // Formato numérico para importes
      hoja.getRange(fila, 5).setNumberFormat('#,##0.00');
      if (!item.esAbono) hoja.getRange(fila, 6).setNumberFormat('#,##0.00');

      var m = item.moneda || 'EUR';
      if (!subtotalesPorMoneda[m]) subtotalesPorMoneda[m] = { importe: 0, cobrado: 0, num: 0 };
      subtotalesPorMoneda[m].importe = redondear2(subtotalesPorMoneda[m].importe + item.importe);
      subtotalesPorMoneda[m].cobrado = redondear2(subtotalesPorMoneda[m].cobrado + (item.esAbono ? 0 : cobradoMostrar));
      subtotalesPorMoneda[m].num++;
      fila++;
    });

    // ── Subtotales por moneda ──
    ['EUR', 'USD'].forEach(function(moneda) {
      var t = subtotalesPorMoneda[moneda];
      if (!t || t.num === 0) return;
      hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
        'Subtotal ' + moneda + ' (' + t.num + ' línea' + (t.num !== 1 ? 's' : '') + ')',
        '', '', moneda,
        t.importe,
        t.cobrado
      ]]).setBackground('#e8f5e9').setFontWeight('bold');
      hoja.getRange(fila, 5).setNumberFormat('#,##0.00');
      hoja.getRange(fila, 6).setNumberFormat('#,##0.00');
      fila++;
    });

    fila++; // línea en blanco entre showrooms
  });

  // ── Ajuste de columnas ──
  hoja.setColumnWidth(1, 130); // Nº Factura
  hoja.setColumnWidth(2, 130); // Fecha
  hoja.setColumnWidth(3, 240); // Cliente
  hoja.setColumnWidth(4, 70);  // Moneda
  hoja.setColumnWidth(5, 120); // Importe
  hoja.setColumnWidth(6, 120); // Cobrado
  hoja.setFrozenRows(0);
}

// ---- Email de resumen ----

function _enviarEmailResumen(resultado, mes, anyo, nombreTab) {
  var nombreMes  = NOMBRES_MES[mes - 1];
  var ss         = SpreadsheetApp.getActiveSpreadsheet();
  var sheetId    = ss.getSheetByName(nombreTab).getSheetId();
  var urlHoja    = ss.getUrl() + '#gid=' + sheetId;
  var emailDest  = Session.getActiveUser().getEmail();

  // ── Construir tabla HTML por showroom ──
  var filasTabla = '';
  var totalEUR = 0, totalUSD = 0;

  Object.keys(resultado.porShowroom).forEach(function(srNombre) {
    var grupo = resultado.porShowroom[srNombre];
    ['EUR', 'USD'].forEach(function(moneda) {
      var t = grupo.totalesPorMoneda[moneda];
      if (!t || t.facturado === 0) return;
      var numLineas = grupo.items.filter(function(i) { return i.moneda === moneda; }).length;
      filasTabla +=
        '<tr style="border-bottom:1px solid #eee;">' +
        '<td style="padding:8px 12px;">' + srNombre + '</td>' +
        '<td style="padding:8px 12px;text-align:center;">' + moneda + '</td>' +
        '<td style="padding:8px 12px;text-align:right;font-weight:bold;">' + _formatNum(t.facturado) + '</td>' +
        '<td style="padding:8px 12px;text-align:center;">' + numLineas + '</td>' +
        '</tr>';
      if (moneda === 'EUR') totalEUR = redondear2(totalEUR + t.facturado);
      if (moneda === 'USD') totalUSD = redondear2(totalUSD + t.facturado);
    });
  });

  var totalesHtml = '';
  if (totalEUR !== 0) totalesHtml += '<p style="margin:6px 0;font-size:15px;"><strong>Total EUR: ' + _formatNum(totalEUR) + ' €</strong></p>';
  if (totalUSD !== 0) totalesHtml += '<p style="margin:6px 0;font-size:15px;"><strong>Total USD: $' + _formatNum(totalUSD) + '</strong></p>';

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:640px;color:#222;">' +
    '<div style="background:#1a1a2e;color:#fff;padding:14px 20px;">' +
    '<h2 style="margin:0;font-size:18px;">Informe de comisiones — ' + nombreMes + ' ' + anyo + '</h2>' +
    '<p style="margin:4px 0;opacity:.7;font-size:13px;">Charo Ruiz Ibiza · Facturas cobradas al 100%</p>' +
    '</div>' +
    '<div style="padding:20px;">' +
    '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
    '<thead><tr style="background:#dce6f1;">' +
    '<th style="padding:8px 12px;text-align:left;">Showroom</th>' +
    '<th style="padding:8px 12px;">Moneda</th>' +
    '<th style="padding:8px 12px;text-align:right;">Total facturado</th>' +
    '<th style="padding:8px 12px;">Líneas</th>' +
    '</tr></thead>' +
    '<tbody>' + filasTabla + '</tbody>' +
    '</table>' +
    '<div style="margin-top:16px;">' + totalesHtml + '</div>' +
    '<div style="margin-top:24px;">' +
    '<a href="' + urlHoja + '" style="background:#0f3460;color:#fff;padding:10px 22px;' +
    'text-decoration:none;border-radius:4px;font-size:13px;">Ver informe completo →</a>' +
    '</div>' +
    '<p style="margin-top:24px;color:#aaa;font-size:11px;">Generado automáticamente · Comisiones CRI</p>' +
    '</div></div>';

  MailApp.sendEmail({
    to:       emailDest,
    subject:  'Informe comisiones — ' + nombreMes + ' ' + anyo,
    htmlBody: html
  });
}

// ---- Utilidades ----

function _pad2(n) { return n < 10 ? '0' + n : String(n); }

function _formatNum(n) {
  return n.toFixed(2).replace('.', 'TEMP').replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace('TEMP', ',');
}
