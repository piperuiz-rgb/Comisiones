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
    clearHistoricoInformes: () => DB.set('historicoInformes', []),

    getSolicitudesCredito: () => DB.getArray('solicitudesCredito'),
    setSolicitudesCredito: (data) => DB.set('solicitudesCredito', data),

    getHilldunConfig: () => DB.get('hilldunConfig'),
    setHilldunConfig: (data) => DB.set('hilldunConfig', data)
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
    if (tabName === 'hilldun') cargarTablaHilldun();
}

// ========================================
// FACTURAS PENDIENTES (ex-Dashboard)
// ========================================

function cargarDashboard() {
    const facturas = DB.getFacturas();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const hoy = new Date();
    
    const container = document.getElementById('facturasPendientesContainer');
    
    // Filtrar solo facturas no cobradas al 100%
    const pendientes = facturas.filter(f => {
        const estado = calcularEstadoFactura(f.id);
        return estado.cobrado < f.importe;
    });
    
    if (pendientes.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No hay facturas pendientes de cobro</p></div>';
        return;
    }
    
    // Controles de filtro
    let html = `
        <div style="display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap;">
            <select id="filtroClientePendientes" style="min-width: 250px;">
                <option value="">Todos los clientes</option>
                ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
            </select>
            <select id="filtroShowroomPendientes" style="min-width: 250px;">
                <option value="">Todos los showrooms</option>
                ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
            </select>
        </div>
    `;
    
    html += '<table><thead><tr><th>Nº Factura</th><th>Cliente</th><th>Showroom</th><th>Importe Total</th><th>Pendiente</th><th>Días Vencida</th></tr></thead><tbody id="pendientesTableBody">';
    
    pendientes.forEach(factura => {
        const cliente = clientes.find(c => c.id === factura.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        const estado = calcularEstadoFactura(factura.id);
        
        const fechaVenc = new Date(factura.vencimiento + 'T00:00:00');
        const diffTime = hoy - fechaVenc;
        const diasVencida = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const colorVencida = diasVencida > 0 ? 'var(--danger)' : 'var(--gray-700)';
        const textoVencida = diasVencida > 0 ? `${diasVencida} días` : diasVencida === 0 ? 'Hoy' : `${Math.abs(diasVencida)} días`;
        
        html += `
            <tr data-cliente="${factura.clienteId}" data-showroom="${showroom ? showroom.id : ''}" data-dias="${diasVencida}">
                <td><strong>${factura.numero}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>${formatCurrency(factura.importe, factura.moneda)}</td>
                <td style="color: var(--warning); font-weight: 600;">${formatCurrency(estado.pendiente, factura.moneda)}</td>
                <td style="color: ${colorVencida}; font-weight: 600;">${textoVencida}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
    
    // Event listeners
    document.getElementById('filtroClientePendientes').addEventListener('change', filtrarPendientes);
    document.getElementById('filtroShowroomPendientes').addEventListener('change', filtrarPendientes);
}

function filtrarPendientes() {
    const clienteFiltro = document.getElementById('filtroClientePendientes').value;
    const showroomFiltro = document.getElementById('filtroShowroomPendientes').value;
    
    const filas = document.querySelectorAll('#pendientesTableBody tr');
    
    filas.forEach(fila => {
        const cliente = fila.getAttribute('data-cliente');
        const showroom = fila.getAttribute('data-showroom');
        
        const coincideCliente = !clienteFiltro || cliente === clienteFiltro;
        const coincideShowroom = !showroomFiltro || showroom === showroomFiltro;
        
        if (coincideCliente && coincideShowroom) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    });
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
    document.getElementById('importResponsesInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarCreditResponses(e.target.files[0]);
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
        let html = '<table><thead><tr><th>Factura</th><th>Cliente</th><th>Importe</th><th>Cobrado</th><th>Pendiente</th><th>Estado</th><th>Vencimiento</th></tr></thead><tbody>';
        
        facturasPend.forEach(fac => {
            const estado = calcularEstadoFactura(fac.id);
            const cliente = clientes.find(c => c.id === fac.clienteId);
            const badge = estado.porcentaje === 0 ? 'danger' : 'warning';
            
            html += `
                <tr>
                    <td><strong>${fac.numero}</strong></td>
                    <td>${cliente ? cliente.nombre : '-'}</td>
                    <td>${formatCurrency(fac.importe, fac.moneda)}</td>
                    <td>${formatCurrency(estado.cobrado, fac.moneda)}</td>
                    <td>${formatCurrency(estado.pendiente, fac.moneda)}</td>
                    <td><span class="badge badge-${badge}">${estado.porcentaje.toFixed(0)}%</span></td>
                    <td>${formatDate(fac.fechaVencimiento)}</td>
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
    if (!clienteId) {
        document.getElementById('pedidosDisponibles').textContent = '-';
        return;
    }
    
    const pedidos = DB.getPedidos().filter(p => p.clienteId === clienteId);
    const numeros = pedidos.map(p => p.numero).join(', ');
    document.getElementById('pedidosDisponibles').textContent = numeros || 'Ninguno';
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
        // Hilldun fields
        document.getElementById('cliCustomerCode').value = cliente.customerCode || '';
        document.getElementById('cliAddress1').value = cliente.address1 || '';
        document.getElementById('cliAddress2').value = cliente.address2 || '';
        document.getElementById('cliCity').value = cliente.city || '';
        document.getElementById('cliState').value = cliente.state || '';
        document.getElementById('cliZip').value = cliente.zip || '';
        document.getElementById('cliCountry').value = cliente.country || '';
        document.getElementById('cliContact').value = cliente.contact || '';
        document.getElementById('cliPhone').value = cliente.phone || '';
        document.getElementById('cliEmail').value = cliente.email || '';
        document.getElementById('cliVat').value = cliente.vatRegistration || '';
        // Show Hilldun fields if any are populated
        const hasHilldunData = cliente.address1 || cliente.phone || cliente.email || cliente.city;
        document.getElementById('hilldunClienteFields').style.display = hasHilldunData ? 'block' : 'none';
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Cliente';
        document.getElementById('cliNombre').value = '';
        document.getElementById('cliShowroom').value = '';
        document.getElementById('cliCustomerCode').value = '';
        document.getElementById('cliAddress1').value = '';
        document.getElementById('cliAddress2').value = '';
        document.getElementById('cliCity').value = '';
        document.getElementById('cliState').value = '';
        document.getElementById('cliZip').value = '';
        document.getElementById('cliCountry').value = '';
        document.getElementById('cliContact').value = '';
        document.getElementById('cliPhone').value = '';
        document.getElementById('cliEmail').value = '';
        document.getElementById('cliVat').value = '';
        document.getElementById('hilldunClienteFields').style.display = 'none';
        editandoId = null;
    }

    modal.classList.add('visible');
}

function toggleHilldunFields() {
    const el = document.getElementById('hilldunClienteFields');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function guardarCliente() {
    const nombre = document.getElementById('cliNombre').value.trim();
    const showroomId = document.getElementById('cliShowroom').value;

    if (!nombre || !showroomId) {
        alert('Por favor completa todos los campos');
        return;
    }

    const hilldunData = {
        customerCode: document.getElementById('cliCustomerCode').value.trim(),
        address1: document.getElementById('cliAddress1').value.trim(),
        address2: document.getElementById('cliAddress2').value.trim(),
        city: document.getElementById('cliCity').value.trim(),
        state: document.getElementById('cliState').value.trim(),
        zip: document.getElementById('cliZip').value.trim(),
        country: document.getElementById('cliCountry').value.trim(),
        contact: document.getElementById('cliContact').value.trim(),
        phone: document.getElementById('cliPhone').value.trim(),
        email: document.getElementById('cliEmail').value.trim(),
        vatRegistration: document.getElementById('cliVat').value.trim()
    };

    const clientes = DB.getClientes();

    if (editandoId) {
        const index = clientes.findIndex(c => c.id === editandoId);
        clientes[index] = { ...clientes[index], nombre, showroomId, ...hilldunData };
    } else {
        clientes.push({
            id: generarId(),
            nombre,
            showroomId,
            ...hilldunData,
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
    
    html += '<table><thead><tr><th>Nº Pedido</th><th>Cliente</th><th>Showroom</th><th>Fecha</th><th>Importe</th><th>Crédito Hilldun</th><th>Acciones</th></tr></thead><tbody id="pedidosTableBody">';

    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(pedido => {
        const cliente = clientes.find(c => c.id === pedido.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        const solicitudCredito = obtenerEstadoCreditoPedido(pedido.id);

        html += `
            <tr data-cliente="${pedido.clienteId}" data-showroom="${showroom ? showroom.id : ''}" data-numero="${pedido.numero.toLowerCase()}">
                <td><strong>${pedido.numero}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>${formatDate(pedido.fecha)}</td>
                <td>${formatCurrency(pedido.importe, pedido.moneda)}</td>
                <td>${solicitudCredito ? getBadgeCredito(solicitudCredito.estado) : '<span class="badge" style="background:#F1F5F9;color:#64748B;">-</span>'}</td>
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
        title.textContent = 'Editar Factura';
        document.getElementById('facNumero').value = factura.numero;
        document.getElementById('facCliente').value = factura.clienteId;
        document.getElementById('facPedidos').value = factura.pedidos || '';
        document.getElementById('facFecha').value = factura.fecha;
        document.getElementById('facVencimiento').value = factura.vencimiento;
        document.getElementById('facMoneda').value = factura.moneda;
        document.getElementById('facImporte').value = factura.importe;
        cargarPedidosCliente();
        editandoId = id;
    } else {
        title.textContent = 'Nueva Factura';
        document.getElementById('facNumero').value = '';
        document.getElementById('facCliente').value = '';
        document.getElementById('facPedidos').value = '';
        document.getElementById('facFecha').valueAsDate = new Date();
        const venc = new Date();
        venc.setDate(venc.getDate() + 30);
        document.getElementById('facVencimiento').valueAsDate = venc;
        document.getElementById('facMoneda').value = 'EUR';
        document.getElementById('facImporte').value = '';
        document.getElementById('pedidosDisponibles').textContent = '-';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function cargarPedidosCliente() {
    const clienteId = document.getElementById('facCliente').value;
    if (!clienteId) {
        document.getElementById('pedidosDisponibles').textContent = '-';
        return;
    }
    
    const pedidos = DB.getPedidos().filter(p => p.clienteId === clienteId);
    const numeros = pedidos.map(p => p.numero).join(', ');
    document.getElementById('pedidosDisponibles').textContent = numeros || 'Ninguno';
}

function guardarFactura() {
    const numero = document.getElementById('facNumero').value.trim();
    const clienteId = document.getElementById('facCliente').value;
    const pedidos = document.getElementById('facPedidos').value.trim();
    const fecha = document.getElementById('facFecha').value;
    const vencimiento = document.getElementById('facVencimiento').value;
    const moneda = document.getElementById('facMoneda').value;
    const importe = parseFloat(document.getElementById('facImporte').value);
    
    if (!numero || !clienteId || !fecha || !vencimiento || isNaN(importe)) {
        alert('Por favor completa todos los campos obligatorios');
        return;
    }
    
    const facturas = DB.getFacturas();
    
    if (editandoId) {
        const index = facturas.findIndex(f => f.id === editandoId);
        facturas[index] = { ...facturas[index], numero, clienteId, pedidos, fecha, vencimiento, moneda, importe };
    } else {
        facturas.push({
            id: generarId(),
            numero,
            clienteId,
            pedidos,
            fecha,
            vencimiento,
            moneda,
            importe,
            fechaCreacion: new Date().toISOString()
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
            let importados = 0;
            
            // Formato: Número | Cliente | Pedidos | Fecha | Vencimiento | Moneda | Importe
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                const clienteNombre = String(row[1] || '');
                const cliente = clientes.find(c => c.nombre.toLowerCase() === clienteNombre.toLowerCase());
                
                if (cliente) {
                    facturas.push({
                        id: generarId(),
                        numero: String(row[0]),
                        clienteId: cliente.id,
                        pedidos: String(row[2] || ''),
                        fecha: row[3] || new Date().toISOString().split('T')[0],
                        vencimiento: row[4] || new Date().toISOString().split('T')[0],
                        moneda: String(row[5] || 'EUR'),
                        importe: parseFloat(row[6]) || 0,
                        fechaCreacion: new Date().toISOString()
                    });
                    importados++;
                }
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
// COBROS - CRUD
// ========================================

function modalCobro(id = null) {
    const modal = document.getElementById('modalCobro');
    const title = document.getElementById('modalCobroTitle');
    
    // Cargar facturas no completamente cobradas
    const facturas = DB.getFacturas();
    const selectFactura = document.getElementById('cobFactura');
    selectFactura.innerHTML = '<option value="">Seleccionar factura...</option>';
    
    facturas.forEach(f => {
        const estado = calcularEstadoFactura(f.id);
        if (estado.estado !== 'cobrada') {
            selectFactura.innerHTML += `<option value="${f.id}">${f.numero} - Pendiente: ${formatCurrency(estado.pendiente, f.moneda)}</option>`;
        }
    });
    
    if (id) {
        const cobros = DB.getCobros();
        const cobro = cobros.find(c => c.id === id);
        title.textContent = 'Editar Cobro';
        document.getElementById('cobFactura').value = cobro.facturaId;
        document.getElementById('cobFecha').value = cobro.fecha;
        document.getElementById('cobMoneda').value = cobro.moneda;
        document.getElementById('cobImporte').value = cobro.importe;
        mostrarInfoFactura();
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Cobro';
        document.getElementById('cobFactura').value = '';
        document.getElementById('cobFecha').valueAsDate = new Date();
        document.getElementById('cobMoneda').value = 'EUR';
        document.getElementById('cobImporte').value = '';
        document.getElementById('infoFactura').style.display = 'none';
        editandoId = null;
    }
    
    modal.classList.add('visible');
}

function mostrarInfoFactura() {
    const facturaId = document.getElementById('cobFactura').value;
    if (!facturaId) {
        document.getElementById('infoFactura').style.display = 'none';
        return;
    }
    
    const factura = DB.getFacturas().find(f => f.id === facturaId);
    const estado = calcularEstadoFactura(facturaId);
    
    document.getElementById('infFactTotal').textContent = formatCurrency(factura.importe, factura.moneda);
    document.getElementById('infFactCobrado').textContent = formatCurrency(estado.cobrado, factura.moneda);
    document.getElementById('infFactPendiente').textContent = formatCurrency(estado.pendiente, factura.moneda);
    document.getElementById('infoFactura').style.display = 'block';
    
    // Preseleccionar moneda de la factura
    document.getElementById('cobMoneda').value = factura.moneda;
}

function guardarCobro() {
    const facturaId = document.getElementById('cobFactura').value;
    const fecha = document.getElementById('cobFecha').value;
    const moneda = document.getElementById('cobMoneda').value;
    const importe = parseFloat(document.getElementById('cobImporte').value);
    
    if (!facturaId || !fecha || isNaN(importe) || importe <= 0) {
        alert('Por favor completa todos los campos correctamente');
        return;
    }
    
    // Verificar que no exceda el pendiente
    const factura = DB.getFacturas().find(f => f.id === facturaId);
    const estado = calcularEstadoFactura(facturaId);
    
    if (importe > estado.pendiente) {
        alert(`El importe no puede ser mayor que el pendiente (${formatCurrency(estado.pendiente, factura.moneda)})`);
        return;
    }
    
    const cobros = DB.getCobros();
    
    if (editandoId) {
        const index = cobros.findIndex(c => c.id === editandoId);
        cobros[index] = { ...cobros[index], facturaId, fecha, moneda, importe };
    } else {
        cobros.push({
            id: generarId(),
            facturaId,
            fecha,
            moneda,
            importe,
            fechaCreacion: new Date().toISOString()
        });
    }
    
    DB.setCobros(cobros);
    
    // Verificar saldo residual
    const nuevoEstado = calcularEstadoFactura(facturaId);
    const saldoResidual = factura.importe - nuevoEstado.cobrado;
    const umbral = calcularUmbralSaldo(factura.importe);
    
    if (saldoResidual > 0 && saldoResidual <= umbral && nuevoEstado.estado !== 'cobrada') {
        // Guardar información para el modal de saldo residual
        facturaSaldoResidual = {
            facturaId,
            saldo: saldoResidual,
            umbral
        };
        
        document.getElementById('mensajeSaldoResidual').textContent = 
            `La factura ${factura.numero} tiene un saldo pendiente de ${formatCurrency(saldoResidual, factura.moneda)}, que es inferior al umbral de ${formatCurrency(umbral, factura.moneda)}. ¿Deseas marcarla como pagada al 100%?`;
        
        cerrarModal('modalCobro');
        document.getElementById('modalSaldoResidual').classList.add('visible');
        return;
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
    const clientes = DB.getClientes();
    const container = document.getElementById('cobrosTable');
    
    if (cobros.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div><p>No hay cobros registrados</p></div>';
        return;
    }
    
    let html = '<table><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>';
    
    cobros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(cobro => {
        const factura = facturas.find(f => f.id === cobro.facturaId);
        const cliente = factura ? clientes.find(c => c.id === factura.clienteId) : null;
        
        html += `
            <tr>
                <td>${formatDate(cobro.fecha)}</td>
                <td><strong>${factura ? factura.numero : '-'}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${formatCurrency(cobro.importe, cobro.moneda)}${cobro.esAjuste ? ' <span class="badge badge-info">Ajuste</span>' : ''}</td>
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
            let importados = 0;
            
            // Formato: Factura | Fecha | Moneda | Importe
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row[0]) continue;
                
                const facturaNum = String(row[0]);
                const factura = facturas.find(f => f.numero.toLowerCase() === facturaNum.toLowerCase());
                
                if (factura) {
                    cobros.push({
                        id: generarId(),
                        facturaId: factura.id,
                        fecha: row[1] || new Date().toISOString().split('T')[0],
                        moneda: String(row[2] || 'EUR'),
                        importe: parseFloat(row[3]) || 0,
                        fechaCreacion: new Date().toISOString()
                    });
                    importados++;
                }
            }
            
            DB.setCobros(cobros);
            cargarTablaCobros();
            showAlert('cobrosAlert', `${importados} cobros importados correctamente`, 'success');
        } catch (error) {
            showAlert('cobrosAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    document.getElementById('importCobrosInput').value = '';
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
    
    // Encontrar facturas que quedaron cobradas al 100% en el periodo
    const facturasComision = [];
    
    facturas.forEach(factura => {
        const cobrosFactura = cobros.filter(c => c.facturaId === factura.id)
            .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
        
        let acumulado = 0;
        let fechaCobro100 = null;
        
        // Encontrar fecha en que se cobró al 100%
        for (const cobro of cobrosFactura) {
            acumulado += cobro.importe;
            if (acumulado >= factura.importe) {
                fechaCobro100 = cobro.fecha;
                break;
            }
        }
        
        // Si se cobró al 100% y está en el rango de fechas
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
                        comision: factura.importe * showroom.comision / 100
                    });
                }
            }
        }
    });
    
    if (facturasComision.length === 0) {
        alert('No hay facturas cobradas al 100% en el periodo seleccionado');
        return;
    }
    
    // Agrupar por showroom
    const porShowroom = {};
    facturasComision.forEach(item => {
        if (!porShowroom[item.showroom.id]) {
            porShowroom[item.showroom.id] = {
                showroom: item.showroom,
                facturas: [],
                totalFacturado: 0,
                totalComision: 0
            };
        }
        porShowroom[item.showroom.id].facturas.push(item);
        porShowroom[item.showroom.id].totalFacturado += item.factura.importe;
        porShowroom[item.showroom.id].totalComision += item.comision;
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
        ['Showroom', 'Total Facturado', '% Comisión', 'Comisión Total'],
    ];
    
    let totalGeneral = 0;
    let totalComisionGeneral = 0;
    
    Object.values(porShowroom).forEach(data => {
        resumenData.push([
            data.showroom.nombre,
            data.totalFacturado,
            data.showroom.comision + '%',
            data.totalComision
        ]);
        totalGeneral += data.totalFacturado;
        totalComisionGeneral += data.totalComision;
    });
    
    resumenData.push(['']);
    resumenData.push(['TOTAL', totalGeneral, '', totalComisionGeneral]);
    
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [
        { wch: 30 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 }
    ];
    
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
            // Línea de factura
            sheetData.push([
                'FACTURA',
                item.factura.numero,
                item.cliente.nombre,
                formatDate(item.factura.fecha),
                formatDate(item.fechaCobro100),
                item.factura.importe,
                item.totalCobrado,
                item.comision
            ]);
            
            // Detalle de cobros
            const cobrosFactura = cobros.filter(c => c.facturaId === item.factura.id)
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            
            let acumulado = 0;
            cobrosFactura.forEach(cobro => {
                acumulado += cobro.importe;
                sheetData.push([
                    '  → Cobro',
                    formatDate(cobro.fecha),
                    '',
                    '',
                    '',
                    cobro.importe,
                    acumulado,
                    cobro.esAjuste ? 'Ajuste' : ''
                ]);
            });
            
            sheetData.push(['']); // Línea vacía entre facturas
        });
        
        // Encabezados (los ponemos después de calcular los datos para que queden arriba del detalle)
        sheetData.splice(4, 0, ['Tipo', 'Nº Factura / Fecha Cobro', 'Cliente', 'Fecha Emisión', 'Fecha Cobro 100%', 'Importe Factura', 'Total Cobrado', 'Comisión / Estado']);
        sheetData.splice(5, 0, ['']);
        
        sheetData.push(['']);
        sheetData.push(['', '', '', '', 'TOTAL', data.totalFacturado, '', data.totalComision]);
        
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 12 },  // Tipo
            { wch: 18 },  // Nº Factura / Fecha
            { wch: 30 },  // Cliente
            { wch: 15 },  // Fecha Emisión
            { wch: 18 },  // Fecha Cobro 100%
            { wch: 15 },  // Importe Factura
            { wch: 15 },  // Total Cobrado / Acumulado
            { wch: 15 }   // Comisión / Estado
        ];
        
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
            id: d.showroom.id,
            nombre: d.showroom.nombre,
            totalFacturado: d.totalFacturado,
            totalComision: d.totalComision,
            numFacturas: d.facturas.length
        })),
        totalGeneral,
        totalComisionGeneral,
        filename,
        fechaGeneracion: new Date().toISOString(),
        detalleCompleto: porShowroom // Guardar todo el detalle
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
    selectShowroom.innerHTML = '<option value="">Todos los informes</option>';
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
        
        // Crear lista de IDs de showrooms incluidos en este informe
        const showroomIds = Object.values(informe.detalleCompleto || {})
            .map(d => d.showroom.id || '')
            .filter(id => id)
            .join(',');
        
        html += `
            <tr data-showrooms="${showroomIds}" data-busqueda="${informe.fechaInicio} ${informe.fechaFin} ${showroomNombres.toLowerCase()}">
                <td>${fecha.toLocaleString('es-ES')}</td>
                <td><strong>${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}</strong></td>
                <td>${showroomNombres}</td>
                <td>${formatCurrency(informe.totalGeneral, 'EUR')}</td>
                <td>${formatCurrency(informe.totalComisionGeneral, 'EUR')}</td>
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
        const showrooms = fila.getAttribute('data-showrooms');
        const textoBusqueda = fila.getAttribute('data-busqueda');
        
        const coincideBusqueda = textoBusqueda.includes(busqueda);
        
        // El informe coincide si el showroom filtrado está en la lista de showrooms del informe
        const coincideShowroom = !showroomFiltro || showrooms.split(',').includes(showroomFiltro);
        
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
                    <strong>Total Facturado:</strong> ${formatCurrency(informe.totalGeneral, 'EUR')}<br>
                    <strong>Total Comisión:</strong> ${formatCurrency(informe.totalComisionGeneral, 'EUR')}
                </div>
    `;
    
    Object.values(informe.detalleCompleto).forEach(showroomData => {
        html += `
            <div class="card" style="margin-bottom: 24px;">
                <h4 style="margin-bottom: 16px; color: var(--primary);">${showroomData.showroom.nombre} - ${showroomData.showroom.comision}%</h4>
                <div style="margin-bottom: 16px;">
                    <strong>Total:</strong> ${formatCurrency(showroomData.totalFacturado, 'EUR')} | 
                    <strong>Comisión:</strong> ${formatCurrency(showroomData.totalComision, 'EUR')}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Factura</th>
                            <th>Cliente</th>
                            <th>Fecha Emisión</th>
                            <th>Fecha Cobro 100%</th>
                            <th>Importe</th>
                            <th>Comisión</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        showroomData.facturas.forEach(item => {
            html += `
                <tr>
                    <td><strong>${item.factura.numero}</strong></td>
                    <td>${item.cliente.nombre}</td>
                    <td>${formatDate(item.factura.fecha)}</td>
                    <td>${formatDate(item.fechaCobro100)}</td>
                    <td>${formatCurrency(item.factura.importe, item.factura.moneda)}</td>
                    <td>${formatCurrency(item.comision, 'EUR')}</td>
                </tr>
            `;
            
            // Mostrar cobros
            const cobrosFactura = cobros.filter(c => c.facturaId === item.factura.id)
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            
            let acum = 0;
            cobrosFactura.forEach(cobro => {
                acum += cobro.importe;
                html += `
                    <tr style="background: var(--gray-50); font-size: 13px;">
                        <td colspan="2" style="padding-left: 40px;">→ Cobro: ${formatDate(cobro.fecha)}</td>
                        <td></td>
                        <td>Acumulado:</td>
                        <td>${formatCurrency(cobro.importe, cobro.moneda)}</td>
                        <td>${formatCurrency(acum, item.factura.moneda)}${cobro.esAjuste ? ' <span class="badge badge-info">Ajuste</span>' : ''}</td>
                    </tr>
                `;
            });
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
    
    // Hoja resumen
    const resumenData = [
        ['INFORME DE COMISIONES DE SHOWROOMS'],
        ['Charo Ruiz Ibiza'],
        [''],
        [`Periodo: ${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}`],
        [`Generado: ${new Date(informe.fechaGeneracion).toLocaleDateString('es-ES')}`],
        [''],
        ['Showroom', 'Total Facturado', '% Comisión', 'Comisión Total'],
    ];
    
    informe.showrooms.forEach(s => {
        const showroomData = Object.values(informe.detalleCompleto).find(d => d.showroom.nombre === s.nombre);
        resumenData.push([
            s.nombre,
            s.totalFacturado,
            showroomData ? showroomData.showroom.comision + '%' : '',
            s.totalComision
        ]);
    });
    
    resumenData.push(['']);
    resumenData.push(['TOTAL', informe.totalGeneral, '', informe.totalComisionGeneral]);
    
    const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
    wsResumen['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');
    
    // Hojas por showroom con detalle
    const cobros = DB.getCobros();
    
    Object.values(informe.detalleCompleto).forEach(data => {
        const sheetData = [
            [`COMISIONES - ${data.showroom.nombre}`],
            [`Periodo: ${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}`],
            [`% Comisión: ${data.showroom.comision}%`],
            [''],
        ];
        
        data.facturas.forEach(item => {
            sheetData.push([
                'FACTURA',
                item.factura.numero,
                item.cliente.nombre,
                formatDate(item.factura.fecha),
                formatDate(item.fechaCobro100),
                item.factura.importe,
                item.totalCobrado,
                item.comision
            ]);
            
            const cobrosFactura = cobros.filter(c => c.facturaId === item.factura.id)
                .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            
            let acumulado = 0;
            cobrosFactura.forEach(cobro => {
                acumulado += cobro.importe;
                sheetData.push([
                    '  → Cobro',
                    formatDate(cobro.fecha),
                    '',
                    '',
                    '',
                    cobro.importe,
                    acumulado,
                    cobro.esAjuste ? 'Ajuste' : ''
                ]);
            });
            
            sheetData.push(['']);
        });
        
        sheetData.splice(4, 0, ['Tipo', 'Nº Factura / Fecha', 'Cliente', 'Fecha Emisión', 'Fecha Cobro 100%', 'Importe Factura', 'Total Cobrado', 'Comisión / Estado']);
        sheetData.splice(5, 0, ['']);
        
        sheetData.push(['']);
        sheetData.push(['', '', '', '', 'TOTAL', data.totalFacturado, '', data.totalComision]);
        
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 12 }, { wch: 18 }, { wch: 30 }, { wch: 15 },
            { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
        ];
        
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


// ========================================
// MÓDULO: HILLDUN - SOLICITUDES DE CRÉDITO
// ========================================

function obtenerEstadoCreditoPedido(pedidoId) {
    const solicitudes = DB.getSolicitudesCredito().filter(s => s.pedidoId === pedidoId);
    if (solicitudes.length === 0) return null;
    // Devolver la solicitud más reciente
    return solicitudes.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion))[0];
}

function getBadgeCredito(estado) {
    switch (estado) {
        case 'aprobada': return '<span class="badge badge-success">Aprobada</span>';
        case 'rechazada': return '<span class="badge badge-danger">Rechazada</span>';
        case 'enviada': return '<span class="badge badge-info">Enviada</span>';
        case 'pendiente': return '<span class="badge badge-warning">Pendiente</span>';
        default: return '<span class="badge" style="background:#F1F5F9;color:#64748B;">Sin solicitud</span>';
    }
}

function cargarTablaHilldun() {
    const solicitudes = DB.getSolicitudesCredito();
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('hilldunTable');

    // Estadísticas
    const total = solicitudes.length;
    const aprobadas = solicitudes.filter(s => s.estado === 'aprobada').length;
    const pendientes = solicitudes.filter(s => s.estado === 'pendiente' || s.estado === 'enviada').length;
    const rechazadas = solicitudes.filter(s => s.estado === 'rechazada').length;

    document.getElementById('hilldunStats').innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Total Solicitudes</div>
            <div class="stat-value">${total}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Aprobadas</div>
            <div class="stat-value" style="color: var(--success);">${aprobadas}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">En Proceso</div>
            <div class="stat-value" style="color: var(--warning);">${pendientes}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Rechazadas</div>
            <div class="stat-value" style="color: var(--danger);">${rechazadas}</div>
        </div>
    `;

    if (solicitudes.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">🏦</div><p>No hay solicitudes de crédito</p><p style="font-size: 14px; margin-top: 8px;">Crea una nueva solicitud para enviar a Hilldun</p></div>';
        return;
    }

    let html = '<table><thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>Showroom</th><th>Importe</th><th>Estado</th><th>Ref. Hilldun</th><th>Acciones</th></tr></thead><tbody id="hilldunTableBody">';

    solicitudes.sort((a, b) => new Date(b.fechaCreacion) - new Date(a.fechaCreacion)).forEach(sol => {
        const pedido = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;

        html += `
            <tr data-estado="${sol.estado}" data-busqueda="${(pedido ? pedido.numero : '').toLowerCase()} ${(cliente ? cliente.nombre : '').toLowerCase()}">
                <td>${formatDate(sol.fecha)}</td>
                <td><strong>${pedido ? pedido.numero : '-'}</strong></td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td>${formatCurrency(sol.importePedido, sol.moneda)}</td>
                <td>${getBadgeCredito(sol.estado)}</td>
                <td>${sol.referencia || '-'}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalSolicitudCredito('${sol.id}')" title="Editar">✏️</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarSolicitudCredito('${sol.id}')" title="Eliminar">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Event listeners para filtros
    document.getElementById('buscarSolicitud').addEventListener('input', filtrarSolicitudes);
    document.getElementById('filtroEstadoSolicitud').addEventListener('change', filtrarSolicitudes);
}

function filtrarSolicitudes() {
    const busqueda = document.getElementById('buscarSolicitud').value.toLowerCase();
    const estadoFiltro = document.getElementById('filtroEstadoSolicitud').value;

    const filas = document.querySelectorAll('#hilldunTableBody tr');

    filas.forEach(fila => {
        const estado = fila.getAttribute('data-estado');
        const texto = fila.getAttribute('data-busqueda');

        const coincideBusqueda = texto.includes(busqueda);
        const coincideEstado = !estadoFiltro || estado === estadoFiltro;

        fila.style.display = (coincideBusqueda && coincideEstado) ? '' : 'none';
    });
}

function toggleCamposRespuesta() {
    const estado = document.getElementById('solEstado').value;
    const campos = document.getElementById('camposRespuesta');
    campos.style.display = (estado === 'aprobada' || estado === 'rechazada') ? 'block' : 'none';
}

function cargarInfoPedidoSolicitud() {
    const pedidoId = document.getElementById('solPedido').value;
    const infoBox = document.getElementById('infoPedidoSolicitud');

    if (!pedidoId) {
        infoBox.style.display = 'none';
        return;
    }

    const pedido = DB.getPedidos().find(p => p.id === pedidoId);
    const cliente = pedido ? DB.getClientes().find(c => c.id === pedido.clienteId) : null;
    const showroom = cliente ? DB.getShowrooms().find(s => s.id === cliente.showroomId) : null;

    document.getElementById('infSolCliente').textContent = cliente ? cliente.nombre : '-';
    document.getElementById('infSolShowroom').textContent = showroom ? showroom.nombre : '-';
    document.getElementById('infSolImporte').textContent = pedido ? formatCurrency(pedido.importe, pedido.moneda) : '-';
    infoBox.style.display = 'block';
}

function modalSolicitudCredito(id = null) {
    const modal = document.getElementById('modalSolicitudCredito');
    const title = document.getElementById('modalSolicitudCreditoTitle');

    // Cargar pedidos en el select
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const select = document.getElementById('solPedido');
    select.innerHTML = '<option value="">Seleccionar pedido...</option>';
    pedidos.forEach(p => {
        const cliente = clientes.find(c => c.id === p.clienteId);
        select.innerHTML += `<option value="${p.id}">${p.numero} - ${cliente ? cliente.nombre : 'Sin cliente'} (${formatCurrency(p.importe, p.moneda)})</option>`;
    });

    if (id) {
        const solicitudes = DB.getSolicitudesCredito();
        const sol = solicitudes.find(s => s.id === id);

        title.textContent = 'Editar Solicitud de Crédito';
        document.getElementById('solPedido').value = sol.pedidoId;
        document.getElementById('solFecha').value = sol.fecha;
        document.getElementById('solEstado').value = sol.estado;
        document.getElementById('solDeliveryStart').value = sol.deliveryStartDate || '';
        document.getElementById('solDeliveryEnd').value = sol.deliveryEndDate || '';
        document.getElementById('solPONumber').value = sol.poNumber || '';
        document.getElementById('solReferencia').value = sol.referencia || '';
        document.getElementById('solFechaRespuesta').value = sol.fechaRespuesta || '';
        document.getElementById('solLimiteCredito').value = sol.limiteCredito || '';
        document.getElementById('solCondiciones').value = sol.condiciones || '';
        document.getElementById('solNotas').value = sol.notas || '';
        editandoId = id;
        cargarInfoPedidoSolicitud();
        toggleCamposRespuesta();
    } else {
        title.textContent = 'Nueva Solicitud de Crédito';
        document.getElementById('solPedido').value = '';
        document.getElementById('solFecha').valueAsDate = new Date();
        document.getElementById('solEstado').value = 'pendiente';
        document.getElementById('solDeliveryStart').valueAsDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        document.getElementById('solDeliveryEnd').valueAsDate = endDate;
        document.getElementById('solPONumber').value = '';
        document.getElementById('solReferencia').value = '';
        document.getElementById('solFechaRespuesta').value = '';
        document.getElementById('solLimiteCredito').value = '';
        document.getElementById('solCondiciones').value = '';
        document.getElementById('solNotas').value = '';
        document.getElementById('infoPedidoSolicitud').style.display = 'none';
        document.getElementById('camposRespuesta').style.display = 'none';
        editandoId = null;
    }

    modal.classList.add('visible');
}

function guardarSolicitudCredito() {
    const pedidoId = document.getElementById('solPedido').value;
    const fecha = document.getElementById('solFecha').value;
    const estado = document.getElementById('solEstado').value;

    if (!pedidoId || !fecha || !estado) {
        alert('Por favor completa los campos obligatorios');
        return;
    }

    const pedido = DB.getPedidos().find(p => p.id === pedidoId);
    const cliente = pedido ? DB.getClientes().find(c => c.id === pedido.clienteId) : null;

    const deliveryStartDate = document.getElementById('solDeliveryStart').value;
    const deliveryEndDate = document.getElementById('solDeliveryEnd').value;
    const poNumber = document.getElementById('solPONumber').value.trim();
    const referencia = document.getElementById('solReferencia').value.trim();
    const fechaRespuesta = document.getElementById('solFechaRespuesta').value;
    const limiteCredito = parseFloat(document.getElementById('solLimiteCredito').value) || 0;
    const condiciones = document.getElementById('solCondiciones').value.trim();
    const notas = document.getElementById('solNotas').value.trim();

    const solicitudes = DB.getSolicitudesCredito();

    if (editandoId) {
        const index = solicitudes.findIndex(s => s.id === editandoId);
        solicitudes[index] = {
            ...solicitudes[index],
            pedidoId,
            clienteId: cliente ? cliente.id : '',
            fecha,
            estado,
            importePedido: pedido ? pedido.importe : 0,
            moneda: pedido ? pedido.moneda : 'EUR',
            deliveryStartDate,
            deliveryEndDate,
            poNumber,
            referencia,
            fechaRespuesta,
            limiteCredito,
            condiciones,
            notas
        };
    } else {
        solicitudes.push({
            id: generarId(),
            pedidoId,
            clienteId: cliente ? cliente.id : '',
            fecha,
            estado,
            importePedido: pedido ? pedido.importe : 0,
            moneda: pedido ? pedido.moneda : 'EUR',
            deliveryStartDate,
            deliveryEndDate,
            poNumber,
            referencia,
            fechaRespuesta,
            limiteCredito,
            condiciones,
            notas,
            fechaCreacion: new Date().toISOString()
        });
    }

    DB.setSolicitudesCredito(solicitudes);
    cerrarModal('modalSolicitudCredito');
    cargarTablaHilldun();
    showAlert('hilldunAlert', `Solicitud ${editandoId ? 'actualizada' : 'creada'} correctamente`, 'success');
}

function eliminarSolicitudCredito(id) {
    if (!confirm('¿Eliminar esta solicitud de crédito?')) return;

    const solicitudes = DB.getSolicitudesCredito().filter(s => s.id !== id);
    DB.setSolicitudesCredito(solicitudes);
    cargarTablaHilldun();
    showAlert('hilldunAlert', 'Solicitud eliminada', 'success');
}

function exportarSolicitudesCredito() {
    const solicitudes = DB.getSolicitudesCredito();
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();

    if (solicitudes.length === 0) {
        alert('No hay solicitudes para exportar');
        return;
    }

    const wb = XLSX.utils.book_new();

    // Hoja resumen
    const data = [
        ['SOLICITUDES DE CRÉDITO - HILLDUN'],
        ['Charo Ruiz Ibiza'],
        [`Generado: ${new Date().toLocaleDateString('es-ES')}`],
        [''],
        ['Fecha Solicitud', 'Nº Pedido', 'Cliente', 'Showroom', 'Importe Pedido', 'Moneda', 'Estado', 'Ref. Hilldun', 'Fecha Respuesta', 'Limite Crédito', 'Condiciones', 'Notas']
    ];

    solicitudes.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(sol => {
        const pedido = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;

        data.push([
            sol.fecha,
            pedido ? pedido.numero : '-',
            cliente ? cliente.nombre : '-',
            showroom ? showroom.nombre : '-',
            sol.importePedido,
            sol.moneda,
            sol.estado.charAt(0).toUpperCase() + sol.estado.slice(1),
            sol.referencia || '',
            sol.fechaRespuesta || '',
            sol.limiteCredito || '',
            sol.condiciones || '',
            sol.notas || ''
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
        { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 20 },
        { wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 30 }, { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes Crédito');

    XLSX.writeFile(wb, `Solicitudes_Credito_Hilldun_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ========================================
// HILLDUN - CONFIGURACION
// ========================================

function toggleConfigHilldun() {
    const panel = document.getElementById('hilldunConfigPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    if (panel.style.display === 'block') cargarHilldunConfig();
}

function cargarHilldunConfig() {
    const config = DB.getHilldunConfig();
    document.getElementById('hcClientCodeEUR').value = config.clientCodeEUR || '';
    document.getElementById('hcClientCodeUSD').value = config.clientCodeUSD || '';
    document.getElementById('hcTermsCode').value = config.termsCode || '';
    document.getElementById('hcTermsDesc').value = config.termsDesc || '';
    document.getElementById('hcNetDays').value = config.netDays || 30;
    document.getElementById('hcDefaultCarrier').value = config.defaultCarrier || '';
    document.getElementById('hcEdiTradingPartner').value = config.ediTradingPartner || '0';
}

function guardarHilldunConfig() {
    const config = {
        clientCodeEUR: document.getElementById('hcClientCodeEUR').value.trim(),
        clientCodeUSD: document.getElementById('hcClientCodeUSD').value.trim(),
        termsCode: document.getElementById('hcTermsCode').value.trim(),
        termsDesc: document.getElementById('hcTermsDesc').value.trim(),
        netDays: parseInt(document.getElementById('hcNetDays').value) || 30,
        defaultCarrier: document.getElementById('hcDefaultCarrier').value.trim(),
        ediTradingPartner: document.getElementById('hcEdiTradingPartner').value
    };
    DB.setHilldunConfig(config);
    showAlert('hilldunAlert', 'Configuracion Hilldun guardada correctamente', 'success');
}

// ========================================
// HILLDUN - UTILIDADES CSV
// ========================================

function formatDateHilldun(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

function generarBatchId() {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${y}${mo}${d}${h}${mi}${s}`;
}

function getHilldunClientCode(moneda) {
    const config = DB.getHilldunConfig();
    if (moneda === 'USD') return config.clientCodeUSD || config.clientCodeEUR || '';
    return config.clientCodeEUR || '';
}

function escapeCsvField(value) {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function downloadCsv(filename, csvContent) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ========================================
// HILLDUN - GENERAR CSV CREDIT REQUESTS
// ========================================

function generarCSVCreditRequests() {
    const config = DB.getHilldunConfig();
    if (!config.clientCodeEUR && !config.clientCodeUSD) {
        alert('Configura primero el Client Code de Hilldun en la seccion de Configuracion.');
        return;
    }

    const solicitudes = DB.getSolicitudesCredito().filter(s => s.estado === 'pendiente' || s.estado === 'enviada');
    if (solicitudes.length === 0) {
        alert('No hay solicitudes pendientes o enviadas para generar el CSV.');
        return;
    }

    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();

    // Header row per Hilldun spec v3.02c
    const header = [
        "Hilldun's Client Code", 'ClientOrderNumber', 'PO Number', 'PO Amount',
        'PO Date', 'DeliveryStartDate', 'DeliveryEndDate', 'TermsCode',
        'TermsDescription', 'NetDays', 'CustomerCode', 'CustomerName',
        'BillToAddress1', 'BillToAddress2', 'BillToCity', 'BillToState',
        'BillToZip', 'BillToCountry', 'BillToContact', 'BillToPhone',
        'BillToEmailAddress', 'BillToRegistration', 'Count', 'Total',
        'Currency', 'BatchID'
    ];

    const batchId = generarBatchId();
    const totalAmount = solicitudes.reduce((sum, s) => sum + (s.importePedido || 0), 0);
    const count = solicitudes.length;
    const warnings = [];

    const rows = solicitudes.map(sol => {
        const pedido = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const moneda = sol.moneda || (pedido ? pedido.moneda : 'EUR');
        const clientCode = getHilldunClientCode(moneda);

        if (cliente && !cliente.phone) {
            warnings.push(`Cliente "${cliente.nombre}" sin telefono - las solicitudes pueden ser rechazadas.`);
        }
        if (cliente && !cliente.address1) {
            warnings.push(`Cliente "${cliente.nombre}" sin direccion de facturacion.`);
        }

        const poNum = sol.poNumber || (pedido ? pedido.numero : '');
        const poAmount = Math.round(sol.importePedido || (pedido ? pedido.importe : 0));
        const poDate = formatDateHilldun(pedido ? pedido.fecha : sol.fecha);
        const deliveryStart = formatDateHilldun(sol.deliveryStartDate || sol.fecha);
        const deliveryEnd = formatDateHilldun(sol.deliveryEndDate || '');

        return [
            clientCode,
            pedido ? pedido.numero : '',
            poNum,
            poAmount,
            poDate,
            deliveryStart,
            deliveryEnd,
            config.termsCode || '',
            config.termsDesc || '',
            config.netDays || 30,
            cliente ? (cliente.customerCode || '') : '',
            cliente ? cliente.nombre : '',
            cliente ? (cliente.address1 || '') : '',
            cliente ? (cliente.address2 || '') : '',
            cliente ? (cliente.city || '') : '',
            cliente ? (cliente.state || '') : '',
            cliente ? (cliente.zip || '') : '',
            cliente ? (cliente.country || '') : '',
            cliente ? (cliente.contact || '') : '',
            cliente ? (cliente.phone || '') : '',
            cliente ? (cliente.email || '') : '',
            cliente ? (cliente.vatRegistration || '') : '',
            count,
            totalAmount,
            moneda,
            batchId
        ];
    });

    // Show warnings
    const uniqueWarnings = [...new Set(warnings)];
    if (uniqueWarnings.length > 0) {
        const proceed = confirm(
            'Advertencias:\n\n' + uniqueWarnings.join('\n') +
            '\n\n¿Deseas continuar con la generacion del CSV?'
        );
        if (!proceed) return;
    }

    // Build CSV
    const csvLines = [header.map(escapeCsvField).join(',')];
    rows.forEach(row => csvLines.push(row.map(escapeCsvField).join(',')));
    const csvContent = csvLines.join('\r\n');

    // Determine filename
    const primaryCode = config.clientCodeEUR || config.clientCodeUSD || 'XXXX';
    const filename = `${batchId}-${primaryCode}-CreditRequests.csv`;

    downloadCsv(filename, csvContent);

    // Mark solicitudes as enviada
    const allSolicitudes = DB.getSolicitudesCredito();
    solicitudes.forEach(sol => {
        const idx = allSolicitudes.findIndex(s => s.id === sol.id);
        if (idx !== -1 && allSolicitudes[idx].estado === 'pendiente') {
            allSolicitudes[idx].estado = 'enviada';
            allSolicitudes[idx].batchId = batchId;
        }
    });
    DB.setSolicitudesCredito(allSolicitudes);
    cargarTablaHilldun();
    showAlert('hilldunAlert', `CSV generado: ${filename} (${count} solicitudes)`, 'success');
}

// ========================================
// HILLDUN - GENERAR CSV INVOICES
// ========================================

function generarCSVInvoices() {
    const config = DB.getHilldunConfig();
    if (!config.clientCodeEUR && !config.clientCodeUSD) {
        alert('Configura primero el Client Code de Hilldun en la seccion de Configuracion.');
        return;
    }

    const facturas = DB.getFacturas();
    if (facturas.length === 0) {
        alert('No hay facturas para generar el CSV.');
        return;
    }

    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();

    // Header per Hilldun spec v3.02c (columns A-EE)
    const header = [
        "Hilldun's Client Code", 'Client Order Number', 'PO Number',
        'InvoiceNumber', 'InvoiceAmount', 'InvoiceBalance', 'InvoiceDate',
        'TermsCode', 'TermsDescription', 'CustomerCode', 'CustomerName',
        'BillToAddress1', 'BillToAddress2', 'BillToCity', 'BillToState',
        'BillToZip', 'BillToCountry', 'BillToContact', 'BillToPhone',
        'Carrier', 'Tracking', 'EdiTradingPartner',
        'InvoiceCount', 'InvoiceTotal', 'CreditMemo', 'OriginalInvoiceNumber',
        'CreditMemoCount', 'CreditMemoTotal', 'Currency', 'BatchID', 'Invoice_URL'
    ];

    const batchId = generarBatchId();

    // Separate regular invoices and credit memos (negative amounts)
    const regularInvoices = facturas.filter(f => f.importe >= 0);
    const creditMemos = facturas.filter(f => f.importe < 0);

    const invoiceCount = regularInvoices.length;
    const invoiceTotal = regularInvoices.reduce((sum, f) => sum + f.importe, 0);
    const creditMemoCount = creditMemos.length;
    const creditMemoTotal = creditMemos.reduce((sum, f) => sum + Math.abs(f.importe), 0);

    const rows = facturas.map(fac => {
        const cliente = clientes.find(c => c.id === fac.clienteId);
        const moneda = fac.moneda || 'EUR';
        const clientCode = getHilldunClientCode(moneda);
        const estado = calcularEstadoFactura(fac.id);
        const isCreditMemo = fac.importe < 0;

        // Find related order number
        let orderNumber = '';
        if (fac.pedidosOrigen) {
            const firstPedidoNum = fac.pedidosOrigen.split(',')[0].trim();
            const pedido = pedidos.find(p => p.numero === firstPedidoNum);
            orderNumber = pedido ? pedido.numero : firstPedidoNum;
        }

        return [
            clientCode,
            orderNumber,
            orderNumber,
            fac.numero,
            Math.abs(fac.importe),
            Math.max(0, estado.pendiente),
            formatDateHilldun(fac.fecha),
            config.termsCode || '',
            config.termsDesc || '',
            cliente ? (cliente.customerCode || '') : '',
            cliente ? cliente.nombre : '',
            cliente ? (cliente.address1 || '') : '',
            cliente ? (cliente.address2 || '') : '',
            cliente ? (cliente.city || '') : '',
            cliente ? (cliente.state || '') : '',
            cliente ? (cliente.zip || '') : '',
            cliente ? (cliente.country || '') : '',
            cliente ? (cliente.contact || '') : '',
            cliente ? (cliente.phone || '') : '',
            config.defaultCarrier || '',
            '',
            config.ediTradingPartner || '0',
            invoiceCount,
            invoiceTotal,
            isCreditMemo ? 1 : 0,
            '',
            creditMemoCount > 0 ? creditMemoCount : '',
            creditMemoTotal > 0 ? creditMemoTotal : '',
            moneda,
            batchId,
            ''
        ];
    });

    // Build CSV
    const csvLines = [header.map(escapeCsvField).join(',')];
    rows.forEach(row => csvLines.push(row.map(escapeCsvField).join(',')));
    const csvContent = csvLines.join('\r\n');

    const primaryCode = config.clientCodeEUR || config.clientCodeUSD || 'XXXX';
    const filename = `${batchId}-${primaryCode}-Invoices.csv`;

    downloadCsv(filename, csvContent);
    showAlert('hilldunAlert', `CSV generado: ${filename} (${facturas.length} facturas)`, 'success');
}

// ========================================
// HILLDUN - IMPORTAR CREDIT RESPONSES
// ========================================

function importarCreditResponses(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim());

            if (lines.length < 2) {
                showAlert('hilldunAlert', 'El archivo CSV esta vacio o no tiene datos.', 'error');
                return;
            }

            // Detect if first line is header
            const firstLine = lines[0].toLowerCase();
            const hasHeader = firstLine.includes('timestamp') || firstLine.includes('client code') ||
                              firstLine.includes('approval') || firstLine.includes('action');
            const startRow = hasHeader ? 1 : 0;

            const solicitudes = DB.getSolicitudesCredito();
            const pedidos = DB.getPedidos();
            let actualizadas = 0;
            let noEncontradas = 0;
            const resultados = [];

            for (let i = startRow; i < lines.length; i++) {
                const fields = parseCSVLine(lines[i]);
                if (fields.length < 17) continue;

                // Columns per Hilldun spec:
                // A=TimeStamp, B=ClientCode, C=ApprovalCode, D=ClientOrderNumber
                // E=ClientCustomerCode, F=DebtorCode, G=DebtorName
                // H=RequestedAmount, I=ApprovedAmount, J=PostDate
                // K=StartDate, L=EndDate, M=ExpirationDate
                // N=TermsNetDays, O=ActionCode, P=ReasonCodes, Q=HilldunDecision
                // R-V=Reasons1-5, W=Count, X=Total

                const approvalCode = fields[2] ? fields[2].trim() : '';
                const clientOrderNumber = fields[3] ? fields[3].trim() : '';
                const debtorName = fields[6] ? fields[6].trim() : '';
                const requestedAmount = parseFloat(fields[7]) || 0;
                const approvedAmount = parseFloat(fields[8]) || 0;
                const postDate = fields[9] ? fields[9].trim() : '';
                const expirationDate = fields[12] ? fields[12].trim() : '';
                const termsNetDays = fields[13] ? fields[13].trim() : '';
                const actionCode = fields[14] ? fields[14].trim() : '';
                const reasonCodes = fields[15] ? fields[15].trim() : '';
                const hilldunDecision = fields[16] ? fields[16].trim() : '';
                const reasons = [];
                for (let r = 17; r <= 21 && r < fields.length; r++) {
                    if (fields[r] && fields[r].trim()) reasons.push(fields[r].trim());
                }

                // Find matching solicitud by order number
                const pedido = pedidos.find(p => p.numero === clientOrderNumber);
                let solicitud = null;
                if (pedido) {
                    solicitud = solicitudes.find(s => s.pedidoId === pedido.id &&
                        (s.estado === 'pendiente' || s.estado === 'enviada'));
                }

                if (!solicitud && pedido) {
                    // Try any solicitud for this pedido
                    solicitud = solicitudes.find(s => s.pedidoId === pedido.id);
                }

                if (solicitud) {
                    // Map action code to estado
                    let nuevoEstado = 'pendiente';
                    switch (actionCode.toUpperCase()) {
                        case 'AC': nuevoEstado = 'aprobada'; break;
                        case 'DR': nuevoEstado = 'rechazada'; break;
                        case 'CI': nuevoEstado = 'rechazada'; break;
                        case 'HC': nuevoEstado = 'enviada'; break;
                        case 'SP': nuevoEstado = 'rechazada'; break;
                        default: nuevoEstado = actionCode ? 'enviada' : 'pendiente'; break;
                    }

                    const idx = solicitudes.findIndex(s => s.id === solicitud.id);
                    solicitudes[idx] = {
                        ...solicitudes[idx],
                        estado: nuevoEstado,
                        referencia: approvalCode,
                        limiteCredito: approvedAmount,
                        fechaRespuesta: postDate ? convertHilldunDate(postDate) : new Date().toISOString().split('T')[0],
                        hilldunDecision: hilldunDecision,
                        actionCode: actionCode,
                        reasonCodes: reasonCodes,
                        condiciones: [
                            hilldunDecision,
                            reasons.length > 0 ? 'Razones: ' + reasons.join(', ') : '',
                            termsNetDays ? 'Net Days: ' + termsNetDays : '',
                            expirationDate ? 'Expira: ' + expirationDate : ''
                        ].filter(Boolean).join(' | ')
                    };
                    actualizadas++;
                    resultados.push(`OK: ${clientOrderNumber} -> ${hilldunDecision || actionCode}`);
                } else {
                    noEncontradas++;
                    resultados.push(`No encontrada: ${clientOrderNumber} (${debtorName})`);
                }
            }

            DB.setSolicitudesCredito(solicitudes);
            cargarTablaHilldun();

            let mensaje = `Importacion completada: ${actualizadas} solicitudes actualizadas`;
            if (noEncontradas > 0) {
                mensaje += `, ${noEncontradas} no encontradas`;
            }
            showAlert('hilldunAlert', mensaje, actualizadas > 0 ? 'success' : 'error');

            if (noEncontradas > 0) {
                console.log('Resultados importacion Hilldun:', resultados);
            }
        } catch (error) {
            showAlert('hilldunAlert', 'Error al importar respuestas: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    document.getElementById('importResponsesInput').value = '';
}

function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                fields.push(current);
                current = '';
            } else {
                current += char;
            }
        }
    }
    fields.push(current);
    return fields;
}

function convertHilldunDate(dateStr) {
    if (!dateStr) return '';
    // Try MM/DD/YYYY or MM-DD-YYYY format
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) {
        return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    }
    // Try YYMMDDHHMMSS format (Hilldun timestamp)
    if (/^\d{12,14}$/.test(dateStr)) {
        let yy, mm, dd;
        if (dateStr.length === 12) {
            yy = dateStr.substring(0, 2);
            mm = dateStr.substring(2, 4);
            dd = dateStr.substring(4, 6);
        } else {
            yy = dateStr.substring(0, 4);
            mm = dateStr.substring(4, 6);
            dd = dateStr.substring(6, 8);
        }
        const year = yy.length === 2 ? '20' + yy : yy;
        return `${year}-${mm}-${dd}`;
    }
    return dateStr;
}


function calcularEstadoFactura(facturaId) {
    const factura = DB.getFacturas().find(f => f.id === facturaId);
    if (!factura) return { estado: 'pendiente', cobrado: 0, pendiente: 0 };

    const cobros = DB.getCobros().filter(c => c.facturaId === facturaId);
    const totalCobrado = cobros.reduce((sum, c) => sum + c.importe, 0);
    const pendiente = factura.importe - totalCobrado;

    let estado = 'pendiente';
    if (totalCobrado >= factura.importe) {
        estado = 'cobrada';
    } else if (totalCobrado > 0) {
        estado = 'parcial';
    }

    return { estado, cobrado: totalCobrado, pendiente: Math.max(0, pendiente) };
}

