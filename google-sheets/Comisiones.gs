// ============================================================
// Comisiones.gs — Motor de cálculo de comisiones
// Porta la lógica de generarInforme() de app.js (líneas 3691-3878)
// ============================================================

/**
 * Calcula las comisiones para el período dado.
 * @param {Object} datos - { showrooms, clientes, facturas, cobros }
 * @param {Object} params - { fechaInicio, fechaFin, showroomNombre }
 * @returns {Object} { items, porShowroom, resumenHistorico }
 */
function calcularComisionesEngine(datos, params) {
  var fechaInicio = toDateStr(params.fechaInicio);
  var fechaFin    = toDateStr(params.fechaFin);
  var filtroShowroom = params.showroomNombre ? String(params.showroomNombre).trim() : null;

  var showrooms = datos.showrooms;
  var clientes  = datos.clientes;
  var facturas  = datos.facturas;
  var cobros    = datos.cobros;

  // Mapas de lookup para rendimiento
  // NOTA: clientesPorNombre devuelve un ARRAY porque un cliente puede pertenecer
  // a varios showrooms (ambos comisionan sobre el importe completo de la factura)
  var showroomPorNombre  = buildMap(showrooms, 'Nombre');
  var clientesPorNombre  = groupBy(clientes, 'Nombre');   // { nombre: [clienteA, clienteB, ...] }
  var cobrosParaFactura  = groupBy(cobros, 'Factura_Ref');

  var items = [];
  // Clave: abonoNum + '|' + showroomNombre → permite que el mismo abono aparezca
  // para dos showrooms distintos cuando el cliente pertenece a ambos
  var abonosYaIncluidos = {};

  // ---- Paso 1: Facturas normales (no abonos) ----
  facturas.forEach(function(factura) {
    if (_esAbono(factura)) return;

    var importeFactura = parseFloat(factura.Importe) || 0;
    var numFactura = String(factura.Numero || '').trim();

    // Cobros asociados a esta factura, ordenados por fecha
    var cobrosFactura = (cobrosParaFactura[numFactura] || [])
      .map(function(c) {
        return { fecha: toDateStr(c.Fecha), importe: parseFloat(c.Importe) || 0, tipo: 'cobro' };
      })
      .sort(function(a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });

    // Abonos que referencian esta factura
    var abonosFactura = facturas.filter(function(f) {
      if (!_esAbono(f)) return false;
      var refs = splitRefs(f.Facturas_Abonadas);
      return refs.indexOf(numFactura.toLowerCase()) !== -1;
    });

    // Timeline de pagos: cobros + abonos ordenados cronológicamente
    var pagos = [];
    cobrosFactura.forEach(function(c) { pagos.push(c); });
    abonosFactura.forEach(function(abono) {
      var importeProp = _importeAbonoProporcional(abono, factura, facturas);
      pagos.push({
        fecha:    toDateStr(abono.Fecha),
        importe:  importeProp,
        tipo:     'abono',
        abonoNum: String(abono.Numero || '').trim()
      });
    });
    pagos.sort(function(a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });

    // Buscar fecha en que acumulado alcanza el importe de la factura
    var acumulado = 0;
    var fechaCobro100 = null;
    for (var i = 0; i < pagos.length; i++) {
      acumulado += pagos[i].importe;
      if (acumulado >= importeFactura) {
        fechaCobro100 = pagos[i].fecha;
        break;
      }
    }

    if (!fechaCobro100) return;
    if (!fechaEnRango(fechaCobro100, fechaInicio, fechaFin)) return;

    var nombreCliente  = String(factura.Cliente_Nombre || '').trim();
    var clientesFactura = clientesPorNombre[nombreCliente] || [];
    if (clientesFactura.length === 0) return;

    // Iterar sobre cada showroom al que pertenece el cliente
    clientesFactura.forEach(function(cliente) {
      var srNombre = String(cliente.Showroom_Nombre || '').trim();
      if (filtroShowroom && srNombre !== filtroShowroom) return;

      var showroom = showroomPorNombre[srNombre];
      if (!showroom) return;

      var comisionPct = parseFloat(showroom.Comision_Pct) || 0;

      items.push({
        showroomNombre: String(showroom.Nombre),
        comisionPct:    comisionPct,
        esAbono:        false,
        numero:         numFactura,
        clienteNombre:  nombreCliente,
        pedidosRef:     String(factura.Pedidos_Ref || ''),
        refCliente:     String(factura.Notas || ''),
        fechaEmision:   toDateStr(factura.Fecha),
        fechaCobro100:  fechaCobro100,
        moneda:         String(factura.Moneda || 'EUR'),
        importe:        importeFactura,
        totalCobrado:   acumulado,
        comision:       redondear2(importeFactura * comisionPct / 100)
      });

      // ---- Escenarios 1 y 2: abonos vinculados incluidos en el período de la factura ----
      abonosFactura.forEach(function(abono) {
        var numAbono  = String(abono.Numero || '').trim();
        var claveAbono = numAbono + '|' + srNombre;

        var acumSinEsteAbono = 0, yaEstabaSaldada = false;
        for (var j = 0; j < pagos.length; j++) {
          var pago = pagos[j];
          if (pago.abonoNum === numAbono) continue;
          if (pago.fecha > toDateStr(abono.Fecha)) break;
          acumSinEsteAbono += pago.importe;
          if (acumSinEsteAbono >= importeFactura) { yaEstabaSaldada = true; break; }
        }

        if (!yaEstabaSaldada) {
          var importeAbono = Math.abs(parseFloat(abono.Importe) || 0);
          items.push({
            showroomNombre: String(showroom.Nombre),
            comisionPct:    comisionPct,
            esAbono:        true,
            numero:         numAbono,
            clienteNombre:  nombreCliente,
            pedidosRef:     String(abono.Facturas_Abonadas || ''),
            fechaEmision:   toDateStr(abono.Fecha),
            fechaCobro100:  fechaCobro100,
            moneda:         String(abono.Moneda || factura.Moneda || 'EUR'),
            importe:        -importeAbono,
            totalCobrado:   0,
            comision:       redondear2(-importeAbono * comisionPct / 100)
          });
          abonosYaIncluidos[claveAbono] = true;
        }
      });
    });
  });

  // ---- Paso 2: Escenario 3 — abonos cuyas facturas ya estaban saldadas antes del abono ----
  facturas.forEach(function(abono) {
    if (!_esAbono(abono)) return;
    var numAbono = String(abono.Numero || '').trim();
    if (abonosYaIncluidos[numAbono]) return;

    var refs = splitRefs(abono.Facturas_Abonadas);
    if (refs.length === 0) return;

    var fechaAbono = toDateStr(abono.Fecha);
    if (!fechaEnRango(fechaAbono, fechaInicio, fechaFin)) return;

    // Verificar que TODAS las facturas referenciadas estaban saldadas ANTES del abono
    var todasYaSaldadas = refs.every(function(ref) {
      var facturaRef = null;
      for (var k = 0; k < facturas.length; k++) {
        if (String(facturas[k].Numero || '').trim().toLowerCase() === ref && !_esAbono(facturas[k])) {
          facturaRef = facturas[k];
          break;
        }
      }
      if (!facturaRef) return true;

      var importeRef = parseFloat(facturaRef.Importe) || 0;
      var numRef = String(facturaRef.Numero || '').trim();

      // Cobros de esta factura ref
      var cobrosRef = (cobrosParaFactura[numRef] || [])
        .map(function(c) { return { fecha: toDateStr(c.Fecha), importe: parseFloat(c.Importe) || 0 }; });

      // Otros abonos que referencian esta factura (excluyendo el abono actual)
      var otrosAbonos = facturas.filter(function(f) {
        if (!_esAbono(f)) return false;
        if (String(f.Numero || '').trim() === numAbono) return false;
        var r = splitRefs(f.Facturas_Abonadas);
        return r.indexOf(ref) !== -1;
      }).map(function(a) {
        return { fecha: toDateStr(a.Fecha), importe: Math.abs(parseFloat(a.Importe) || 0) };
      });

      var pagosRef = cobrosRef.concat(otrosAbonos);
      pagosRef.sort(function(a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });

      var acum = 0;
      for (var m = 0; m < pagosRef.length; m++) {
        if (pagosRef[m].fecha >= fechaAbono) break;
        acum += pagosRef[m].importe;
        if (acum >= importeRef) return true;
      }
      return false;
    });

    if (!todasYaSaldadas) return;

    var nombreClienteAbono  = String(abono.Cliente_Nombre || '').trim();
    var clientesAbono = clientesPorNombre[nombreClienteAbono] || [];
    if (clientesAbono.length === 0) return;

    clientesAbono.forEach(function(cliente) {
      var srNombre   = String(cliente.Showroom_Nombre || '').trim();
      var claveAbono = numAbono + '|' + srNombre;
      if (abonosYaIncluidos[claveAbono]) return;
      if (filtroShowroom && srNombre !== filtroShowroom) return;

      var showroom = showroomPorNombre[srNombre];
      if (!showroom) return;

      var comisionPct  = parseFloat(showroom.Comision_Pct) || 0;
      var importeAbono = Math.abs(parseFloat(abono.Importe) || 0);

      items.push({
        showroomNombre: String(showroom.Nombre),
        comisionPct:    comisionPct,
        esAbono:        true,
        numero:         numAbono,
        clienteNombre:  nombreClienteAbono,
        pedidosRef:     String(abono.Facturas_Abonadas || ''),
        fechaEmision:   fechaAbono,
        fechaCobro100:  fechaAbono,
        moneda:         String(abono.Moneda || 'EUR'),
        importe:        -importeAbono,
        totalCobrado:   0,
        comision:       redondear2(-importeAbono * comisionPct / 100)
      });
    });
  });

  // Agrupar por showroom con totales por moneda
  var porShowroom = _agruparPorShowroom(items);

  return {
    items:            items,
    porShowroom:      porShowroom,
    resumenHistorico: _construirResumen(porShowroom, params, items.length)
  };
}

// ---- Funciones privadas ----

function _esAbono(factura) {
  var v = factura.Es_Abono;
  return v === true || v === 'TRUE' || v === 'true' || v === 1;
}

function _importeAbonoProporcional(abono, factura, todasFacturas) {
  var refs = splitRefs(abono.Facturas_Abonadas);
  var importeAbono = Math.abs(parseFloat(abono.Importe) || 0);
  if (refs.length === 1) return importeAbono;

  var facturasRef = refs.map(function(r) {
    for (var i = 0; i < todasFacturas.length; i++) {
      if (String(todasFacturas[i].Numero || '').trim().toLowerCase() === r && !_esAbono(todasFacturas[i])) {
        return todasFacturas[i];
      }
    }
    return null;
  }).filter(Boolean);

  var importeTotal = facturasRef.reduce(function(sum, f) {
    return sum + Math.abs(parseFloat(f.Importe) || 0);
  }, 0);

  if (importeTotal === 0) return 0;
  return importeAbono * (Math.abs(parseFloat(factura.Importe) || 0) / importeTotal);
}

function _agruparPorShowroom(items) {
  var porShowroom = {};
  items.forEach(function(item) {
    var nombre = item.showroomNombre;
    var moneda = item.moneda || 'EUR';
    if (!porShowroom[nombre]) {
      porShowroom[nombre] = {
        showroomNombre:  nombre,
        comisionPct:     item.comisionPct,
        items:           [],
        totalesPorMoneda: {}
      };
    }
    if (!porShowroom[nombre].totalesPorMoneda[moneda]) {
      porShowroom[nombre].totalesPorMoneda[moneda] = { facturado: 0, comision: 0 };
    }
    porShowroom[nombre].items.push(item);
    porShowroom[nombre].totalesPorMoneda[moneda].facturado = redondear2(
      porShowroom[nombre].totalesPorMoneda[moneda].facturado + item.importe
    );
    porShowroom[nombre].totalesPorMoneda[moneda].comision = redondear2(
      porShowroom[nombre].totalesPorMoneda[moneda].comision + item.comision
    );
  });
  return porShowroom;
}

function _construirResumen(porShowroom, params, numFacturas) {
  var totalEURFacturado = 0, totalEURComision = 0;
  var totalUSDFacturado = 0, totalUSDComision = 0;

  Object.keys(porShowroom).forEach(function(nombre) {
    var totales = porShowroom[nombre].totalesPorMoneda;
    if (totales['EUR']) {
      totalEURFacturado = redondear2(totalEURFacturado + totales['EUR'].facturado);
      totalEURComision  = redondear2(totalEURComision  + totales['EUR'].comision);
    }
    if (totales['USD']) {
      totalUSDFacturado = redondear2(totalUSDFacturado + totales['USD'].facturado);
      totalUSDComision  = redondear2(totalUSDComision  + totales['USD'].comision);
    }
  });

  return {
    periodoInicio:    toDateStr(params.fechaInicio),
    periodoFin:       toDateStr(params.fechaFin),
    showroomFiltro:   params.showroomNombre || null,
    totalEURFacturado: totalEURFacturado,
    totalEURComision:  totalEURComision,
    totalUSDFacturado: totalUSDFacturado,
    totalUSDComision:  totalUSDComision,
    numFacturas:       numFacturas
  };
}
