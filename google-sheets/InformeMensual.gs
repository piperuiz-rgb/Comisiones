// ============================================================
// InformeMensual.gs — Informe mensual de facturas cobradas y emitidas
// ============================================================

var NOMBRES_MES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// ---- Punto de entrada desde el menú ----

function generarInformeMensual() {
  var ui = SpreadsheetApp.getUi();

  var hoy     = new Date();
  var previo  = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  var defecto = _pad2(previo.getMonth() + 1) + '/' + previo.getFullYear();

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

  // ── Facturas cobradas al 100% ──
  var cobradas = calcularComisionesEngine(datos, {
    fechaInicio:    fechaInicio,
    fechaFin:       fechaFin,
    showroomNombre: null
  });

  // ── Facturas emitidas durante el mes ──
  var emitidas = _calcularEmitidas(datos, fechaInicio, fechaFin);

  // ── Facturas con cobro parcial en el mes (candidatas a comisionar) ──
  var candidatas = _calcularCandidatas(datos, fechaInicio, fechaFin);

  // ── Cobros del mes (para conciliación bancaria) ──
  var cobros = _calcularCobros(datos, fechaInicio, fechaFin);

  if (cobradas.items.length === 0 && emitidas.items.length === 0 && candidatas.items.length === 0 && cobros.items.length === 0) {
    ui.alert(
      'Sin resultados',
      'No hay facturas cobradas, emitidas ni con cobro parcial en ' + NOMBRES_MES[mes - 1] + ' ' + anyo + '.\n\n' +
      'Comprueba que los datos estén actualizados.',
      ui.ButtonSet.OK
    );
    return;
  }

  var nombreMes    = NOMBRES_MES[mes - 1];
  var sufijo       = nombreMes + '_' + anyo;

  // Crear cobros (conciliación bancaria)
  var nombreCobros = 'Cobros_' + sufijo;
  var hojaCobros   = _crearOLimpiarTab(nombreCobros);
  _escribirTabCobros(hojaCobros, cobros, mes, anyo);

  // Crear emitidas
  var nombreEmitidas = 'Emitidas_' + sufijo;
  var hojaEmitidas   = _crearOLimpiarTab(nombreEmitidas);
  _escribirTabEmitidas(hojaEmitidas, emitidas, mes, anyo);

  // Crear cobradas (100% + parciales en naranja) → va a posición 2
  var nombreCobradas = 'Cobradas_' + sufijo;
  var hojaCobradas   = _crearOLimpiarTab(nombreCobradas);
  _escribirTabMensual(hojaCobradas, cobradas, candidatas, mes, anyo);
  hojaCobradas.activate();

  // Email con los tres informes
  var emailEnviado = false;
  try {
    _enviarEmailResumen(cobradas, emitidas, candidatas, cobros, mes, anyo, nombreCobradas, nombreEmitidas, nombreCobros);
    emailEnviado = true;
  } catch(e) {
    Logger.log('Error enviando email: ' + e.message);
  }

  agregarHistoricoInforme(cobradas.resumenHistorico);

  var parcialNote = candidatas.items.length > 0 ? ' (+ ' + candidatas.items.length + ' parciales en naranja)' : '';
  var msg = '✅ Pestañas creadas:\n  · ' + nombreCobradas + parcialNote + '\n  · ' + nombreEmitidas + '\n  · ' + nombreCobros;
  if (emailEnviado) msg += '\n📧 Email enviado a ' + Session.getActiveUser().getEmail();
  else              msg += '\n⚠️ No se pudo enviar el email (comprueba los permisos de Gmail).';
  ui.alert('Informe generado', msg, ui.ButtonSet.OK);
}

// ---- Calcular facturas emitidas durante el mes ----

function _calcularEmitidas(datos, fechaInicio, fechaFin) {
  var clientesPorNombre = groupBy(datos.clientes, 'Nombre');
  var items = [];

  datos.facturas.forEach(function(factura) {
    var fechaEmision = toDateStr(factura.Fecha);
    if (!fechaEnRango(fechaEmision, fechaInicio, fechaFin)) return;

    var nombreCliente  = String(factura.Cliente_Nombre || '').trim();
    var clientesFactura = clientesPorNombre[nombreCliente] || [];
    if (clientesFactura.length === 0) return; // cliente sin showroom → excluir

    var esAbono  = factura.Es_Abono === true || factura.Es_Abono === 'TRUE' || factura.Es_Abono === 'true';
    var importe  = parseFloat(factura.Importe) || 0;

    var showroomsProcessados = {};
    clientesFactura.forEach(function(cliente) {
      var srNombre = String(cliente.Showroom_Nombre || '').trim();
      if (!srNombre) return;
      if (showroomsProcessados[srNombre]) return;
      showroomsProcessados[srNombre] = true;

      items.push({
        showroomNombre:   srNombre,
        esAbono:          esAbono,
        numero:           String(factura.Numero || ''),
        clienteNombre:    nombreCliente,
        pedidosRef:       String(factura.Pedidos_Ref || ''),
        refCliente:       String(factura.Notas || ''),
        fechaEmision:     fechaEmision,
        fechaVencimiento: toDateStr(factura.Vencimiento),
        moneda:           String(factura.Moneda || 'EUR'),
        importe:          importe
      });
    });
  });

  // Agrupar por showroom
  var porShowroom = {};
  items.forEach(function(item) {
    var nombre = item.showroomNombre;
    var moneda = item.moneda || 'EUR';
    if (!porShowroom[nombre]) {
      porShowroom[nombre] = { showroomNombre: nombre, items: [], totalesPorMoneda: {} };
    }
    if (!porShowroom[nombre].totalesPorMoneda[moneda]) {
      porShowroom[nombre].totalesPorMoneda[moneda] = { facturado: 0 };
    }
    porShowroom[nombre].items.push(item);
    porShowroom[nombre].totalesPorMoneda[moneda].facturado = redondear2(
      porShowroom[nombre].totalesPorMoneda[moneda].facturado + item.importe
    );
  });

  return { items: items, porShowroom: porShowroom };
}

// ---- Crear o limpiar pestaña ----

function _crearOLimpiarTab(nombre) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(nombre);
  if (hoja) {
    hoja.clearContents();
    hoja.clearFormats();
  } else {
    hoja = ss.insertSheet(nombre);
    ss.setActiveSheet(hoja);
    ss.moveActiveSheet(2);
  }
  return hoja;
}

// ---- Pestaña: Facturas cobradas (100% + parciales en naranja) ----

function _escribirTabMensual(hoja, resultado, candidatas, mes, anyo) {
  var nombreMes = NOMBRES_MES[mes - 1];
  var NUM_COLS  = 9;

  hoja.getRange(1, 1, 1, NUM_COLS).merge()
    .setValue('FACTURAS COBRADAS — ' + nombreMes.toUpperCase() + ' ' + anyo)
    .setBackground('#1a1a2e').setFontColor('#ffffff')
    .setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.setRowHeight(1, 36);

  hoja.getRange(2, 1, 1, NUM_COLS).merge()
    .setValue('Generado: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');

  hoja.getRange(3, 1, 1, NUM_COLS).merge()
    .setValue('⬜ Cobrada al 100%     🟧 Cobro parcial (pendiente de cobro total)     🟨 Abono')
    .setFontStyle('italic').setFontColor('#555555').setHorizontalAlignment('center');

  var CABECERAS = ['Nº Factura', 'Fecha emisión', 'Fecha cobro 100%', 'Pedido origen', 'Pedido Joor', 'Cliente', 'Moneda', 'Importe factura', 'Total cobrado'];

  // Construir mapa combinado por showroom: primero cobradas, luego parciales
  var mergedPorShowroom = {};

  Object.keys(resultado.porShowroom).forEach(function(srNombre) {
    if (!mergedPorShowroom[srNombre]) mergedPorShowroom[srNombre] = { items: [] };
    resultado.porShowroom[srNombre].items.forEach(function(item) {
      mergedPorShowroom[srNombre].items.push({
        esAbono:       item.esAbono,
        parcial:       false,
        numero:        item.numero,
        clienteNombre: item.clienteNombre,
        pedidosRef:    item.pedidosRef,
        refCliente:    item.refCliente || '',
        fechaEmision:  item.fechaEmision,
        fechaCobro100: item.fechaCobro100,
        moneda:        item.moneda,
        importe:       item.importe,
        totalCobrado:  item.totalCobrado
      });
    });
  });

  if (candidatas && candidatas.porShowroom) {
    Object.keys(candidatas.porShowroom).forEach(function(srNombre) {
      if (!mergedPorShowroom[srNombre]) mergedPorShowroom[srNombre] = { items: [] };
      candidatas.porShowroom[srNombre].items.forEach(function(item) {
        mergedPorShowroom[srNombre].items.push({
          esAbono:       false,
          parcial:       true,
          numero:        item.numero,
          clienteNombre: item.clienteNombre,
          pedidosRef:    item.pedidosRef,
          refCliente:    item.refCliente || '',
          fechaEmision:  item.fechaEmision,
          fechaCobro100: '',
          moneda:        item.moneda,
          importe:       item.importe,
          totalCobrado:  item.totalCobrado
        });
      });
    });
  }

  var totalItems = Object.keys(mergedPorShowroom).reduce(function(s, k) {
    return s + mergedPorShowroom[k].items.length;
  }, 0);

  if (totalItems === 0) {
    hoja.getRange(5, 1).setValue('Sin facturas cobradas este mes.');
    return;
  }

  // Columna "Pedido Joor" en formato texto para evitar decimales en códigos numéricos
  hoja.getRange(5, 5, 2000, 1).setNumberFormat('@');

  var fila = 5;
  Object.keys(mergedPorShowroom).forEach(function(srNombre) {
    var grupo = mergedPorShowroom[srNombre];
    if (grupo.items.length === 0) return;

    hoja.getRange(fila, 1, 1, NUM_COLS).merge()
      .setValue('▶  ' + srNombre)
      .setBackground('#0f3460').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
    fila++;

    hoja.getRange(fila, 1, 1, NUM_COLS).setValues([CABECERAS])
      .setBackground('#dce6f1').setFontWeight('bold').setHorizontalAlignment('center');
    fila++;

    var subtotalesPorMoneda = {};

    grupo.items.forEach(function(item) {
      var colorFila;
      if (item.parcial)       colorFila = '#ffe0b2'; // naranja claro: cobro parcial
      else if (item.esAbono)  colorFila = '#fff3cd'; // amarillo: abono
      else                    colorFila = '#ffffff';  // blanco: cobrada al 100%

      var cobradoMostrar = item.esAbono ? '' : Math.min(item.totalCobrado, item.importe);
      hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
        item.numero, item.fechaEmision, item.fechaCobro100,
        item.pedidosRef, item.refCliente,
        item.clienteNombre, item.moneda, item.importe, cobradoMostrar
      ]]).setBackground(colorFila);
      hoja.getRange(fila, 8).setNumberFormat('#,##0.00');
      if (!item.esAbono) hoja.getRange(fila, 9).setNumberFormat('#,##0.00');

      var m = item.moneda || 'EUR';
      if (!subtotalesPorMoneda[m]) subtotalesPorMoneda[m] = { importe: 0, cobrado: 0, num: 0 };
      subtotalesPorMoneda[m].importe = redondear2(subtotalesPorMoneda[m].importe + Math.abs(item.importe));
      subtotalesPorMoneda[m].cobrado = redondear2(subtotalesPorMoneda[m].cobrado + (item.esAbono ? 0 : (cobradoMostrar || 0)));
      subtotalesPorMoneda[m].num++;
      fila++;
    });

    ['EUR', 'USD'].forEach(function(moneda) {
      var t = subtotalesPorMoneda[moneda];
      if (!t || t.num === 0) return;
      hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
        'Subtotal ' + moneda + ' (' + t.num + ' línea' + (t.num !== 1 ? 's' : '') + ')',
        '', '', '', '', '', moneda, t.importe, t.cobrado
      ]]).setBackground('#e8f5e9').setFontWeight('bold');
      hoja.getRange(fila, 8).setNumberFormat('#,##0.00');
      hoja.getRange(fila, 9).setNumberFormat('#,##0.00');
      fila++;
    });

    fila++;
  });

  hoja.setColumnWidth(1, 140); hoja.setColumnWidth(2, 110);
  hoja.setColumnWidth(3, 110); hoja.setColumnWidth(4, 110);
  hoja.setColumnWidth(5, 160); hoja.setColumnWidth(6, 220);
  hoja.setColumnWidth(7, 65);  hoja.setColumnWidth(8, 120);
  hoja.setColumnWidth(9, 120);
  hoja.setFrozenRows(0);
}

// ---- Pestaña: Facturas emitidas durante el mes ----

function _escribirTabEmitidas(hoja, emitidas, mes, anyo) {
  var nombreMes = NOMBRES_MES[mes - 1];
  var NUM_COLS  = 8;

  hoja.getRange(1, 1, 1, NUM_COLS).merge()
    .setValue('FACTURAS EMITIDAS — ' + nombreMes.toUpperCase() + ' ' + anyo)
    .setBackground('#0f3460').setFontColor('#ffffff')
    .setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.setRowHeight(1, 36);

  hoja.getRange(2, 1, 1, NUM_COLS).merge()
    .setValue('Generado: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'))
    .setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');

  var CABECERAS = ['Nº Factura', 'Fecha emisión', 'Fecha vencimiento', 'Pedido origen', 'Pedido Joor', 'Cliente', 'Moneda', 'Importe'];

  if (emitidas.items.length === 0) {
    hoja.getRange(4, 1).setValue('Sin facturas emitidas este mes.');
    return;
  }

  // Columna "Pedido Joor" en formato texto para evitar decimales en códigos numéricos
  hoja.getRange(4, 5, 2000, 1).setNumberFormat('@');

  var fila = 4;
  Object.keys(emitidas.porShowroom).forEach(function(srNombre) {
    var grupo = emitidas.porShowroom[srNombre];

    hoja.getRange(fila, 1, 1, NUM_COLS).merge()
      .setValue('▶  ' + srNombre)
      .setBackground('#1a1a2e').setFontColor('#ffffff').setFontWeight('bold').setFontSize(11);
    fila++;

    hoja.getRange(fila, 1, 1, NUM_COLS).setValues([CABECERAS])
      .setBackground('#dce6f1').setFontWeight('bold').setHorizontalAlignment('center');
    fila++;

    var subtotalesPorMoneda = {};

    grupo.items.forEach(function(item) {
      var colorFila = item.esAbono ? '#fff3cd' : '#ffffff';
      hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
        item.numero, item.fechaEmision, item.fechaVencimiento,
        item.pedidosRef, item.refCliente || '',
        item.clienteNombre, item.moneda, item.importe
      ]]).setBackground(colorFila);
      hoja.getRange(fila, 8).setNumberFormat('#,##0.00');

      var m = item.moneda || 'EUR';
      if (!subtotalesPorMoneda[m]) subtotalesPorMoneda[m] = { importe: 0, num: 0 };
      subtotalesPorMoneda[m].importe = redondear2(subtotalesPorMoneda[m].importe + item.importe);
      subtotalesPorMoneda[m].num++;
      fila++;
    });

    ['EUR', 'USD'].forEach(function(moneda) {
      var t = subtotalesPorMoneda[moneda];
      if (!t || t.num === 0) return;
      hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
        'Subtotal ' + moneda + ' (' + t.num + ' línea' + (t.num !== 1 ? 's' : '') + ')',
        '', '', '', '', '', moneda, t.importe
      ]]).setBackground('#e8f5e9').setFontWeight('bold');
      hoja.getRange(fila, 8).setNumberFormat('#,##0.00');
      fila++;
    });

    fila++;
  });

  hoja.setColumnWidth(1, 140); hoja.setColumnWidth(2, 110);
  hoja.setColumnWidth(3, 120); hoja.setColumnWidth(4, 110);
  hoja.setColumnWidth(5, 160); hoja.setColumnWidth(6, 220);
  hoja.setColumnWidth(7, 65);  hoja.setColumnWidth(8, 120);
  hoja.setFrozenRows(0);
}

// ---- Email con adjuntos Excel ----

function _enviarEmailResumen(cobradas, emitidas, candidatas, cobros, mes, anyo, nombreTabCobradas, nombreTabEmitidas, nombreTabCobros) {
  var nombreMes = NOMBRES_MES[mes - 1];
  var ss        = SpreadsheetApp.getActiveSpreadsheet();
  var emailDest = Session.getActiveUser().getEmail();

  // Generar los tres archivos Excel adjuntos
  var adjuntos = [];
  var hojaCobradas = ss.getSheetByName(nombreTabCobradas);
  var hojaEmitidas = ss.getSheetByName(nombreTabEmitidas);
  var hojaCobros   = ss.getSheetByName(nombreTabCobros);
  if (hojaCobradas) {
    try { adjuntos.push(_hojaAExcelBlob(hojaCobradas, nombreTabCobradas)); }
    catch(e) { Logger.log('Excel cobradas: ' + e.message); }
  }
  if (hojaEmitidas) {
    try { adjuntos.push(_hojaAExcelBlob(hojaEmitidas, nombreTabEmitidas)); }
    catch(e) { Logger.log('Excel emitidas: ' + e.message); }
  }
  if (hojaCobros) {
    try { adjuntos.push(_hojaAExcelBlob(hojaCobros, nombreTabCobros)); }
    catch(e) { Logger.log('Excel cobros: ' + e.message); }
  }

  // Cuerpo del correo: resumen de totales por sección
  function _bloqueResumen(porShowroom) {
    var filas = '';
    var totalEUR = 0, totalUSD = 0;
    Object.keys(porShowroom).forEach(function(srNombre) {
      var grupo = porShowroom[srNombre];
      ['EUR', 'USD'].forEach(function(moneda) {
        var t = grupo.totalesPorMoneda[moneda];
        if (!t || t.facturado === 0) return;
        var num = grupo.items.filter(function(i) { return i.moneda === moneda; }).length;
        filas +=
          '<tr style="border-bottom:1px solid #eee;">' +
          '<td style="padding:6px 12px;">'                                        + srNombre + '</td>' +
          '<td style="padding:6px 12px;text-align:center;">'                      + moneda   + '</td>' +
          '<td style="padding:6px 12px;text-align:right;font-weight:bold;">'      + _formatNum(Math.abs(t.facturado)) + '</td>' +
          '<td style="padding:6px 12px;text-align:center;color:#666;">'           + num      + '</td>' +
          '</tr>';
        if (moneda === 'EUR') totalEUR = redondear2(totalEUR + t.facturado);
        if (moneda === 'USD') totalUSD = redondear2(totalUSD + t.facturado);
      });
    });
    if (!filas) return '<p style="color:#888;margin:0;">Sin datos este mes.</p>';
    var pie = '';
    if (totalEUR) pie += '<strong>Total EUR: ' + _formatNum(Math.abs(totalEUR)) + ' €</strong><br>';
    if (totalUSD) pie += '<strong>Total USD: $' + _formatNum(Math.abs(totalUSD)) + '</strong>';
    return '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
           '<thead><tr style="background:#dce6f1;">' +
           '<th style="padding:6px 12px;text-align:left;">Showroom</th>' +
           '<th style="padding:6px 12px;">Moneda</th>' +
           '<th style="padding:6px 12px;text-align:right;">Total facturado</th>' +
           '<th style="padding:6px 12px;">Líneas</th>' +
           '</tr></thead><tbody>' + filas + '</tbody></table>' +
           '<p style="margin:10px 0 0;">' + pie + '</p>';
  }

  function _bloque(titulo, subtitulo, color, cuerpo) {
    return '<div style="margin-bottom:24px;">' +
      '<div style="background:' + color + ';color:#fff;padding:10px 16px;border-radius:4px 4px 0 0;">' +
      '<strong style="font-size:14px;">' + titulo + '</strong>' +
      '<span style="opacity:.75;font-size:12px;margin-left:10px;">' + subtitulo + '</span>' +
      '</div>' +
      '<div style="border:1px solid #ddd;border-top:none;padding:14px;border-radius:0 0 4px 4px;">' +
      cuerpo + '</div></div>';
  }

  var notaParciales = candidatas && candidatas.items.length > 0
    ? '<p style="margin:10px 0 0;color:#e65100;font-size:12px;">⚠️ ' + candidatas.items.length +
      ' factura' + (candidatas.items.length !== 1 ? 's' : '') +
      ' con cobro parcial incluida' + (candidatas.items.length !== 1 ? 's' : '') +
      ' en el Excel adjunto (marcadas en naranja).</p>'
    : '';

  function _bloqueResumenCobros(cobros) {
    if (cobros.items.length === 0) {
      return '<p style="color:#888;margin:0;">Sin cobros este mes.</p>';
    }
    var filas = '';
    ['EUR', 'USD'].forEach(function(moneda) {
      var total = cobros.totalesPorMoneda[moneda];
      var num   = cobros.items.filter(function(i) { return i.moneda === moneda; }).length;
      if (!num) return;
      filas +=
        '<tr style="border-bottom:1px solid #eee;">' +
        '<td style="padding:6px 12px;text-align:center;">'                     + moneda + '</td>' +
        '<td style="padding:6px 12px;text-align:center;">'                     + num    + '</td>' +
        '<td style="padding:6px 12px;text-align:right;font-weight:bold;">'     + _formatNum(total) + '</td>' +
        '</tr>';
    });
    return '<table style="border-collapse:collapse;width:100%;font-size:13px;">' +
           '<thead><tr style="background:#e1bee7;">' +
           '<th style="padding:6px 12px;">Moneda</th>' +
           '<th style="padding:6px 12px;">Cobros</th>' +
           '<th style="padding:6px 12px;text-align:right;">Total</th>' +
           '</tr></thead><tbody>' + filas + '</tbody></table>' +
           '<p style="margin:8px 0 0;font-size:12px;color:#666;">Ver Excel adjunto para el detalle por fecha y factura.</p>';
  }

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:660px;color:#222;">' +
    '<div style="background:#1a1a2e;color:#fff;padding:14px 20px;border-radius:4px 4px 0 0;">' +
    '<h2 style="margin:0;font-size:18px;">Informe mensual — ' + nombreMes + ' ' + anyo + '</h2>' +
    '<p style="margin:4px 0 0;opacity:.7;font-size:13px;">Charo Ruiz Ibiza · ' +
    (adjuntos.length > 0 ? adjuntos.length + ' archivo(s) Excel adjunto(s)' : 'sin adjuntos') +
    '</p></div>' +
    '<div style="padding:20px;">' +
    _bloque('Facturas cobradas', cobradas.items.length + ' al 100%' + (candidatas && candidatas.items.length > 0 ? ' · ' + candidatas.items.length + ' parciales' : ''), '#1a1a2e',
            _bloqueResumen(cobradas.porShowroom) + notaParciales) +
    _bloque('Facturas emitidas', emitidas.items.length + ' facturas', '#0f3460',
            _bloqueResumen(emitidas.porShowroom)) +
    _bloque('Cobros del mes (conciliación bancaria)', cobros.items.length + ' cobro' + (cobros.items.length !== 1 ? 's' : ''), '#4a148c',
            _bloqueResumenCobros(cobros)) +
    '<p style="color:#aaa;font-size:11px;margin-top:4px;">Generado automáticamente · Comisiones CRI</p>' +
    '</div></div>';

  MailApp.sendEmail({
    to:          emailDest,
    subject:     'Informe mensual — ' + nombreMes + ' ' + anyo,
    htmlBody:    html,
    attachments: adjuntos
  });
}

// Exporta una pestaña del Google Sheet como blob .xlsx adjuntable al correo.
// Crea un spreadsheet temporal, copia la pestaña, exporta y lo elimina.
function _hojaAExcelBlob(hoja, nombreArchivo) {
  var tempSS = SpreadsheetApp.create('_TEMP_CRI_' + new Date().getTime());
  var tempId = tempSS.getId();
  try {
    hoja.copyTo(tempSS);
    tempSS.deleteSheet(tempSS.getSheets()[0]); // eliminar hoja vacía por defecto
    var url = 'https://docs.google.com/spreadsheets/d/' + tempId +
              '/export?format=xlsx&portrait=false';
    var blob = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
    }).getBlob().setName(nombreArchivo + '.xlsx');
    return blob;
  } finally {
    DriveApp.getFileById(tempId).setTrashed(true);
  }
}

// ---- Facturas con cobro parcial en el mes (candidatas a comisionar) ----

function _calcularCandidatas(datos, fechaInicio, fechaFin) {
  var clientesPorNombre = groupBy(datos.clientes, 'Nombre');

  // Índices de cobros por factura y por pedido (anticipos sin factura)
  var cobrosParaFactura = {};
  var cobrosParaPedido  = {};
  datos.cobros.forEach(function(c) {
    var factRef = String(c.Factura_Ref || '').trim();
    var pedRef  = String(c.Pedido_Ref  || '').trim();
    if (factRef) {
      if (!cobrosParaFactura[factRef]) cobrosParaFactura[factRef] = [];
      cobrosParaFactura[factRef].push(c);
    } else if (pedRef) {
      if (!cobrosParaPedido[pedRef]) cobrosParaPedido[pedRef] = [];
      cobrosParaPedido[pedRef].push(c);
    }
  });

  var items = [];

  datos.facturas.forEach(function(factura) {
    var esAbono = factura.Es_Abono === true || factura.Es_Abono === 'TRUE' || factura.Es_Abono === 'true';
    if (esAbono) return;

    var numero    = String(factura.Numero     || '').trim();
    var pedidoRef = String(factura.Pedidos_Ref || '').trim();
    var importe   = parseFloat(factura.Importe) || 0;
    if (importe <= 0 || !numero) return;

    // Todos los cobros de esta factura (directos + anticipos sobre el pedido)
    var cobrosDirectos  = cobrosParaFactura[numero]    || [];
    var cobrosAnticipo  = pedidoRef ? (cobrosParaPedido[pedidoRef] || []) : [];
    var todosCobros     = cobrosDirectos.concat(cobrosAnticipo);
    if (todosCobros.length === 0) return;

    // ¿Hubo algún cobro en el mes del informe?
    var tieneCobroEnMes = todosCobros.some(function(c) {
      return fechaEnRango(toDateStr(c.Fecha), fechaInicio, fechaFin);
    });
    if (!tieneCobroEnMes) return;

    // Total cobrado acumulado
    var totalCobrado = redondear2(todosCobros.reduce(function(s, c) {
      return s + (parseFloat(c.Importe) || 0);
    }, 0));

    // Pendiente por encima del umbral de tolerancia → candidata
    // Si el residual es menor que calcularUmbral(), la factura se trata como cobrada
    // y la recoge calcularComisionesEngine → no duplicar aquí
    var pendiente = redondear2(importe - totalCobrado);
    if (pendiente <= calcularUmbral(importe)) return;

    // Solo clientes con showroom asignado
    var nombreCliente   = String(factura.Cliente_Nombre || '').trim();
    var clientesFactura = clientesPorNombre[nombreCliente] || [];
    if (clientesFactura.length === 0) return;

    var showroomsProcessados = {};
    clientesFactura.forEach(function(cliente) {
      var srNombre = String(cliente.Showroom_Nombre || '').trim();
      if (!srNombre) return;
      if (showroomsProcessados[srNombre]) return;
      showroomsProcessados[srNombre] = true;
      items.push({
        showroomNombre: srNombre,
        numero:         numero,
        clienteNombre:  nombreCliente,
        pedidosRef:     String(factura.Pedidos_Ref || ''),
        refCliente:     String(factura.Notas       || ''),
        fechaEmision:   toDateStr(factura.Fecha),
        moneda:         String(factura.Moneda || 'EUR'),
        importe:        importe,
        totalCobrado:   Math.min(totalCobrado, importe),
        pendiente:      Math.max(pendiente, 0)
      });
    });
  });

  // Agrupar por showroom
  var porShowroom = {};
  items.forEach(function(item) {
    var sr     = item.showroomNombre;
    var moneda = item.moneda || 'EUR';
    if (!porShowroom[sr]) porShowroom[sr] = { showroomNombre: sr, items: [], totalesPorMoneda: {} };
    if (!porShowroom[sr].totalesPorMoneda[moneda]) {
      porShowroom[sr].totalesPorMoneda[moneda] = { importe: 0, cobrado: 0, pendiente: 0 };
    }
    porShowroom[sr].items.push(item);
    var t = porShowroom[sr].totalesPorMoneda[moneda];
    t.importe   = redondear2(t.importe   + item.importe);
    t.cobrado   = redondear2(t.cobrado   + item.totalCobrado);
    t.pendiente = redondear2(t.pendiente + item.pendiente);
  });

  return { items: items, porShowroom: porShowroom };
}


// ---- Cobros del mes (para conciliación bancaria) ----

function _calcularCobros(datos, fechaInicio, fechaFin) {
  var facturasPorNumero = {};
  datos.facturas.forEach(function(f) {
    var num = String(f.Numero || '').trim();
    if (num) facturasPorNumero[num.toLowerCase()] = f;
  });

  var clientesPorNombre = groupBy(datos.clientes, 'Nombre');

  var items = [];

  datos.cobros.forEach(function(cobro) {
    var fechaCobro = toDateStr(cobro.Fecha);
    if (!fechaEnRango(fechaCobro, fechaInicio, fechaFin)) return;

    var facturaRef = String(cobro.Factura_Ref || '').trim();
    var pedidoRef  = String(cobro.Pedido_Ref  || '').trim();
    var importe    = parseFloat(cobro.Importe) || 0;
    var esAjuste   = cobro.Es_Ajuste === true || cobro.Es_Ajuste === 'TRUE' || cobro.Es_Ajuste === 'true';

    var clienteNombre  = '';
    var showroomNombre = '';
    if (facturaRef) {
      var factura = facturasPorNumero[facturaRef.toLowerCase()];
      if (factura) {
        clienteNombre = String(factura.Cliente_Nombre || '').trim();
        var clientes  = clientesPorNombre[clienteNombre] || [];
        if (clientes.length > 0) showroomNombre = String(clientes[0].Showroom_Nombre || '').trim();
      }
    }

    items.push({
      fecha:          fechaCobro,
      facturaRef:     facturaRef,
      pedidoRef:      pedidoRef,
      clienteNombre:  clienteNombre,
      showroomNombre: showroomNombre,
      moneda:         String(cobro.Moneda || 'EUR'),
      importe:        importe,
      esAjuste:       esAjuste
    });
  });

  items.sort(function(a, b) {
    if (a.fecha < b.fecha) return -1;
    if (a.fecha > b.fecha) return 1;
    return 0;
  });

  var totalesPorMoneda = {};
  items.forEach(function(item) {
    var m = item.moneda || 'EUR';
    if (!totalesPorMoneda[m]) totalesPorMoneda[m] = 0;
    totalesPorMoneda[m] = redondear2(totalesPorMoneda[m] + item.importe);
  });

  return { items: items, totalesPorMoneda: totalesPorMoneda };
}

// ---- Pestaña: Cobros del mes ----

function _escribirTabCobros(hoja, cobros, mes, anyo) {
  var nombreMes = NOMBRES_MES[mes - 1];
  var NUM_COLS  = 7;

  hoja.getRange(1, 1, 1, NUM_COLS).merge()
    .setValue('COBROS — ' + nombreMes.toUpperCase() + ' ' + anyo)
    .setBackground('#4a148c').setFontColor('#ffffff')
    .setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  hoja.setRowHeight(1, 36);

  hoja.getRange(2, 1, 1, NUM_COLS).merge()
    .setValue('Generado: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') +
              '  ·  Cobros ordenados por fecha para conciliación bancaria')
    .setFontColor('#888888').setFontStyle('italic').setHorizontalAlignment('center');

  var CABECERAS = ['Fecha cobro', 'Nº Factura', 'Pedido', 'Cliente', 'Showroom', 'Moneda', 'Importe'];

  if (cobros.items.length === 0) {
    hoja.getRange(4, 1).setValue('Sin cobros este mes.');
    return;
  }

  hoja.getRange(3, 1, 1, NUM_COLS).setValues([CABECERAS])
    .setBackground('#e1bee7').setFontWeight('bold').setHorizontalAlignment('center');

  var fila = 4;
  cobros.items.forEach(function(item) {
    var colorFila = item.esAjuste ? '#fff3cd' : '#ffffff';
    hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
      item.fecha, item.facturaRef, item.pedidoRef,
      item.clienteNombre, item.showroomNombre,
      item.moneda, item.importe
    ]]).setBackground(colorFila);
    hoja.getRange(fila, 7).setNumberFormat('#,##0.00');
    fila++;
  });

  ['EUR', 'USD'].forEach(function(moneda) {
    var total = cobros.totalesPorMoneda[moneda];
    var num   = cobros.items.filter(function(i) { return i.moneda === moneda; }).length;
    if (!num) return;
    hoja.getRange(fila, 1, 1, NUM_COLS).setValues([[
      'Total ' + moneda + ' (' + num + ' cobro' + (num !== 1 ? 's' : '') + ')',
      '', '', '', '', moneda, total
    ]]).setBackground('#e1bee7').setFontWeight('bold');
    hoja.getRange(fila, 7).setNumberFormat('#,##0.00');
    fila++;
  });

  hoja.setColumnWidth(1, 110); hoja.setColumnWidth(2, 140);
  hoja.setColumnWidth(3, 110); hoja.setColumnWidth(4, 200);
  hoja.setColumnWidth(5, 160); hoja.setColumnWidth(6, 65);
  hoja.setColumnWidth(7, 120);
  hoja.setFrozenRows(3);
}

// ---- Utilidades ----

function _pad2(n) { return n < 10 ? '0' + n : String(n); }

function _formatNum(n) {
  return n.toFixed(2).replace('.', 'TEMP').replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace('TEMP', ',');
}
