// ========================================
// SISTEMA DE ALMACENAMIENTO
// ========================================

const DB = {
    get: (key) => JSON.parse(localStorage.getItem(key) || '{}'),
    getArray: (key) => JSON.parse(localStorage.getItem(key) || '[]'),
    set: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
    
    getShowrooms: () => DB.getArray('showrooms'),
    setShowrooms: (data) => DB.set('showrooms', data),
    
    getClientes: () => DB.getArray('clientes'),
    setClientes: (data) => DB.set('clientes', data),
    
    getPedidos: () => DB.getArray('pedidos'),
    setPedidos: (data) => DB.set('pedidos', data),
    
    getFacturas: () => DB.getArray('facturas'),
    setFacturas: (data) => DB.set('facturas', data),
    
    getCobros: () => DB.getArray('cobros'),
    setCobros: (data) => DB.set('cobros', data),
    
    getHistoricoInformes: () => DB.getArray('historicoInformes'),
    addHistoricoInforme: (informe) => {
        const historico = DB.getHistoricoInformes();
        historico.unshift(informe);
        if (historico.length > 100) historico.pop(); // Máximo 100
        DB.set('historicoInformes', historico);
    },
    clearHistoricoInformes: () => DB.set('historicoInformes', [])
};

// ========================================
// VARIABLES GLOBALES
// ========================================

let editandoId = null;
let facturaSaldoResidual = null;

// ========================================
// UTILIDADES
// ========================================

function generarId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatCurrency(value, moneda = 'EUR') {
    const symbol = moneda === 'USD' ? '$' : '€';
    const formatted = new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
    return moneda === 'USD' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('es-ES');
}

function showAlert(containerId, message, type = 'info') {
    const alert = document.getElementById(containerId);
    if (!alert) return;
    alert.className = `alert alert-${type} visible`;
    alert.innerHTML = `<strong>${type === 'error' ? '⚠' : 'ℹ'}</strong><span>${message}</span>`;
    setTimeout(() => alert.classList.remove('visible'), 5000);
}

function cerrarModal(modalId) {
    document.getElementById(modalId).classList.remove('visible');
    editandoId = null;
}

function calcularUmbralSaldo(importeFactura) {
    if (importeFactura < 1000) return 30;
    if (importeFactura < 10000) return 50;
    return 100;
}

function aplicarFormatoNumerosExcel(ws) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = ws[addr];
            if (cell && cell.t === 'n') {
                cell.v = Math.round(cell.v * 100) / 100;
                cell.z = '#,##0.00';
            }
        }
    }
}

function redondear2(valor) {
    return Math.round(valor * 100) / 100;
}

// ========================================
// NAVEGACIÓN
// ========================================

function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    if (tabName === 'dashboard') cargarDashboard();
    if (tabName === 'showrooms') cargarTablaShowrooms();
    if (tabName === 'clientes') cargarTablaClientes();
    if (tabName === 'pedidos') cargarTablaPedidos();
    if (tabName === 'facturas') cargarTablaFacturas();
    if (tabName === 'cobros') cargarTablaCobros();
    if (tabName === 'informes') cargarSelectShowrooms();
    if (tabName === 'historico') cargarHistoricoInformes();
}

function calcularTotalAbonos(factura, todasFacturas) {
    if (!todasFacturas) todasFacturas = DB.getFacturas();
    const abonos = todasFacturas.filter(f => f.esAbono && f.facturasAbonadas);
    let total = 0;

    abonos.forEach(abono => {
        const refs = abono.facturasAbonadas.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (!refs.includes(factura.numero.toLowerCase())) return;

        if (refs.length === 1) {
            total += Math.abs(abono.importe);
        } else {
            // Reparto proporcional entre las facturas referenciadas
            const facturasRef = refs.map(r => todasFacturas.find(f => f.numero.toLowerCase() === r && !f.esAbono)).filter(Boolean);
            const importeTotal = facturasRef.reduce((sum, f) => sum + Math.abs(f.importe), 0);
            if (importeTotal > 0) {
                total += Math.abs(abono.importe) * (factura.importe / importeTotal);
            }
        }
    });

    return total;
}

function calcularEstadoFactura(facturaId) {
    const facturas = DB.getFacturas();
    const factura = facturas.find(f => f.id === facturaId);
    if (!factura) return { estado: 'pendiente', cobrado: 0, pendiente: 0, porcentaje: 0 };

    // Para abonos: su estado depende de si las facturas referenciadas están saldadas
    if (factura.esAbono) {
        const refsStr = factura.facturasAbonadas || '';
        const refs = refsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (refs.length === 0) {
            return { estado: 'pendiente', cobrado: 0, pendiente: Math.abs(factura.importe), porcentaje: 0 };
        }

        const todasCobradas = refs.every(ref => {
            const facturaRef = facturas.find(f => f.numero.toLowerCase() === ref && !f.esAbono);
            if (!facturaRef) return true;
            const cobrosRef = DB.getCobros().filter(c => c.facturaId === facturaRef.id);
            const totalCobros = cobrosRef.reduce((sum, c) => sum + c.importe, 0);
            const totalAbonos = calcularTotalAbonos(facturaRef, facturas);
            return (totalCobros + totalAbonos) >= facturaRef.importe;
        });

        // Comprobar también si las facturas ya estaban saldadas antes del abono (escenario 3)
        const yaEstabaSaldada = refs.every(ref => {
            const facturaRef = facturas.find(f => f.numero.toLowerCase() === ref && !f.esAbono);
            if (!facturaRef) return true;
            const cobrosRef = DB.getCobros().filter(c => c.facturaId === facturaRef.id)
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            let acum = 0;
            for (const cobro of cobrosRef) {
                acum += cobro.importe;
                if (acum >= facturaRef.importe) {
                    return new Date(cobro.fecha) < new Date(factura.fecha);
                }
            }
            return false;
        });

        const saldado = todasCobradas || yaEstabaSaldada;
        return {
            estado: saldado ? 'cobrada' : 'pendiente',
            cobrado: saldado ? Math.abs(factura.importe) : 0,
            pendiente: saldado ? 0 : Math.abs(factura.importe),
            porcentaje: saldado ? 100 : 0
        };
    }

    // Para facturas normales: cobros + abonos
    const cobros = DB.getCobros().filter(c => c.facturaId === facturaId);
    const totalCobrado = cobros.reduce((sum, c) => sum + c.importe, 0);
    const totalAbonos = calcularTotalAbonos(factura, facturas);
    const totalSaldado = totalCobrado + totalAbonos;

    const pendiente = factura.importe - totalSaldado;
    const porcentaje = factura.importe > 0 ? Math.min(100, (totalSaldado / factura.importe) * 100) : 0;

    let estado = 'pendiente';
    if (totalSaldado >= factura.importe) {
        estado = 'cobrada';
    } else if (totalSaldado > 0) {
        estado = 'parcial';
    }

    return { estado, cobrado: totalSaldado, pendiente: Math.max(0, pendiente), porcentaje };
}

function calcularEstadoPedido(pedidoId) {
    const pedido = DB.getPedidos().find(p => p.id === pedidoId);
    if (!pedido) return { estado: 'pendiente', cobrado: 0, pendiente: 0, porcentaje: 0 };

    const cobros = DB.getCobros().filter(c => c.pedidoId === pedidoId && !c.facturaId);
    const totalCobrado = cobros.reduce((sum, c) => sum + c.importe, 0);
    const pendiente = pedido.importe - totalCobrado;
    const porcentaje = pedido.importe > 0 ? Math.min(100, (totalCobrado / pedido.importe) * 100) : 0;

    let estado = 'pendiente';
    if (totalCobrado >= pedido.importe) {
        estado = 'cobrada';
    } else if (totalCobrado > 0) {
        estado = 'parcial';
    }

    return { estado, cobrado: totalCobrado, pendiente: Math.max(0, pendiente), porcentaje };
}

// ========================================
// SHOWROOMS - CRUD
// ========================================

function modalShowroom(id = null) {
    const modal = document.getElementById('modalShowroom');
    const title = document.getElementById('modalShowroomTitle');
    
    if (id) {
        const showrooms = DB.getShowrooms();
        const showroom = showrooms.find(s => s.id === id);
        title.textContent = 'Editar Showroom';
        document.getElementById('showNombre').value = showroom.nombre;
        document.getElementById('showComision').value = showroom.comision;
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Showroom';
        document.getElementById('showNombre').value = '';
        document.getElementById('showComision').value = '';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function guardarShowroom() {
    const nombre = document.getElementById('showNombre').value.trim();
    const comision = parseFloat(document.getElementById('showComision').value);
    
    if (!nombre || isNaN(comision) || comision < 0 || comision > 100) {
        alert('Por favor completa todos los campos correctamente');
        return;
    }
    
    const showrooms = DB.getShowrooms();
    
    if (editandoId) {
        const index = showrooms.findIndex(s => s.id === editandoId);
        showrooms[index] = { ...showrooms[index], nombre, comision };
    } else {
        showrooms.push({
            id: generarId(),
            nombre,
            comision,
            fechaCreacion: new Date().toISOString()
        });
    }
    
    DB.setShowrooms(showrooms);
    cerrarModal('modalShowroom');
    cargarTablaShowrooms();
    showAlert('showroomsAlert', `Showroom ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
}

function cargarTablaShowrooms() {
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('showroomsTable');
    
    if (showrooms.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏢</div><p>No hay showrooms registrados</p></div>';
        return;
    }
    
    let html = '<table><thead><tr><th>Nombre</th><th>% Comisión</th><th>Acciones</th></tr></thead><tbody>';
    
    showrooms.forEach(showroom => {
        html += `
            <tr>
                <td><strong>${showroom.nombre}</strong></td>
                <td>${showroom.comision}%</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalShowroom('${showroom.id}')" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarShowroom('${showroom.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarShowroom(id) {
    if (!confirm('¿Eliminar este showroom?')) return;
    
    const showrooms = DB.getShowrooms().filter(s => s.id !== id);
    DB.setShowrooms(showrooms);
    cargarTablaShowrooms();
    showAlert('showroomsAlert', 'Showroom eliminado', 'success');
}

function exportarShowrooms() {
    const showrooms = DB.getShowrooms();
    if (showrooms.length === 0) {
        alert('No hay showrooms para exportar');
        return;
    }
    
    const data = [['Nombre', '% Comisión']];
    showrooms.forEach(s => data.push([s.nombre, s.comision]));
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Showrooms');
    XLSX.writeFile(wb, 'Showrooms_Charo_Ruiz.xlsx');
}

function importarShowrooms(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const showrooms = DB.getShowrooms();
            let importados = 0;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                showrooms.push({
                    id: generarId(),
                    nombre: String(row[0]),
                    comision: parseFloat(row[1]) || 0,
                    fechaCreacion: new Date().toISOString()
                });
                importados++;
            }
            
            DB.setShowrooms(showrooms);
            cargarTablaShowrooms();
            showAlert('showroomsAlert', `${importados} showrooms importados correctamente`, 'success');
        } catch (error) {
            showAlert('showroomsAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importShowroomsInput').value = '';
}


// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // Configurar fechas por defecto
    const hoy = new Date();
    document.getElementById('cobFecha').valueAsDate = hoy;
    document.getElementById('pedFecha').valueAsDate = hoy;
    document.getElementById('facFecha').valueAsDate = hoy;
    
    const treintaDias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
    document.getElementById('facVencimiento').valueAsDate = treintaDias;

    // Fechas informe (mes actual)
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    document.getElementById('infFechaInicio').valueAsDate = primerDia;
    document.getElementById('infFechaFin').valueAsDate = ultimoDia;

    // Configurar eventos de importación
    document.getElementById('importShowroomsInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarShowrooms(e.target.files[0]);
    });
    document.getElementById('importClientesInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarClientes(e.target.files[0]);
    });
    document.getElementById('importPedidosInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarPedidos(e.target.files[0]);
    });
    document.getElementById('importFacturasInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarFacturas(e.target.files[0]);
    });
    document.getElementById('importCobrosInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarCobros(e.target.files[0]);
    });

    // Cargar dashboard inicial
    cargarDashboard();
});

// ========================================
// MÓDULO: DASHBOARD
// ========================================

function cargarDashboard() {
    const showrooms = DB.getShowrooms();
    const clientes = DB.getClientes();
    const pedidos = DB.getPedidos();
    const facturas = DB.getFacturas();
    const cobros = DB.getCobros();

    // Calcular estadísticas
    let totalFacturas = 0;
    let facturasPendientes = 0;
    let facturasParcialesCobradas = 0;
    let facturasCobradas = 0;
    let montoPendiente = 0;

    facturas.forEach(fac => {
        const estado = calcularEstadoFactura(fac.id);
        totalFacturas++;
        
        if (estado.porcentaje === 0) {
            facturasPendientes++;
            montoPendiente += fac.importe;
        } else if (estado.porcentaje < 100) {
            facturasParcialesCobradas++;
            montoPendiente += estado.pendiente;
        } else {
            facturasCobradas++;
        }
    });

    // Renderizar estadísticas
    const statsHTML = `
        <div class="stat-card">
            <div class="stat-label">Showrooms</div>
            <div class="stat-value">${showrooms.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Clientes</div>
            <div class="stat-value">${clientes.length}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Total Facturas</div>
            <div class="stat-value">${totalFacturas}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Cobradas 100%</div>
            <div class="stat-value" style="color: var(--success);">${facturasCobradas}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Pendientes</div>
            <div class="stat-value" style="color: var(--danger);">${facturasPendientes}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Monto Pendiente</div>
            <div class="stat-value" style="color: var(--warning);">${formatCurrency(montoPendiente, 'EUR')}</div>
        </div>
    `;
    document.getElementById('statsGrid').innerHTML = statsHTML;

    // Tabla de facturas pendientes
    const facturasPend = facturas.filter(f => {
        const estado = calcularEstadoFactura(f.id);
        return estado.porcentaje < 100;
    });

    if (facturasPend.length === 0) {
        document.getElementById('facturasPendientesContainer').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <p>¡Todas las facturas están cobradas!</p>
            </div>
        `;
    } else {
        const hoy = new Date();
        // Ordenar por fecha de vencimiento (más antiguas primero)
        facturasPend.sort((a, b) => new Date(a.vencimiento || a.fechaVencimiento) - new Date(b.vencimiento || b.fechaVencimiento));

        let html = '<table><thead><tr><th>Factura</th><th>Cliente</th><th>Showroom</th><th>Importe</th><th>Cobrado</th><th>Pendiente</th><th>Estado</th><th>Vencimiento</th><th>Días Vencida</th></tr></thead><tbody>';

        facturasPend.forEach(fac => {
            const estado = calcularEstadoFactura(fac.id);
            const cliente = clientes.find(c => c.id === fac.clienteId);
            const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
            const badge = estado.porcentaje === 0 ? 'danger' : 'warning';
            const fechaVenc = new Date(fac.vencimiento || fac.fechaVencimiento);
            const diffMs = hoy - fechaVenc;
            const diasVencida = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const vencida = diasVencida > 0;

            html += `
                <tr>
                    <td><strong>${fac.numero}</strong></td>
                    <td>${cliente ? cliente.nombre : '-'}</td>
                    <td>${showroom ? showroom.nombre : '-'}</td>
                    <td>${formatCurrency(fac.importe, fac.moneda)}</td>
                    <td>${formatCurrency(estado.cobrado, fac.moneda)}</td>
                    <td style="color: var(--warning); font-weight: 600;">${formatCurrency(estado.pendiente, fac.moneda)}</td>
                    <td><span class="badge badge-${badge}">${estado.porcentaje.toFixed(0)}%</span></td>
                    <td style="color: ${vencida ? 'var(--danger)' : 'inherit'}">${formatDate(fac.vencimiento || fac.fechaVencimiento)}</td>
                    <td style="font-weight: 600; color: ${vencida ? 'var(--danger)' : 'var(--success)'};">${vencida ? diasVencida + ' días' : 'Al día'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        document.getElementById('facturasPendientesContainer').innerHTML = html;
    }
}

// ========================================
// MÓDULO: SHOWROOMS
// ========================================

function modalShowroom(id = null) {
    const modal = document.getElementById('modalShowroom');
    const title = document.getElementById('modalShowroomTitle');
    
    if (id) {
        const showrooms = DB.getShowrooms();
        const showroom = showrooms.find(s => s.id === id);
        
        title.textContent = 'Editar Showroom';
        document.getElementById('showNombre').value = showroom.nombre;
        document.getElementById('showComision').value = showroom.comision;
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Showroom';
        document.getElementById('showNombre').value = '';
        document.getElementById('showComision').value = '';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function guardarShowroom() {
    const nombre = document.getElementById('showNombre').value.trim();
    const comision = parseFloat(document.getElementById('showComision').value);
    
    if (!nombre || isNaN(comision)) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    const showrooms = DB.getShowrooms();
    
    if (editandoId) {
        const index = showrooms.findIndex(s => s.id === editandoId);
        showrooms[index] = { ...showrooms[index], nombre, comision };
    } else {
        showrooms.push({
            id: generarId(),
            nombre,
            comision,
            createdAt: new Date().toISOString()
        });
    }
    
    DB.setShowrooms(showrooms);
    cerrarModal('modalShowroom');
    cargarTablaShowrooms();
    showAlert('showroomsAlert', `Showroom ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
}

function cargarTablaShowrooms() {
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('showroomsTable');
    
    if (showrooms.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🏢</div>
                <p>No hay showrooms registrados</p>
                <p style="font-size: 14px; margin-top: 8px;">Crea uno nuevo o importa desde Excel</p>
            </div>
        `;
        return;
    }
    
    let html = '<table><thead><tr><th>Nombre</th><th>% Comisión</th><th>Acciones</th></tr></thead><tbody>';
    
    showrooms.forEach(show => {
        html += `
            <tr>
                <td><strong>${show.nombre}</strong></td>
                <td>${show.comision}%</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalShowroom('${show.id}')" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarShowroom('${show.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarShowroom(id) {
    if (!confirm('¿Eliminar este showroom?')) return;
    
    const showrooms = DB.getShowrooms().filter(s => s.id !== id);
    DB.setShowrooms(showrooms);
    cargarTablaShowrooms();
    showAlert('showroomsAlert', 'Showroom eliminado correctamente', 'success');
}

function exportarShowrooms() {
    const showrooms = DB.getShowrooms();
    if (showrooms.length === 0) {
        alert('No hay showrooms para exportar');
        return;
    }
    
    const data = [['Nombre', '% Comisión']];
    showrooms.forEach(s => data.push([s.nombre, s.comision]));
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Showrooms');
    XLSX.writeFile(wb, 'Showrooms.xlsx');
}

function importarShowrooms(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const showrooms = DB.getShowrooms();
            let importados = 0;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                showrooms.push({
                    id: generarId(),
                    nombre: row[0],
                    comision: parseFloat(row[1]) || 0,
                    createdAt: new Date().toISOString()
                });
                importados++;
            }
            
            DB.setShowrooms(showrooms);
            cargarTablaShowrooms();
            showAlert('showroomsAlert', `${importados} showrooms importados correctamente`, 'success');
        } catch (error) {
            showAlert('showroomsAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importShowroomsInput').value = '';
}

// ========================================
// MÓDULO: CLIENTES
// ========================================

function modalCliente(id = null) {
    const modal = document.getElementById('modalCliente');
    const title = document.getElementById('modalClienteTitle');
    
    // Cargar showrooms en el select
    const showrooms = DB.getShowrooms();
    const select = document.getElementById('cliShowroom');
    select.innerHTML = '<option value="">Seleccionar showroom...</option>';
    showrooms.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
    });
    
    if (id) {
        const clientes = DB.getClientes();
        const cliente = clientes.find(c => c.id === id);
        
        title.textContent = 'Editar Cliente';
        document.getElementById('cliNombre').value = cliente.nombre;
        document.getElementById('cliShowroom').value = cliente.showroomId;
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Cliente';
        document.getElementById('cliNombre').value = '';
        document.getElementById('cliShowroom').value = '';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function guardarCliente() {
    const nombre = document.getElementById('cliNombre').value.trim();
    const showroomId = document.getElementById('cliShowroom').value;
    
    if (!nombre || !showroomId) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    const clientes = DB.getClientes();
    
    if (editandoId) {
        const index = clientes.findIndex(c => c.id === editandoId);
        clientes[index] = { ...clientes[index], nombre, showroomId };
    } else {
        clientes.push({
            id: generarId(),
            nombre,
            showroomId,
            createdAt: new Date().toISOString()
        });
    }
    
    DB.setClientes(clientes);
    cerrarModal('modalCliente');
    cargarTablaClientes();
    showAlert('clientesAlert', `Cliente ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
}

function cargarTablaClientes() {
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('clientesTable');
    
    if (clientes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <p>No hay clientes registrados</p>
                <p style="font-size: 14px; margin-top: 8px;">Crea uno nuevo o importa desde Excel</p>
            </div>
        `;
        return;
    }
    
    let html = '<table><thead><tr><th>Nombre</th><th>Showroom</th><th>Acciones</th></tr></thead><tbody>';
    
    clientes.forEach(cli => {
        const showroom = showrooms.find(s => s.id === cli.showroomId);
        html += `
            <tr>
                <td><strong>${cli.nombre}</strong></td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalCliente('${cli.id}')" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarCliente('${cli.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    
    const clientes = DB.getClientes().filter(c => c.id !== id);
    DB.setClientes(clientes);
    cargarTablaClientes();
    showAlert('clientesAlert', 'Cliente eliminado correctamente', 'success');
}

function exportarClientes() {
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    
    if (clientes.length === 0) {
        alert('No hay clientes para exportar');
        return;
    }
    
    const data = [['Nombre Cliente', 'Showroom']];
    clientes.forEach(c => {
        const showroom = showrooms.find(s => s.id === c.showroomId);
        data.push([c.nombre, showroom ? showroom.nombre : '']);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'Clientes.xlsx');
}

function importarClientes(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const clientes = DB.getClientes();
            const showrooms = DB.getShowrooms();
            let importados = 0;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                // Buscar showroom por nombre
                const showroom = showrooms.find(s => s.nombre === row[1]);
                if (!showroom) continue;
                
                clientes.push({
                    id: generarId(),
                    nombre: row[0],
                    showroomId: showroom.id,
                    createdAt: new Date().toISOString()
                });
                importados++;
            }
            
            DB.setClientes(clientes);
            cargarTablaClientes();
            showAlert('clientesAlert', `${importados} clientes importados correctamente`, 'success');
        } catch (error) {
            showAlert('clientesAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importClientesInput').value = '';
}


// ========================================
// MÓDULO: PEDIDOS
// ========================================

function modalPedido(id = null) {
    const modal = document.getElementById('modalPedido');
    const title = document.getElementById('modalPedidoTitle');
    
    // Cargar clientes
    const clientes = DB.getClientes();
    const select = document.getElementById('pedCliente');
    select.innerHTML = '<option value="">Seleccionar cliente...</option>';
    clientes.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
    
    if (id) {
        const pedidos = DB.getPedidos();
        const pedido = pedidos.find(p => p.id === id);
        
        title.textContent = 'Editar Pedido';
        document.getElementById('pedNumero').value = pedido.numero;
        document.getElementById('pedCliente').value = pedido.clienteId;
        document.getElementById('pedFecha').value = pedido.fecha;
        document.getElementById('pedMoneda').value = pedido.moneda;
        document.getElementById('pedImporte').value = pedido.importe;
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Pedido';
        document.getElementById('pedNumero').value = '';
        document.getElementById('pedCliente').value = '';
        document.getElementById('pedFecha').valueAsDate = new Date();
        document.getElementById('pedMoneda').value = 'EUR';
        document.getElementById('pedImporte').value = '';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function guardarPedido() {
    const numero = document.getElementById('pedNumero').value.trim();
    const clienteId = document.getElementById('pedCliente').value;
    const fecha = document.getElementById('pedFecha').value;
    const moneda = document.getElementById('pedMoneda').value;
    const importe = parseFloat(document.getElementById('pedImporte').value);
    
    if (!numero || !clienteId || !fecha || isNaN(importe)) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    const pedidos = DB.getPedidos();
    
    if (editandoId) {
        const index = pedidos.findIndex(p => p.id === editandoId);
        pedidos[index] = { ...pedidos[index], numero, clienteId, fecha, moneda, importe };
    } else {
        pedidos.push({
            id: generarId(),
            numero,
            clienteId,
            fecha,
            moneda,
            importe,
            createdAt: new Date().toISOString()
        });
    }
    
    DB.setPedidos(pedidos);
    cerrarModal('modalPedido');
    cargarTablaPedidos();
    showAlert('pedidosAlert', `Pedido ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
}

function cargarTablaPedidos() {
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const container = document.getElementById('pedidosTable');
    
    if (pedidos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>No hay pedidos registrados</p>
                <p style="font-size: 14px; margin-top: 8px;">Crea uno nuevo o importa desde Excel</p>
            </div>
        `;
        return;
    }
    
    let html = '<table><thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>';
    
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(ped => {
        const cliente = clientes.find(c => c.id === ped.clienteId);
        html += `
            <tr>
                <td><strong>${ped.numero}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${formatDate(ped.fecha)}</td>
                <td>${formatCurrency(ped.importe, ped.moneda)}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalPedido('${ped.id}')" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarPedido('${ped.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarPedido(id) {
    if (!confirm('¿Eliminar este pedido?')) return;
    
    const pedidos = DB.getPedidos().filter(p => p.id !== id);
    DB.setPedidos(pedidos);
    cargarTablaPedidos();
    showAlert('pedidosAlert', 'Pedido eliminado correctamente', 'success');
}

function importarPedidos(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const pedidos = DB.getPedidos();
            const clientes = DB.getClientes();
            let importados = 0;
            
            // Formato: Número | Cliente | Fecha | Moneda | Importe
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                const cliente = clientes.find(c => c.nombre === row[1]);
                if (!cliente) continue;
                
                pedidos.push({
                    id: generarId(),
                    numero: row[0],
                    clienteId: cliente.id,
                    fecha: row[2] ? new Date(row[2]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    moneda: row[3] || 'EUR',
                    importe: parseFloat(row[4]) || 0,
                    createdAt: new Date().toISOString()
                });
                importados++;
            }
            
            DB.setPedidos(pedidos);
            cargarTablaPedidos();
            showAlert('pedidosAlert', `${importados} pedidos importados correctamente`, 'success');
        } catch (error) {
            showAlert('pedidosAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importPedidosInput').value = '';
}

// ========================================
// MÓDULO: FACTURAS
// ========================================

function modalFactura(id = null) {
    const modal = document.getElementById('modalFactura');
    const title = document.getElementById('modalFacturaTitle');
    
    // Cargar clientes
    const clientes = DB.getClientes();
    const select = document.getElementById('facCliente');
    select.innerHTML = '<option value="">Seleccionar cliente...</option>';
    clientes.forEach(c => {
        select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
    
    if (id) {
        const facturas = DB.getFacturas();
        const factura = facturas.find(f => f.id === id);
        
        title.textContent = 'Editar Factura';
        document.getElementById('facNumero').value = factura.numero;
        document.getElementById('facCliente').value = factura.clienteId;
        document.getElementById('facPedidos').value = factura.pedidosOrigen || '';
        document.getElementById('facFecha').value = factura.fecha;
        document.getElementById('facVencimiento').value = factura.fechaVencimiento;
        document.getElementById('facMoneda').value = factura.moneda;
        document.getElementById('facImporte').value = factura.importe;
        editandoId = id;
        
        cargarPedidosCliente();
    } else {
        title.textContent = 'Nueva Factura';
        document.getElementById('facNumero').value = '';
        document.getElementById('facCliente').value = '';
        document.getElementById('facPedidos').value = '';
        document.getElementById('facFecha').valueAsDate = new Date();
        const treintaDias = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        document.getElementById('facVencimiento').valueAsDate = treintaDias;
        document.getElementById('facMoneda').value = 'EUR';
        document.getElementById('facImporte').value = '';
        editandoId = null;
        document.getElementById('pedidosDisponibles').textContent = '-';
    }
    
    modal.classList.add('visible');
}

function cargarPedidosCliente() {
    const clienteId = document.getElementById('facCliente').value;
    const container = document.getElementById('pedidosCheckboxes');
    const info = document.getElementById('pedidosDisponiblesInfo');
    const hiddenInput = document.getElementById('facPedidos');

    if (!clienteId) {
        container.innerHTML = '';
        info.textContent = 'Selecciona un cliente para ver sus pedidos';
        info.style.display = '';
        return;
    }

    const pedidos = DB.getPedidos().filter(p => p.clienteId === clienteId);

    if (pedidos.length === 0) {
        container.innerHTML = '';
        info.textContent = 'Este cliente no tiene pedidos registrados';
        info.style.display = '';
        return;
    }

    info.style.display = 'none';

    // Pedidos ya seleccionados (al editar factura)
    const seleccionados = (hiddenInput.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
    pedidos.forEach(p => {
        const estado = calcularEstadoPedido(p.id);
        const checked = seleccionados.includes(p.numero.toLowerCase()) ? 'checked' : '';
        const anticipoInfo = estado.cobrado > 0 ? ` | Antic: ${formatCurrency(estado.cobrado, p.moneda)}` : '';
        html += `
            <label style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--gray-300); border-radius: 8px; cursor: pointer; font-size: 13px; background: ${checked ? 'var(--primary-light)' : 'var(--gray-50)'};">
                <input type="checkbox" value="${p.numero}" onchange="actualizarPedidosSeleccionados()" ${checked}
                    style="accent-color: var(--primary);">
                <strong>${p.numero}</strong>
                <span style="color: var(--gray-500);">${formatCurrency(p.importe, p.moneda)}${anticipoInfo}</span>
            </label>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function actualizarPedidosSeleccionados() {
    const checkboxes = document.querySelectorAll('#pedidosCheckboxes input[type="checkbox"]');
    const seleccionados = [];
    checkboxes.forEach(cb => {
        const label = cb.closest('label');
        if (cb.checked) {
            seleccionados.push(cb.value);
            if (label) label.style.background = 'var(--primary-light)';
        } else {
            if (label) label.style.background = 'var(--gray-50)';
        }
    });
    document.getElementById('facPedidos').value = seleccionados.join(', ');
}

function guardarFactura() {
    const numero = document.getElementById('facNumero').value.trim();
    const clienteId = document.getElementById('facCliente').value;
    const pedidosOrigen = document.getElementById('facPedidos').value.trim();
    const fecha = document.getElementById('facFecha').value;
    const fechaVencimiento = document.getElementById('facVencimiento').value;
    const moneda = document.getElementById('facMoneda').value;
    const importe = parseFloat(document.getElementById('facImporte').value);
    
    if (!numero || !clienteId || !fecha || !fechaVencimiento || isNaN(importe)) {
        alert('Por favor completa todos los campos obligatorios');
        return;
    }
    
    const facturas = DB.getFacturas();
    
    if (editandoId) {
        const index = facturas.findIndex(f => f.id === editandoId);
        facturas[index] = { ...facturas[index], numero, clienteId, pedidosOrigen, fecha, fechaVencimiento, moneda, importe };
    } else {
        facturas.push({
            id: generarId(),
            numero,
            clienteId,
            pedidosOrigen,
            fecha,
            fechaVencimiento,
            moneda,
            importe,
            createdAt: new Date().toISOString()
        });
    }
    
    DB.setFacturas(facturas);
    cerrarModal('modalFactura');
    cargarTablaFacturas();
    showAlert('facturasAlert', `Factura ${editandoId ? 'actualizada' : 'creada'} correctamente`, 'success');
}

function cargarTablaFacturas() {
    const facturas = DB.getFacturas();
    const clientes = DB.getClientes();
    const container = document.getElementById('facturasTable');
    
    if (facturas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📄</div>
                <p>No hay facturas registradas</p>
                <p style="font-size: 14px; margin-top: 8px;">Crea una nueva o importa desde Excel</p>
            </div>
        `;
        return;
    }
    
    let html = '<table><thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th>Vencimiento</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>';
    
    facturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(fac => {
        const cliente = clientes.find(c => c.id === fac.clienteId);
        const estado = calcularEstadoFactura(fac.id);
        let badge = 'danger';
        let textoEstado = 'Pendiente';
        
        if (estado.porcentaje === 100) {
            badge = 'success';
            textoEstado = 'Cobrada';
        } else if (estado.porcentaje > 0) {
            badge = 'warning';
            textoEstado = `${estado.porcentaje.toFixed(0)}%`;
        }
        
        html += `
            <tr>
                <td><strong>${fac.numero}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${formatDate(fac.fecha)}</td>
                <td>${formatDate(fac.fechaVencimiento)}</td>
                <td>${formatCurrency(fac.importe, fac.moneda)}</td>
                <td><span class="badge badge-${badge}">${textoEstado}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalFactura('${fac.id}')" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarFactura('${fac.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarFactura(id) {
    if (!confirm('¿Eliminar esta factura?')) return;
    
    const facturas = DB.getFacturas().filter(f => f.id !== id);
    DB.setFacturas(facturas);
    cargarTablaFacturas();
    showAlert('facturasAlert', 'Factura eliminada correctamente', 'success');
}

function importarFacturas(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const facturas = DB.getFacturas();
            const clientes = DB.getClientes();
            let importados = 0;
            
            // Formato: Número | Cliente | Pedidos | Fecha | Vencimiento | Moneda | Importe
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                const cliente = clientes.find(c => c.nombre === row[1]);
                if (!cliente) continue;
                
                facturas.push({
                    id: generarId(),
                    numero: row[0],
                    clienteId: cliente.id,
                    pedidosOrigen: row[2] || '',
                    fecha: row[3] ? new Date(row[3]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    fechaVencimiento: row[4] ? new Date(row[4]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    moneda: row[5] || 'EUR',
                    importe: parseFloat(row[6]) || 0,
                    createdAt: new Date().toISOString()
                });
                importados++;
            }
            
            DB.setFacturas(facturas);
            cargarTablaFacturas();
            showAlert('facturasAlert', `${importados} facturas importadas correctamente`, 'success');
        } catch (error) {
            showAlert('facturasAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importFacturasInput').value = '';
}


// ========================================
// CLIENTES - CRUD
// ========================================

function modalCliente(id = null) {
    const modal = document.getElementById('modalCliente');
    const title = document.getElementById('modalClienteTitle');
    
    // Cargar showrooms en select
    const showrooms = DB.getShowrooms();
    const selectShowroom = document.getElementById('cliShowroom');
    selectShowroom.innerHTML = '<option value="">Seleccionar showroom...</option>';
    showrooms.forEach(s => {
        selectShowroom.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
    });
    
    if (id) {
        const clientes = DB.getClientes();
        const cliente = clientes.find(c => c.id === id);
        title.textContent = 'Editar Cliente';
        document.getElementById('cliNombre').value = cliente.nombre;
        document.getElementById('cliShowroom').value = cliente.showroomId;
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Cliente';
        document.getElementById('cliNombre').value = '';
        document.getElementById('cliShowroom').value = '';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function guardarCliente() {
    const nombre = document.getElementById('cliNombre').value.trim();
    const showroomId = document.getElementById('cliShowroom').value;
    
    if (!nombre || !showroomId) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    const clientes = DB.getClientes();
    
    if (editandoId) {
        const index = clientes.findIndex(c => c.id === editandoId);
        clientes[index] = { ...clientes[index], nombre, showroomId };
    } else {
        clientes.push({
            id: generarId(),
            nombre,
            showroomId,
            fechaCreacion: new Date().toISOString()
        });
    }
    
    DB.setClientes(clientes);
    cerrarModal('modalCliente');
    cargarTablaClientes();
    showAlert('clientesAlert', `Cliente ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
}

function cargarTablaClientes() {
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('clientesTable');
    
    if (clientes.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">👥</div><p>No hay clientes registrados</p></div>';
        return;
    }
    
    let html = '<table><thead><tr><th>Nombre</th><th>Showroom</th><th>Acciones</th></tr></thead><tbody>';
    
    clientes.forEach(cliente => {
        const showroom = showrooms.find(s => s.id === cliente.showroomId);
        html += `
            <tr>
                <td><strong>${cliente.nombre}</strong></td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalCliente('${cliente.id}')">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarCliente('${cliente.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarCliente(id) {
    if (!confirm('¿Eliminar este cliente?')) return;
    
    const clientes = DB.getClientes().filter(c => c.id !== id);
    DB.setClientes(clientes);
    cargarTablaClientes();
    showAlert('clientesAlert', 'Cliente eliminado', 'success');
}

function exportarClientes() {
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    
    if (clientes.length === 0) {
        alert('No hay clientes para exportar');
        return;
    }
    
    const data = [['Nombre', 'Showroom']];
    clientes.forEach(c => {
        const showroom = showrooms.find(s => s.id === c.showroomId);
        data.push([c.nombre, showroom ? showroom.nombre : '']);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, 'Clientes_Charo_Ruiz.xlsx');
}

function importarClientes(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const clientes = DB.getClientes();
            const showrooms = DB.getShowrooms();
            let importados = 0;
            
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                const showroomNombre = String(row[1] || '');
                const showroom = showrooms.find(s => s.nombre.toLowerCase() === showroomNombre.toLowerCase());
                
                if (showroom) {
                    clientes.push({
                        id: generarId(),
                        nombre: String(row[0]),
                        showroomId: showroom.id,
                        fechaCreacion: new Date().toISOString()
                    });
                    importados++;
                }
            }
            
            DB.setClientes(clientes);
            cargarTablaClientes();
            showAlert('clientesAlert', `${importados} clientes importados correctamente`, 'success');
        } catch (error) {
            showAlert('clientesAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importClientesInput').value = '';
}

// ========================================
// PEDIDOS - CRUD
// ========================================

function modalPedido(id = null) {
    const modal = document.getElementById('modalPedido');
    const title = document.getElementById('modalPedidoTitle');
    
    // Cargar clientes en select
    const clientes = DB.getClientes();
    const selectCliente = document.getElementById('pedCliente');
    selectCliente.innerHTML = '<option value="">Seleccionar cliente...</option>';
    clientes.forEach(c => {
        selectCliente.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });
    
    if (id) {
        const pedidos = DB.getPedidos();
        const pedido = pedidos.find(p => p.id === id);
        title.textContent = 'Editar Pedido';
        document.getElementById('pedNumero').value = pedido.numero;
        document.getElementById('pedCliente').value = pedido.clienteId;
        document.getElementById('pedFecha').value = pedido.fecha;
        document.getElementById('pedMoneda').value = pedido.moneda;
        document.getElementById('pedImporte').value = pedido.importe;
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Pedido';
        document.getElementById('pedNumero').value = '';
        document.getElementById('pedCliente').value = '';
        document.getElementById('pedFecha').valueAsDate = new Date();
        document.getElementById('pedMoneda').value = 'EUR';
        document.getElementById('pedImporte').value = '';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function guardarPedido() {
    const numero = document.getElementById('pedNumero').value.trim();
    const clienteId = document.getElementById('pedCliente').value;
    const fecha = document.getElementById('pedFecha').value;
    const moneda = document.getElementById('pedMoneda').value;
    const importe = parseFloat(document.getElementById('pedImporte').value);
    
    if (!numero || !clienteId || !fecha || isNaN(importe)) {
        alert('Por favor completa todos los campos');
        return;
    }
    
    const pedidos = DB.getPedidos();
    
    if (editandoId) {
        const index = pedidos.findIndex(p => p.id === editandoId);
        pedidos[index] = { ...pedidos[index], numero, clienteId, fecha, moneda, importe };
    } else {
        pedidos.push({
            id: generarId(),
            numero,
            clienteId,
            fecha,
            moneda,
            importe,
            fechaCreacion: new Date().toISOString()
        });
    }
    
    DB.setPedidos(pedidos);
    cerrarModal('modalPedido');
    cargarTablaPedidos();
    showAlert('pedidosAlert', `Pedido ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
}

function cargarTablaPedidos() {
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('pedidosTable');
    
    if (pedidos.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📦</div><p>No hay pedidos registrados</p></div>';
        return;
    }
    
    // Controles de filtro
    let html = `
        <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
            <input type="text" id="buscarPedido" placeholder="🔍 Buscar pedido..." style="flex: 1; min-width: 200px;">
            <select id="filtroClientePedido" style="min-width: 200px;">
                <option value="">Todos los clientes</option>
                ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
            </select>
            <select id="filtroShowroomPedido" style="min-width: 200px;">
                <option value="">Todos los showrooms</option>
                ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
        </div>
    `;
    
    html += '<table><thead><tr><th>Nº Pedido</th><th>Cliente</th><th>Showroom</th><th>Fecha</th><th>Importe</th><th>Acciones</th></tr></thead><tbody id="pedidosTableBody">';
    
    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(pedido => {
        const cliente = clientes.find(c => c.id === pedido.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        
        html += `
            <tr data-cliente="${pedido.clienteId}" data-showroom="${showroom ? showroom.id : ''}" data-numero="${pedido.numero.toLowerCase()}">
                <td><strong>${pedido.numero}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>${formatDate(pedido.fecha)}</td>
                <td>${formatCurrency(pedido.importe, pedido.moneda)}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalPedido('${pedido.id}')">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarPedido('${pedido.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Event listeners
    document.getElementById('buscarPedido').addEventListener('input', filtrarPedidos);
    document.getElementById('filtroClientePedido').addEventListener('change', filtrarPedidos);
    document.getElementById('filtroShowroomPedido').addEventListener('change', filtrarPedidos);
}

function filtrarPedidos() {
    const busqueda = document.getElementById('buscarPedido').value.toLowerCase();
    const clienteFiltro = document.getElementById('filtroClientePedido').value;
    const showroomFiltro = document.getElementById('filtroShowroomPedido').value;
    
    const filas = document.querySelectorAll('#pedidosTableBody tr');
    
    filas.forEach(fila => {
        const numero = fila.getAttribute('data-numero');
        const cliente = fila.getAttribute('data-cliente');
        const showroom = fila.getAttribute('data-showroom');
        
        const coincideBusqueda = numero.includes(busqueda);
        const coincideCliente = !clienteFiltro || cliente === clienteFiltro;
        const coincideShowroom = !showroomFiltro || showroom === showroomFiltro;
        
        if (coincideBusqueda && coincideCliente && coincideShowroom) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    });
}

function eliminarPedido(id) {
    if (!confirm('¿Eliminar este pedido?')) return;
    
    const pedidos = DB.getPedidos().filter(p => p.id !== id);
    DB.setPedidos(pedidos);
    cargarTablaPedidos();
    showAlert('pedidosAlert', 'Pedido eliminado', 'success');
}

function importarPedidos(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            
            const pedidos = DB.getPedidos();
            const clientes = DB.getClientes();
            let importados = 0;
            
            // Formato: Número | Cliente | Fecha | Moneda | Importe
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                const clienteNombre = String(row[1] || '');
                const cliente = clientes.find(c => c.nombre.toLowerCase() === clienteNombre.toLowerCase());
                
                if (cliente) {
                    pedidos.push({
                        id: generarId(),
                        numero: String(row[0]),
                        clienteId: cliente.id,
                        fecha: row[2] || new Date().toISOString().split('T')[0],
                        moneda: String(row[3] || 'EUR'),
                        importe: parseFloat(row[4]) || 0,
                        fechaCreacion: new Date().toISOString()
                    });
                    importados++;
                }
            }
            
            DB.setPedidos(pedidos);
            cargarTablaPedidos();
            showAlert('pedidosAlert', `${importados} pedidos importados correctamente`, 'success');
        } catch (error) {
            showAlert('pedidosAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importPedidosInput').value = '';
}

// ========================================
// FACTURAS - CRUD
// ========================================

function modalFactura(id = null) {
    const modal = document.getElementById('modalFactura');
    const title = document.getElementById('modalFacturaTitle');

    // Cargar clientes en select
    const clientes = DB.getClientes();
    const selectCliente = document.getElementById('facCliente');
    selectCliente.innerHTML = '<option value="">Seleccionar cliente...</option>';
    clientes.forEach(c => {
        selectCliente.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
    });

    if (id) {
        const facturas = DB.getFacturas();
        const factura = facturas.find(f => f.id === id);
        title.textContent = factura.esAbono ? 'Editar Abono' : 'Editar Factura';
        document.getElementById('facNumero').value = factura.numero;
        document.getElementById('facCliente').value = factura.clienteId;
        document.getElementById('facPedidos').value = factura.pedidos || '';
        document.getElementById('facFacturasAbonadas').value = factura.facturasAbonadas || '';
        document.getElementById('facFecha').value = factura.fecha;
        document.getElementById('facVencimiento').value = factura.vencimiento;
        document.getElementById('facMoneda').value = factura.moneda;
        document.getElementById('facImporte').value = factura.esAbono ? Math.abs(factura.importe) : factura.importe;
        cambiarTipoFactura(factura.esAbono ? 'abono' : 'factura');
        cargarPedidosCliente();
        cargarFacturasAbonables();
        editandoId = id;
    } else {
        title.textContent = 'Nueva Factura';
        document.getElementById('facNumero').value = '';
        document.getElementById('facCliente').value = '';
        document.getElementById('facPedidos').value = '';
        document.getElementById('facFacturasAbonadas').value = '';
        document.getElementById('facFecha').valueAsDate = new Date();
        const venc = new Date();
        venc.setDate(venc.getDate() + 30);
        document.getElementById('facVencimiento').valueAsDate = venc;
        document.getElementById('facMoneda').value = 'EUR';
        document.getElementById('facImporte').value = '';
        cambiarTipoFactura('factura');
        document.getElementById('pedidosCheckboxes').innerHTML = '';
        document.getElementById('pedidosDisponiblesInfo').textContent = 'Selecciona un cliente para ver sus pedidos';
        document.getElementById('pedidosDisponiblesInfo').style.display = '';
        document.getElementById('facturasAbonablesCheckboxes').innerHTML = '';
        editandoId = null;
    }

    modal.classList.add('visible');
}

function cargarPedidosCliente() {
    const clienteId = document.getElementById('facCliente').value;
    const container = document.getElementById('pedidosCheckboxes');
    const info = document.getElementById('pedidosDisponiblesInfo');
    const hiddenInput = document.getElementById('facPedidos');

    if (!clienteId) {
        container.innerHTML = '';
        info.textContent = 'Selecciona un cliente para ver sus pedidos';
        info.style.display = '';
        return;
    }

    const pedidos = DB.getPedidos().filter(p => p.clienteId === clienteId);

    if (pedidos.length === 0) {
        container.innerHTML = '';
        info.textContent = 'Este cliente no tiene pedidos registrados';
        info.style.display = '';
        return;
    }

    info.style.display = 'none';

    // Pedidos ya seleccionados (al editar factura)
    const seleccionados = (hiddenInput.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
    pedidos.forEach(p => {
        const estado = calcularEstadoPedido(p.id);
        const checked = seleccionados.includes(p.numero.toLowerCase()) ? 'checked' : '';
        const anticipoInfo = estado.cobrado > 0 ? ` | Antic: ${formatCurrency(estado.cobrado, p.moneda)}` : '';
        html += `
            <label style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--gray-300); border-radius: 8px; cursor: pointer; font-size: 13px; background: ${checked ? 'var(--primary-light)' : 'var(--gray-50)'};">
                <input type="checkbox" value="${p.numero}" onchange="actualizarPedidosSeleccionados()" ${checked}
                    style="accent-color: var(--primary);">
                <strong>${p.numero}</strong>
                <span style="color: var(--gray-500);">${formatCurrency(p.importe, p.moneda)}${anticipoInfo}</span>
            </label>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function actualizarPedidosSeleccionados() {
    const checkboxes = document.querySelectorAll('#pedidosCheckboxes input[type="checkbox"]');
    const seleccionados = [];
    checkboxes.forEach(cb => {
        const label = cb.closest('label');
        if (cb.checked) {
            seleccionados.push(cb.value);
            if (label) label.style.background = 'var(--primary-light)';
        } else {
            if (label) label.style.background = 'var(--gray-50)';
        }
    });
    document.getElementById('facPedidos').value = seleccionados.join(', ');
}

function guardarFactura() {
    const numero = document.getElementById('facNumero').value.trim();
    const clienteId = document.getElementById('facCliente').value;
    const pedidosStr = document.getElementById('facPedidos').value.trim();
    const facturasAbonadasStr = document.getElementById('facFacturasAbonadas').value.trim();
    const fecha = document.getElementById('facFecha').value;
    const vencimiento = document.getElementById('facVencimiento').value;
    const moneda = document.getElementById('facMoneda').value;
    let importe = parseFloat(document.getElementById('facImporte').value);
    const esAbono = tipoFacturaModal === 'abono';

    if (!numero || !clienteId || !fecha || !vencimiento || isNaN(importe)) {
        alert('Por favor completa todos los campos obligatorios');
        return;
    }

    if (esAbono && !facturasAbonadasStr) {
        alert('Selecciona al menos una factura que este abono rectifica');
        return;
    }

    // Los abonos se guardan con importe negativo
    if (esAbono && importe > 0) {
        importe = -importe;
    }

    const facturas = DB.getFacturas();
    let facturaId;

    if (editandoId) {
        facturaId = editandoId;
        const index = facturas.findIndex(f => f.id === editandoId);
        facturas[index] = { ...facturas[index], numero, clienteId, pedidos: pedidosStr, facturasAbonadas: facturasAbonadasStr, fecha, vencimiento, moneda, importe, esAbono };
    } else {
        facturaId = generarId();
        facturas.push({
            id: facturaId,
            numero, clienteId,
            pedidos: pedidosStr,
            facturasAbonadas: facturasAbonadasStr,
            fecha, vencimiento, moneda, importe,
            esAbono,
            fechaCreacion: new Date().toISOString()
        });
    }

    DB.setFacturas(facturas);

    const tipoDoc = esAbono ? 'Abono' : 'Factura';

    // Transferir anticipos de pedidos a esta factura (solo facturas normales)
    if (!esAbono && pedidosStr) {
        const pedidosDB = DB.getPedidos();
        const refs = pedidosStr.split(',').map(s => s.trim().toLowerCase());
        const cobros = DB.getCobros();
        let transferidos = 0;

        refs.forEach(ref => {
            const pedido = pedidosDB.find(p => p.numero.toLowerCase() === ref);
            if (!pedido) return;
            cobros.forEach(cobro => {
                if (cobro.pedidoId === pedido.id && !cobro.facturaId) {
                    cobro.facturaId = facturaId;
                    transferidos++;
                }
            });
        });

        if (transferidos > 0) {
            DB.setCobros(cobros);
            showAlert('facturasAlert', `${tipoDoc} ${editandoId ? 'actualizada' : 'creada'}. ${transferidos} anticipo(s) transferido(s).`, 'success');
        } else {
            showAlert('facturasAlert', `${tipoDoc} ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
        }
    } else {
        showAlert('facturasAlert', `${tipoDoc} ${editandoId ? 'actualizado' : 'creado'} correctamente`, 'success');
    }

    cerrarModal('modalFactura');
    cargarTablaFacturas();
}

function cargarTablaFacturas() {
    const facturas = DB.getFacturas();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const cobros = DB.getCobros();
    const container = document.getElementById('facturasTable');
    
    if (facturas.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📄</div><p>No hay facturas registradas</p></div>';
        return;
    }
    
    // Añadir controles de filtro y búsqueda
    let html = `
        <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
            <input type="text" id="buscarFactura" placeholder="🔍 Buscar factura..." style="flex: 1; min-width: 200px;">
            <select id="filtroClienteFactura" style="min-width: 200px;">
                <option value="">Todos los clientes</option>
                ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
            </select>
            <select id="filtroShowroomFactura" style="min-width: 200px;">
                <option value="">Todos los showrooms</option>
                ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
            <select id="filtroEstadoFactura" style="min-width: 150px;">
                <option value="">Todos los estados</option>
                <option value="pendiente">🔴 Pendiente</option>
                <option value="parcial">🟡 Parcial</option>
                <option value="cobrada">🟢 Cobrada</option>
            </select>
        </div>
    `;
    
    html += '<table><thead><tr><th>Nº Factura</th><th>Cliente</th><th>Showroom</th><th>Fecha</th><th>Vencimiento</th><th>Importe</th><th>Cobrado</th><th>Pendiente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="facturasTableBody">';
    
    facturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(factura => {
        const cliente = clientes.find(c => c.id === factura.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        const estado = calcularEstadoFactura(factura.id);
        const cobrosFactura = cobros.filter(c => c.facturaId === factura.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        
        const estadoTexto = estado.cobrado >= factura.importe ? 'cobrada' : estado.cobrado > 0 ? 'parcial' : 'pendiente';
        const badgeClass = estadoTexto === 'cobrada' ? 'success' : estadoTexto === 'parcial' ? 'warning' : 'danger';
        const badgeText = estadoTexto === 'cobrada' ? '🟢 Cobrada' : estadoTexto === 'parcial' ? '🟡 Parcial' : '🔴 Pendiente';
        
        html += `
            <tr data-cliente="${factura.clienteId}" data-showroom="${showroom ? showroom.id : ''}" data-estado="${estadoTexto}" data-numero="${factura.numero.toLowerCase()}">
                <td>
                    <strong>${factura.numero}</strong>
                    ${factura.esAbono ? ' <span class="badge badge-danger" style="font-size: 10px;">ABONO</span>' : ''}
                    ${cobrosFactura.length > 0 ? `<button class="btn btn-secondary btn-icon" onclick="toggleDetalleCobros('${factura.id}')" style="margin-left: 8px;">👁️</button>` : ''}
                </td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>${formatDate(factura.fecha)}</td>
                <td>${formatDate(factura.vencimiento)}</td>
                <td>${formatCurrency(factura.importe, factura.moneda)}</td>
                <td style="color: var(--success); font-weight: 600;">${formatCurrency(estado.cobrado, factura.moneda)}</td>
                <td style="color: var(--warning); font-weight: 600;">${formatCurrency(estado.pendiente, factura.moneda)}</td>
                <td><span class="badge badge-${badgeClass}">${badgeText}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalFactura('${factura.id}')">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarFactura('${factura.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
            ${cobrosFactura.length > 0 ? `
            <tr id="detalle-${factura.id}" style="display: none;">
                <td colspan="10" style="background: var(--gray-50); padding: 20px;">
                    <strong>Historial de Cobros:</strong>
                    <table style="margin-top: 12px; width: 100%;">
                        <thead>
                            <tr style="background: var(--white);">
                                <th>Fecha</th>
                                <th>Importe</th>
                                <th>Acumulado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(() => {
                                let acum = 0;
                                return cobrosFactura.reverse().map(c => {
                                    acum += c.importe;
                                    return `
                                        <tr style="background: var(--white);">
                                            <td>${formatDate(c.fecha)}</td>
                                            <td>${formatCurrency(c.importe, c.moneda)}${c.esAjuste ? ' <span class="badge badge-info">Ajuste</span>' : ''}</td>
                                            <td><strong>${formatCurrency(acum, factura.moneda)}</strong></td>
                                        </tr>
                                    `;
                                }).join('');
                            })()}
                        </tbody>
                    </table>
                </td>
            </tr>
            ` : ''}
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Event listeners para filtros
    document.getElementById('buscarFactura').addEventListener('input', filtrarFacturas);
    document.getElementById('filtroClienteFactura').addEventListener('change', filtrarFacturas);
    document.getElementById('filtroShowroomFactura').addEventListener('change', filtrarFacturas);
    document.getElementById('filtroEstadoFactura').addEventListener('change', filtrarFacturas);
}

function toggleDetalleCobros(facturaId) {
    const detalle = document.getElementById(`detalle-${facturaId}`);
    if (detalle.style.display === 'none') {
        detalle.style.display = 'table-row';
    } else {
        detalle.style.display = 'none';
    }
}

function filtrarFacturas() {
    const busqueda = document.getElementById('buscarFactura').value.toLowerCase();
    const clienteFiltro = document.getElementById('filtroClienteFactura').value;
    const showroomFiltro = document.getElementById('filtroShowroomFactura').value;
    const estadoFiltro = document.getElementById('filtroEstadoFactura').value;
    
    const filas = document.querySelectorAll('#facturasTableBody tr[data-numero]');
    
    filas.forEach(fila => {
        const numero = fila.getAttribute('data-numero');
        const cliente = fila.getAttribute('data-cliente');
        const showroom = fila.getAttribute('data-showroom');
        const estado = fila.getAttribute('data-estado');
        
        const coincideBusqueda = numero.includes(busqueda);
        const coincideCliente = !clienteFiltro || cliente === clienteFiltro;
        const coincideShowroom = !showroomFiltro || showroom === showroomFiltro;
        const coincideEstado = !estadoFiltro || estado === estadoFiltro;
        
        const siguiente = fila.nextElementSibling;
        if (coincideBusqueda && coincideCliente && coincideShowroom && coincideEstado) {
            fila.style.display = '';
            if (siguiente && siguiente.id.startsWith('detalle-')) {
                // Mantener el detalle oculto por defecto
                siguiente.style.display = 'none';
            }
        } else {
            fila.style.display = 'none';
            if (siguiente && siguiente.id.startsWith('detalle-')) {
                siguiente.style.display = 'none';
            }
        }
    });
}

function eliminarFactura(id) {
    if (!confirm('¿Eliminar esta factura?')) return;
    
    const facturas = DB.getFacturas().filter(f => f.id !== id);
    DB.setFacturas(facturas);
    cargarTablaFacturas();
    showAlert('facturasAlert', 'Factura eliminada', 'success');
}

function importarFacturas(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            const facturas = DB.getFacturas();
            const clientes = DB.getClientes();
            const pedidos = DB.getPedidos();
            let importados = 0;
            const sinPedido = []; // Facturas importadas sin pedido asociado
            const sinCliente = []; // Filas sin cliente encontrado

            // Formato: Número | Cliente | Pedidos | Fecha | Vencimiento | Moneda | Importe | FacturasAbonadas (opcional)
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;

                const clienteNombre = String(row[1] || '');
                const cliente = clientes.find(c => c.nombre.toLowerCase() === clienteNombre.toLowerCase());

                if (!cliente) {
                    sinCliente.push({ numero: String(row[0]), clienteNombre });
                    continue;
                }

                const pedidosStr = String(row[2] || '').trim();
                const facturasAbonadasStr = String(row[7] || '').trim();
                let importe = parseFloat(row[6]) || 0;
                const esAbono = facturasAbonadasStr.length > 0;

                // Los abonos se guardan con importe negativo
                if (esAbono && importe > 0) {
                    importe = -importe;
                }

                const facturaId = generarId();

                facturas.push({
                    id: facturaId,
                    numero: String(row[0]),
                    clienteId: cliente.id,
                    pedidos: esAbono ? '' : pedidosStr,
                    facturasAbonadas: facturasAbonadasStr,
                    fecha: row[3] || new Date().toISOString().split('T')[0],
                    vencimiento: row[4] || new Date().toISOString().split('T')[0],
                    moneda: String(row[5] || 'EUR'),
                    importe,
                    esAbono,
                    fechaCreacion: new Date().toISOString()
                });
                importados++;

                // Verificar si los pedidos referenciados existen
                const pedidosCliente = pedidos.filter(p => p.clienteId === cliente.id);
                if (!pedidosStr && pedidosCliente.length > 0) {
                    sinPedido.push({ facturaId, numero: String(row[0]), cliente, pedidosCliente });
                } else if (pedidosStr) {
                    const refs = pedidosStr.split(',').map(s => s.trim().toLowerCase());
                    const todosExisten = refs.every(ref =>
                        pedidosCliente.some(p => p.numero.toLowerCase() === ref)
                    );
                    if (!todosExisten && pedidosCliente.length > 0) {
                        sinPedido.push({ facturaId, numero: String(row[0]), cliente, pedidosCliente, pedidosRef: pedidosStr });
                    }
                }
            }

            DB.setFacturas(facturas);
            cargarTablaFacturas();

            let msg = `${importados} facturas importadas correctamente.`;
            if (sinCliente.length > 0) {
                msg += ` ${sinCliente.length} filas omitidas (cliente no encontrado: ${sinCliente.map(s => s.clienteNombre).join(', ')}).`;
            }
            showAlert('facturasAlert', msg, importados > 0 ? 'success' : 'error');

            // Mostrar modal de sugerencias si hay facturas sin pedido
            if (sinPedido.length > 0) {
                mostrarModalAsociarPedidos(sinPedido);
            }
        } catch (error) {
            showAlert('facturasAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importFacturasInput').value = '';
}

function mostrarModalAsociarPedidos(facturasConSugerencia) {
    let html = `
        <div class="modal visible" id="modalAsociarPedidos">
            <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title">Facturas sin pedido asociado</h3>
                    <button class="modal-close" onclick="document.getElementById('modalAsociarPedidos').remove()">×</button>
                </div>
                <p style="margin-bottom: 16px; color: var(--gray-600);">
                    Las siguientes facturas no tienen pedido asociado o el pedido referenciado no existe.
                    Puedes asociarlas a un pedido del cliente o dejarlas sin pedido.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Factura</th>
                            <th>Cliente</th>
                            <th>Ref. Actual</th>
                            <th>Asociar a Pedido</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    facturasConSugerencia.forEach((item, idx) => {
        const opciones = item.pedidosCliente.map(p =>
            `<option value="${p.numero}">${p.numero} (${formatCurrency(p.importe, p.moneda)})</option>`
        ).join('');

        html += `
            <tr>
                <td><strong>${item.numero}</strong></td>
                <td>${item.cliente.nombre}</td>
                <td>${item.pedidosRef || '<em>vacío</em>'}</td>
                <td>
                    <select id="asocPedido_${idx}" data-factura-id="${item.facturaId}" style="width: 100%;">
                        <option value="">-- Sin pedido --</option>
                        ${opciones}
                    </select>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('modalAsociarPedidos').remove()">Ignorar</button>
                    <button class="btn btn-primary" onclick="guardarAsociacionesPedidos(${facturasConSugerencia.length})">Guardar Asociaciones</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function guardarAsociacionesPedidos(total) {
    const facturas = DB.getFacturas();
    let actualizadas = 0;

    for (let i = 0; i < total; i++) {
        const select = document.getElementById(`asocPedido_${i}`);
        if (!select) continue;
        const facturaId = select.dataset.facturaId;
        const pedidoNum = select.value;

        if (pedidoNum) {
            const idx = facturas.findIndex(f => f.id === facturaId);
            if (idx >= 0) {
                facturas[idx].pedidos = pedidoNum;
                actualizadas++;
            }
        }
    }

    DB.setFacturas(facturas);
    cargarTablaFacturas();
    document.getElementById('modalAsociarPedidos').remove();

    if (actualizadas > 0) {
        showAlert('facturasAlert', `${actualizadas} factura(s) asociada(s) a pedidos correctamente`, 'success');
    }
}


// ========================================
// COBROS - CRUD
// ========================================

// ========================================
// ABONOS / RECTIFICATIVAS
// ========================================

var tipoFacturaModal = 'factura'; // 'factura' o 'abono'

function cambiarTipoFactura(tipo) {
    tipoFacturaModal = tipo;
    document.getElementById('facTipoFactura').className = tipo === 'factura' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('facTipoAbono').className = tipo === 'abono' ? 'btn btn-danger' : 'btn btn-secondary';
    document.getElementById('facPedidosGroup').style.display = tipo === 'factura' ? '' : 'none';
    document.getElementById('facAbonoGroup').style.display = tipo === 'abono' ? '' : 'none';
    document.getElementById('facImporteHelp').style.display = tipo === 'abono' ? '' : 'none';
    document.getElementById('facImporteLabel').textContent = tipo === 'abono' ? 'Importe del abono *' : 'Importe *';

    if (tipo === 'abono') {
        cargarFacturasAbonables();
    }
}

function cargarFacturasAbonables() {
    const clienteId = document.getElementById('facCliente').value;
    const container = document.getElementById('facturasAbonablesCheckboxes');
    const info = document.getElementById('facturasAbonablesInfo');
    const hiddenInput = document.getElementById('facFacturasAbonadas');

    if (tipoFacturaModal !== 'abono') return;

    if (!clienteId) {
        container.innerHTML = '';
        info.textContent = 'Selecciona un cliente para ver sus facturas';
        info.style.display = '';
        return;
    }

    const facturas = DB.getFacturas().filter(f => f.clienteId === clienteId && (f.importe > 0 || !f.esAbono));
    if (facturas.length === 0) {
        container.innerHTML = '';
        info.textContent = 'Este cliente no tiene facturas';
        info.style.display = '';
        return;
    }

    info.style.display = 'none';
    const seleccionadas = (hiddenInput.value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';
    facturas.forEach(f => {
        const estado = calcularEstadoFactura(f.id);
        const checked = seleccionadas.includes(f.numero.toLowerCase()) ? 'checked' : '';
        const estadoBadge = estado.estado === 'cobrada'
            ? '<span style="color: var(--success);">Cobrada</span>'
            : `<span style="color: var(--warning);">Pte: ${formatCurrency(estado.pendiente, f.moneda)}</span>`;
        html += `
            <label style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid var(--gray-300); border-radius: 8px; cursor: pointer; font-size: 13px; background: ${checked ? '#fde8e8' : 'var(--gray-50)'};">
                <input type="checkbox" value="${f.numero}" onchange="actualizarFacturasAbonadas()" ${checked}
                    style="accent-color: var(--danger);">
                <strong>${f.numero}</strong>
                <span style="color: var(--gray-500);">${formatCurrency(f.importe, f.moneda)} - ${estadoBadge}</span>
            </label>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function actualizarFacturasAbonadas() {
    const checkboxes = document.querySelectorAll('#facturasAbonablesCheckboxes input[type="checkbox"]');
    const seleccionadas = [];
    checkboxes.forEach(cb => {
        const label = cb.closest('label');
        if (cb.checked) {
            seleccionadas.push(cb.value);
            if (label) label.style.background = '#fde8e8';
        } else {
            if (label) label.style.background = 'var(--gray-50)';
        }
    });
    document.getElementById('facFacturasAbonadas').value = seleccionadas.join(', ');
}

// ========================================
// COBROS - CRUD
// ========================================

var tipoCobro = 'factura'; // 'factura' o 'pedido'

function cambiarTipoCobro(tipo) {
    tipoCobro = tipo;
    document.getElementById('cobTipoFactura').className = tipo === 'factura' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('cobTipoPedido').className = tipo === 'pedido' ? 'btn btn-primary' : 'btn btn-secondary';
    document.getElementById('cobFacturaGroup').style.display = tipo === 'factura' ? '' : 'none';
    document.getElementById('cobPedidoGroup').style.display = tipo === 'pedido' ? '' : 'none';
    document.getElementById('infoFactura').style.display = 'none';

    if (tipo === 'factura') {
        document.getElementById('cobPedido').value = '';
    } else {
        document.getElementById('cobFactura').value = '';
    }
}

function modalCobro(id = null) {
    const modal = document.getElementById('modalCobro');
    const title = document.getElementById('modalCobroTitle');
    const clientes = DB.getClientes();

    // Cargar facturas no completamente cobradas
    const facturas = DB.getFacturas();
    const selectFactura = document.getElementById('cobFactura');
    selectFactura.innerHTML = '<option value="">Seleccionar factura...</option>';

    facturas.forEach(f => {
        const estado = calcularEstadoFactura(f.id);
        if (estado.estado !== 'cobrada') {
            const cliente = clientes.find(c => c.id === f.clienteId);
            selectFactura.innerHTML += `<option value="${f.id}">${f.numero} - ${cliente ? cliente.nombre : ''} - Pte: ${formatCurrency(estado.pendiente, f.moneda)}</option>`;
        }
    });

    // Cargar pedidos con anticipos pendientes
    const pedidos = DB.getPedidos();
    const selectPedido = document.getElementById('cobPedido');
    selectPedido.innerHTML = '<option value="">Seleccionar pedido...</option>';

    pedidos.forEach(p => {
        const estado = calcularEstadoPedido(p.id);
        const cliente = clientes.find(c => c.id === p.clienteId);
        selectPedido.innerHTML += `<option value="${p.id}">${p.numero} - ${cliente ? cliente.nombre : ''} - ${formatCurrency(p.importe, p.moneda)}${estado.cobrado > 0 ? ' (Antic: ' + formatCurrency(estado.cobrado, p.moneda) + ')' : ''}</option>`;
    });

    if (id) {
        const cobros = DB.getCobros();
        const cobro = cobros.find(c => c.id === id);
        title.textContent = 'Editar Cobro';

        if (cobro.pedidoId && !cobro.facturaId) {
            cambiarTipoCobro('pedido');
            document.getElementById('cobPedido').value = cobro.pedidoId;
        } else {
            cambiarTipoCobro('factura');
            document.getElementById('cobFactura').value = cobro.facturaId;
        }

        document.getElementById('cobFecha').value = cobro.fecha;
        document.getElementById('cobMoneda').value = cobro.moneda;
        document.getElementById('cobImporte').value = cobro.importe;
        mostrarInfoCobro();
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Cobro';
        cambiarTipoCobro('factura');
        document.getElementById('cobFactura').value = '';
        document.getElementById('cobPedido').value = '';
        document.getElementById('cobFecha').valueAsDate = new Date();
        document.getElementById('cobMoneda').value = 'EUR';
        document.getElementById('cobImporte').value = '';
        document.getElementById('infoFactura').style.display = 'none';
        editandoId = null;
    }

    modal.classList.add('visible');
}

function mostrarInfoCobro() {
    const infoBox = document.getElementById('infoFactura');

    if (tipoCobro === 'factura') {
        const facturaId = document.getElementById('cobFactura').value;
        if (!facturaId) { infoBox.style.display = 'none'; return; }

        const factura = DB.getFacturas().find(f => f.id === facturaId);
        const estado = calcularEstadoFactura(facturaId);

        document.getElementById('infFactTotal').textContent = formatCurrency(factura.importe, factura.moneda);
        document.getElementById('infFactCobrado').textContent = formatCurrency(estado.cobrado, factura.moneda);
        document.getElementById('infFactPendiente').textContent = formatCurrency(estado.pendiente, factura.moneda);
        infoBox.style.display = 'block';
        document.getElementById('cobMoneda').value = factura.moneda;
    } else {
        const pedidoId = document.getElementById('cobPedido').value;
        if (!pedidoId) { infoBox.style.display = 'none'; return; }

        const pedido = DB.getPedidos().find(p => p.id === pedidoId);
        const estado = calcularEstadoPedido(pedidoId);

        document.getElementById('infFactTotal').textContent = formatCurrency(pedido.importe, pedido.moneda);
        document.getElementById('infFactCobrado').textContent = formatCurrency(estado.cobrado, pedido.moneda);
        document.getElementById('infFactPendiente').textContent = formatCurrency(estado.pendiente, pedido.moneda);
        infoBox.style.display = 'block';
        document.getElementById('cobMoneda').value = pedido.moneda;
    }
}

// Alias de compatibilidad
function mostrarInfoFactura() { mostrarInfoCobro(); }

function guardarCobro() {
    const fecha = document.getElementById('cobFecha').value;
    const moneda = document.getElementById('cobMoneda').value;
    const importe = parseFloat(document.getElementById('cobImporte').value);

    let facturaId = null;
    let pedidoId = null;

    if (tipoCobro === 'factura') {
        facturaId = document.getElementById('cobFactura').value;
        if (!facturaId) { alert('Selecciona una factura'); return; }
    } else {
        pedidoId = document.getElementById('cobPedido').value;
        if (!pedidoId) { alert('Selecciona un pedido'); return; }
    }

    if (!fecha || isNaN(importe) || importe <= 0) {
        alert('Por favor completa todos los campos correctamente');
        return;
    }

    // Verificar que no exceda el pendiente
    if (facturaId) {
        const factura = DB.getFacturas().find(f => f.id === facturaId);
        const estado = calcularEstadoFactura(facturaId);
        if (importe > estado.pendiente) {
            alert(`El importe no puede ser mayor que el pendiente (${formatCurrency(estado.pendiente, factura.moneda)})`);
            return;
        }
    } else if (pedidoId) {
        const pedido = DB.getPedidos().find(p => p.id === pedidoId);
        const estado = calcularEstadoPedido(pedidoId);
        if (importe > estado.pendiente) {
            alert(`El importe del anticipo no puede ser mayor que el pendiente del pedido (${formatCurrency(estado.pendiente, pedido.moneda)})`);
            return;
        }
    }

    const cobros = DB.getCobros();

    if (editandoId) {
        const index = cobros.findIndex(c => c.id === editandoId);
        cobros[index] = { ...cobros[index], facturaId, pedidoId, fecha, moneda, importe };
    } else {
        cobros.push({
            id: generarId(),
            facturaId,
            pedidoId,
            fecha, moneda, importe,
            fechaCreacion: new Date().toISOString()
        });
    }

    DB.setCobros(cobros);

    // Verificar saldo residual solo para facturas
    if (facturaId) {
        const factura = DB.getFacturas().find(f => f.id === facturaId);
        const nuevoEstado = calcularEstadoFactura(facturaId);
        const saldoResidual = factura.importe - nuevoEstado.cobrado;
        const umbral = calcularUmbralSaldo(factura.importe);

        if (saldoResidual > 0 && saldoResidual <= umbral && nuevoEstado.estado !== 'cobrada') {
            facturaSaldoResidual = { facturaId, saldo: saldoResidual, umbral };

            document.getElementById('mensajeSaldoResidual').textContent =
                `La factura ${factura.numero} tiene un saldo pendiente de ${formatCurrency(saldoResidual, factura.moneda)}, que es inferior al umbral de ${formatCurrency(umbral, factura.moneda)}. ¿Deseas marcarla como pagada al 100%?`;

            cerrarModal('modalCobro');
            document.getElementById('modalSaldoResidual').classList.add('visible');
            return;
        }
    }

    cerrarModal('modalCobro');
    cargarTablaCobros();
    cargarDashboard();
    showAlert('cobrosAlert', `Cobro ${editandoId ? 'actualizado' : 'registrado'} correctamente`, 'success');
}

function marcarComoCompleto() {
    if (!facturaSaldoResidual) return;
    
    const cobros = DB.getCobros();
    const factura = DB.getFacturas().find(f => f.id === facturaSaldoResidual.facturaId);
    
    // Crear cobro adicional por el saldo residual
    cobros.push({
        id: generarId(),
        facturaId: facturaSaldoResidual.facturaId,
        fecha: new Date().toISOString().split('T')[0],
        moneda: factura.moneda,
        importe: facturaSaldoResidual.saldo,
        fechaCreacion: new Date().toISOString(),
        esAjuste: true
    });
    
    DB.setCobros(cobros);
    
    cerrarModal('modalSaldoResidual');
    cargarTablaCobros();
    cargarDashboard();
    showAlert('cobrosAlert', 'Factura marcada como pagada al 100%', 'success');
    
    facturaSaldoResidual = null;
}

function cargarTablaCobros() {
    const cobros = DB.getCobros();
    const facturas = DB.getFacturas();
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const container = document.getElementById('cobrosTable');

    if (cobros.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>No hay cobros registrados</p></div>';
        return;
    }

    let html = '<table><thead><tr><th>Fecha</th><th>Aplicado a</th><th>Cliente</th><th>Importe</th><th>Tipo</th><th>Acciones</th></tr></thead><tbody>';

    cobros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(cobro => {
        let referencia = '-';
        let clienteNombre = '-';
        let tipoBadge = '';

        if (cobro.facturaId) {
            const factura = facturas.find(f => f.id === cobro.facturaId);
            if (factura) {
                referencia = factura.numero;
                const cliente = clientes.find(c => c.id === factura.clienteId);
                clienteNombre = cliente ? cliente.nombre : '-';
            }
            tipoBadge = cobro.pedidoId
                ? '<span class="badge badge-success">Anticipo transferido</span>'
                : '<span class="badge badge-info">Factura</span>';
        } else if (cobro.pedidoId) {
            const pedido = pedidos.find(p => p.id === cobro.pedidoId);
            if (pedido) {
                referencia = pedido.numero;
                const cliente = clientes.find(c => c.id === pedido.clienteId);
                clienteNombre = cliente ? cliente.nombre : '-';
            }
            tipoBadge = '<span class="badge badge-warning">Anticipo s/pedido</span>';
        }

        html += `
            <tr>
                <td>${formatDate(cobro.fecha)}</td>
                <td><strong>${referencia}</strong></td>
                <td>${clienteNombre}</td>
                <td>${formatCurrency(cobro.importe, cobro.moneda)}${cobro.esAjuste ? ' <span class="badge badge-info">Ajuste</span>' : ''}</td>
                <td>${tipoBadge}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalCobro('${cobro.id}')">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarCobro('${cobro.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarCobro(id) {
    if (!confirm('¿Eliminar este cobro?')) return;
    
    const cobros = DB.getCobros().filter(c => c.id !== id);
    DB.setCobros(cobros);
    cargarTablaCobros();
    cargarDashboard();
    showAlert('cobrosAlert', 'Cobro eliminado', 'success');
}

function importarCobros(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            const cobros = DB.getCobros();
            const facturas = DB.getFacturas();
            const pedidosDB = DB.getPedidos();
            const clientes = DB.getClientes();
            let importados = 0;
            let anticipos = 0;
            const sinAsociar = [];

            // Formato: Factura/Pedido | Fecha | Moneda | Importe
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;

                const ref = String(row[0]).trim();
                const fecha = row[1] || new Date().toISOString().split('T')[0];
                const moneda = String(row[2] || 'EUR');
                const importe = parseFloat(row[3]) || 0;

                // Primero buscar por factura
                const factura = facturas.find(f => f.numero.toLowerCase() === ref.toLowerCase());
                if (factura) {
                    cobros.push({
                        id: generarId(),
                        facturaId: factura.id, pedidoId: null,
                        fecha, moneda, importe,
                        fechaCreacion: new Date().toISOString()
                    });
                    importados++;
                    continue;
                }

                // Si no, buscar por pedido (anticipo)
                const pedido = pedidosDB.find(p => p.numero.toLowerCase() === ref.toLowerCase());
                if (pedido) {
                    cobros.push({
                        id: generarId(),
                        facturaId: null, pedidoId: pedido.id,
                        fecha, moneda, importe,
                        fechaCreacion: new Date().toISOString()
                    });
                    anticipos++;
                    continue;
                }

                // No matchea ni factura ni pedido
                sinAsociar.push({ facturaRef: ref, fecha, moneda, importe });
            }

            DB.setCobros(cobros);
            cargarTablaCobros();

            let msg = '';
            if (importados > 0) msg += `${importados} cobro(s) sobre facturas. `;
            if (anticipos > 0) msg += `${anticipos} anticipo(s) sobre pedidos. `;
            if (sinAsociar.length > 0) msg += `${sinAsociar.length} cobro(s) sin asociar.`;
            if (!msg) msg = 'No se importaron cobros.';
            showAlert('cobrosAlert', msg, (importados + anticipos) > 0 ? 'success' : 'error');

            if (sinAsociar.length > 0) {
                mostrarModalAsociarCobros(sinAsociar, facturas, clientes);
            }
        } catch (error) {
            showAlert('cobrosAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importCobrosInput').value = '';
}

function mostrarModalAsociarCobros(cobrosNoAsociados, facturas, clientes) {
    // Preparar sugerencias: facturas pendientes de cobro, ordenadas por relevancia
    const facturasPendientes = facturas.filter(f => {
        const estado = calcularEstadoFactura(f.id);
        return estado.porcentaje < 100;
    }).map(f => {
        const cliente = clientes.find(c => c.id === f.clienteId);
        const estado = calcularEstadoFactura(f.id);
        return { ...f, clienteNombre: cliente ? cliente.nombre : '-', pendiente: estado.pendiente };
    });

    let html = `
        <div class="modal visible" id="modalAsociarCobros">
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title">Cobros pendientes de asociar</h3>
                    <button class="modal-close" onclick="document.getElementById('modalAsociarCobros').remove()">×</button>
                </div>
                <p style="margin-bottom: 16px; color: var(--gray-600);">
                    Los siguientes cobros no coinciden con ninguna factura existente.
                    Selecciona la factura a la que asociar cada cobro o descártalos.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>Ref. Original</th>
                            <th>Fecha</th>
                            <th>Importe</th>
                            <th>Asociar a Factura</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    cobrosNoAsociados.forEach((cobro, idx) => {
        // Ordenar sugerencias: primero facturas con importe similar, luego por moneda
        const sugerencias = [...facturasPendientes]
            .sort((a, b) => {
                // Priorizar misma moneda
                const monedaA = a.moneda === cobro.moneda ? 0 : 1;
                const monedaB = b.moneda === cobro.moneda ? 0 : 1;
                if (monedaA !== monedaB) return monedaA - monedaB;
                // Luego por cercanía de importe pendiente
                return Math.abs(a.pendiente - cobro.importe) - Math.abs(b.pendiente - cobro.importe);
            });

        const opciones = sugerencias.map(f =>
            `<option value="${f.id}">${f.numero} - ${f.clienteNombre} (Pte: ${formatCurrency(f.pendiente, f.moneda)})</option>`
        ).join('');

        html += `
            <tr>
                <td><strong>${cobro.facturaRef}</strong></td>
                <td>${formatDate(cobro.fecha)}</td>
                <td>${formatCurrency(cobro.importe, cobro.moneda)}</td>
                <td>
                    <select id="asocCobro_${idx}" style="width: 100%;"
                        data-fecha="${cobro.fecha}" data-moneda="${cobro.moneda}" data-importe="${cobro.importe}">
                        <option value="">-- No asociar --</option>
                        ${opciones}
                    </select>
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="document.getElementById('modalAsociarCobros').remove()">Descartar Todos</button>
                    <button class="btn btn-primary" onclick="guardarAsociacionesCobros(${cobrosNoAsociados.length})">Guardar Asociaciones</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);
}

function guardarAsociacionesCobros(total) {
    const cobros = DB.getCobros();
    let asociados = 0;

    for (let i = 0; i < total; i++) {
        const select = document.getElementById(`asocCobro_${i}`);
        if (!select || !select.value) continue;

        const facturaId = select.value;
        const fecha = select.dataset.fecha;
        const moneda = select.dataset.moneda;
        const importe = parseFloat(select.dataset.importe);

        // Verificar que no exceda el pendiente
        const estado = calcularEstadoFactura(facturaId);
        if (importe > estado.pendiente) {
            alert(`El cobro de ${formatCurrency(importe, moneda)} excede el pendiente de la factura (${formatCurrency(estado.pendiente, moneda)}). Se omite.`);
            continue;
        }

        cobros.push({
            id: generarId(),
            facturaId,
            fecha, moneda, importe,
            fechaCreacion: new Date().toISOString()
        });
        asociados++;
    }

    DB.setCobros(cobros);
    cargarTablaCobros();
    cargarDashboard();
    document.getElementById('modalAsociarCobros').remove();

    if (asociados > 0) {
        showAlert('cobrosAlert', `${asociados} cobro(s) asociado(s) correctamente`, 'success');
    }
}

// ========================================
// INFORMES
// ========================================

function cargarSelectShowrooms() {
    const showrooms = DB.getShowrooms();
    const select = document.getElementById('infShowroom');
    select.innerHTML = '<option value="">Todos los showrooms</option>';
    showrooms.forEach(s => {
        select.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
    });
}

function generarInforme() {
    const fechaInicio = document.getElementById('infFechaInicio').value;
    const fechaFin = document.getElementById('infFechaFin').value;
    const showroomId = document.getElementById('infShowroom').value;

    if (!fechaInicio || !fechaFin) {
        alert('Por favor selecciona el rango de fechas');
        return;
    }

    const facturas = DB.getFacturas();
    const cobros = DB.getCobros();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();

    const facturasComision = [];
    const abonosYaIncluidos = new Set();

    // Paso 1: Facturas normales (no abonos)
    facturas.filter(f => !f.esAbono).forEach(factura => {
        const cobrosFactura = cobros.filter(c => c.facturaId === factura.id)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        // Buscar abonos que referencian esta factura
        const abonosFactura = facturas.filter(f => f.esAbono && f.facturasAbonadas).filter(abono => {
            const refs = abono.facturasAbonadas.split(',').map(s => s.trim().toLowerCase());
            return refs.includes(factura.numero.toLowerCase());
        });

        // Calcular parte proporcional de cada abono para esta factura
        function importeAbonoProporcional(abono) {
            const refs = abono.facturasAbonadas.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            if (refs.length === 1) return Math.abs(abono.importe);
            const facturasRef = refs.map(r => facturas.find(f => f.numero.toLowerCase() === r && !f.esAbono)).filter(Boolean);
            const importeTotal = facturasRef.reduce((sum, f) => sum + Math.abs(f.importe), 0);
            return importeTotal > 0 ? Math.abs(abono.importe) * (factura.importe / importeTotal) : 0;
        }

        // Crear timeline de pagos: cobros + abonos ordenados por fecha
        const pagos = [];
        cobrosFactura.forEach(c => pagos.push({ fecha: c.fecha, importe: c.importe, tipo: 'cobro' }));
        abonosFactura.forEach(a => pagos.push({ fecha: a.fecha, importe: importeAbonoProporcional(a), tipo: 'abono', abonoId: a.id }));
        pagos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

        let acumulado = 0;
        let fechaCobro100 = null;

        for (const pago of pagos) {
            acumulado += pago.importe;
            if (acumulado >= factura.importe) {
                fechaCobro100 = pago.fecha;
                break;
            }
        }

        if (fechaCobro100 && fechaCobro100 >= fechaInicio && fechaCobro100 <= fechaFin) {
            const cliente = clientes.find(c => c.id === factura.clienteId);
            if (cliente && (!showroomId || cliente.showroomId === showroomId)) {
                const showroom = showrooms.find(s => s.id === cliente.showroomId);
                if (showroom) {
                    facturasComision.push({
                        factura,
                        cliente,
                        showroom,
                        fechaCobro100,
                        totalCobrado: acumulado,
                        comision: redondear2(factura.importe * showroom.comision / 100),
                        pedidosRef: factura.pedidos || ''
                    });

                    // Escenarios 1 y 2: incluir abonos vinculados
                    abonosFactura.forEach(abono => {
                        // Comprobar si la factura ya estaba saldada ANTES de este abono (solo con cobros y otros abonos anteriores)
                        let acumSinEsteAbono = 0;
                        let yaEstabaSaldada = false;
                        for (const pago of pagos) {
                            if (pago.abonoId === abono.id) continue;
                            if (new Date(pago.fecha) > new Date(abono.fecha)) break;
                            acumSinEsteAbono += pago.importe;
                            if (acumSinEsteAbono >= factura.importe) {
                                yaEstabaSaldada = true;
                                break;
                            }
                        }

                        if (!yaEstabaSaldada) {
                            // Escenarios 1/2: el abono se incluye con la factura en su periodo
                            facturasComision.push({
                                factura: abono,
                                cliente,
                                showroom,
                                fechaCobro100,
                                totalCobrado: 0,
                                comision: redondear2(abono.importe * showroom.comision / 100),
                                pedidosRef: abono.facturasAbonadas || '',
                                esAbono: true
                            });
                            abonosYaIncluidos.add(abono.id);
                        }
                    });
                }
            }
        }
    });

    // Paso 2: Escenario 3 - Abonos cuyas facturas ya estaban saldadas antes del abono
    facturas.filter(f => f.esAbono).forEach(abono => {
        if (abonosYaIncluidos.has(abono.id)) return;

        const refsStr = abono.facturasAbonadas || '';
        const refs = refsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (refs.length === 0) return;

        // Verificar que TODAS las facturas referenciadas estaban saldadas ANTES del abono
        const todasYaSaldadas = refs.every(ref => {
            const facturaRef = facturas.find(f => f.numero.toLowerCase() === ref && !f.esAbono);
            if (!facturaRef) return true;

            const cobrosRef = cobros.filter(c => c.facturaId === facturaRef.id)
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            // Incluir otros abonos (no este) en el cálculo
            const otrosAbonos = facturas.filter(f => f.esAbono && f.id !== abono.id && f.facturasAbonadas).filter(a => {
                const r = a.facturasAbonadas.split(',').map(s => s.trim().toLowerCase());
                return r.includes(ref);
            });

            const pagos = [];
            cobrosRef.forEach(c => pagos.push({ fecha: c.fecha, importe: c.importe }));
            otrosAbonos.forEach(a => pagos.push({ fecha: a.fecha, importe: Math.abs(a.importe) }));
            pagos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            let acum = 0;
            for (const pago of pagos) {
                if (new Date(pago.fecha) >= new Date(abono.fecha)) break;
                acum += pago.importe;
                if (acum >= facturaRef.importe) return true;
            }
            return false;
        });

        if (todasYaSaldadas && abono.fecha >= fechaInicio && abono.fecha <= fechaFin) {
            const cliente = clientes.find(c => c.id === abono.clienteId);
            if (cliente && (!showroomId || cliente.showroomId === showroomId)) {
                const showroom = showrooms.find(s => s.id === cliente.showroomId);
                if (showroom) {
                    facturasComision.push({
                        factura: abono,
                        cliente,
                        showroom,
                        fechaCobro100: abono.fecha,
                        totalCobrado: 0,
                        comision: redondear2(abono.importe * showroom.comision / 100),
                        pedidosRef: abono.facturasAbonadas || '',
                        esAbono: true
                    });
                }
            }
        }
    });

    if (facturasComision.length === 0) {
        alert('No hay facturas cobradas al 100% en el periodo seleccionado');
        return;
    }

    // Agrupar por showroom con totales por moneda
    const porShowroom = {};
    facturasComision.forEach(item => {
        const moneda = item.factura.moneda || 'EUR';
        if (!porShowroom[item.showroom.id]) {
            porShowroom[item.showroom.id] = {
                showroom: item.showroom,
                facturas: [],
                totalesPorMoneda: {}
            };
        }
        if (!porShowroom[item.showroom.id].totalesPorMoneda[moneda]) {
            porShowroom[item.showroom.id].totalesPorMoneda[moneda] = { facturado: 0, comision: 0 };
        }
        porShowroom[item.showroom.id].facturas.push(item);
        porShowroom[item.showroom.id].totalesPorMoneda[moneda].facturado += item.factura.importe;
        porShowroom[item.showroom.id].totalesPorMoneda[moneda].comision += item.comision;
    });

    // Generar Excel
    crearInformeExcel(porShowroom, fechaInicio, fechaFin);
}

function crearInformeExcel(porShowroom, fechaInicio, fechaFin) {
    const wb = XLSX.utils.book_new();

    // Hoja resumen
    const resumenData = [
        ['INFORME DE COMISIONES DE SHOWROOMS'],
        ['Charo Ruiz Ibiza'],
        [''],
        [`Periodo: ${formatDate(fechaInicio)} - ${formatDate(fechaFin)}`],
        [''],
        ['Showroom', 'Moneda', 'Total Facturado', '% Comisión', 'Comisión Total'],
    ];

    const totalesGenerales = {};

    Object.values(porShowroom).forEach(data => {
        Object.entries(data.totalesPorMoneda).forEach(([moneda, totales]) => {
            resumenData.push([
                data.showroom.nombre,
                moneda,
                totales.facturado,
                data.showroom.comision + '%',
                totales.comision
            ]);
            if (!totalesGenerales[moneda]) totalesGenerales[moneda] = { facturado: 0, comision: 0 };
            totalesGenerales[moneda].facturado += totales.facturado;
            totalesGenerales[moneda].comision += totales.comision;
        });
    });

    resumenData.push(['']);
    Object.entries(totalesGenerales).forEach(([moneda, totales]) => {
        resumenData.push(['TOTAL', moneda, totales.facturado, '', totales.comision]);
    });
    
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [
        { wch: 30 },
        { wch: 8 },
        { wch: 18 },
        { wch: 12 },
        { wch: 18 }
    ];
    aplicarFormatoNumerosExcel(wsResumen);

    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    const cobros = DB.getCobros();

    // Hoja por cada showroom CON DETALLE DE COBROS
    Object.values(porShowroom).forEach(data => {
        const sheetData = [
            [`COMISIONES - ${data.showroom.nombre}`],
            [`Periodo: ${formatDate(fechaInicio)} - ${formatDate(fechaFin)}`],
            [`% Comisión: ${data.showroom.comision}%`],
            [''],
        ];

        data.facturas.sort((a, b) => new Date(a.fechaCobro100) - new Date(b.fechaCobro100)).forEach(item => {
            const moneda = item.factura.moneda || 'EUR';
            const tipoLabel = item.factura.esAbono ? 'ABONO' : 'FACTURA';
            const refCol = item.factura.esAbono
                ? (item.factura.facturasAbonadas || '')
                : (item.pedidosRef || item.factura.pedidos || '');
            sheetData.push([
                tipoLabel,
                item.factura.numero,
                item.cliente.nombre,
                refCol,
                formatDate(item.factura.fecha),
                formatDate(item.fechaCobro100),
                moneda,
                item.factura.importe,
                item.factura.esAbono ? '' : item.totalCobrado,
                item.comision
            ]);

            // Detalle de cobros solo para facturas normales
            if (!item.factura.esAbono) {
                const cobrosFactura = cobros.filter(c => c.facturaId === item.factura.id)
                    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

                let acumulado = 0;
                cobrosFactura.forEach(cobro => {
                    const pedidosDB = DB.getPedidos();
                    const pedidoRef = cobro.pedidoId ? (pedidosDB.find(p => p.id === cobro.pedidoId) || {}).numero || '' : '';
                    acumulado += cobro.importe;
                    sheetData.push([
                        cobro.pedidoId ? '  → Anticipo' : '  → Cobro',
                        formatDate(cobro.fecha),
                        pedidoRef ? `(Pedido: ${pedidoRef})` : '',
                        '',
                        '',
                        '',
                        '',
                        cobro.importe,
                        acumulado,
                        cobro.esAjuste ? 'Ajuste' : ''
                    ]);
                });
            }

            sheetData.push(['']);
        });

        // Encabezados
        sheetData.splice(4, 0, ['Tipo', 'Nº Factura / Fecha Cobro', 'Cliente', 'Pedido(s) / Fact. abonadas', 'Fecha Emisión', 'Fecha Cobro / Emisión', 'Moneda', 'Importe', 'Total Cobrado', 'Comisión']);
        sheetData.splice(5, 0, ['']);

        // Totales por moneda
        sheetData.push(['']);
        Object.entries(data.totalesPorMoneda).forEach(([moneda, totales]) => {
            sheetData.push(['', '', '', '', '', 'TOTAL', moneda, totales.facturado, '', totales.comision]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 12 },  // Tipo
            { wch: 18 },  // Nº Factura / Fecha
            { wch: 30 },  // Cliente
            { wch: 20 },  // Pedido(s)
            { wch: 15 },  // Fecha Emisión
            { wch: 18 },  // Fecha Cobro 100%
            { wch: 8 },   // Moneda
            { wch: 18 },  // Importe Factura
            { wch: 18 },  // Total Cobrado / Acumulado
            { wch: 18 }   // Comisión / Estado
        ];
        aplicarFormatoNumerosExcel(ws);

        XLSX.utils.book_append_sheet(wb, ws, data.showroom.nombre.substring(0, 30));
    });
    
    // Descargar
    const filename = `Comisiones_${fechaInicio}_${fechaFin}.xlsx`;
    XLSX.writeFile(wb, filename);
    
    // Guardar en histórico
    const informeData = {
        id: generarId(),
        fechaInicio,
        fechaFin,
        showroomId: document.getElementById('infShowroom').value || 'todos',
        showrooms: Object.values(porShowroom).map(d => ({
            nombre: d.showroom.nombre,
            totalesPorMoneda: d.totalesPorMoneda,
            numFacturas: d.facturas.length
        })),
        totalesGenerales,
        filename,
        fechaGeneracion: new Date().toISOString(),
        detalleCompleto: porShowroom
    };
    
    DB.addHistoricoInforme(informeData);
    
    showAlert('facturasAlert', 'Informe generado y guardado en histórico', 'success');
}

// ========================================
// INICIALIZACIÓN
// ========================================

document.addEventListener('DOMContentLoaded', function() {
    // Cargar dashboard inicial
    cargarDashboard();
    
    // Configurar fechas por defecto en informe
    const hoy = new Date();
    const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    
    document.getElementById('infFechaInicio').valueAsDate = primerDia;
    document.getElementById('infFechaFin').valueAsDate = ultimoDia;
    
    // Configurar fecha actual en cobros
    document.getElementById('cobFecha').valueAsDate = new Date();
});


// ========================================
// HISTÓRICO DE INFORMES
// ========================================

function cargarHistoricoInformes() {
    const historico = DB.getHistoricoInformes();
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('historicoInformesContainer');
    
    // Cargar showrooms en filtro
    const selectShowroom = document.getElementById('filtroShowroomHistorico');
    selectShowroom.innerHTML = '<option value="">Todos los showrooms</option><option value="todos">Informes generales</option>';
    showrooms.forEach(s => {
        selectShowroom.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
    });
    
    if (historico.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><p>No hay informes generados</p></div>';
        return;
    }
    
    let html = '<table><thead><tr><th>Fecha Generación</th><th>Periodo</th><th>Showroom(s)</th><th>Total Facturado</th><th>Total Comisión</th><th>Facturas</th><th>Acciones</th></tr></thead><tbody id="historicoTableBody">';
    
    historico.forEach(informe => {
        const fecha = new Date(informe.fechaGeneracion);
        const showroomNombres = informe.showrooms.map(s => s.nombre).join(', ');
        const numFacturas = informe.showrooms.reduce((sum, s) => sum + s.numFacturas, 0);
        const showroomBusqueda = showroomNombres.toLowerCase();

        // Compatibilidad: informes antiguos con totalGeneral / nuevos con totalesGenerales
        const totGen = informe.totalesGenerales || { EUR: { facturado: informe.totalGeneral || 0, comision: informe.totalComisionGeneral || 0 } };
        const totalFactHTML = Object.entries(totGen).map(([m, t]) => formatCurrency(t.facturado, m)).join(' + ');
        const totalComHTML = Object.entries(totGen).map(([m, t]) => formatCurrency(t.comision, m)).join(' + ');

        html += `
            <tr data-showroom="${informe.showroomId}" data-busqueda="${informe.fechaInicio} ${informe.fechaFin} ${showroomBusqueda}">
                <td>${fecha.toLocaleString('es-ES')}</td>
                <td><strong>${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}</strong></td>
                <td>${showroomNombres}</td>
                <td>${totalFactHTML}</td>
                <td>${totalComHTML}</td>
                <td>${numFacturas}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="verDetalleInforme('${informe.id}')" title="Ver detalle">👁️</button>
                        <button class="btn btn-primary btn-icon" onclick="redescargarInforme('${informe.id}')" title="Descargar Excel">📥</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarInforme('${informe.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Event listeners
    document.getElementById('buscarHistorico').addEventListener('input', filtrarHistorico);
    document.getElementById('filtroShowroomHistorico').addEventListener('change', filtrarHistorico);
}

function filtrarHistorico() {
    const busqueda = document.getElementById('buscarHistorico').value.toLowerCase();
    const showroomFiltro = document.getElementById('filtroShowroomHistorico').value;
    
    const filas = document.querySelectorAll('#historicoTableBody tr');
    
    filas.forEach(fila => {
        const showroom = fila.getAttribute('data-showroom');
        const textoBusqueda = fila.getAttribute('data-busqueda');
        
        const coincideBusqueda = textoBusqueda.includes(busqueda);
        const coincideShowroom = !showroomFiltro || showroom === showroomFiltro;
        
        if (coincideBusqueda && coincideShowroom) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    });
}

function verDetalleInforme(informeId) {
    const informe = DB.getHistoricoInformes().find(i => i.id === informeId);
    if (!informe) return;
    
    const cobros = DB.getCobros();
    
    // Crear modal con el detalle
    let html = `
        <div class="modal visible" id="modalDetalleInforme">
            <div class="modal-content" style="max-width: 90%; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title">📊 Detalle del Informe</h3>
                    <button class="modal-close" onclick="document.getElementById('modalDetalleInforme').remove()">×</button>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <strong>Periodo:</strong> ${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}<br>
                    <strong>Generado:</strong> ${new Date(informe.fechaGeneracion).toLocaleString('es-ES')}<br>
                    ${(() => {
                        const totGen = informe.totalesGenerales || { EUR: { facturado: informe.totalGeneral || 0, comision: informe.totalComisionGeneral || 0 } };
                        return Object.entries(totGen).map(([m, t]) =>
                            `<strong>Total Facturado (${m}):</strong> ${formatCurrency(t.facturado, m)} | <strong>Comisión:</strong> ${formatCurrency(t.comision, m)}`
                        ).join('<br>');
                    })()}
                </div>
    `;
    
    Object.values(informe.detalleCompleto).forEach(showroomData => {
        html += `
            <div class="card" style="margin-bottom: 24px;">
                <h4 style="margin-bottom: 16px; color: var(--primary);">${showroomData.showroom.nombre} - ${showroomData.showroom.comision}%</h4>
                <div style="margin-bottom: 16px;">
                    ${(() => {
                        const tpm = showroomData.totalesPorMoneda || { EUR: { facturado: showroomData.totalFacturado || 0, comision: showroomData.totalComision || 0 } };
                        return Object.entries(tpm).map(([m, t]) =>
                            `<strong>Total (${m}):</strong> ${formatCurrency(t.facturado, m)} | <strong>Comisión:</strong> ${formatCurrency(t.comision, m)}`
                        ).join(' &nbsp;|&nbsp; ');
                    })()}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Factura</th>
                            <th>Cliente</th>
                            <th>Pedido(s) / Fact. abonadas</th>
                            <th>Fecha Emisión</th>
                            <th>Fecha Cobro / Emisión</th>
                            <th>Importe</th>
                            <th>Comisión</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        showroomData.facturas.forEach(item => {
            const esAbono = item.factura.esAbono || item.esAbono;
            const refCol = esAbono
                ? (item.factura.facturasAbonadas || '-')
                : (item.pedidosRef || item.factura.pedidos || '-');
            const rowStyle = esAbono ? ' style="background: #fef2f2;"' : '';
            html += `
                <tr${rowStyle}>
                    <td><strong>${item.factura.numero}</strong>${esAbono ? ' <span class="badge badge-danger" style="font-size: 10px;">ABONO</span>' : ''}</td>
                    <td>${item.cliente.nombre}</td>
                    <td>${refCol}</td>
                    <td>${formatDate(item.factura.fecha)}</td>
                    <td>${formatDate(item.fechaCobro100)}</td>
                    <td>${formatCurrency(item.factura.importe, item.factura.moneda)}</td>
                    <td>${formatCurrency(item.comision, item.factura.moneda)}</td>
                </tr>
            `;

            if (!esAbono) {
                const cobrosFactura = cobros.filter(c => c.facturaId === item.factura.id)
                    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                const pedidosDB = DB.getPedidos();

                let acum = 0;
                cobrosFactura.forEach(cobro => {
                    acum += cobro.importe;
                    const pedidoRef = cobro.pedidoId ? (pedidosDB.find(p => p.id === cobro.pedidoId) || {}).numero || '' : '';
                    html += `
                        <tr style="background: var(--gray-50); font-size: 13px;">
                            <td colspan="2" style="padding-left: 40px;">→ ${cobro.pedidoId ? 'Anticipo' : 'Cobro'}: ${formatDate(cobro.fecha)}</td>
                            <td>${pedidoRef ? 'Ped: ' + pedidoRef : ''}</td>
                            <td>Acumulado:</td>
                            <td></td>
                            <td>${formatCurrency(cobro.importe, cobro.moneda)}</td>
                            <td>${formatCurrency(acum, item.factura.moneda)}${cobro.esAjuste ? ' <span class="badge badge-info">Ajuste</span>' : ''}</td>
                        </tr>
                    `;
                });
            }
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
    });
    
    html += `
                <div class="modal-footer">
                    <button class="btn btn-primary" onclick="redescargarInforme('${informe.id}')">📥 Descargar Excel</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('modalDetalleInforme').remove()">Cerrar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', html);
}

function redescargarInforme(informeId) {
    const informe = DB.getHistoricoInformes().find(i => i.id === informeId);
    if (!informe) return;
    
    // Regenerar el Excel con los datos guardados
    crearInformeExcelDesdeHistorico(informe);
}

function crearInformeExcelDesdeHistorico(informe) {
    const wb = XLSX.utils.book_new();

    // Hoja resumen - compatible con formato antiguo y nuevo
    const resumenData = [
        ['INFORME DE COMISIONES DE SHOWROOMS'],
        ['Charo Ruiz Ibiza'],
        [''],
        [`Periodo: ${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}`],
        [`Generado: ${new Date(informe.fechaGeneracion).toLocaleDateString('es-ES')}`],
        [''],
        ['Showroom', 'Moneda', 'Total Facturado', '% Comisión', 'Comisión Total'],
    ];

    const totGen = informe.totalesGenerales || { EUR: { facturado: informe.totalGeneral || 0, comision: informe.totalComisionGeneral || 0 } };

    informe.showrooms.forEach(s => {
        const showroomData = Object.values(informe.detalleCompleto).find(d => d.showroom.nombre === s.nombre);
        const tpm = s.totalesPorMoneda || { EUR: { facturado: s.totalFacturado || 0, comision: s.totalComision || 0 } };
        Object.entries(tpm).forEach(([moneda, totales]) => {
            resumenData.push([
                s.nombre,
                moneda,
                totales.facturado,
                showroomData ? showroomData.showroom.comision + '%' : '',
                totales.comision
            ]);
        });
    });

    resumenData.push(['']);
    Object.entries(totGen).forEach(([moneda, totales]) => {
        resumenData.push(['TOTAL', moneda, totales.facturado, '', totales.comision]);
    });

    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 18 }, { wch: 12 }, { wch: 18 }];
    aplicarFormatoNumerosExcel(wsResumen);
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

    // Hojas por showroom con detalle
    const cobros = DB.getCobros();

    Object.values(informe.detalleCompleto).forEach(data => {
        const tpm = data.totalesPorMoneda || { EUR: { facturado: data.totalFacturado || 0, comision: data.totalComision || 0 } };
        const sheetData = [
            [`COMISIONES - ${data.showroom.nombre}`],
            [`Periodo: ${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}`],
            [`% Comisión: ${data.showroom.comision}%`],
            [''],
        ];

        data.facturas.forEach(item => {
            const moneda = item.factura.moneda || 'EUR';
            const tipoLabel = item.factura.esAbono ? 'ABONO' : 'FACTURA';
            const refCol = item.factura.esAbono
                ? (item.factura.facturasAbonadas || '')
                : (item.pedidosRef || item.factura.pedidos || '');
            sheetData.push([
                tipoLabel,
                item.factura.numero,
                item.cliente.nombre,
                refCol,
                formatDate(item.factura.fecha),
                formatDate(item.fechaCobro100),
                moneda,
                item.factura.importe,
                item.factura.esAbono ? '' : item.totalCobrado,
                item.comision
            ]);

            if (!item.factura.esAbono) {
                const cobrosFactura = cobros.filter(c => c.facturaId === item.factura.id)
                    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                const pedidosDB = DB.getPedidos();

                let acumulado = 0;
                cobrosFactura.forEach(cobro => {
                    const pedidoRef = cobro.pedidoId ? (pedidosDB.find(p => p.id === cobro.pedidoId) || {}).numero || '' : '';
                    acumulado += cobro.importe;
                    sheetData.push([
                        cobro.pedidoId ? '  → Anticipo' : '  → Cobro',
                        formatDate(cobro.fecha),
                        pedidoRef ? `(Pedido: ${pedidoRef})` : '',
                        '', '', '', '',
                        cobro.importe,
                        acumulado,
                        cobro.esAjuste ? 'Ajuste' : ''
                    ]);
                });
            }

            sheetData.push(['']);
        });

        sheetData.splice(4, 0, ['Tipo', 'Nº Factura / Fecha', 'Cliente', 'Pedido(s) / Fact. abonadas', 'Fecha Emisión', 'Fecha Cobro / Emisión', 'Moneda', 'Importe', 'Total Cobrado', 'Comisión']);
        sheetData.splice(5, 0, ['']);

        sheetData.push(['']);
        Object.entries(tpm).forEach(([moneda, totales]) => {
            sheetData.push(['', '', '', '', '', 'TOTAL', moneda, totales.facturado, '', totales.comision]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 20 }, { wch: 15 },
            { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }
        ];
        aplicarFormatoNumerosExcel(ws);

        XLSX.utils.book_append_sheet(wb, ws, data.showroom.nombre.substring(0, 30));
    });

    XLSX.writeFile(wb, informe.filename);
}

function eliminarInforme(informeId) {
    if (!confirm('¿Eliminar este informe del histórico?')) return;
    
    const historico = DB.getHistoricoInformes().filter(i => i.id !== informeId);
    DB.set('historicoInformes', historico);
    cargarHistoricoInformes();
}

function limpiarHistoricoInformes() {
    if (!confirm('¿Eliminar todo el histórico de informes?')) return;
    DB.clearHistoricoInformes();
    cargarHistoricoInformes();
}

