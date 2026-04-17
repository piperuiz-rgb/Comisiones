// ============================================================
// Code.gs — Menú principal y punto de entrada de la aplicación
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Comisiones CRI')
    .addItem('📊 Calcular Comisiones', 'calcularComisiones')
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('📥 Importar datos')
        .addItem('Importar Showrooms',    'importarShowrooms')
        .addItem('Importar Clientes',     'importarClientes')
        .addItem('Importar Pedidos',      'importarPedidos')
        .addItem('Importar Facturas',     'importarFacturas')
        .addItem('Importar Cobros',       'importarCobros')
    )
    .addSeparator()
    .addItem('✅ Validar datos',          'validarDatos')
    .addItem('📋 Ver histórico',          'verHistorico')
    .addSeparator()
    .addItem('⚙️  Crear estructura de hojas', 'crearEstructura')
    .addToUi();
}

// ---- Cálculo principal ----

function calcularComisiones() {
  var ui = SpreadsheetApp.getUi();
  var params;
  try {
    params = leerParametrosInforme();
  } catch (e) {
    ui.alert('Error', 'No se encontró la hoja "Informe_Parametros". Ejecuta Comisiones CRI → Crear estructura de hojas primero.', ui.ButtonSet.OK);
    return;
  }

  var fechaIni = toDateStr(params.fechaInicio);
  var fechaFin = toDateStr(params.fechaFin);

  if (!fechaIni || !fechaFin) {
    ui.alert('Fechas requeridas', 'Completa las fechas de inicio y fin en la hoja "Informe_Parametros" (celdas C2 y C3).', ui.ButtonSet.OK);
    return;
  }

  if (fechaIni > fechaFin) {
    ui.alert('Fechas inválidas', 'La fecha de inicio debe ser anterior o igual a la fecha de fin.', ui.ButtonSet.OK);
    return;
  }

  try {
    var datos = cargarTodosLosDatos();
  } catch (e) {
    ui.alert('Error al cargar datos', e.message, ui.ButtonSet.OK);
    return;
  }

  if (datos.facturas.length === 0) {
    ui.alert('Sin datos', 'No hay facturas registradas. Importa datos primero.', ui.ButtonSet.OK);
    return;
  }

  try {
    var resultado = calcularComisionesEngine(datos, params);
  } catch (e) {
    ui.alert('Error en el cálculo', e.message, ui.ButtonSet.OK);
    return;
  }

  if (resultado.items.length === 0) {
    ui.alert(
      'Sin resultados',
      'No hay facturas cobradas al 100% en el periodo ' + fechaIni + ' — ' + fechaFin + '.\n\n' +
      'Comprueba que las fechas corresponden a cobros registrados en la hoja "Cobros".',
      ui.ButtonSet.OK
    );
    return;
  }

  escribirInformeCompleto(resultado, params);
  agregarHistoricoInforme(resultado.resumenHistorico);

  // Navegar a la hoja de resumen
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESUMEN).activate();

  var resumen = resultado.resumenHistorico;
  var msg = '✅ Informe generado correctamente.\n\n';
  msg += 'Período: ' + fechaIni + ' — ' + fechaFin + '\n';
  msg += 'Facturas/abonos incluidos: ' + resultado.items.length + '\n';
  if (resumen.totalEURFacturado !== 0) {
    msg += 'Total EUR: ' + resumen.totalEURFacturado.toFixed(2) + ' € → Comisión: ' + resumen.totalEURComision.toFixed(2) + ' €\n';
  }
  if (resumen.totalUSDFacturado !== 0) {
    msg += 'Total USD: $' + resumen.totalUSDFacturado.toFixed(2) + ' → Comisión: $' + resumen.totalUSDComision.toFixed(2) + '\n';
  }

  ui.alert('Informe generado', msg, ui.ButtonSet.OK);
}

// ---- Validación ----

function validarDatos() {
  var ui = SpreadsheetApp.getUi();
  var errores = [];

  try {
    var datos = cargarTodosLosDatos();
  } catch (e) {
    ui.alert('Error', e.message, ui.ButtonSet.OK);
    return;
  }

  var showroomNombres = {};
  datos.showrooms.forEach(function(s) { showroomNombres[String(s.Nombre || '')] = true; });

  var clienteNombres = {};
  datos.clientes.forEach(function(c) {
    clienteNombres[String(c.Nombre || '')] = true;
    if (!showroomNombres[String(c.Showroom_Nombre || '')]) {
      errores.push('Cliente "' + c.Nombre + '": showroom "' + c.Showroom_Nombre + '" no encontrado en Showrooms.');
    }
  });

  var facturaNumerosSet = {};
  datos.facturas.forEach(function(f) {
    var esAbono = f.Es_Abono === true || f.Es_Abono === 'TRUE' || f.Es_Abono === 'true';
    if (!esAbono) facturaNumerosSet[String(f.Numero || '').toLowerCase()] = true;
    if (!clienteNombres[String(f.Cliente_Nombre || '')]) {
      errores.push('Factura "' + f.Numero + '": cliente "' + f.Cliente_Nombre + '" no encontrado en Clientes.');
    }
  });

  datos.facturas.forEach(function(f) {
    var esAbono = f.Es_Abono === true || f.Es_Abono === 'TRUE' || f.Es_Abono === 'true';
    if (!esAbono) return;
    var refs = splitRefs(f.Facturas_Abonadas);
    refs.forEach(function(ref) {
      if (!facturaNumerosSet[ref]) {
        errores.push('Abono "' + f.Numero + '": factura referenciada "' + ref + '" no encontrada.');
      }
    });
  });

  var facturaNumerosAll = {};
  datos.facturas.forEach(function(f) { facturaNumerosAll[String(f.Numero || '').toLowerCase()] = true; });

  datos.cobros.forEach(function(c) {
    var ref = String(c.Factura_Ref || '').toLowerCase();
    if (ref && !facturaNumerosAll[ref]) {
      errores.push('Cobro fecha "' + toDateStr(c.Fecha) + '": factura ref "' + c.Factura_Ref + '" no encontrada.');
    }
  });

  if (errores.length === 0) {
    ui.alert('Validación correcta', '✅ No se encontraron problemas en los datos.', ui.ButtonSet.OK);
  } else {
    var msg = 'Se encontraron ' + errores.length + ' problema(s):\n\n';
    msg += errores.slice(0, 15).join('\n');
    if (errores.length > 15) msg += '\n... y ' + (errores.length - 15) + ' más.';
    ui.alert('Problemas encontrados', msg, ui.ButtonSet.OK);
  }
}

// ---- Histórico ----

function verHistorico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAMES.HISTORICO);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('La hoja "Historico_Informes" no existe. Genera un informe primero.');
    return;
  }
  sheet.activate();
}

// ---- Creación de estructura inicial ----

function crearEstructura() {
  var ui = SpreadsheetApp.getUi();
  var resp = ui.alert(
    'Crear estructura',
    'Esto creará todas las hojas necesarias si no existen. Las hojas existentes no se modificarán.\n\n¿Continuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var hojas = [
    {
      nombre: SHEET_NAMES.SHOWROOMS,
      cabeceras: ['ID_Odoo', 'Nombre', 'Comision_Pct', 'Idioma', 'Ultima_Actualizacion'],
      anchos: [180, 200, 100, 60, 140]
    },
    {
      nombre: SHEET_NAMES.CLIENTES,
      cabeceras: ['ID_Odoo', 'Nombre', 'Showroom_Nombre', 'Email', 'Telefono', 'Ultima_Actualizacion'],
      anchos: [180, 200, 200, 200, 120, 140]
    },
    {
      nombre: SHEET_NAMES.PEDIDOS,
      cabeceras: ['ID_Odoo', 'Numero', 'Cliente_Nombre', 'Fecha', 'Moneda', 'Importe', 'Ultima_Actualizacion'],
      anchos: [180, 120, 200, 100, 60, 100, 140]
    },
    {
      nombre: SHEET_NAMES.FACTURAS,
      cabeceras: ['ID_Odoo', 'Numero', 'Cliente_Nombre', 'Pedidos_Ref', 'Fecha', 'Vencimiento', 'Moneda', 'Importe', 'Es_Abono', 'Facturas_Abonadas', 'Notas', 'Ultima_Actualizacion'],
      anchos: [180, 120, 200, 120, 100, 100, 60, 100, 70, 150, 200, 140]
    },
    {
      nombre: SHEET_NAMES.COBROS,
      cabeceras: ['ID_Odoo', 'Factura_Ref', 'Pedido_Ref', 'Fecha', 'Moneda', 'Importe', 'Es_Ajuste', 'Ultima_Actualizacion'],
      anchos: [180, 150, 120, 100, 60, 100, 70, 140]
    },
    {
      nombre: SHEET_NAMES.LIQUIDACIONES,
      cabeceras: ['ID', 'Showroom_Nombre', 'Fecha_Inicio', 'Fecha_Fin', 'Fecha_Pago', 'Moneda', 'Importe', 'Notas'],
      anchos: [80, 200, 100, 100, 100, 60, 100, 200]
    },
    {
      nombre: SHEET_NAMES.HISTORICO,
      cabeceras: ['Fecha_Generacion', 'Periodo_Inicio', 'Periodo_Fin', 'Showroom_Filtro', 'Total_EUR_Facturado', 'Total_EUR_Comision', 'Total_USD_Facturado', 'Total_USD_Comision', 'Num_Facturas'],
      anchos: [140, 110, 110, 160, 140, 130, 140, 130, 100]
    }
  ];

  hojas.forEach(function(def) {
    var hoja = ss.getSheetByName(def.nombre);
    if (!hoja) {
      hoja = ss.insertSheet(def.nombre);
      hoja.getRange(1, 1, 1, def.cabeceras.length)
        .setValues([def.cabeceras])
        .setBackground('#1a1a2e')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
      hoja.setFrozenRows(1);
      def.anchos.forEach(function(w, i) { hoja.setColumnWidth(i + 1, w); });
    }
  });

  // Hoja de parámetros
  _crearHojaParametros(ss);

  // Hojas de informe (placeholders)
  ['Informe_Resumen', 'Informe_Detalle'].forEach(function(nombre) {
    if (!ss.getSheetByName(nombre)) ss.insertSheet(nombre);
  });

  // Hoja TEMP_Import
  if (!ss.getSheetByName(SHEET_NAMES.TEMP)) {
    var temp = ss.insertSheet(SHEET_NAMES.TEMP);
    temp.getRange('A1').setValue('⚠️ Pega aquí los datos a importar (incluyendo fila de cabeceras) y ejecuta el importador correspondiente desde el menú. Esta hoja se limpia automáticamente tras cada importación.');
    temp.getRange('A1').setFontStyle('italic').setFontColor('#666666');
  }

  ui.alert('✅ Estructura creada', 'Se han creado las hojas necesarias.\n\nEmpieza introduciendo datos en:\n1. Showrooms\n2. Clientes\n3. Pedidos\n4. Facturas\n5. Cobros', ui.ButtonSet.OK);
}

function _crearHojaParametros(ss) {
  var hoja = ss.getSheetByName(SHEET_NAMES.PARAMS);
  if (hoja) return;

  hoja = ss.insertSheet(SHEET_NAMES.PARAMS);

  var datos = [
    ['PARÁMETROS DEL INFORME DE COMISIONES', '', ''],
    ['', '', ''],
    ['Fecha inicio del período:', '', ''],
    ['Fecha fin del período:', '', ''],
    ['Showroom (vacío = todos):', '', ''],
    ['', '', ''],
    ['→ Ejecuta el menú: Comisiones CRI → Calcular Comisiones', '', '']
  ];

  hoja.getRange(1, 1, datos.length, 3).setValues(datos);

  hoja.getRange('A1:C1').merge()
    .setBackground('#1a1a2e')
    .setFontColor('#ffffff')
    .setFontSize(13)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  hoja.getRange('A3:A5').setFontWeight('bold');
  hoja.getRange('C3:C5').setBackground('#fff9c4');

  hoja.getRange('A7').setFontStyle('italic').setFontColor('#1a6e42');

  // Etiquetas para las celdas de entrada
  hoja.getRange('B3').setValue('Fecha inicio →');
  hoja.getRange('B4').setValue('Fecha fin →');
  hoja.getRange('B5').setValue('Showroom →');

  hoja.setColumnWidth(1, 220);
  hoja.setColumnWidth(2, 120);
  hoja.setColumnWidth(3, 200);
}
