// ========================================
// I18N - TRADUCCIONES
// ========================================

const I18N = {
    es: {
        // Order statuses
        confirmado: 'Confirmado',
        en_preparacion: 'En preparacion',
        preparado: 'Preparado',
        enviado: 'Enviado',
        entregado: 'Entregado',
        // Credit statuses
        pendiente: 'Pendiente',
        enviada: 'Enviada',
        aprobada: 'Aprobada',
        rechazada: 'Rechazada',
        // Table headers
        orderNumber: 'N. Pedido',
        joorPO: 'Joor PO',
        client: 'Cliente',
        date: 'Fecha',
        amount: 'Importe',
        paymentTerms: 'Condiciones',
        status: 'Estado',
        shipping: 'Envio',
        trackingNumber: 'N. Seguimiento',
        credit: 'Credito',
        advance: 'Anticipo',
        creditPortion: 'A credito',
        // Portal
        portalTitle: 'Portal Pedidos',
        portalSubtitle: 'Consulta el estado de tus pedidos',
        allStatuses: 'Todos los estados',
        search: 'Buscar pedido...',
        noOrders: 'No hay pedidos registrados',
        shippingMethod: 'Metodo de envio',
        orderDetails: 'Detalles del pedido',
        total: 'Total',
        creditStatus: 'Estado credito',
        backToApp: 'Volver a la app'
    },
    en: {
        confirmado: 'Confirmed',
        en_preparacion: 'In preparation',
        preparado: 'Ready',
        enviado: 'Shipped',
        entregado: 'Delivered',
        pendiente: 'Pending',
        enviada: 'Sent',
        aprobada: 'Approved',
        rechazada: 'Rejected',
        orderNumber: 'Order No.',
        joorPO: 'Joor PO',
        client: 'Client',
        date: 'Date',
        amount: 'Amount',
        paymentTerms: 'Terms',
        status: 'Status',
        shipping: 'Shipping',
        trackingNumber: 'Tracking No.',
        credit: 'Credit',
        advance: 'Advance',
        creditPortion: 'On credit',
        portalTitle: 'Orders Portal',
        portalSubtitle: 'Check the status of your orders',
        allStatuses: 'All statuses',
        search: 'Search order...',
        noOrders: 'No orders found',
        shippingMethod: 'Shipping method',
        orderDetails: 'Order details',
        total: 'Total',
        creditStatus: 'Credit status',
        backToApp: 'Back to app'
    }
};

function t(key, lang) {
    lang = lang || 'es';
    return (I18N[lang] && I18N[lang][key]) || (I18N.es[key]) || key;
}

// ========================================
// SISTEMA DE ALMACENAMIENTO (Firestore + cache en memoria)
// ========================================

const COLLECTIONS = ['showrooms', 'clientes', 'pedidos', 'facturas', 'cobros', 'historicoInformes', 'solicitudesCredito', 'hilldunConfig'];

const DB = {
    _cache: {},
    _ready: false,

    _listeners: [],
    _ignoreNext: {},  // Evitar eco de nuestras propias escrituras

    // Inicializa cargando datos desde Firestore (con fallback a localStorage)
    init: async function() {
        try {
            const promises = COLLECTIONS.map(async (col) => {
                console.log(`Firestore: leyendo "${col}"...`);
                const doc = await db.collection('data').doc(col).get();
                if (doc.exists && doc.data().items) {
                    DB._cache[col] = doc.data().items;
                    console.log(`Firestore: "${col}" cargado (${DB._cache[col].length} registros)`);
                } else {
                    // Migrar datos existentes de localStorage a Firestore
                    const local = JSON.parse(localStorage.getItem(col) || '[]');
                    DB._cache[col] = local;
                    if (local.length > 0) {
                        await db.collection('data').doc(col).set({ items: local });
                        console.log(`Migrado "${col}" a Firestore (${local.length} registros)`);
                    }
                }
            });
            await Promise.all(promises);
            DB._ready = true;
            console.log('Datos cargados desde Firestore');
            // Activar sincronización en tiempo real
            DB._startRealtimeSync();
        } catch(e) {
            console.warn('Error cargando desde Firestore, usando localStorage:', e);
            COLLECTIONS.forEach(col => {
                DB._cache[col] = JSON.parse(localStorage.getItem(col) || '[]');
            });
            DB._ready = true;
        }
    },

    // Escucha cambios en tiempo real de Firestore (sincroniza entre dispositivos)
    _startRealtimeSync: function() {
        COLLECTIONS.forEach(col => {
            const unsub = db.collection('data').doc(col).onSnapshot(doc => {
                if (DB._ignoreNext[col]) {
                    DB._ignoreNext[col] = false;
                    return;
                }
                if (doc.exists && doc.data().items) {
                    const remoteData = doc.data().items;
                    const localJson = JSON.stringify(DB._cache[col]);
                    const remoteJson = JSON.stringify(remoteData);
                    if (localJson !== remoteJson) {
                        DB._cache[col] = remoteData;
                        localStorage.setItem(col, remoteJson);
                        console.log(`Sync: "${col}" actualizado desde otro dispositivo`);
                        DB._refreshUI();
                    }
                }
            }, err => {
                console.warn(`Error en listener de "${col}":`, err);
            });
            DB._listeners.push(unsub);
        });
    },

    // Refresca la pestaña activa tras recibir datos remotos
    _refreshUI: function() {
        const activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return;
        const tabId = activeTab.id.replace('tab-', '');
        if (tabId === 'dashboard') cargarDashboard();
        else if (tabId === 'showrooms') cargarTablaShowrooms();
        else if (tabId === 'clientes') cargarTablaClientes();
        else if (tabId === 'pedidos') cargarTablaPedidos();
        else if (tabId === 'facturas') cargarTablaFacturas();
        else if (tabId === 'cobros') cargarTablaCobros();
        else if (tabId === 'informes') { cargarSelectShowrooms(); cargarSelectExtractoClientes(); }
        else if (tabId === 'historico') cargarHistoricoInformes();
        else if (tabId === 'hilldun') cargarTablaHilldun();
    },

    get: (key) => JSON.parse(JSON.stringify(DB._cache[key] || {})),
    getArray: (key) => JSON.parse(JSON.stringify(DB._cache[key] || [])),
    set: (key, data) => {
        DB._cache[key] = data;
        // Guardar en localStorage como respaldo offline
        localStorage.setItem(key, JSON.stringify(data));
        // Marcar para ignorar el eco de onSnapshot de esta escritura
        DB._ignoreNext[key] = true;
        // Guardar en Firestore (async)
        db.collection('data').doc(key).set({ items: data }).then(() => {
            console.log(`Firestore: "${key}" guardado OK (${Array.isArray(data) ? data.length : 1} registros)`);
        }).catch(e => {
            console.error(`Firestore: ERROR guardando "${key}":`, e.code, e.message);
            DB._ignoreNext[key] = false;
        });
    },

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
    alert.innerHTML = `<strong>${type === 'error' ? '!' : 'i'}</strong><span>${message}</span>`;
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
// TRADUCCIONES PARA INFORMES (i18n)
// ========================================

const i18n = {
    es: {
        // Hoja resumen
        reportTitle: 'INFORME DE COMISIONES DE SHOWROOMS',
        companyName: 'Charo Ruiz Ibiza',
        period: 'Periodo',
        generated: 'Generado',
        summarySheet: 'Resumen',
        showroom: 'Showroom',
        currency: 'Moneda',
        totalBilled: 'Total Facturado',
        commissionPct: '% Comisión',
        totalCommission: 'Comisión Total',
        total: 'TOTAL',
        // Hoja detalle
        commissionsFor: 'COMISIONES',
        type: 'Tipo',
        invoiceNoDate: 'Nº Factura / Fecha Cobro',
        client: 'Cliente',
        ordersOrCredited: 'Pedido(s) / Fact. abonadas',
        joorPO: 'Joor PO',
        issueDate: 'Fecha Emisión',
        paymentDate: 'Fecha Cobro / Emisión',
        amount: 'Importe',
        totalCollected: 'Total Cobrado',
        commission: 'Comisión',
        invoice: 'FACTURA',
        creditNote: 'ABONO',
        advance: '  → Anticipo',
        payment: '  → Cobro',
        orderRef: 'Pedido',
        accumulated: 'Acumulado',
        adjustment: 'Ajuste',
        // Detalle modal
        detailTitle: 'Detalle del Informe',
        downloadExcel: 'Descargar Excel',
        close: 'Cerrar',
        totalLabel: 'Total',
        commissionLabel: 'Comisión',
    },
    en: {
        // Summary sheet
        reportTitle: 'SHOWROOM COMMISSION REPORT',
        companyName: 'Charo Ruiz Ibiza',
        period: 'Period',
        generated: 'Generated',
        summarySheet: 'Summary',
        showroom: 'Showroom',
        currency: 'Currency',
        totalBilled: 'Total Billed',
        commissionPct: '% Commission',
        totalCommission: 'Total Commission',
        total: 'TOTAL',
        // Detail sheet
        commissionsFor: 'COMMISSIONS',
        type: 'Type',
        invoiceNoDate: 'Invoice No. / Payment Date',
        client: 'Client',
        ordersOrCredited: 'Order(s) / Credited Invoices',
        joorPO: 'Joor PO',
        issueDate: 'Issue Date',
        paymentDate: 'Payment / Issue Date',
        amount: 'Amount',
        totalCollected: 'Total Collected',
        commission: 'Commission',
        invoice: 'INVOICE',
        creditNote: 'CREDIT NOTE',
        advance: '  → Advance',
        payment: '  → Payment',
        orderRef: 'Order',
        accumulated: 'Accumulated',
        adjustment: 'Adjustment',
        // Detail modal
        detailTitle: 'Report Detail',
        downloadExcel: 'Download Excel',
        close: 'Close',
        totalLabel: 'Total',
        commissionLabel: 'Commission',
    }
};

function t(key, lang) {
    return (i18n[lang] && i18n[lang][key]) || i18n.es[key] || key;
}

function formatDateLang(dateStr, lang) {
    if (!dateStr) return '-';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString(lang === 'en' ? 'en-GB' : 'es-ES');
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
    if (tabName === 'informes') { cargarSelectShowrooms(); cargarSelectExtractoClientes(); }
    if (tabName === 'historico') cargarHistoricoInformes();
    if (tabName === 'hilldun') cargarTablaHilldun();
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
// INICIALIZACIÓN
// ========================================

// ========================================
// MÓDULO: AUTENTICACIÓN
// ========================================

let currentUserRole = null;
let currentUserData = null;

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Auth] DOMContentLoaded - iniciando listener de autenticación');
    auth.onAuthStateChanged(async function(user) {
        console.log('[Auth] Estado de auth recibido:', user ? ('Usuario: ' + user.email) : 'Sin sesión');
        if (user) {
            await manejarUsuarioLogueado(user);
        } else {
            mostrarPantallaLogin();
        }
    });
});

async function manejarUsuarioLogueado(user) {
    try {
        console.log('[Auth] Buscando rol en Firestore para uid:', user.uid);
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            // Si no hay ningún usuario aún, el primero es admin (bootstrap)
            const snapshot = await db.collection('users').limit(1).get();
            if (snapshot.empty) {
                await db.collection('users').doc(user.uid).set({
                    email: user.email || user.displayName,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                });
                currentUserRole = 'admin';
                currentUserData = { role: 'admin', email: user.email };
            } else {
                mostrarAccesoDenegado(user);
                return;
            }
        } else {
            currentUserRole = userDoc.data().role;
            currentUserData = userDoc.data();
        }

        console.log('[Auth] Rol asignado:', currentUserRole);
        ocultarPantallaLogin(user);

        if (currentUserRole === 'admin') {
            await inicializarAppAdmin();
        } else if (currentUserRole === 'showroom') {
            await inicializarPortalShowroomAuth(currentUserData.showroomId);
        }
    } catch (error) {
        console.error('Error al verificar acceso:', error);
        mostrarErrorLogin('Error al verificar permisos. Comprueba tu conexión.');
    }
}

function mostrarPantallaLogin() {
    console.log('[Auth] Mostrando pantalla de login');
    const overlay = document.getElementById('loginOverlay');
    const header = document.getElementById('mainHeader');
    const app = document.getElementById('mainApp');
    if (overlay) overlay.style.display = 'flex';
    if (header) header.style.display = 'none';
    if (app) app.style.display = 'none';
}

function ocultarPantallaLogin(user) {
    console.log('[Auth] Ocultando pantalla de login, mostrando header');
    const overlay = document.getElementById('loginOverlay');
    const header = document.getElementById('mainHeader');
    const emailEl = document.getElementById('userEmailDisplay');
    const userInfo = document.getElementById('userInfo');
    if (overlay) overlay.style.display = 'none';
    if (header) header.style.display = 'block';
    if (emailEl) emailEl.textContent = user.email || user.displayName || '';
    if (userInfo) userInfo.style.display = 'flex';
}

function mostrarAccesoDenegado(user) {
    const form = document.getElementById('loginForm');
    form.innerHTML = `
        <div class="login-error" style="display:block; margin-bottom: 20px;">
            <strong>Sin acceso</strong><br>
            <span style="font-size:13px">${user.email || user.displayName} no tiene permisos asignados.<br>Contacta con el administrador.</span>
        </div>
        <button onclick="cerrarSesion()" class="btn btn-secondary" style="width:100%; padding:12px;">Cerrar sesi&oacute;n</button>
    `;
    document.getElementById('loginOverlay').style.display = 'flex';
}

async function loginConGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        document.getElementById('loginError').style.display = 'none';
        await auth.signInWithPopup(provider);
    } catch (error) {
        if (error.code !== 'auth/popup-closed-by-user') {
            mostrarErrorLogin(mensajeErrorAuth(error.code));
        }
    }
}

async function loginConEmail() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
        mostrarErrorLogin('Introduce email y contraseña');
        return;
    }
    try {
        document.getElementById('loginError').style.display = 'none';
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        mostrarErrorLogin(mensajeErrorAuth(error.code));
    }
}

async function cerrarSesion() {
    if (confirm('¿Cerrar sesión?')) {
        await auth.signOut();
        location.reload();
    }
}

function mostrarErrorLogin(msg) {
    const el = document.getElementById('loginError');
    el.textContent = msg;
    el.style.display = 'block';
}

function mensajeErrorAuth(code) {
    const errores = {
        'auth/user-not-found': 'Email no registrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/invalid-credential': 'Email o contraseña incorrectos',
        'auth/invalid-email': 'Email inválido',
        'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
        'auth/network-request-failed': 'Error de conexión. Comprueba internet.',
    };
    return errores[code] || 'Error al iniciar sesión (' + code + ')';
}

async function inicializarAppAdmin() {
    console.log('[Auth] Inicializando app de administrador');
    // Mostrar acciones de admin en header
    const adminActions = document.getElementById('adminActions');
    const mainApp = document.getElementById('mainApp');
    if (adminActions) adminActions.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'block';

    // Cargar datos
    const container = document.querySelector('.container');
    container.style.opacity = '0.4';
    container.style.pointerEvents = 'none';
    await DB.init();
    container.style.opacity = '1';
    container.style.pointerEvents = '';

    // Configurar fechas por defecto
    const hoy = new Date();
    document.getElementById('cobFecha').valueAsDate = hoy;
    document.getElementById('pedFecha').valueAsDate = hoy;
    document.getElementById('facFecha').valueAsDate = hoy;

    const treintaDias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
    document.getElementById('facVencimiento').valueAsDate = treintaDias;

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
    document.getElementById('importBackupInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarBackup(e.target.files[0]);
    });
    document.getElementById('importResponsesInput').addEventListener('change', (e) => {
        if (e.target.files.length > 0) importarCreditResponses(e.target.files[0]);
    });

    cargarDashboard();
}

async function inicializarPortalShowroomAuth(showroomId) {
    if (!showroomId) {
        mostrarAccesoDenegado(auth.currentUser);
        return;
    }
    await DB.init();
    document.getElementById('mainApp').style.display = 'none';
    let portal = document.getElementById('showroomPortal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'showroomPortal';
        document.body.appendChild(portal);
    }
    portal.style.display = 'block';
    renderPortalShowroom(showroomId, null, true);
}

// ========================================
// MÓDULO: GESTIÓN DE USUARIOS (ADMIN)
// ========================================

async function abrirGestionUsuarios() {
    // Cargar showrooms en el select
    const showrooms = DB.getShowrooms();
    const sel = document.getElementById('nuevoUsuarioShowroom');
    sel.innerHTML = '<option value="">Seleccionar showroom...</option>';
    showrooms.forEach(s => {
        sel.innerHTML += `<option value="${s.id}">${s.nombre}</option>`;
    });

    // Cargar lista de usuarios
    await cargarListaUsuarios();

    document.getElementById('modalUsuarios').style.display = 'flex';
}

async function cargarListaUsuarios() {
    const container = document.getElementById('listaUsuarios');
    try {
        const snapshot = await db.collection('users').get();
        if (snapshot.empty) {
            container.innerHTML = '<p style="color:var(--gray-500)">No hay usuarios registrados</p>';
            return;
        }
        const showrooms = DB.getShowrooms();
        let html = '<table style="width:100%;font-size:13px;border-collapse:collapse;"><thead><tr style="border-bottom:2px solid #E2E8F0;">';
        html += '<th style="text-align:left;padding:8px 4px;">Email</th><th style="text-align:left;padding:8px 4px;">Rol</th><th style="text-align:left;padding:8px 4px;">Showroom</th><th style="padding:8px 4px;"></th>';
        html += '</tr></thead><tbody>';
        snapshot.forEach(doc => {
            const u = doc.data();
            const show = u.showroomId ? showrooms.find(s => s.id === u.showroomId) : null;
            const rolLabel = { admin: 'Administrador', showroom: 'Showroom', client: 'Cliente' }[u.role] || u.role;
            html += `<tr style="border-bottom:1px solid #F3F4F6;">
                <td style="padding:8px 4px;">${u.email || '-'}</td>
                <td style="padding:8px 4px;"><span class="badge badge-${u.role === 'admin' ? 'primary' : 'secondary'}">${rolLabel}</span></td>
                <td style="padding:8px 4px;">${show ? show.nombre : '-'}</td>
                <td style="padding:8px 4px;text-align:right;"><button class="btn btn-danger btn-icon" onclick="eliminarUsuario('${doc.id}')" title="Revocar acceso">&times;</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="color:var(--danger)">Error al cargar usuarios: ' + e.message + '</p>';
    }
}

function toggleShowroomSelector() {
    const rol = document.getElementById('nuevoUsuarioRol').value;
    document.getElementById('nuevoUsuarioShowroomGroup').style.display = rol === 'showroom' ? 'block' : 'none';
}

async function crearNuevoUsuario() {
    const email = document.getElementById('nuevoUsuarioEmail').value.trim();
    const password = document.getElementById('nuevoUsuarioPassword').value;
    const rol = document.getElementById('nuevoUsuarioRol').value;
    const showroomId = document.getElementById('nuevoUsuarioShowroom').value;
    const errorEl = document.getElementById('nuevoUsuarioError');
    const exitoEl = document.getElementById('nuevoUsuarioExito');

    errorEl.style.display = 'none';
    exitoEl.style.display = 'none';

    if (!email || !password) {
        errorEl.textContent = 'Email y contraseña son obligatorios';
        errorEl.className = 'alert alert-error';
        errorEl.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
        errorEl.className = 'alert alert-error';
        errorEl.style.display = 'block';
        return;
    }
    if (rol === 'showroom' && !showroomId) {
        errorEl.textContent = 'Selecciona el showroom asignado';
        errorEl.className = 'alert alert-error';
        errorEl.style.display = 'block';
        return;
    }

    try {
        // Crear usuario con la app secundaria (no cierra sesión del admin)
        const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;

        // Guardar rol en Firestore
        const userData = { email, role: rol, createdAt: new Date().toISOString() };
        if (rol === 'showroom') userData.showroomId = showroomId;
        await db.collection('users').doc(uid).set(userData);

        // Cerrar sesión de la app secundaria
        await secondaryAuth.signOut();

        exitoEl.textContent = `Acceso creado para ${email}`;
        exitoEl.style.display = 'block';
        document.getElementById('nuevoUsuarioEmail').value = '';
        document.getElementById('nuevoUsuarioPassword').value = '';

        await cargarListaUsuarios();
    } catch (error) {
        errorEl.textContent = mensajeErrorAuth(error.code) || error.message;
        errorEl.className = 'alert alert-error';
        errorEl.style.display = 'block';
    }
}

async function eliminarUsuario(uid) {
    if (!confirm('¿Revocar acceso a este usuario? Solo se elimina el acceso a la app, no la cuenta de Firebase.')) return;
    try {
        await db.collection('users').doc(uid).delete();
        await cargarListaUsuarios();
    } catch (e) {
        alert('Error al revocar acceso: ' + e.message);
    }
}

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
                <div class="empty-icon">OK</div>
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

    // Cargar secciones adicionales del dashboard
    cargarKPIs();
    cargarAlertasVencimiento();
    cargarComisionesProyectadas();
    cargarAgingReport();
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
        document.getElementById('showIdioma').value = showroom.idioma || 'es';
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Showroom';
        document.getElementById('showNombre').value = '';
        document.getElementById('showComision').value = '';
        document.getElementById('showIdioma').value = 'es';
        editandoId = null;
    }

    modal.classList.add('visible');
}

function guardarShowroom() {
    const nombre = document.getElementById('showNombre').value.trim();
    const comision = parseFloat(document.getElementById('showComision').value);
    const idioma = document.getElementById('showIdioma').value;

    if (!nombre || isNaN(comision)) {
        alert('Por favor completa todos los campos');
        return;
    }

    const showrooms = DB.getShowrooms();

    // Validación de duplicados
    const duplicado = showrooms.find(s => s.nombre.toLowerCase() === nombre.toLowerCase() && s.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe un showroom con el nombre "${duplicado.nombre}"`);
        return;
    }

    if (editandoId) {
        const index = showrooms.findIndex(s => s.id === editandoId);
        showrooms[index] = { ...showrooms[index], nombre, comision, idioma };
    } else {
        showrooms.push({
            id: generarId(),
            nombre,
            comision,
            idioma,
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
                <div class="empty-icon">S</div>
                <p>No hay showrooms registrados</p>
                <p style="font-size: 14px; margin-top: 8px;">Crea uno nuevo o importa desde Excel</p>
            </div>
        `;
        return;
    }

    let html = `<div class="filter-bar">
        <input type="text" id="buscarShowroom" placeholder="Buscar showroom...">
    </div>`;

    html += `<table><thead><tr>
        <th class="sortable" data-col="nombre" onclick="ordenarTabla('showroomsTableBody','nombre','text')">Nombre</th>
        <th class="sortable" data-col="comision" onclick="ordenarTabla('showroomsTableBody','comision','number')">% Comisi&oacute;n</th>
        <th>Idioma Informe</th>
        <th>Acciones</th>
    </tr></thead><tbody id="showroomsTableBody">`;

    showrooms.forEach(show => {
        const idiomaLabel = (show.idioma || 'es') === 'en' ? 'EN' : 'ES';
        html += `
            <tr data-sort-key="1" data-sort-nombre="${show.nombre}" data-sort-comision="${show.comision}" data-nombre="${show.nombre.toLowerCase()}">
                <td><strong>${show.nombre}</strong></td>
                <td>${show.comision}%</td>
                <td><span class="badge badge-info">${idiomaLabel}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-primary btn-icon" onclick="abrirPortalShowroom('${show.id}')" title="Portal Pedidos">Portal</button>
                        <button class="btn btn-secondary btn-icon" onclick="modalShowroom('${show.id}')" title="Editar">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarShowroom('${show.id}')" title="Eliminar">Del</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    document.getElementById('buscarShowroom').addEventListener('input', function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll('#showroomsTableBody tr').forEach(r => {
            r.style.display = r.getAttribute('data-nombre').includes(q) ? '' : 'none';
        });
    });
}

function eliminarShowroom(id) {
    const clientes = DB.getClientes().filter(c => c.showroomId === id);
    const pedidos = DB.getPedidos();
    const facturas = DB.getFacturas();
    const cobros = DB.getCobros();

    const clienteIds = new Set(clientes.map(c => c.id));
    const pedidosVinculados = pedidos.filter(p => clienteIds.has(p.clienteId));
    const facturasVinculadas = facturas.filter(f => clienteIds.has(f.clienteId));
    const facturaIds = new Set(facturasVinculadas.map(f => f.id));
    const cobrosVinculados = cobros.filter(c => facturaIds.has(c.facturaId));

    let msg = '¿Eliminar este showroom?';
    const items = [];
    if (clientes.length > 0) items.push(`${clientes.length} cliente(s)`);
    if (pedidosVinculados.length > 0) items.push(`${pedidosVinculados.length} pedido(s)`);
    if (facturasVinculadas.length > 0) items.push(`${facturasVinculadas.length} factura(s)`);
    if (cobrosVinculados.length > 0) items.push(`${cobrosVinculados.length} cobro(s)`);
    if (items.length > 0) {
        msg += `\n\nSe eliminarán también: ${items.join(', ')}.\nEsta acción no se puede deshacer.`;
    }

    if (!confirm(msg)) return;

    // Eliminar en cascada
    DB.setCobros(cobros.filter(c => !facturaIds.has(c.facturaId)));
    DB.setFacturas(facturas.filter(f => !clienteIds.has(f.clienteId)));
    DB.setPedidos(pedidos.filter(p => !clienteIds.has(p.clienteId)));
    DB.setClientes(DB.getClientes().filter(c => c.showroomId !== id));
    DB.setShowrooms(DB.getShowrooms().filter(s => s.id !== id));

    cargarTablaShowrooms();
    showAlert('showroomsAlert', 'Showroom y datos vinculados eliminados', 'success');
}

function exportarShowrooms() {
    const showrooms = DB.getShowrooms();
    if (showrooms.length === 0) {
        alert('No hay showrooms para exportar');
        return;
    }

    const data = [['Nombre', '% Comisión', 'Idioma']];
    showrooms.forEach(s => data.push([s.nombre, s.comision, s.idioma || 'es']));

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

                const idiomaRaw = (String(row[2] || 'es')).toLowerCase().trim();
                const idioma = (idiomaRaw === 'en' || idiomaRaw === 'english') ? 'en' : 'es';

                showrooms.push({
                    id: generarId(),
                    nombre: row[0],
                    comision: parseFloat(row[1]) || 0,
                    idioma,
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

    // Validación de duplicados (mismo nombre + mismo showroom)
    const duplicado = clientes.find(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.showroomId === showroomId && c.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe un cliente "${duplicado.nombre}" en este showroom`);
        return;
    }

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
                <div class="empty-icon">C</div>
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
                        <button class="btn btn-secondary btn-icon" onclick="modalCliente('${cli.id}')" title="Editar">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarCliente('${cli.id}')" title="Eliminar">Del</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarCliente(id) {
    const pedidos = DB.getPedidos().filter(p => p.clienteId === id);
    const facturas = DB.getFacturas().filter(f => f.clienteId === id);
    const facturaIds = new Set(facturas.map(f => f.id));
    const cobros = DB.getCobros().filter(c => facturaIds.has(c.facturaId));

    let msg = '¿Eliminar este cliente?';
    const items = [];
    if (pedidos.length > 0) items.push(`${pedidos.length} pedido(s)`);
    if (facturas.length > 0) items.push(`${facturas.length} factura(s)`);
    if (cobros.length > 0) items.push(`${cobros.length} cobro(s)`);
    if (items.length > 0) {
        msg += `\n\nSe eliminarán también: ${items.join(', ')}.\nEsta acción no se puede deshacer.`;
    }

    if (!confirm(msg)) return;

    DB.setCobros(DB.getCobros().filter(c => !facturaIds.has(c.facturaId)));
    DB.setFacturas(DB.getFacturas().filter(f => f.clienteId !== id));
    DB.setPedidos(DB.getPedidos().filter(p => p.clienteId !== id));
    DB.setClientes(DB.getClientes().filter(c => c.id !== id));

    cargarTablaClientes();
    showAlert('clientesAlert', 'Cliente y datos vinculados eliminados', 'success');
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

    // Validación de duplicados
    const duplicado = pedidos.find(p => p.numero.toLowerCase() === numero.toLowerCase() && p.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe un pedido con el número "${duplicado.numero}"`);
        return;
    }

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
                <div class="empty-icon">P</div>
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
                        <button class="btn btn-secondary btn-icon" onclick="modalPedido('${ped.id}')" title="Editar">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarPedido('${ped.id}')" title="Eliminar">Del</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarPedido(id) {
    const pedido = DB.getPedidos().find(p => p.id === id);
    const cobrosAnticipo = DB.getCobros().filter(c => c.pedidoId === id);

    let msg = '¿Eliminar este pedido?';
    if (cobrosAnticipo.length > 0) {
        msg += `\n\nTiene ${cobrosAnticipo.length} anticipo(s) asociado(s) que también se eliminarán.`;
    }

    if (!confirm(msg)) return;

    if (cobrosAnticipo.length > 0) {
        const cobroIds = new Set(cobrosAnticipo.map(c => c.id));
        DB.setCobros(DB.getCobros().filter(c => !cobroIds.has(c.id)));
    }
    DB.setPedidos(DB.getPedidos().filter(p => p.id !== id));
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

    // Validación de duplicados
    const duplicado = facturas.find(f => f.numero.toLowerCase() === numero.toLowerCase() && f.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe una factura con el número "${duplicado.numero}"`);
        return;
    }

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
                <div class="empty-icon">F</div>
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
                        <button class="btn btn-secondary btn-icon" onclick="modalFactura('${fac.id}')" title="Editar">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarFactura('${fac.id}')" title="Eliminar">Del</button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function eliminarFactura(id) {
    const cobrosFactura = DB.getCobros().filter(c => c.facturaId === id);

    let msg = '¿Eliminar esta factura?';
    if (cobrosFactura.length > 0) {
        msg += `\n\nTiene ${cobrosFactura.length} cobro(s) asociado(s) que también se eliminarán.`;
    }

    if (!confirm(msg)) return;

    if (cobrosFactura.length > 0) {
        const cobroIds = new Set(cobrosFactura.map(c => c.id));
        DB.setCobros(DB.getCobros().filter(c => !cobroIds.has(c.id)));
    }
    DB.setFacturas(DB.getFacturas().filter(f => f.id !== id));
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

    // Validación de duplicados
    const duplicado = clientes.find(c => c.nombre.toLowerCase() === nombre.toLowerCase() && c.showroomId === showroomId && c.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe un cliente "${duplicado.nombre}" en este showroom`);
        return;
    }

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
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">C</div><p>No hay clientes registrados</p></div>';
        return;
    }

    let html = `<div class="filter-bar">
        <input type="text" id="buscarCliente" placeholder="Buscar cliente...">
        <select id="filtroShowroomCliente">
            <option value="">Todos los showrooms</option>
            ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
        </select>
    </div>`;

    html += `<table><thead><tr>
        <th class="sortable" data-col="nombre" onclick="ordenarTabla('clientesTableBody','nombre','text')">Nombre</th>
        <th class="sortable" data-col="showroom" onclick="ordenarTabla('clientesTableBody','showroom','text')">Showroom</th>
        <th>Acciones</th>
    </tr></thead><tbody id="clientesTableBody">`;

    clientes.forEach(cliente => {
        const showroom = showrooms.find(s => s.id === cliente.showroomId);
        const showNombre = showroom ? showroom.nombre : '-';
        html += `
            <tr data-sort-key="1" data-sort-nombre="${cliente.nombre}" data-sort-showroom="${showNombre}" data-nombre="${cliente.nombre.toLowerCase()}" data-showroom="${showroom ? showroom.id : ''}">
                <td><strong>${cliente.nombre}</strong></td>
                <td>${showNombre}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalCliente('${cliente.id}')">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarCliente('${cliente.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    const filtrarClientes = () => {
        const q = document.getElementById('buscarCliente').value.toLowerCase();
        const showFiltro = document.getElementById('filtroShowroomCliente').value;
        document.querySelectorAll('#clientesTableBody tr').forEach(r => {
            const coincideNombre = r.getAttribute('data-nombre').includes(q);
            const coincideShow = !showFiltro || r.getAttribute('data-showroom') === showFiltro;
            r.style.display = (coincideNombre && coincideShow) ? '' : 'none';
        });
    };
    document.getElementById('buscarCliente').addEventListener('input', filtrarClientes);
    document.getElementById('filtroShowroomCliente').addEventListener('change', filtrarClientes);
}

function eliminarCliente(id) {
    const pedidos = DB.getPedidos().filter(p => p.clienteId === id);
    const facturas = DB.getFacturas().filter(f => f.clienteId === id);
    const facturaIds = new Set(facturas.map(f => f.id));
    const cobros = DB.getCobros().filter(c => facturaIds.has(c.facturaId));

    let msg = '¿Eliminar este cliente?';
    const items = [];
    if (pedidos.length > 0) items.push(`${pedidos.length} pedido(s)`);
    if (facturas.length > 0) items.push(`${facturas.length} factura(s)`);
    if (cobros.length > 0) items.push(`${cobros.length} cobro(s)`);
    if (items.length > 0) {
        msg += `\n\nSe eliminarán también: ${items.join(', ')}.\nEsta acción no se puede deshacer.`;
    }

    if (!confirm(msg)) return;

    DB.setCobros(DB.getCobros().filter(c => !facturaIds.has(c.facturaId)));
    DB.setFacturas(DB.getFacturas().filter(f => f.clienteId !== id));
    DB.setPedidos(DB.getPedidos().filter(p => p.clienteId !== id));
    DB.setClientes(DB.getClientes().filter(c => c.id !== id));

    cargarTablaClientes();
    showAlert('clientesAlert', 'Cliente y datos vinculados eliminados', 'success');
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
        document.getElementById('pedJoorPO').value = pedido.joorPO || '';
        document.getElementById('pedCondicionesPago').value = pedido.condicionesPago || 'NET30';
        if (pedido.condicionesPago === 'custom') {
            document.getElementById('pedAnticipoPct').value = pedido.anticipoPct || 0;
            document.getElementById('pedNetDays').value = pedido.netDays || 30;
        }
        document.getElementById('pedEstado').value = pedido.estadoPedido || 'confirmado';
        document.getElementById('pedMetodoEnvio').value = pedido.metodoEnvio || '';
        document.getElementById('pedTracking').value = pedido.trackingNumber || '';
        editandoId = id;
    } else {
        title.textContent = 'Nuevo Pedido';
        document.getElementById('pedNumero').value = '';
        document.getElementById('pedJoorPO').value = '';
        document.getElementById('pedCliente').value = '';
        document.getElementById('pedFecha').valueAsDate = new Date();
        document.getElementById('pedMoneda').value = 'EUR';
        document.getElementById('pedImporte').value = '';
        document.getElementById('pedCondicionesPago').value = 'NET30';
        document.getElementById('pedAnticipoPct').value = 0;
        document.getElementById('pedNetDays').value = 30;
        document.getElementById('pedEstado').value = 'confirmado';
        document.getElementById('pedMetodoEnvio').value = '';
        document.getElementById('pedTracking').value = '';
        editandoId = null;
    }

    calcularImporteCredito();
    modal.classList.add('visible');
}

// Payment terms -> anticipo percentage mapping
const CONDICIONES_PAGO = {
    'NET30':        { anticipoPct: 0,  netDays: 30, label: 'NET30' },
    'NET60':        { anticipoPct: 0,  netDays: 60, label: 'NET60' },
    'NET90':        { anticipoPct: 0,  netDays: 90, label: 'NET90' },
    '30_ANT_NET30': { anticipoPct: 30, netDays: 30, label: '30% ant. + NET30' },
    '50_ANT_NET30': { anticipoPct: 50, netDays: 30, label: '50% ant. + NET30' },
    '50_ANT_NET60': { anticipoPct: 50, netDays: 60, label: '50% ant. + NET60' }
};

function getAnticipoPct(pedido) {
    if (!pedido.condicionesPago) return 0;
    if (pedido.condicionesPago === 'custom') return pedido.anticipoPct || 0;
    const def = CONDICIONES_PAGO[pedido.condicionesPago];
    return def ? def.anticipoPct : 0;
}

function getNetDays(pedido) {
    if (!pedido.condicionesPago) return 30;
    if (pedido.condicionesPago === 'custom') return pedido.netDays || 30;
    const def = CONDICIONES_PAGO[pedido.condicionesPago];
    return def ? def.netDays : 30;
}

function getImporteCredito(pedido) {
    const pct = getAnticipoPct(pedido);
    return pedido.importe * (1 - pct / 100);
}

function getImporteAnticipo(pedido) {
    const pct = getAnticipoPct(pedido);
    return pedido.importe * pct / 100;
}

function getCondicionesLabel(pedido) {
    if (!pedido.condicionesPago) return 'NET30';
    if (pedido.condicionesPago === 'custom') {
        const pct = pedido.anticipoPct || 0;
        const days = pedido.netDays || 30;
        return pct > 0 ? `${pct}% ant. + NET${days}` : `NET${days}`;
    }
    const def = CONDICIONES_PAGO[pedido.condicionesPago];
    return def ? def.label : pedido.condicionesPago;
}

function calcularImporteCredito() {
    const condicion = document.getElementById('pedCondicionesPago').value;
    const importe = parseFloat(document.getElementById('pedImporte').value) || 0;
    const moneda = document.getElementById('pedMoneda').value;

    // Show/hide custom fields
    document.getElementById('pedCustomAnticipo').style.display = condicion === 'custom' ? 'flex' : 'none';

    let anticipoPct = 0;
    if (condicion === 'custom') {
        anticipoPct = parseFloat(document.getElementById('pedAnticipoPct').value) || 0;
    } else {
        const def = CONDICIONES_PAGO[condicion];
        anticipoPct = def ? def.anticipoPct : 0;
    }

    const importeAnticipo = importe * anticipoPct / 100;
    const importeCredito = importe - importeAnticipo;

    // Show breakdown if there's an anticipo
    const desglose = document.getElementById('pedDesglose');
    if (anticipoPct > 0 && importe > 0) {
        desglose.style.display = 'block';
        document.getElementById('pedImporteAnticipo').textContent = formatCurrency(importeAnticipo, moneda);
        document.getElementById('pedImporteCredito').textContent = formatCurrency(importeCredito, moneda);
    } else {
        desglose.style.display = 'none';
    }
}

function guardarPedido() {
    const numero = document.getElementById('pedNumero').value.trim();
    const clienteId = document.getElementById('pedCliente').value;
    const fecha = document.getElementById('pedFecha').value;
    const moneda = document.getElementById('pedMoneda').value;
    const importe = parseFloat(document.getElementById('pedImporte').value);
    const joorPO = document.getElementById('pedJoorPO').value.trim();
    const condicionesPago = document.getElementById('pedCondicionesPago').value;
    const anticipoPct = condicionesPago === 'custom' ? (parseFloat(document.getElementById('pedAnticipoPct').value) || 0) : null;
    const netDays = condicionesPago === 'custom' ? (parseInt(document.getElementById('pedNetDays').value) || 30) : null;
    const estadoPedido = document.getElementById('pedEstado').value;
    const metodoEnvio = document.getElementById('pedMetodoEnvio').value.trim();
    const trackingNumber = document.getElementById('pedTracking').value.trim();

    if (!numero || !clienteId || !fecha || isNaN(importe)) {
        alert('Por favor completa todos los campos');
        return;
    }

    const pedidos = DB.getPedidos();

    // Validación de duplicados
    const duplicado = pedidos.find(p => p.numero.toLowerCase() === numero.toLowerCase() && p.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe un pedido con el número "${duplicado.numero}"`);
        return;
    }

    const extraFields = { joorPO, condicionesPago, estadoPedido, metodoEnvio, trackingNumber };
    if (condicionesPago === 'custom') {
        extraFields.anticipoPct = anticipoPct;
        extraFields.netDays = netDays;
    }

    if (editandoId) {
        const index = pedidos.findIndex(p => p.id === editandoId);
        pedidos[index] = { ...pedidos[index], numero, clienteId, fecha, moneda, importe, ...extraFields };
    } else {
        pedidos.push({
            id: generarId(),
            numero,
            clienteId,
            fecha,
            moneda,
            importe,
            ...extraFields,
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
    const facturas = DB.getFacturas();
    const cobros = DB.getCobros();
    const container = document.getElementById('pedidosTable');

    if (pedidos.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">P</div><p>No hay pedidos registrados</p></div>';
        return;
    }

    let html = `<div class="filter-bar">
        <input type="text" id="buscarPedido" placeholder="Buscar pedido...">
        <select id="filtroClientePedido">
            <option value="">Todos los clientes</option>
            ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
        </select>
        <select id="filtroShowroomPedido">
            <option value="">Todos los showrooms</option>
            ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
        </select>
        <select id="filtroEstadoPedido">
            <option value="">Todos los estados</option>
            <option value="confirmado">Confirmado</option>
            <option value="en_preparacion">En preparaci&oacute;n</option>
            <option value="preparado">Preparado</option>
            <option value="enviado">Enviado</option>
            <option value="entregado">Entregado</option>
        </select>
    </div>`;

    const solicitudes = DB.getSolicitudesCredito();

    html += `<table><thead><tr>
        <th class="sortable" data-col="numero" onclick="ordenarTabla('pedidosTableBody','numero','text')">N&ordm; Pedido</th>
        <th>Joor PO</th>
        <th class="sortable" data-col="cliente" onclick="ordenarTabla('pedidosTableBody','cliente','text')">Cliente</th>
        <th class="sortable" data-col="showroom" onclick="ordenarTabla('pedidosTableBody','showroom','text')">Showroom</th>
        <th class="sortable" data-col="fecha" onclick="ordenarTabla('pedidosTableBody','fecha','date')">Fecha</th>
        <th class="sortable" data-col="importe" onclick="ordenarTabla('pedidosTableBody','importe','number')">Importe</th>
        <th>Estado</th>
        <th>Env&iacute;o</th>
        <th>Cr&eacute;dito</th>
        <th>Acciones</th>
    </tr></thead><tbody id="pedidosTableBody">`;

    pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(pedido => {
        const cliente = clientes.find(c => c.id === pedido.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;

        // Payment terms info
        const condLabel = getCondicionesLabel(pedido);

        // Order status badge
        const estadoBadges = {
            confirmado: 'secondary', en_preparacion: 'warning',
            preparado: 'info', enviado: 'primary', entregado: 'success'
        };
        const estadoLabels = {
            confirmado: 'Confirmado', en_preparacion: 'En prep.',
            preparado: 'Preparado', enviado: 'Enviado', entregado: 'Entregado'
        };
        const estado = pedido.estadoPedido || 'confirmado';
        const estadoHtml = `<span class="badge badge-${estadoBadges[estado] || 'secondary'}">${estadoLabels[estado] || estado}</span>`;

        // Shipping info - single line
        let envioHtml = '-';
        if (pedido.metodoEnvio || pedido.trackingNumber) {
            const parts = [];
            if (pedido.metodoEnvio) parts.push(pedido.metodoEnvio);
            if (pedido.trackingNumber) parts.push(`<code style="font-size:11px">${pedido.trackingNumber}</code>`);
            envioHtml = parts.join(' &middot; ');
        }

        // Credit status - single line badge only
        const solicitud = solicitudes.find(s => s.pedidoId === pedido.id);
        let creditoHtml = '';
        if (solicitud) {
            const badges = { pendiente: 'warning', enviada: 'primary', aprobada: 'success', rechazada: 'danger' };
            const badge = badges[solicitud.estado] || 'secondary';
            creditoHtml = `<span class="badge badge-${badge}" style="cursor:pointer" onclick="modalSolicitudCredito('${solicitud.id}')" title="Click para ver/editar">${solicitud.estado}</span>`;
        } else {
            creditoHtml = `<button class="btn btn-primary" style="font-size:11px;padding:3px 8px" onclick="solicitarCreditoDesdePedido('${pedido.id}')">Solicitar</button>`;
        }

        // Find related facturas and cobros for expand row
        const facturasRelacionadas = facturas.filter(f => {
            if (!f.pedidos) return false;
            const refs = f.pedidos.split(',').map(r => r.trim().toLowerCase());
            return refs.includes(pedido.numero.toLowerCase());
        });
        const cobrosAnticipo = cobros.filter(c => c.pedidoId === pedido.id && !c.facturaId);
        const hasDetails = facturasRelacionadas.length > 0 || cobrosAnticipo.length > 0;

        // Build expand detail content
        let detalleHtml = '';

        if (facturasRelacionadas.length > 0) {
            detalleHtml += `
                <div style="margin-bottom:16px">
                    <div style="font-weight:600;margin-bottom:8px;color:var(--text-primary)">Facturas asociadas</div>
                    <table style="width:100%;background:white;border-radius:6px;border:1px solid var(--border-color)">
                        <thead>
                            <tr style="background:var(--gray-100)">
                                <th style="padding:8px 12px;text-align:left;font-weight:600">N&ordm; Factura</th>
                                <th style="padding:8px 12px;text-align:left;font-weight:600">Fecha</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600">Importe</th>
                                <th style="padding:8px 12px;text-align:center;font-weight:600">Estado</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600">Cobrado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${facturasRelacionadas.map(f => {
                                const cobrosF = cobros.filter(c => c.facturaId === f.id).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                                const estadoF = calcularEstadoFactura(f.id);
                                const estadoTexto = estadoF.cobrado >= Math.abs(f.importe) ? 'cobrada' : estadoF.cobrado > 0 ? 'parcial' : 'pendiente';
                                const estadoBadgeMap = { pendiente: 'warning', parcial: 'primary', cobrada: 'success' };
                                const estadoLabelMap = { pendiente: 'Pendiente', parcial: 'Parcial', cobrada: 'Cobrada' };
                                return `
                                    <tr style="border-top:1px solid var(--border-color)">
                                        <td style="padding:8px 12px"><strong>${f.numero}</strong>${f.esAbono ? ' <span class="badge badge-info" style="font-size:10px">Abono</span>' : ''}</td>
                                        <td style="padding:8px 12px">${formatDate(f.fecha)}</td>
                                        <td style="padding:8px 12px;text-align:right">${formatCurrency(f.importe, f.moneda)}</td>
                                        <td style="padding:8px 12px;text-align:center"><span class="badge badge-${estadoBadgeMap[estadoTexto]}">${estadoLabelMap[estadoTexto]}</span></td>
                                        <td style="padding:8px 12px;text-align:right;color:var(--success);font-weight:600">${formatCurrency(estadoF.cobrado, f.moneda)}</td>
                                    </tr>
                                    ${cobrosF.map(c => `
                                        <tr style="background:var(--gray-50)">
                                            <td style="padding:4px 12px 4px 28px;color:var(--text-secondary);font-size:13px" colspan="2">&#8627; ${formatDate(c.fecha)}${c.esAjuste ? ' <span class="badge badge-info" style="font-size:10px">Ajuste</span>' : ''}</td>
                                            <td style="padding:4px 12px;text-align:right;color:var(--success);font-size:13px">${formatCurrency(c.importe, c.moneda)}</td>
                                            <td colspan="2"></td>
                                        </tr>
                                    `).join('')}
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (cobrosAnticipo.length > 0) {
            const totalAnticipo = cobrosAnticipo.reduce((sum, c) => sum + c.importe, 0);
            detalleHtml += `
                <div>
                    <div style="font-weight:600;margin-bottom:8px;color:var(--text-primary)">Anticipos s/pedido</div>
                    <table style="width:100%;background:white;border-radius:6px;border:1px solid var(--border-color)">
                        <thead>
                            <tr style="background:var(--gray-100)">
                                <th style="padding:8px 12px;text-align:left;font-weight:600">Fecha</th>
                                <th style="padding:8px 12px;text-align:right;font-weight:600">Importe</th>
                                <th style="padding:8px 12px;text-align:left;font-weight:600">Notas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cobrosAnticipo.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).map(c => `
                                <tr style="border-top:1px solid var(--border-color)">
                                    <td style="padding:8px 12px">${formatDate(c.fecha)}</td>
                                    <td style="padding:8px 12px;text-align:right;color:var(--success)">${formatCurrency(c.importe, c.moneda)}</td>
                                    <td style="padding:8px 12px;color:var(--text-secondary)">${c.notas || '-'}</td>
                                </tr>
                            `).join('')}
                            <tr style="border-top:2px solid var(--border-color)">
                                <td style="padding:8px 12px;font-weight:600">Total anticipos</td>
                                <td style="padding:8px 12px;text-align:right;color:var(--success);font-weight:600">${formatCurrency(totalAnticipo, pedido.moneda)}</td>
                                <td></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            `;
        }

        if (!hasDetails) {
            detalleHtml = '<span style="color:var(--text-secondary);font-size:13px">Sin facturas ni anticipos registrados</span>';
        }

        html += `
            <tr data-sort-key="1" data-sort-numero="${pedido.numero}" data-sort-cliente="${cliente ? cliente.nombre : ''}" data-sort-showroom="${showroom ? showroom.nombre : ''}" data-sort-fecha="${pedido.fecha}" data-sort-importe="${pedido.importe}" data-cliente="${pedido.clienteId}" data-showroom="${showroom ? showroom.id : ''}" data-numero="${pedido.numero.toLowerCase()}" data-joorpo="${(pedido.joorPO || '').toLowerCase()}" data-estado="${estado}" data-pedido-id="${pedido.id}" data-pedido-row="1">
                <td style="white-space:nowrap">
                    <span style="cursor:pointer;display:inline-flex;align-items:center;gap:5px" onclick="toggleDetallePedido('${pedido.id}')">
                        <span id="chevron-${pedido.id}" style="font-size:9px;transition:transform 0.2s;display:inline-block;color:var(--text-secondary)">&#9654;</span>
                        <strong>${pedido.numero}</strong>
                    </span>
                </td>
                <td style="white-space:nowrap">${pedido.joorPO || '-'}</td>
                <td>${cliente ? cliente.nombre : '-'}</td>
                <td>${showroom ? showroom.nombre : '-'}</td>
                <td style="white-space:nowrap">${formatDate(pedido.fecha)}</td>
                <td style="white-space:nowrap">${formatCurrency(pedido.importe, pedido.moneda)}${pedido.condicionesPago ? ` <small style="color:var(--text-secondary)">${condLabel}</small>` : ''}</td>
                <td style="text-align:center;white-space:nowrap">${estadoHtml}</td>
                <td style="white-space:nowrap">${envioHtml}</td>
                <td style="text-align:center;white-space:nowrap">${creditoHtml}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalPedido('${pedido.id}')">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarPedido('${pedido.id}')">Del</button>
                    </div>
                </td>
            </tr>
            <tr id="detalle-pedido-${pedido.id}" style="display:none" data-detail-row="1">
                <td colspan="10" style="background:var(--gray-50);padding:16px 24px;border-top:none">
                    ${detalleHtml}
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
    document.getElementById('filtroEstadoPedido').addEventListener('change', filtrarPedidos);
}

function filtrarPedidos() {
    const busqueda = document.getElementById('buscarPedido').value.toLowerCase();
    const clienteFiltro = document.getElementById('filtroClientePedido').value;
    const showroomFiltro = document.getElementById('filtroShowroomPedido').value;
    const estadoFiltro = document.getElementById('filtroEstadoPedido').value;

    const filas = document.querySelectorAll('#pedidosTableBody tr[data-pedido-row="1"]');

    filas.forEach(fila => {
        const numero = fila.getAttribute('data-numero');
        const joorpo = fila.getAttribute('data-joorpo') || '';
        const cliente = fila.getAttribute('data-cliente');
        const showroom = fila.getAttribute('data-showroom');
        const estado = fila.getAttribute('data-estado');
        const pedidoId = fila.getAttribute('data-pedido-id');

        const coincideBusqueda = numero.includes(busqueda) || joorpo.includes(busqueda);
        const coincideCliente = !clienteFiltro || cliente === clienteFiltro;
        const coincideShowroom = !showroomFiltro || showroom === showroomFiltro;
        const coincideEstado = !estadoFiltro || estado === estadoFiltro;

        const visible = coincideBusqueda && coincideCliente && coincideShowroom && coincideEstado;
        fila.style.display = visible ? '' : 'none';

        // Hide detail row when parent is hidden
        if (pedidoId) {
            const detalleRow = document.getElementById(`detalle-pedido-${pedidoId}`);
            if (detalleRow && !visible) detalleRow.style.display = 'none';
        }
    });
}

function eliminarPedido(id) {
    const cobrosAnticipo = DB.getCobros().filter(c => c.pedidoId === id);

    let msg = '¿Eliminar este pedido?';
    if (cobrosAnticipo.length > 0) {
        msg += `\n\nTiene ${cobrosAnticipo.length} anticipo(s) asociado(s) que también se eliminarán.`;
    }

    if (!confirm(msg)) return;

    if (cobrosAnticipo.length > 0) {
        const cobroIds = new Set(cobrosAnticipo.map(c => c.id));
        DB.setCobros(DB.getCobros().filter(c => !cobroIds.has(c.id)));
    }
    DB.setPedidos(DB.getPedidos().filter(p => p.id !== id));
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
        document.getElementById('facPedidos').value = factura.pedidos || factura.pedidosOrigen || '';
        document.getElementById('facFacturasAbonadas').value = factura.facturasAbonadas || '';
        document.getElementById('facFecha').value = factura.fecha;
        document.getElementById('facVencimiento').value = factura.vencimiento || factura.fechaVencimiento || '';
        document.getElementById('facMoneda').value = factura.moneda;
        document.getElementById('facImporte').value = factura.esAbono ? Math.abs(factura.importe) : factura.importe;
        document.getElementById('facNotas').value = factura.notas || '';
        cambiarTipoFactura(factura.esAbono ? 'abono' : 'factura');
        cargarPedidosCliente();
        cargarFacturasAbonables();
        // Pre-cargar envío desde el primer pedido referenciado que tenga datos
        const pedidosDB = DB.getPedidos();
        const pedidosRefStr = factura.pedidos || factura.pedidosOrigen || '';
        const refs = pedidosRefStr.split(',').map(s => s.trim()).filter(Boolean);
        const pedidoConEnvio = refs.map(n => pedidosDB.find(p => p.numero.trim() === n)).filter(Boolean).find(p => p.metodoEnvio || p.trackingNumber);
        document.getElementById('facMetodoEnvio').value = pedidoConEnvio ? (pedidoConEnvio.metodoEnvio || '') : '';
        document.getElementById('facTracking').value = pedidoConEnvio ? (pedidoConEnvio.trackingNumber || '') : '';
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
        document.getElementById('facNotas').value = '';
        document.getElementById('facMetodoEnvio').value = '';
        document.getElementById('facTracking').value = '';
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

    // Si los campos de envío están vacíos, pre-rellenar desde el primer pedido seleccionado con datos
    const metodoField = document.getElementById('facMetodoEnvio');
    const trackingField = document.getElementById('facTracking');
    if (seleccionados.length > 0 && !metodoField.value && !trackingField.value) {
        const pedidos = DB.getPedidos();
        const pedidoConEnvio = seleccionados.map(n => pedidos.find(p => p.numero === n)).filter(Boolean).find(p => p.metodoEnvio || p.trackingNumber);
        if (pedidoConEnvio) {
            metodoField.value = pedidoConEnvio.metodoEnvio || '';
            trackingField.value = pedidoConEnvio.trackingNumber || '';
        }
    }
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
    const notas = document.getElementById('facNotas').value.trim();
    const metodoEnvio = document.getElementById('facMetodoEnvio').value.trim();
    const trackingNumber = document.getElementById('facTracking').value.trim();
    const esAbono = tipoFacturaModal === 'abono';

    if (!numero || !clienteId || !fecha || !vencimiento || isNaN(importe)) {
        alert('Por favor completa todos los campos obligatorios');
        return;
    }

    if (esAbono && !facturasAbonadasStr) {
        alert('Selecciona al menos una factura que este abono rectifica');
        return;
    }

    // Validación de duplicados
    const facturas = DB.getFacturas();
    const duplicado = facturas.find(f => f.numero.toLowerCase() === numero.toLowerCase() && f.id !== editandoId);
    if (duplicado) {
        alert(`Ya existe una factura con el número "${duplicado.numero}"`);
        return;
    }

    // Los abonos se guardan con importe negativo
    if (esAbono && importe > 0) {
        importe = -importe;
    }

    let facturaId;

    if (editandoId) {
        facturaId = editandoId;
        const index = facturas.findIndex(f => f.id === editandoId);
        facturas[index] = { ...facturas[index], numero, clienteId, pedidos: pedidosStr, facturasAbonadas: facturasAbonadasStr, fecha, vencimiento, moneda, importe, esAbono, notas };
    } else {
        facturaId = generarId();
        facturas.push({
            id: facturaId,
            numero, clienteId,
            pedidos: pedidosStr,
            facturasAbonadas: facturasAbonadasStr,
            fecha, vencimiento, moneda, importe,
            esAbono, notas,
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

    // Actualizar datos de envío en los pedidos referenciados
    if (!esAbono && pedidosStr && (metodoEnvio || trackingNumber)) {
        const pedidosDB2 = DB.getPedidos();
        const pedidoRefs = pedidosStr.split(',').map(s => s.trim().toLowerCase());
        let envioActualizado = false;
        pedidoRefs.forEach(ref => {
            const idx = pedidosDB2.findIndex(p => p.numero.trim().toLowerCase() === ref);
            if (idx !== -1) {
                pedidosDB2[idx] = { ...pedidosDB2[idx], metodoEnvio, trackingNumber };
                envioActualizado = true;
            }
        });
        if (envioActualizado) {
            DB.setPedidos(pedidosDB2);
            cargarTablaPedidos();
        }
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
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">F</div><p>No hay facturas registradas</p></div>';
        return;
    }
    
    let html = `<div class="filter-bar">
        <input type="text" id="buscarFactura" placeholder="Buscar factura...">
        <select id="filtroClienteFactura">
            <option value="">Todos los clientes</option>
            ${clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
        </select>
        <select id="filtroShowroomFactura">
            <option value="">Todos los showrooms</option>
            ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
        </select>
        <select id="filtroEstadoFactura">
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="parcial">Parcial</option>
            <option value="cobrada">Cobrada</option>
        </select>
    </div>`;

    html += `<table><thead><tr>
        <th class="sortable" data-col="numero" onclick="ordenarTabla('facturasTableBody','numero','text')">N&ordm; Factura</th>
        <th class="sortable" data-col="cliente" onclick="ordenarTabla('facturasTableBody','cliente','text')">Cliente</th>
        <th class="sortable" data-col="showroom" onclick="ordenarTabla('facturasTableBody','showroom','text')">Showroom</th>
        <th class="sortable" data-col="fecha" onclick="ordenarTabla('facturasTableBody','fecha','date')">Fecha</th>
        <th class="sortable" data-col="vencimiento" onclick="ordenarTabla('facturasTableBody','vencimiento','date')">Vencimiento</th>
        <th class="sortable" data-col="importe" onclick="ordenarTabla('facturasTableBody','importe','number')">Importe</th>
        <th class="sortable" data-col="cobrado" onclick="ordenarTabla('facturasTableBody','cobrado','number')">Cobrado</th>
        <th class="sortable" data-col="pendiente" onclick="ordenarTabla('facturasTableBody','pendiente','number')">Pendiente</th>
        <th>Estado</th>
        <th>Acciones</th>
    </tr></thead><tbody id="facturasTableBody">`;

    facturas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(factura => {
        const cliente = clientes.find(c => c.id === factura.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        const estado = calcularEstadoFactura(factura.id);
        const cobrosFactura = cobros.filter(c => c.facturaId === factura.id).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        const estadoTexto = estado.cobrado >= factura.importe ? 'cobrada' : estado.cobrado > 0 ? 'parcial' : 'pendiente';
        const badgeClass = estadoTexto === 'cobrada' ? 'success' : estadoTexto === 'parcial' ? 'warning' : 'danger';
        const badgeText = estadoTexto === 'cobrada' ? 'Cobrada' : estadoTexto === 'parcial' ? 'Parcial' : 'Pendiente';

        html += `
            <tr data-sort-key="1" data-sort-numero="${factura.numero}" data-sort-cliente="${cliente ? cliente.nombre : ''}" data-sort-showroom="${showroom ? showroom.nombre : ''}" data-sort-fecha="${factura.fecha}" data-sort-vencimiento="${factura.vencimiento || ''}" data-sort-importe="${factura.importe}" data-sort-cobrado="${estado.cobrado}" data-sort-pendiente="${estado.pendiente}" data-cliente="${factura.clienteId}" data-showroom="${showroom ? showroom.id : ''}" data-estado="${estadoTexto}" data-numero="${factura.numero.toLowerCase()}">
                <td>
                    <strong>${factura.numero}</strong>
                    ${factura.esAbono ? ' <span class="badge badge-danger" style="font-size: 10px;">ABONO</span>' : ''}
                    ${cobrosFactura.length > 0 ? `<button class="btn btn-secondary btn-icon" onclick="toggleDetalleCobros('${factura.id}')" style="margin-left: 8px;">Ver</button>` : ''}
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
                        <button class="btn btn-secondary btn-icon" onclick="modalFactura('${factura.id}')">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarFactura('${factura.id}')">Del</button>
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

function toggleDetallePedido(pedidoId) {
    const detalle = document.getElementById(`detalle-pedido-${pedidoId}`);
    const chevron = document.getElementById(`chevron-${pedidoId}`);
    if (!detalle) return;
    const isOpen = detalle.style.display !== 'none';
    detalle.style.display = isOpen ? 'none' : '';
    if (chevron) chevron.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
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
    const cobrosFactura = DB.getCobros().filter(c => c.facturaId === id);

    let msg = '¿Eliminar esta factura?';
    if (cobrosFactura.length > 0) {
        msg += `\n\nTiene ${cobrosFactura.length} cobro(s) asociado(s) que también se eliminarán.`;
    }

    if (!confirm(msg)) return;

    if (cobrosFactura.length > 0) {
        const cobroIds = new Set(cobrosFactura.map(c => c.id));
        DB.setCobros(DB.getCobros().filter(c => !cobroIds.has(c.id)));
    }
    DB.setFacturas(DB.getFacturas().filter(f => f.id !== id));
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
    document.getElementById('facEnvioGroup').style.display = tipo === 'factura' ? '' : 'none';
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
        document.getElementById('cobNotas').value = cobro.notas || '';
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
        document.getElementById('cobNotas').value = '';
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
    const notas = document.getElementById('cobNotas').value.trim();

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
        cobros[index] = { ...cobros[index], facturaId, pedidoId, fecha, moneda, importe, notas };
    } else {
        cobros.push({
            id: generarId(),
            facturaId,
            pedidoId,
            fecha, moneda, importe, notas,
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
    const showrooms = DB.getShowrooms();
    const container = document.getElementById('cobrosTable');

    if (cobros.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">$</div><p>No hay cobros registrados</p></div>';
        return;
    }

    let html = `<div class="filter-bar">
        <input type="text" id="buscarCobro" placeholder="Buscar cobro...">
        <select id="filtroShowroomCobro">
            <option value="">Todos los showrooms</option>
            ${showrooms.map(s => `<option value="${s.id}">${s.nombre}</option>`).join('')}
        </select>
        <select id="filtroTipoCobro">
            <option value="">Todos los tipos</option>
            <option value="factura">Factura</option>
            <option value="anticipo">Anticipo s/pedido</option>
            <option value="transferido">Anticipo transferido</option>
        </select>
    </div>`;

    html += `<table><thead><tr>
        <th class="sortable" data-col="fecha" onclick="ordenarTabla('cobrosTableBody','fecha','date')">Fecha</th>
        <th class="sortable" data-col="referencia" onclick="ordenarTabla('cobrosTableBody','referencia','text')">Aplicado a</th>
        <th class="sortable" data-col="cliente" onclick="ordenarTabla('cobrosTableBody','cliente','text')">Cliente</th>
        <th class="sortable" data-col="importe" onclick="ordenarTabla('cobrosTableBody','importe','number')">Importe</th>
        <th>Tipo</th>
        <th>Acciones</th>
    </tr></thead><tbody id="cobrosTableBody">`;

    cobros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(cobro => {
        let referencia = '-';
        let clienteNombre = '-';
        let tipoBadge = '';
        let tipoFiltro = '';
        let showroomId = '';

        if (cobro.facturaId) {
            const factura = facturas.find(f => f.id === cobro.facturaId);
            if (factura) {
                referencia = factura.numero;
                const cliente = clientes.find(c => c.id === factura.clienteId);
                clienteNombre = cliente ? cliente.nombre : '-';
                if (cliente) {
                    const show = showrooms.find(s => s.id === cliente.showroomId);
                    showroomId = show ? show.id : '';
                }
            }
            if (cobro.pedidoId) {
                tipoBadge = '<span class="badge badge-success">Anticipo transferido</span>';
                tipoFiltro = 'transferido';
            } else {
                tipoBadge = '<span class="badge badge-info">Factura</span>';
                tipoFiltro = 'factura';
            }
        } else if (cobro.pedidoId) {
            const pedido = pedidos.find(p => p.id === cobro.pedidoId);
            if (pedido) {
                referencia = pedido.numero;
                const cliente = clientes.find(c => c.id === pedido.clienteId);
                clienteNombre = cliente ? cliente.nombre : '-';
                if (cliente) {
                    const show = showrooms.find(s => s.id === cliente.showroomId);
                    showroomId = show ? show.id : '';
                }
            }
            tipoBadge = '<span class="badge badge-warning">Anticipo s/pedido</span>';
            tipoFiltro = 'anticipo';
        }

        html += `
            <tr data-sort-key="1" data-sort-fecha="${cobro.fecha}" data-sort-referencia="${referencia}" data-sort-cliente="${clienteNombre}" data-sort-importe="${cobro.importe}" data-showroom="${showroomId}" data-tipo="${tipoFiltro}" data-buscar="${(referencia + ' ' + clienteNombre).toLowerCase()}">
                <td>${formatDate(cobro.fecha)}</td>
                <td><strong>${referencia}</strong></td>
                <td>${clienteNombre}</td>
                <td>${formatCurrency(cobro.importe, cobro.moneda)}${cobro.esAjuste ? ' <span class="badge badge-info">Ajuste</span>' : ''}</td>
                <td>${tipoBadge}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-secondary btn-icon" onclick="modalCobro('${cobro.id}')">Edit</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarCobro('${cobro.id}')">Del</button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    const filtrarCobros = () => {
        const q = document.getElementById('buscarCobro').value.toLowerCase();
        const showFiltro = document.getElementById('filtroShowroomCobro').value;
        const tipoFiltro = document.getElementById('filtroTipoCobro').value;
        document.querySelectorAll('#cobrosTableBody tr').forEach(r => {
            const coincideBusqueda = !q || (r.getAttribute('data-buscar') || '').includes(q);
            const coincideShow = !showFiltro || r.getAttribute('data-showroom') === showFiltro;
            const coincideTipo = !tipoFiltro || r.getAttribute('data-tipo') === tipoFiltro;
            r.style.display = (coincideBusqueda && coincideShow && coincideTipo) ? '' : 'none';
        });
    };
    document.getElementById('buscarCobro').addEventListener('input', filtrarCobros);
    document.getElementById('filtroShowroomCobro').addEventListener('change', filtrarCobros);
    document.getElementById('filtroTipoCobro').addEventListener('change', filtrarCobros);
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
    const pedidos = DB.getPedidos();

    // Obtiene el Joor PO a partir de los números de pedido de una factura
    function getJoorPOParaFactura(factura) {
        if (factura.esAbono) {
            const refs = (factura.facturasAbonadas || '').split(',').map(s => s.trim()).filter(Boolean);
            const joorPOs = refs.flatMap(ref => {
                const factRef = facturas.find(f => f.numero.toLowerCase() === ref.toLowerCase() && !f.esAbono);
                if (!factRef) return [];
                const nums = (factRef.pedidos || '').split(',').map(s => s.trim()).filter(Boolean);
                return nums.map(n => {
                    const p = pedidos.find(p => p.numero && p.numero.trim() === n);
                    return p && p.joorPO ? p.joorPO.trim() : '';
                }).filter(Boolean);
            });
            return [...new Set(joorPOs)].join(', ');
        }
        const nums = (factura.pedidos || '').split(',').map(s => s.trim()).filter(Boolean);
        return nums.map(n => {
            const p = pedidos.find(p => p.numero && p.numero.trim() === n);
            return p && p.joorPO ? p.joorPO.trim() : '';
        }).filter(Boolean).join(', ');
    }

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
                        pedidosRef: factura.pedidos || '',
                        joorPO: getJoorPOParaFactura(factura)
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
                                joorPO: getJoorPOParaFactura(abono),
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
                        joorPO: getJoorPOParaFactura(abono),
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

    // Hoja resumen (siempre en español para la vista general)
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

    // Hoja por cada showroom CON DETALLE DE COBROS (en el idioma del showroom)
    Object.values(porShowroom).forEach(data => {
        const lang = data.showroom.idioma || 'es';
        const fd = (d) => formatDateLang(d, lang);

        const sheetData = [
            [`${t('commissionsFor', lang)} - ${data.showroom.nombre}`],
            [`${t('period', lang)}: ${fd(fechaInicio)} - ${fd(fechaFin)}`],
            [`${t('commissionPct', lang)}: ${data.showroom.comision}%`],
            [''],
        ];

        data.facturas.sort((a, b) => new Date(a.fechaCobro100) - new Date(b.fechaCobro100)).forEach(item => {
            const moneda = item.factura.moneda || 'EUR';
            const tipoLabel = item.factura.esAbono ? t('creditNote', lang) : t('invoice', lang);
            const refCol = item.factura.esAbono
                ? (item.factura.facturasAbonadas || '')
                : (item.pedidosRef || item.factura.pedidos || '');
            sheetData.push([
                tipoLabel,
                item.factura.numero,
                item.cliente.nombre,
                refCol,
                item.joorPO || '',
                fd(item.factura.fecha),
                fd(item.fechaCobro100),
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
                        cobro.pedidoId ? t('advance', lang) : t('payment', lang),
                        fd(cobro.fecha),
                        pedidoRef ? `(${t('orderRef', lang)}: ${pedidoRef})` : '',
                        '',
                        '',
                        '',
                        '',
                        '',
                        cobro.importe,
                        acumulado,
                        cobro.esAjuste ? t('adjustment', lang) : ''
                    ]);
                });
            }

            sheetData.push(['']);
        });

        // Encabezados
        sheetData.splice(4, 0, [t('type', lang), t('invoiceNoDate', lang), t('client', lang), t('ordersOrCredited', lang), t('joorPO', lang), t('issueDate', lang), t('paymentDate', lang), t('currency', lang), t('amount', lang), t('totalCollected', lang), t('commission', lang)]);
        sheetData.splice(5, 0, ['']);

        // Totales por moneda
        sheetData.push(['']);
        Object.entries(data.totalesPorMoneda).forEach(([moneda, totales]) => {
            sheetData.push(['', '', '', '', '', '', t('total', lang), moneda, totales.facturado, '', totales.comision]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 14 },  // Tipo
            { wch: 22 },  // Nº Factura / Fecha
            { wch: 30 },  // Cliente
            { wch: 22 },  // Pedido(s)
            { wch: 18 },  // Joor PO
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
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">H</div><p>No hay informes generados</p></div>';
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
                        <button class="btn btn-secondary btn-icon" onclick="verDetalleInforme('${informe.id}')" title="Ver detalle">Ver</button>
                        <button class="btn btn-primary btn-icon" onclick="redescargarInforme('${informe.id}')" title="Descargar Excel">XLS</button>
                        <button class="btn btn-danger btn-icon" onclick="eliminarInforme('${informe.id}')" title="Eliminar">Del</button>
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
                    <h3 class="modal-title">Detalle del Informe</h3>
                    <button class="modal-close" onclick="document.getElementById('modalDetalleInforme').remove()">&times;</button>
                </div>

                <div style="margin-bottom: 24px;">
                    <strong>Periodo:</strong> ${formatDate(informe.fechaInicio)} - ${formatDate(informe.fechaFin)}<br>
                    <strong>Generado:</strong> ${new Date(informe.fechaGeneracion).toLocaleString('es-ES')}<br>
                    ${(() => {
                        const totGen = informe.totalesGenerales || { EUR: { facturado: informe.totalGeneral || 0, comision: informe.totalComisionGeneral || 0 } };
                        return Object.entries(totGen).map(([m, tt]) =>
                            `<strong>Total Facturado (${m}):</strong> ${formatCurrency(tt.facturado, m)} | <strong>Comisión:</strong> ${formatCurrency(tt.comision, m)}`
                        ).join('<br>');
                    })()}
                </div>
    `;

    Object.values(informe.detalleCompleto).forEach(showroomData => {
        const lang = showroomData.showroom.idioma || 'es';
        const fd = (d) => formatDateLang(d, lang);
        html += `
            <div class="card" style="margin-bottom: 24px;">
                <h4 style="margin-bottom: 16px; color: var(--primary);">${showroomData.showroom.nombre} - ${showroomData.showroom.comision}%</h4>
                <div style="margin-bottom: 16px;">
                    ${(() => {
                        const tpm = showroomData.totalesPorMoneda || { EUR: { facturado: showroomData.totalFacturado || 0, comision: showroomData.totalComision || 0 } };
                        return Object.entries(tpm).map(([m, tt]) =>
                            `<strong>${t('totalLabel', lang)} (${m}):</strong> ${formatCurrency(tt.facturado, m)} | <strong>${t('commissionLabel', lang)}:</strong> ${formatCurrency(tt.comision, m)}`
                        ).join(' &nbsp;|&nbsp; ');
                    })()}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>${t('invoice', lang)}</th>
                            <th>${t('client', lang)}</th>
                            <th>${t('ordersOrCredited', lang)}</th>
                            <th>${t('issueDate', lang)}</th>
                            <th>${t('paymentDate', lang)}</th>
                            <th>${t('amount', lang)}</th>
                            <th>${t('commission', lang)}</th>
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
            const badgeLabel = esAbono ? t('creditNote', lang) : '';
            html += `
                <tr${rowStyle}>
                    <td><strong>${item.factura.numero}</strong>${esAbono ? ` <span class="badge badge-danger" style="font-size: 10px;">${badgeLabel}</span>` : ''}</td>
                    <td>${item.cliente.nombre}</td>
                    <td>${refCol}</td>
                    <td>${fd(item.factura.fecha)}</td>
                    <td>${fd(item.fechaCobro100)}</td>
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
                            <td colspan="2" style="padding-left: 40px;">${cobro.pedidoId ? t('advance', lang).trim() : t('payment', lang).trim()}: ${fd(cobro.fecha)}</td>
                            <td>${pedidoRef ? t('orderRef', lang) + ': ' + pedidoRef : ''}</td>
                            <td>${t('accumulated', lang)}:</td>
                            <td></td>
                            <td>${formatCurrency(cobro.importe, cobro.moneda)}</td>
                            <td>${formatCurrency(acum, item.factura.moneda)}${cobro.esAjuste ? ` <span class="badge badge-info">${t('adjustment', lang)}</span>` : ''}</td>
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
                    <button class="btn btn-primary" onclick="redescargarInforme('${informe.id}')">${t('downloadExcel', 'es')}</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('modalDetalleInforme').remove()">${t('close', 'es')}</button>
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

    // Hojas por showroom con detalle (en el idioma del showroom)
    const cobros = DB.getCobros();

    Object.values(informe.detalleCompleto).forEach(data => {
        const lang = data.showroom.idioma || 'es';
        const fd = (d) => formatDateLang(d, lang);
        const tpm = data.totalesPorMoneda || { EUR: { facturado: data.totalFacturado || 0, comision: data.totalComision || 0 } };
        const sheetData = [
            [`${t('commissionsFor', lang)} - ${data.showroom.nombre}`],
            [`${t('period', lang)}: ${fd(informe.fechaInicio)} - ${fd(informe.fechaFin)}`],
            [`${t('commissionPct', lang)}: ${data.showroom.comision}%`],
            [''],
        ];

        data.facturas.forEach(item => {
            const moneda = item.factura.moneda || 'EUR';
            const tipoLabel = item.factura.esAbono ? t('creditNote', lang) : t('invoice', lang);
            const refCol = item.factura.esAbono
                ? (item.factura.facturasAbonadas || '')
                : (item.pedidosRef || item.factura.pedidos || '');
            sheetData.push([
                tipoLabel,
                item.factura.numero,
                item.cliente.nombre,
                refCol,
                item.joorPO || '',
                fd(item.factura.fecha),
                fd(item.fechaCobro100),
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
                        cobro.pedidoId ? t('advance', lang) : t('payment', lang),
                        fd(cobro.fecha),
                        pedidoRef ? `(${t('orderRef', lang)}: ${pedidoRef})` : '',
                        '', '', '', '', '',
                        cobro.importe,
                        acumulado,
                        cobro.esAjuste ? t('adjustment', lang) : ''
                    ]);
                });
            }

            sheetData.push(['']);
        });

        sheetData.splice(4, 0, [t('type', lang), t('invoiceNoDate', lang), t('client', lang), t('ordersOrCredited', lang), t('joorPO', lang), t('issueDate', lang), t('paymentDate', lang), t('currency', lang), t('amount', lang), t('totalCollected', lang), t('commission', lang)]);
        sheetData.splice(5, 0, ['']);

        sheetData.push(['']);
        Object.entries(tpm).forEach(([moneda, totales]) => {
            sheetData.push(['', '', '', '', '', '', t('total', lang), moneda, totales.facturado, '', totales.comision]);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!cols'] = [
            { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 22 }, { wch: 18 },
            { wch: 15 }, { wch: 18 }, { wch: 8 }, { wch: 18 }, { wch: 18 }, { wch: 18 }
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

// ========================================
// BACKUP / RESTAURACIÓN
// ========================================

function exportarBackup() {
    const backup = {
        version: '2.0',
        fecha: new Date().toISOString(),
        datos: {
            showrooms: DB.getShowrooms(),
            clientes: DB.getClientes(),
            pedidos: DB.getPedidos(),
            facturas: DB.getFacturas(),
            cobros: DB.getCobros(),
            historicoInformes: DB.getHistoricoInformes()
        }
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_Comisiones_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importarBackup(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const backup = JSON.parse(e.target.result);
            if (!backup.datos) {
                alert('Archivo de backup no válido');
                return;
            }

            if (!confirm(`Restaurar backup del ${new Date(backup.fecha).toLocaleString('es-ES')}?\n\nEsto REEMPLAZARÁ todos los datos actuales.\nSe recomienda hacer un backup antes de continuar.`)) return;

            if (backup.datos.showrooms) DB.setShowrooms(backup.datos.showrooms);
            if (backup.datos.clientes) DB.setClientes(backup.datos.clientes);
            if (backup.datos.pedidos) DB.setPedidos(backup.datos.pedidos);
            if (backup.datos.facturas) DB.setFacturas(backup.datos.facturas);
            if (backup.datos.cobros) DB.setCobros(backup.datos.cobros);
            if (backup.datos.historicoInformes) DB.set('historicoInformes', backup.datos.historicoInformes);

            alert('Backup restaurado correctamente. La página se recargará.');
            location.reload();
        } catch (error) {
            alert('Error al leer el archivo de backup: ' + error.message);
        }
    };
    reader.readAsText(file);
    document.getElementById('importBackupInput').value = '';
}

// ========================================
// BÚSQUEDA GLOBAL
// ========================================

function busquedaGlobalHandler() {
    const query = document.getElementById('busquedaGlobal').value.trim().toLowerCase();
    const container = document.getElementById('resultadosBusqueda');

    if (query.length < 2) {
        container.style.display = 'none';
        return;
    }

    const showrooms = DB.getShowrooms();
    const clientes = DB.getClientes();
    const pedidos = DB.getPedidos();
    const facturas = DB.getFacturas();

    const resultados = [];

    showrooms.filter(s => s.nombre.toLowerCase().includes(query)).forEach(s => {
        resultados.push({ tipo: 'Showroom', nombre: s.nombre, detalle: `${s.comision}%`, tab: 'showrooms' });
    });

    clientes.filter(c => c.nombre.toLowerCase().includes(query)).forEach(c => {
        const show = showrooms.find(s => s.id === c.showroomId);
        resultados.push({ tipo: 'Cliente', nombre: c.nombre, detalle: show ? show.nombre : '', tab: 'clientes' });
    });

    pedidos.filter(p => p.numero.toLowerCase().includes(query)).forEach(p => {
        const cli = clientes.find(c => c.id === p.clienteId);
        resultados.push({ tipo: 'Pedido', nombre: p.numero, detalle: `${cli ? cli.nombre : ''} - ${formatCurrency(p.importe, p.moneda)}`, tab: 'pedidos' });
    });

    facturas.filter(f => f.numero.toLowerCase().includes(query)).forEach(f => {
        const cli = clientes.find(c => c.id === f.clienteId);
        resultados.push({ tipo: 'Factura', nombre: f.numero, detalle: `${cli ? cli.nombre : ''} - ${formatCurrency(f.importe, f.moneda)}`, tab: 'facturas' });
    });

    if (resultados.length === 0) {
        container.innerHTML = '<div class="card" style="margin-top: 8px; padding: 16px; color: var(--gray-500);">Sin resultados</div>';
    } else {
        let html = '<div class="card" style="margin-top: 8px; padding: 0;">';
        html += '<table><thead><tr><th>Tipo</th><th>Nombre / Número</th><th>Detalle</th><th></th></tr></thead><tbody>';
        resultados.slice(0, 20).forEach(r => {
            html += `<tr>
                <td><span class="badge badge-info">${r.tipo}</span></td>
                <td><strong>${r.nombre}</strong></td>
                <td>${r.detalle}</td>
                <td><button class="btn btn-secondary btn-icon" onclick="switchTab('${r.tab}'); document.getElementById('busquedaGlobal').value=''; document.getElementById('resultadosBusqueda').style.display='none';">Ir</button></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        container.innerHTML = html;
    }

    container.style.display = 'block';
}

// ========================================
// COMISIONES PROYECTADAS (DASHBOARD)
// ========================================

function cargarComisionesProyectadas() {
    const facturas = DB.getFacturas().filter(f => !f.esAbono);
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const cobros = DB.getCobros();

    const proyeccion = {};

    facturas.forEach(factura => {
        const estado = calcularEstadoFactura(factura.id);
        if (estado.porcentaje >= 100) return; // Ya cobrada

        const cliente = clientes.find(c => c.id === factura.clienteId);
        if (!cliente) return;
        const showroom = showrooms.find(s => s.id === cliente.showroomId);
        if (!showroom) return;

        const moneda = factura.moneda || 'EUR';
        const key = `${showroom.id}_${moneda}`;

        if (!proyeccion[key]) {
            proyeccion[key] = { showroom: showroom.nombre, moneda, pendiente: 0, comisionEstimada: 0 };
        }

        const pendiente = factura.importe - estado.cobrado;
        proyeccion[key].pendiente += pendiente;
        proyeccion[key].comisionEstimada += redondear2(factura.importe * showroom.comision / 100);
    });

    const container = document.getElementById('comisionesProyectadasContainer');
    const items = Object.values(proyeccion);

    if (items.length === 0) {
        container.innerHTML = '<p style="color: var(--gray-500); padding: 12px;">No hay facturas pendientes de cobro.</p>';
        return;
    }

    let html = '<table><thead><tr><th>Showroom</th><th>Moneda</th><th>Facturado Pendiente</th><th>Comisión Estimada</th></tr></thead><tbody>';
    items.forEach(item => {
        html += `<tr>
            <td><strong>${item.showroom}</strong></td>
            <td>${item.moneda}</td>
            <td>${formatCurrency(item.pendiente, item.moneda)}</td>
            <td>${formatCurrency(item.comisionEstimada, item.moneda)}</td>
        </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ========================================
// INFORME DE ANTIGÜEDAD DE DEUDA
// ========================================

function cargarAgingReport() {
    const facturas = DB.getFacturas().filter(f => !f.esAbono);
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();
    const hoy = new Date();

    const tramos = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
    const totales = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };

    facturas.forEach(factura => {
        const estado = calcularEstadoFactura(factura.id);
        if (estado.porcentaje >= 100) return;

        const vencimiento = new Date(factura.vencimiento || factura.fechaVencimiento);
        const diasVencida = Math.floor((hoy - vencimiento) / (1000 * 60 * 60 * 24));

        if (diasVencida < 0) return; // No vencida aún

        const pendiente = factura.importe - estado.cobrado;
        const cliente = clientes.find(c => c.id === factura.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;

        const item = {
            factura: factura.numero,
            cliente: cliente ? cliente.nombre : '-',
            showroom: showroom ? showroom.nombre : '-',
            pendiente,
            moneda: factura.moneda || 'EUR',
            diasVencida
        };

        if (diasVencida <= 30) { tramos['0-30'].push(item); totales['0-30'] += pendiente; }
        else if (diasVencida <= 60) { tramos['31-60'].push(item); totales['31-60'] += pendiente; }
        else if (diasVencida <= 90) { tramos['61-90'].push(item); totales['61-90'] += pendiente; }
        else { tramos['90+'].push(item); totales['90+'] += pendiente; }
    });

    const container = document.getElementById('agingReportContainer');
    const totalFacturas = Object.values(tramos).reduce((sum, arr) => sum + arr.length, 0);

    if (totalFacturas === 0) {
        container.innerHTML = '<p style="color: var(--gray-500); padding: 12px;">No hay facturas vencidas pendientes.</p>';
        return;
    }

    // Agrupar totales por moneda para cada tramo
    const totalesPorMoneda = {};
    Object.entries(tramos).forEach(([tramo, items]) => {
        totalesPorMoneda[tramo] = {};
        items.forEach(item => {
            const mon = item.moneda || 'EUR';
            totalesPorMoneda[tramo][mon] = (totalesPorMoneda[tramo][mon] || 0) + item.pendiente;
        });
    });

    let html = '<div class="stats-grid" style="margin-bottom: 16px;">';
    const colores = { '0-30': 'var(--warning)', '31-60': '#ea580c', '61-90': '#dc2626', '90+': '#991b1b' };
    Object.entries(tramos).forEach(([tramo, items]) => {
        const totalesMon = Object.entries(totalesPorMoneda[tramo]);
        const totalStr = totalesMon.map(([mon, val]) => formatCurrency(val, mon)).join(' + ');
        html += `<div class="stat-card" style="border-left-color: ${colores[tramo]};">
            <div class="stat-label">${tramo} d&iacute;as</div>
            <div class="stat-value" style="font-size: ${totalesMon.length > 1 ? '16px' : '24px'};">${totalStr}</div>
            <div style="font-size: 12px; color: var(--gray-500); margin-top: 4px;">${items.length} factura(s)</div>
        </div>`;
    });
    html += '</div>';

    html += '<table><thead><tr><th>Tramo</th><th>Factura</th><th>Cliente</th><th>Showroom</th><th>Pendiente</th><th>Días Vencida</th></tr></thead><tbody>';
    Object.entries(tramos).forEach(([tramo, items]) => {
        items.sort((a, b) => b.diasVencida - a.diasVencida).forEach(item => {
            const badgeClass = tramo === '90+' ? 'danger' : tramo === '61-90' ? 'danger' : tramo === '31-60' ? 'warning' : 'info';
            html += `<tr>
                <td><span class="badge badge-${badgeClass}">${tramo}d</span></td>
                <td><strong>${item.factura}</strong></td>
                <td>${item.cliente}</td>
                <td>${item.showroom}</td>
                <td>${formatCurrency(item.pendiente, item.moneda)}</td>
                <td>${item.diasVencida} días</td>
            </tr>`;
        });
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ========================================
// COMPARATIVA ENTRE PERIODOS
// ========================================

function calcularFacturacionPeriodo(fechaInicio, fechaFin) {
    const facturas = DB.getFacturas().filter(f => !f.esAbono && f.fecha >= fechaInicio && f.fecha <= fechaFin);
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();

    const porShowroom = {};
    let totalEUR = 0;

    facturas.forEach(f => {
        const cliente = clientes.find(c => c.id === f.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        const nombre = showroom ? showroom.nombre : 'Sin showroom';

        if (!porShowroom[nombre]) porShowroom[nombre] = { facturado: 0, numFacturas: 0 };
        porShowroom[nombre].facturado += f.importe;
        porShowroom[nombre].numFacturas++;
        totalEUR += f.importe;
    });

    return { porShowroom, total: totalEUR, numFacturas: facturas.length };
}

function generarComparativa() {
    const inicio1 = document.getElementById('cmpInicio1').value;
    const fin1 = document.getElementById('cmpFin1').value;
    const inicio2 = document.getElementById('cmpInicio2').value;
    const fin2 = document.getElementById('cmpFin2').value;

    if (!inicio1 || !fin1 || !inicio2 || !fin2) {
        alert('Por favor selecciona ambos periodos completos');
        return;
    }

    const p1 = calcularFacturacionPeriodo(inicio1, fin1);
    const p2 = calcularFacturacionPeriodo(inicio2, fin2);

    const allShowrooms = new Set([...Object.keys(p1.porShowroom), ...Object.keys(p2.porShowroom)]);

    let html = '<table><thead><tr><th>Showroom</th><th>Periodo 1</th><th>Periodo 2</th><th>Diferencia</th><th>Variación</th></tr></thead><tbody>';

    allShowrooms.forEach(nombre => {
        const v1 = (p1.porShowroom[nombre] || { facturado: 0 }).facturado;
        const v2 = (p2.porShowroom[nombre] || { facturado: 0 }).facturado;
        const diff = v2 - v1;
        const pct = v1 > 0 ? ((diff / v1) * 100).toFixed(1) : (v2 > 0 ? '+100' : '0');
        const badge = diff > 0 ? 'success' : diff < 0 ? 'danger' : 'info';

        html += `<tr>
            <td><strong>${nombre}</strong></td>
            <td>${formatCurrency(v1, 'EUR')}</td>
            <td>${formatCurrency(v2, 'EUR')}</td>
            <td>${formatCurrency(diff, 'EUR')}</td>
            <td><span class="badge badge-${badge}">${diff >= 0 ? '+' : ''}${pct}%</span></td>
        </tr>`;
    });

    const totalDiff = p2.total - p1.total;
    const totalPct = p1.total > 0 ? ((totalDiff / p1.total) * 100).toFixed(1) : '0';
    html += `<tr style="font-weight: bold; border-top: 2px solid var(--gray-300);">
        <td>TOTAL</td>
        <td>${formatCurrency(p1.total, 'EUR')} (${p1.numFacturas} fact.)</td>
        <td>${formatCurrency(p2.total, 'EUR')} (${p2.numFacturas} fact.)</td>
        <td>${formatCurrency(totalDiff, 'EUR')}</td>
        <td><span class="badge badge-${totalDiff >= 0 ? 'success' : 'danger'}">${totalDiff >= 0 ? '+' : ''}${totalPct}%</span></td>
    </tr>`;

    html += '</tbody></table>';
    document.getElementById('comparativaResultado').innerHTML = html;
}

// ========================================
// EXTRACTO POR CLIENTE
// ========================================

function cargarSelectExtractoClientes() {
    const clientes = DB.getClientes();
    const select = document.getElementById('extCliente');
    select.innerHTML = '<option value="">Seleccionar cliente...</option>';
    clientes.forEach(c => { select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`; });
}

function generarExtractoCliente() {
    const clienteId = document.getElementById('extCliente').value;
    if (!clienteId) { alert('Selecciona un cliente'); return; }

    const cliente = DB.getClientes().find(c => c.id === clienteId);
    const showroom = DB.getShowrooms().find(s => s.id === cliente.showroomId);
    const pedidos = DB.getPedidos().filter(p => p.clienteId === clienteId).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const facturas = DB.getFacturas().filter(f => f.clienteId === clienteId).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const cobros = DB.getCobros();

    let html = `<div class="card" style="margin-bottom: 0;">
        <h4 style="color: var(--primary); margin-bottom: 16px;">Extracto: ${cliente.nombre}</h4>
        <div style="margin-bottom: 16px;">
            <strong>Showroom:</strong> ${showroom ? showroom.nombre : '-'} |
            <strong>Pedidos:</strong> ${pedidos.length} |
            <strong>Facturas:</strong> ${facturas.length}
        </div>`;

    if (pedidos.length > 0) {
        html += '<h4 style="margin: 16px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500);">Pedidos</h4>';
        html += '<table><thead><tr><th>Número</th><th>Fecha</th><th>Importe</th></tr></thead><tbody>';
        pedidos.forEach(p => {
            html += `<tr><td><strong>${p.numero}</strong></td><td>${formatDate(p.fecha)}</td><td>${formatCurrency(p.importe, p.moneda)}</td></tr>`;
        });
        html += '</tbody></table>';
    }

    if (facturas.length > 0) {
        html += '<h4 style="margin: 16px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500);">Facturas y Cobros</h4>';
        html += '<table><thead><tr><th>Factura</th><th>Tipo</th><th>Fecha</th><th>Importe</th><th>Cobrado</th><th>Estado</th></tr></thead><tbody>';
        facturas.forEach(f => {
            const estado = calcularEstadoFactura(f.id);
            const badge = estado.porcentaje >= 100 ? 'success' : estado.porcentaje > 0 ? 'warning' : 'danger';
            const tipoLabel = f.esAbono ? 'Abono' : 'Factura';
            html += `<tr>
                <td><strong>${f.numero}</strong></td>
                <td>${tipoLabel}</td>
                <td>${formatDate(f.fecha)}</td>
                <td>${formatCurrency(f.importe, f.moneda)}</td>
                <td>${f.esAbono ? '-' : formatCurrency(estado.cobrado, f.moneda)}</td>
                <td><span class="badge badge-${badge}">${estado.porcentaje >= 100 ? 'Cobrada' : estado.porcentaje > 0 ? estado.porcentaje.toFixed(0) + '%' : 'Pendiente'}</span></td>
            </tr>`;

            if (!f.esAbono) {
                const cobrosF = cobros.filter(c => c.facturaId === f.id).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                cobrosF.forEach(c => {
                    html += `<tr style="background: var(--gray-50); font-size: 12px;">
                        <td colspan="2" style="padding-left: 30px;">${c.pedidoId ? 'Anticipo' : 'Cobro'}</td>
                        <td>${formatDate(c.fecha)}</td>
                        <td>${formatCurrency(c.importe, c.moneda)}</td>
                        <td colspan="2"></td>
                    </tr>`;
                });
            }
        });

        // Totales
        const totalFacturado = facturas.filter(f => !f.esAbono).reduce((sum, f) => sum + f.importe, 0);
        const totalAbonos = facturas.filter(f => f.esAbono).reduce((sum, f) => sum + f.importe, 0);
        const totalCobrado = facturas.filter(f => !f.esAbono).reduce((sum, f) => sum + calcularEstadoFactura(f.id).cobrado, 0);

        html += `<tr style="font-weight: bold; border-top: 2px solid var(--gray-300);">
            <td colspan="3">TOTAL</td>
            <td>${formatCurrency(totalFacturado + totalAbonos, 'EUR')}</td>
            <td>${formatCurrency(totalCobrado, 'EUR')}</td>
            <td>${formatCurrency(totalFacturado + totalAbonos - totalCobrado, 'EUR')} pend.</td>
        </tr>`;
        html += '</tbody></table>';
    }

    html += '</div>';
    document.getElementById('extractoResultado').innerHTML = html;
}

// ========================================
// SISTEMA DE ORDENACIÓN DE TABLAS
// ========================================

let sortState = {};

function ordenarTabla(tableBodyId, columna, tipo) {
    const key = tableBodyId + '_' + columna;
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    // Toggle direction
    if (sortState[tableBodyId] === key + '_asc') {
        sortState[tableBodyId] = key + '_desc';
    } else {
        sortState[tableBodyId] = key + '_asc';
    }
    const asc = sortState[tableBodyId].endsWith('_asc');

    // Update header styles
    const table = tbody.closest('table');
    table.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });
    const headers = table.querySelectorAll('th.sortable');
    headers.forEach(th => {
        if (th.getAttribute('data-col') === columna) {
            th.classList.add(asc ? 'sort-asc' : 'sort-desc');
        }
    });

    // Get rows (skip detail rows for facturas)
    const rows = Array.from(tbody.querySelectorAll('tr[data-sort-key]'));

    rows.sort((a, b) => {
        let va = a.getAttribute('data-sort-' + columna) || '';
        let vb = b.getAttribute('data-sort-' + columna) || '';

        if (tipo === 'number') {
            va = parseFloat(va) || 0;
            vb = parseFloat(vb) || 0;
        } else if (tipo === 'date') {
            va = va || '0000-00-00';
            vb = vb || '0000-00-00';
        } else {
            va = va.toLowerCase();
            vb = vb.toLowerCase();
        }

        if (va < vb) return asc ? -1 : 1;
        if (va > vb) return asc ? 1 : -1;
        return 0;
    });

    // Reorder DOM
    rows.forEach(row => {
        // For facturas, also move the detail row
        const detailRow = row.nextElementSibling;
        tbody.appendChild(row);
        if (detailRow && detailRow.id && detailRow.id.startsWith('detalle-')) {
            tbody.appendChild(detailRow);
        }
    });
}

// ========================================
// EXPORTAR PEDIDOS
// ========================================

function exportarPedidos() {
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();

    if (pedidos.length === 0) {
        alert('No hay pedidos para exportar');
        return;
    }

    const data = [['Número', 'Cliente', 'Showroom', 'Fecha', 'Moneda', 'Importe']];
    pedidos.forEach(p => {
        const cliente = clientes.find(c => c.id === p.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        data.push([p.numero, cliente ? cliente.nombre : '', showroom ? showroom.nombre : '', p.fecha, p.moneda, p.importe]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, 'Pedidos_Charo_Ruiz.xlsx');
}

// ========================================
// KPIs FINANCIEROS AVANZADOS
// ========================================

function cargarKPIs() {
    const facturas = DB.getFacturas().filter(f => !f.esAbono);
    const cobros = DB.getCobros();
    const showrooms = DB.getShowrooms();
    const clientes = DB.getClientes();

    // DSO (Days Sales Outstanding) - Promedio de días de cobro
    let totalDias = 0;
    let facturasConCobro = 0;

    facturas.forEach(f => {
        const estado = calcularEstadoFactura(f.id);
        if (estado.porcentaje >= 100) {
            const cobrosF = cobros.filter(c => c.facturaId === f.id);
            if (cobrosF.length > 0) {
                const ultimoCobro = cobrosF.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
                const dias = Math.floor((new Date(ultimoCobro.fecha) - new Date(f.fecha)) / (1000 * 60 * 60 * 24));
                if (dias >= 0) {
                    totalDias += dias;
                    facturasConCobro++;
                }
            }
        }
    });

    const dso = facturasConCobro > 0 ? Math.round(totalDias / facturasConCobro) : 0;

    // Tasa de cobro global
    const totalFacturado = facturas.reduce((sum, f) => sum + f.importe, 0);
    const totalCobrado = facturas.reduce((sum, f) => sum + calcularEstadoFactura(f.id).cobrado, 0);
    const tasaCobro = totalFacturado > 0 ? ((totalCobrado / totalFacturado) * 100).toFixed(1) : 0;

    // Tasa cobro por showroom
    const tasaPorShowroom = {};
    showrooms.forEach(s => {
        const clienteIds = new Set(clientes.filter(c => c.showroomId === s.id).map(c => c.id));
        const facShow = facturas.filter(f => clienteIds.has(f.clienteId));
        const facturadoShow = facShow.reduce((sum, f) => sum + f.importe, 0);
        const cobradoShow = facShow.reduce((sum, f) => sum + calcularEstadoFactura(f.id).cobrado, 0);
        if (facturadoShow > 0) {
            tasaPorShowroom[s.nombre] = ((cobradoShow / facturadoShow) * 100).toFixed(1);
        }
    });

    // Render KPI cards
    const statsGrid = document.getElementById('statsGrid');
    const kpiHTML = `
        <div class="stat-card" style="border-left-color: var(--accent);">
            <div class="stat-label">DSO (D&iacute;as Promedio Cobro)</div>
            <div class="stat-value">${dso}d</div>
        </div>
        <div class="stat-card" style="border-left-color: var(--gold);">
            <div class="stat-label">Tasa de Cobro</div>
            <div class="stat-value" style="color: ${parseFloat(tasaCobro) >= 80 ? 'var(--success)' : parseFloat(tasaCobro) >= 50 ? 'var(--warning)' : 'var(--danger)'};">${tasaCobro}%</div>
        </div>
    `;
    statsGrid.innerHTML += kpiHTML;
}

// ========================================
// ALERTAS DE VENCIMIENTO PRÓXIMO
// ========================================

function cargarAlertasVencimiento() {
    const facturas = DB.getFacturas().filter(f => !f.esAbono);
    const clientes = DB.getClientes();
    const hoy = new Date();
    const en7dias = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);

    const proximasVencer = [];
    facturas.forEach(f => {
        const estado = calcularEstadoFactura(f.id);
        if (estado.porcentaje >= 100) return;

        const venc = new Date(f.vencimiento || f.fechaVencimiento);
        if (venc >= hoy && venc <= en7dias) {
            const cliente = clientes.find(c => c.id === f.clienteId);
            const diasRestantes = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
            proximasVencer.push({
                numero: f.numero,
                cliente: cliente ? cliente.nombre : '-',
                importe: formatCurrency(estado.pendiente, f.moneda),
                dias: diasRestantes
            });
        }
    });

    const container = document.getElementById('alertasVencimiento');
    if (!container) return;

    if (proximasVencer.length === 0) {
        container.style.display = 'none';
        return;
    }

    let html = `<div class="alert alert-warning visible" style="display: block; margin-bottom: 20px;">
        <strong>Facturas por vencer en los pr&oacute;ximos 7 d&iacute;as (${proximasVencer.length}):</strong>
        <ul style="margin: 8px 0 0 20px; list-style: disc;">`;
    proximasVencer.forEach(f => {
        html += `<li>${f.numero} - ${f.cliente} - ${f.importe} (${f.dias === 0 ? 'HOY' : f.dias === 1 ? 'manana' : f.dias + ' dias'})</li>`;
    });
    html += '</ul></div>';
    container.innerHTML = html;
    container.style.display = 'block';
}

// ========================================
// AUTO-BACKUP (localStorage snapshot)
// ========================================

let operationCount = 0;

function autoBackup() {
    operationCount++;
    if (operationCount % 10 === 0) { // Each 10 operations
        const backup = {
            timestamp: new Date().toISOString(),
            showrooms: DB.getShowrooms(),
            clientes: DB.getClientes(),
            pedidos: DB.getPedidos(),
            facturas: DB.getFacturas(),
            cobros: DB.getCobros()
        };
        try {
            localStorage.setItem('autoBackup', JSON.stringify(backup));
        } catch(e) {
            // localStorage full, silently fail
        }
    }
}

function restaurarAutoBackup() {
    const backup = localStorage.getItem('autoBackup');
    if (!backup) {
        alert('No hay copia de seguridad automatica disponible');
        return;
    }
    const data = JSON.parse(backup);
    const fecha = new Date(data.timestamp).toLocaleString('es-ES');
    if (!confirm(`Restaurar desde el auto-backup del ${fecha}?\n\nEsto reemplazara todos los datos actuales.`)) return;

    DB.setShowrooms(data.showrooms || []);
    DB.setClientes(data.clientes || []);
    DB.setPedidos(data.pedidos || []);
    DB.setFacturas(data.facturas || []);
    DB.setCobros(data.cobros || []);

    alert('Datos restaurados correctamente');
    location.reload();
}

// Hook into DB setters for auto-backup
const originalSet = DB.set;
DB.set = function(key, data) {
    originalSet(key, data);
    autoBackup();
};

// Also auto-backup on page unload
window.addEventListener('beforeunload', function() {
    const backup = {
        timestamp: new Date().toISOString(),
        showrooms: DB.getShowrooms(),
        clientes: DB.getClientes(),
        pedidos: DB.getPedidos(),
        facturas: DB.getFacturas(),
        cobros: DB.getCobros()
    };
    try {
        localStorage.setItem('autoBackup', JSON.stringify(backup));
    } catch(e) { /* ignore */ }
});


// ========================================
// MODULO: HILLDUN CREDITO
// ========================================

function cargarTablaHilldun() {
    const solicitudes = DB.getSolicitudesCredito();
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();

    // Stats
    const total = solicitudes.length;
    const pendientes = solicitudes.filter(s => s.estado === 'pendiente').length;
    const enviadas = solicitudes.filter(s => s.estado === 'enviada').length;
    const aprobadas = solicitudes.filter(s => s.estado === 'aprobada').length;
    const rechazadas = solicitudes.filter(s => s.estado === 'rechazada').length;

    const statsEl = document.getElementById('hilldunStats');
    statsEl.innerHTML = `
        <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">${total}</div></div>
        <div class="stat-card"><div class="stat-label">Pendientes</div><div class="stat-value" style="color:var(--warning)">${pendientes}</div></div>
        <div class="stat-card"><div class="stat-label">Enviadas</div><div class="stat-value" style="color:var(--primary)">${enviadas}</div></div>
        <div class="stat-card"><div class="stat-label">Aprobadas</div><div class="stat-value" style="color:var(--success)">${aprobadas}</div></div>
        <div class="stat-card"><div class="stat-label">Rechazadas</div><div class="stat-value" style="color:var(--danger)">${rechazadas}</div></div>
    `;

    // Filtrar
    const busqueda = (document.getElementById('buscarSolicitud').value || '').toLowerCase();
    const filtroEstado = document.getElementById('filtroEstadoSolicitud').value;

    let filtradas = solicitudes;
    if (filtroEstado) filtradas = filtradas.filter(s => s.estado === filtroEstado);
    if (busqueda) {
        filtradas = filtradas.filter(s => {
            const pedido = pedidos.find(p => p.id === s.pedidoId);
            const cliente = clientes.find(c => c.id === s.clienteId);
            const texto = [pedido?.numero, cliente?.nombre, s.referencia, s.notas].join(' ').toLowerCase();
            return texto.includes(busqueda);
        });
    }

    const container = document.getElementById('hilldunTable');
    if (filtradas.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">H</div><p>No hay solicitudes de credito</p></div>';
        return;
    }

    let html = '<table><thead><tr><th>Pedido</th><th>Cliente</th><th>Showroom</th><th>Importe</th><th>Fecha</th><th>Estado</th><th>Referencia</th><th>Acciones</th></tr></thead><tbody>';

    filtradas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(sol => {
        const pedido = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;

        const badges = { pendiente: 'warning', enviada: 'primary', aprobada: 'success', rechazada: 'danger' };
        const badge = badges[sol.estado] || 'secondary';

        html += `<tr>
            <td><strong>${pedido ? pedido.numero : '-'}</strong></td>
            <td>${cliente ? cliente.nombre : '-'}</td>
            <td>${showroom ? showroom.nombre : '-'}</td>
            <td>${formatCurrency(sol.importePedido || 0, sol.moneda || 'EUR')}</td>
            <td>${formatDate(sol.fecha)}</td>
            <td><span class="badge badge-${badge}">${sol.estado}</span></td>
            <td>${sol.referencia || '-'}</td>
            <td><div class="actions">
                <button class="btn btn-secondary btn-icon" onclick="modalSolicitudCredito('${sol.id}')" title="Editar">E</button>
                <button class="btn btn-danger btn-icon" onclick="eliminarSolicitudCredito('${sol.id}')" title="Eliminar">X</button>
            </div></td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Attach filter events
    document.getElementById('buscarSolicitud').onkeyup = cargarTablaHilldun;
    document.getElementById('filtroEstadoSolicitud').onchange = cargarTablaHilldun;
}

function modalSolicitudCredito(id = null) {
    const modal = document.getElementById('modalSolicitudCredito');
    const title = document.getElementById('modalSolicitudCreditoTitle');

    // Cargar pedidos
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const select = document.getElementById('solPedido');
    select.innerHTML = '<option value="">Seleccionar pedido...</option>';
    pedidos.forEach(p => {
        const cliente = clientes.find(c => c.id === p.clienteId);
        select.innerHTML += `<option value="${p.id}">${p.numero} - ${cliente ? cliente.nombre : '?'} (${formatCurrency(p.importe, p.moneda)})</option>`;
    });

    if (id) {
        const solicitudes = DB.getSolicitudesCredito();
        const sol = solicitudes.find(s => s.id === id);

        title.textContent = 'Editar Solicitud de Credito';
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
        title.textContent = 'Nueva Solicitud de Credito';
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

function cargarInfoPedidoSolicitud() {
    const pedidoId = document.getElementById('solPedido').value;
    if (!pedidoId) {
        document.getElementById('infoPedidoSolicitud').style.display = 'none';
        return;
    }

    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const showrooms = DB.getShowrooms();

    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const cliente = clientes.find(c => c.id === pedido.clienteId);
    const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;

    document.getElementById('infSolCliente').textContent = cliente ? cliente.nombre : '-';
    document.getElementById('infSolShowroom').textContent = showroom ? showroom.nombre : '-';

    const anticipoPct = getAnticipoPct(pedido);
    if (anticipoPct > 0) {
        const importeCredito = getImporteCredito(pedido);
        document.getElementById('infSolImporte').innerHTML = `${formatCurrency(pedido.importe, pedido.moneda)} <small style="color:var(--text-secondary)">(${getCondicionesLabel(pedido)} → credito: <strong style="color:var(--primary)">${formatCurrency(importeCredito, pedido.moneda)}</strong>)</small>`;
    } else {
        document.getElementById('infSolImporte').textContent = formatCurrency(pedido.importe, pedido.moneda);
    }
    document.getElementById('infoPedidoSolicitud').style.display = 'block';
}

function toggleCamposRespuesta() {
    const estado = document.getElementById('solEstado').value;
    const campos = document.getElementById('camposRespuesta');
    campos.style.display = (estado === 'aprobada' || estado === 'rechazada') ? 'block' : 'none';
}

function guardarSolicitudCredito() {
    const pedidoId = document.getElementById('solPedido').value;
    const fecha = document.getElementById('solFecha').value;
    const estado = document.getElementById('solEstado').value;

    if (!pedidoId || !fecha) {
        alert('Selecciona un pedido y una fecha');
        return;
    }

    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const pedido = pedidos.find(p => p.id === pedidoId);
    const cliente = pedido ? clientes.find(c => c.id === pedido.clienteId) : null;

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
            pedidoId, clienteId: cliente ? cliente.id : '', fecha, estado,
            importePedido: pedido ? pedido.importe : 0, moneda: pedido ? pedido.moneda : 'EUR',
            deliveryStartDate, deliveryEndDate, poNumber,
            referencia, fechaRespuesta, limiteCredito, condiciones, notas
        };
    } else {
        solicitudes.push({
            id: generarId(), pedidoId, clienteId: cliente ? cliente.id : '', fecha, estado,
            importePedido: pedido ? pedido.importe : 0, moneda: pedido ? pedido.moneda : 'EUR',
            deliveryStartDate, deliveryEndDate, poNumber,
            referencia, fechaRespuesta, limiteCredito, condiciones, notas,
            fechaCreacion: new Date().toISOString()
        });
    }

    DB.setSolicitudesCredito(solicitudes);
    cerrarModal('modalSolicitudCredito');
    cargarTablaHilldun();
    showAlert('hilldunAlert', `Solicitud ${editandoId ? 'actualizada' : 'creada'} correctamente`, 'success');
}

function eliminarSolicitudCredito(id) {
    if (!confirm('Eliminar esta solicitud de credito?')) return;
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

    if (solicitudes.length === 0) { alert('No hay solicitudes para exportar'); return; }

    const wb = XLSX.utils.book_new();
    const data = [['Pedido', 'Cliente', 'Showroom', 'Importe', 'Moneda', 'Fecha', 'Estado', 'Referencia', 'Limite Credito', 'Condiciones', 'Notas']];

    solicitudes.forEach(sol => {
        const pedido = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const showroom = cliente ? showrooms.find(s => s.id === cliente.showroomId) : null;
        data.push([
            pedido ? pedido.numero : '', cliente ? cliente.nombre : '', showroom ? showroom.nombre : '',
            sol.importePedido || 0, sol.moneda || 'EUR', sol.fecha, sol.estado,
            sol.referencia || '', sol.limiteCredito || '', sol.condiciones || '', sol.notas || ''
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitudes Credito');
    XLSX.writeFile(wb, `Solicitudes_Credito_Hilldun_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ========================================
// HILLDUN - SOLICITAR CREDITO DESDE PEDIDO
// ========================================

function solicitarCreditoDesdePedido(pedidoId) {
    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const pedido = pedidos.find(p => p.id === pedidoId);
    if (!pedido) return;

    const cliente = clientes.find(c => c.id === pedido.clienteId);

    // Check if config exists
    const config = DB.getHilldunConfig();
    const hasConfig = config.clientCodeEUR || config.clientCodeUSD;

    // Check if client has address data
    const hasAddress = cliente && cliente.address1 && cliente.phone;

    // Warn if missing data
    if (!hasConfig || !hasAddress) {
        let warnings = [];
        if (!hasConfig) warnings.push('- No hay Client Code de Hilldun configurado (pestana Hilldun > Configuracion)');
        if (!hasAddress) warnings.push(`- El cliente "${cliente ? cliente.nombre : '?'}" no tiene datos de facturacion completos (editar cliente > Datos Facturacion)`);
        if (!confirm('Faltan datos para enviar a Hilldun:\n\n' + warnings.join('\n') + '\n\nCrear la solicitud de todas formas?')) return;
    }

    // Calculate credit amount based on payment terms
    const importeCredito = getImporteCredito(pedido);
    const importeAnticipo = getImporteAnticipo(pedido);
    const anticipoPct = getAnticipoPct(pedido);
    const netDays = getNetDays(pedido);

    // Create solicitud
    const hoy = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + netDays);
    const fin = endDate.toISOString().split('T')[0];

    const solicitudes = DB.getSolicitudesCredito();
    const nuevaSolicitud = {
        id: generarId(),
        pedidoId: pedido.id,
        clienteId: pedido.clienteId,
        fecha: hoy,
        estado: 'pendiente',
        importePedido: pedido.importe,
        importeCredito: importeCredito,
        importeAnticipo: importeAnticipo,
        anticipoPct: anticipoPct,
        moneda: pedido.moneda,
        deliveryStartDate: hoy,
        deliveryEndDate: fin,
        poNumber: '',
        referencia: '',
        fechaRespuesta: '',
        limiteCredito: 0,
        condiciones: '',
        notas: '',
        fechaCreacion: new Date().toISOString()
    };

    solicitudes.push(nuevaSolicitud);
    DB.setSolicitudesCredito(solicitudes);

    // Confirm message with breakdown
    let confirmMsg = `Solicitud creada para pedido ${pedido.numero}.`;
    if (anticipoPct > 0) {
        confirmMsg += `\n\nImporte total: ${formatCurrency(pedido.importe, pedido.moneda)}`;
        confirmMsg += `\nAnticipo (${anticipoPct}%): ${formatCurrency(importeAnticipo, pedido.moneda)}`;
        confirmMsg += `\nA credito Hilldun: ${formatCurrency(importeCredito, pedido.moneda)}`;
    }

    // Ask if user wants to generate CSV now
    if (hasConfig && hasAddress) {
        if (confirm(confirmMsg + '\n\nGenerar y descargar el CSV para Hilldun ahora?')) {
            generarCSVCreditRequestsParaPedido(nuevaSolicitud.id);
        }
    }

    cargarTablaPedidos();
    showAlert('pedidosAlert', `Solicitud de credito creada para ${pedido.numero}`, 'success');
}

function generarCSVCreditRequestsParaPedido(solicitudId) {
    const config = DB.getHilldunConfig();
    const solicitudes = DB.getSolicitudesCredito();
    const sol = solicitudes.find(s => s.id === solicitudId);
    if (!sol) return;

    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();
    const pedido = pedidos.find(p => p.id === sol.pedidoId);
    const cliente = clientes.find(c => c.id === sol.clienteId);
    const moneda = sol.moneda || 'EUR';

    const header = [
        "Hilldun's Client Code", 'ClientOrderNumber', 'PO Number', 'PO Amount',
        'PO Date', 'DeliveryStartDate', 'DeliveryEndDate', 'TermsCode',
        'TermsDescription', 'NetDays', 'CustomerCode', 'CustomerName',
        'BillToAddress1', 'BillToAddress2', 'BillToCity', 'BillToState',
        'BillToZip', 'BillToCountry', 'BillToContact', 'BillToPhone',
        'BillToEmailAddress', 'BillToRegistration', 'Count', 'Total',
        'Currency', 'BatchID'
    ];

    // Use credit amount (importeCredito) if available, otherwise fall back to importePedido
    const importeParaHilldun = sol.importeCredito != null ? sol.importeCredito : (sol.importePedido || 0);

    const batchId = generarBatchId();
    const row = [
        getHilldunClientCode(moneda),
        pedido ? pedido.numero : '', sol.poNumber || (pedido ? pedido.numero : ''),
        Math.round(importeParaHilldun),
        formatDateHilldun(pedido ? pedido.fecha : sol.fecha),
        formatDateHilldun(sol.deliveryStartDate || sol.fecha),
        formatDateHilldun(sol.deliveryEndDate || ''),
        config.termsCode || '', config.termsDesc || '', config.netDays || 30,
        cliente ? (cliente.customerCode || '') : '', cliente ? cliente.nombre : '',
        cliente ? (cliente.address1 || '') : '', cliente ? (cliente.address2 || '') : '',
        cliente ? (cliente.city || '') : '', cliente ? (cliente.state || '') : '',
        cliente ? (cliente.zip || '') : '', cliente ? (cliente.country || '') : '',
        cliente ? (cliente.contact || '') : '', cliente ? (cliente.phone || '') : '',
        cliente ? (cliente.email || '') : '', cliente ? (cliente.vatRegistration || '') : '',
        1, importeParaHilldun, moneda, batchId
    ];

    const csvLines = [header.map(escapeCsvField).join(','), row.map(escapeCsvField).join(',')];
    const primaryCode = config.clientCodeEUR || config.clientCodeUSD || 'XXXX';
    const filename = `${batchId}-${primaryCode}-CreditRequest-${pedido ? pedido.numero : 'NEW'}.csv`;
    downloadCsv(filename, csvLines.join('\r\n'));

    // Mark as enviada
    const idx = solicitudes.findIndex(s => s.id === solicitudId);
    if (idx !== -1) {
        solicitudes[idx].estado = 'enviada';
        solicitudes[idx].batchId = batchId;
        DB.setSolicitudesCredito(solicitudes);
    }
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
    return `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
}

function getHilldunClientCode(moneda) {
    const config = DB.getHilldunConfig();
    return moneda === 'USD' ? (config.clientCodeUSD || config.clientCodeEUR || '') : (config.clientCodeEUR || '');
}

function escapeCsvField(value) {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
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
    const totalAmount = solicitudes.reduce((sum, s) => sum + (s.importeCredito != null ? s.importeCredito : (s.importePedido || 0)), 0);
    const count = solicitudes.length;
    const warnings = [];

    const rows = solicitudes.map(sol => {
        const pedido = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const moneda = sol.moneda || (pedido ? pedido.moneda : 'EUR');
        const importeParaHilldun = sol.importeCredito != null ? sol.importeCredito : (sol.importePedido || (pedido ? pedido.importe : 0));

        if (cliente && !cliente.phone) warnings.push(`Cliente "${cliente.nombre}" sin telefono.`);
        if (cliente && !cliente.address1) warnings.push(`Cliente "${cliente.nombre}" sin direccion.`);

        return [
            getHilldunClientCode(moneda),
            pedido ? pedido.numero : '',
            sol.poNumber || (pedido ? pedido.numero : ''),
            Math.round(importeParaHilldun),
            formatDateHilldun(pedido ? pedido.fecha : sol.fecha),
            formatDateHilldun(sol.deliveryStartDate || sol.fecha),
            formatDateHilldun(sol.deliveryEndDate || ''),
            config.termsCode || '', config.termsDesc || '', config.netDays || 30,
            cliente ? (cliente.customerCode || '') : '', cliente ? cliente.nombre : '',
            cliente ? (cliente.address1 || '') : '', cliente ? (cliente.address2 || '') : '',
            cliente ? (cliente.city || '') : '', cliente ? (cliente.state || '') : '',
            cliente ? (cliente.zip || '') : '', cliente ? (cliente.country || '') : '',
            cliente ? (cliente.contact || '') : '', cliente ? (cliente.phone || '') : '',
            cliente ? (cliente.email || '') : '', cliente ? (cliente.vatRegistration || '') : '',
            count, totalAmount, moneda, batchId
        ];
    });

    const uniqueWarnings = [...new Set(warnings)];
    if (uniqueWarnings.length > 0) {
        if (!confirm('Advertencias:\n\n' + uniqueWarnings.join('\n') + '\n\nContinuar?')) return;
    }

    const csvLines = [header.map(escapeCsvField).join(',')];
    rows.forEach(row => csvLines.push(row.map(escapeCsvField).join(',')));

    const primaryCode = config.clientCodeEUR || config.clientCodeUSD || 'XXXX';
    const filename = `${batchId}-${primaryCode}-CreditRequests.csv`;
    downloadCsv(filename, csvLines.join('\r\n'));

    // Mark as enviada
    const allSol = DB.getSolicitudesCredito();
    solicitudes.forEach(sol => {
        const idx = allSol.findIndex(s => s.id === sol.id);
        if (idx !== -1 && allSol[idx].estado === 'pendiente') {
            allSol[idx].estado = 'enviada';
            allSol[idx].batchId = batchId;
        }
    });
    DB.setSolicitudesCredito(allSol);
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
    if (facturas.length === 0) { alert('No hay facturas para generar el CSV.'); return; }

    const pedidos = DB.getPedidos();
    const clientes = DB.getClientes();

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
    const regularInvoices = facturas.filter(f => f.importe >= 0);
    const creditMemos = facturas.filter(f => f.importe < 0);
    const invoiceCount = regularInvoices.length;
    const invoiceTotal = regularInvoices.reduce((sum, f) => sum + f.importe, 0);
    const creditMemoCount = creditMemos.length;
    const creditMemoTotal = creditMemos.reduce((sum, f) => sum + Math.abs(f.importe), 0);

    const rows = facturas.map(fac => {
        const cliente = clientes.find(c => c.id === fac.clienteId);
        const moneda = fac.moneda || 'EUR';
        const estado = calcularEstadoFactura(fac.id);
        const isCreditMemo = fac.importe < 0;

        let orderNumber = '';
        if (fac.pedidosOrigen || fac.pedidos) {
            const src = fac.pedidosOrigen || fac.pedidos;
            const firstNum = src.split(',')[0].trim();
            orderNumber = firstNum;
        }

        return [
            getHilldunClientCode(moneda), orderNumber, orderNumber,
            fac.numero, Math.abs(fac.importe), Math.max(0, estado.pendiente),
            formatDateHilldun(fac.fecha),
            config.termsCode || '', config.termsDesc || '',
            cliente ? (cliente.customerCode || '') : '', cliente ? cliente.nombre : '',
            cliente ? (cliente.address1 || '') : '', cliente ? (cliente.address2 || '') : '',
            cliente ? (cliente.city || '') : '', cliente ? (cliente.state || '') : '',
            cliente ? (cliente.zip || '') : '', cliente ? (cliente.country || '') : '',
            cliente ? (cliente.contact || '') : '', cliente ? (cliente.phone || '') : '',
            config.defaultCarrier || '', '', config.ediTradingPartner || '0',
            invoiceCount, invoiceTotal, isCreditMemo ? 1 : 0, '',
            creditMemoCount > 0 ? creditMemoCount : '', creditMemoTotal > 0 ? creditMemoTotal : '',
            moneda, batchId, ''
        ];
    });

    const csvLines = [header.map(escapeCsvField).join(',')];
    rows.forEach(row => csvLines.push(row.map(escapeCsvField).join(',')));

    const primaryCode = config.clientCodeEUR || config.clientCodeUSD || 'XXXX';
    const filename = `${batchId}-${primaryCode}-Invoices.csv`;
    downloadCsv(filename, csvLines.join('\r\n'));
    showAlert('hilldunAlert', `CSV generado: ${filename} (${facturas.length} facturas)`, 'success');
}

// ========================================
// HILLDUN - IMPORTAR CREDIT RESPONSES
// ========================================

function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
                else inQuotes = false;
            } else current += char;
        } else {
            if (char === '"') inQuotes = true;
            else if (char === ',') { fields.push(current); current = ''; }
            else current += char;
        }
    }
    fields.push(current);
    return fields;
}

function convertHilldunDate(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
    if (/^\d{12,14}$/.test(dateStr)) {
        const yy = dateStr.length >= 8 ? dateStr.substring(0, 4) : '20' + dateStr.substring(0, 2);
        const mm = dateStr.substring(dateStr.length >= 8 ? 4 : 2, dateStr.length >= 8 ? 6 : 4);
        const dd = dateStr.substring(dateStr.length >= 8 ? 6 : 4, dateStr.length >= 8 ? 8 : 6);
        return `${yy}-${mm}-${dd}`;
    }
    return dateStr;
}

function importarCreditResponses(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim());

            if (lines.length < 2) {
                showAlert('hilldunAlert', 'El archivo CSV esta vacio.', 'error');
                return;
            }

            const firstLine = lines[0].toLowerCase();
            const hasHeader = firstLine.includes('timestamp') || firstLine.includes('client code') || firstLine.includes('action');
            const startRow = hasHeader ? 1 : 0;

            const solicitudes = DB.getSolicitudesCredito();
            const pedidos = DB.getPedidos();
            let actualizadas = 0;
            let noEncontradas = 0;

            for (let i = startRow; i < lines.length; i++) {
                const fields = parseCSVLine(lines[i]);
                if (fields.length < 17) continue;

                const approvalCode = (fields[2] || '').trim();
                const clientOrderNumber = (fields[3] || '').trim();
                const approvedAmount = parseFloat(fields[8]) || 0;
                const postDate = (fields[9] || '').trim();
                const expirationDate = (fields[12] || '').trim();
                const termsNetDays = (fields[13] || '').trim();
                const actionCode = (fields[14] || '').trim();
                const reasonCodes = (fields[15] || '').trim();
                const hilldunDecision = (fields[16] || '').trim();
                const reasons = [];
                for (let r = 17; r <= 21 && r < fields.length; r++) {
                    if (fields[r] && fields[r].trim()) reasons.push(fields[r].trim());
                }

                const pedido = pedidos.find(p => p.numero === clientOrderNumber);
                let solicitud = pedido ? solicitudes.find(s => s.pedidoId === pedido.id) : null;

                if (solicitud) {
                    let nuevoEstado = 'pendiente';
                    switch (actionCode.toUpperCase()) {
                        case 'AC': nuevoEstado = 'aprobada'; break;
                        case 'DR': case 'CI': case 'SP': nuevoEstado = 'rechazada'; break;
                        case 'HC': nuevoEstado = 'enviada'; break;
                        default: nuevoEstado = actionCode ? 'enviada' : 'pendiente'; break;
                    }

                    const idx = solicitudes.findIndex(s => s.id === solicitud.id);
                    solicitudes[idx] = {
                        ...solicitudes[idx],
                        estado: nuevoEstado, referencia: approvalCode, limiteCredito: approvedAmount,
                        fechaRespuesta: postDate ? convertHilldunDate(postDate) : new Date().toISOString().split('T')[0],
                        hilldunDecision: hilldunDecision, actionCode: actionCode, reasonCodes: reasonCodes,
                        condiciones: [hilldunDecision, reasons.length > 0 ? 'Razones: ' + reasons.join(', ') : '',
                            termsNetDays ? 'Net Days: ' + termsNetDays : '', expirationDate ? 'Expira: ' + expirationDate : ''
                        ].filter(Boolean).join(' | ')
                    };
                    actualizadas++;
                } else {
                    noEncontradas++;
                }
            }

            DB.setSolicitudesCredito(solicitudes);
            cargarTablaHilldun();

            let mensaje = `Importacion: ${actualizadas} solicitudes actualizadas`;
            if (noEncontradas > 0) mensaje += `, ${noEncontradas} no encontradas`;
            showAlert('hilldunAlert', mensaje, actualizadas > 0 ? 'success' : 'error');
        } catch (error) {
            showAlert('hilldunAlert', 'Error al importar: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    document.getElementById('importResponsesInput').value = '';
}

// ========================================
// PORTAL DE SHOWROOM - VISTA PEDIDOS
// ========================================

function abrirPortalShowroom(showroomId) {
    const showrooms = DB.getShowrooms();
    const showroom = showrooms.find(s => s.id === showroomId);
    if (!showroom) {
        alert('Showroom no encontrado');
        return;
    }

    const lang = showroom.idioma || 'es';

    // Hide main app, show portal
    document.getElementById('mainApp').style.display = 'none';
    let portal = document.getElementById('showroomPortal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'showroomPortal';
        document.body.appendChild(portal);
    }
    portal.style.display = 'block';

    renderPortalShowroom(showroomId, lang);
}

function cerrarPortalShowroom() {
    const portal = document.getElementById('showroomPortal');
    if (portal) portal.style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
}

function renderPortalShowroom(showroomId, lang, standalone) {
    const showrooms = DB.getShowrooms();
    const showroom = showrooms.find(s => s.id === showroomId);
    const clientes = DB.getClientes().filter(c => c.showroomId === showroomId);
    const clienteIds = new Set(clientes.map(c => c.id));
    const pedidos = DB.getPedidos().filter(p => clienteIds.has(p.clienteId));
    const solicitudes = DB.getSolicitudesCredito();

    const estadoOpciones = ['confirmado', 'en_preparacion', 'preparado', 'enviado', 'entregado'];

    const portal = document.getElementById('showroomPortal');
    let html = `
    <div style="max-width:1400px; margin:0 auto; padding:20px">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px">
            <div>
                <h1 style="margin:0; color:var(--text-primary)">${showroom.nombre} - ${t('portalTitle', lang)}</h1>
                <p style="color:var(--text-secondary); margin:4px 0 0">${t('portalSubtitle', lang)}</p>
            </div>
            ${standalone
                ? `<button class="btn btn-secondary" onclick="cerrarSesion()" style="font-size:13px;">Cerrar sesi&oacute;n</button>`
                : `<button class="btn btn-secondary" onclick="cerrarPortalShowroom()">${t('backToApp', lang)}</button>`}
        </div>

        <div class="filter-bar" style="margin-bottom:16px">
            <input type="text" id="portalBuscar" placeholder="${t('search', lang)}">
            <select id="portalFiltroEstado">
                <option value="">${t('allStatuses', lang)}</option>
                ${estadoOpciones.map(e => `<option value="${e}">${t(e, lang)}</option>`).join('')}
            </select>
        </div>
    `;

    if (pedidos.length === 0) {
        html += `<div class="empty-state"><p>${t('noOrders', lang)}</p></div>`;
    } else {
        html += `<table><thead><tr>
            <th>${t('orderNumber', lang)}</th>
            <th>${t('joorPO', lang)}</th>
            <th>${t('client', lang)}</th>
            <th>${t('date', lang)}</th>
            <th>${t('amount', lang)}</th>
            <th>${t('paymentTerms', lang)}</th>
            <th>${t('status', lang)}</th>
            <th>${t('shipping', lang)}</th>
            <th>${t('credit', lang)}</th>
        </tr></thead><tbody id="portalTableBody">`;

        pedidos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).forEach(pedido => {
            const cliente = clientes.find(c => c.id === pedido.clienteId);
            const estado = pedido.estadoPedido || 'confirmado';
            const anticipoPct = getAnticipoPct(pedido);
            const importeCredito = getImporteCredito(pedido);
            const condLabel = getCondicionesLabel(pedido);

            // Status badge
            const estadoBadges = {
                confirmado: 'secondary', en_preparacion: 'warning',
                preparado: 'info', enviado: 'primary', entregado: 'success'
            };
            const estadoHtml = `<span class="badge badge-${estadoBadges[estado] || 'secondary'}">${t(estado, lang)}</span>`;

            // Shipping
            let envioHtml = '-';
            if (pedido.metodoEnvio || pedido.trackingNumber) {
                envioHtml = '';
                if (pedido.metodoEnvio) envioHtml += `<small>${pedido.metodoEnvio}</small>`;
                if (pedido.trackingNumber) envioHtml += `${pedido.metodoEnvio ? '<br>' : ''}<code style="font-size:11px">${pedido.trackingNumber}</code>`;
            }

            // Payment terms with breakdown
            let termsHtml = condLabel || '-';
            if (anticipoPct > 0) {
                termsHtml += `<br><small style="color:var(--text-secondary)">${t('advance', lang)}: ${formatCurrency(pedido.importe * anticipoPct / 100, pedido.moneda)}</small>`;
                termsHtml += `<br><small style="color:var(--primary)">${t('creditPortion', lang)}: ${formatCurrency(importeCredito, pedido.moneda)}</small>`;
            }

            // Credit status
            const solicitud = solicitudes.find(s => s.pedidoId === pedido.id);
            let creditoHtml = '-';
            if (solicitud) {
                const badges = { pendiente: 'warning', enviada: 'primary', aprobada: 'success', rechazada: 'danger' };
                creditoHtml = `<span class="badge badge-${badges[solicitud.estado] || 'secondary'}">${t(solicitud.estado, lang)}</span>`;
                if (solicitud.estado === 'aprobada' && solicitud.limiteCredito) {
                    creditoHtml += `<br><small style="color:var(--success)">${formatCurrency(solicitud.limiteCredito, solicitud.moneda || pedido.moneda)}</small>`;
                }
            }

            html += `
                <tr data-numero="${pedido.numero.toLowerCase()}" data-joorpo="${(pedido.joorPO || '').toLowerCase()}" data-estado="${estado}">
                    <td><strong>${pedido.numero}</strong></td>
                    <td>${pedido.joorPO || '-'}</td>
                    <td>${cliente ? cliente.nombre : '-'}</td>
                    <td>${formatDate(pedido.fecha)}</td>
                    <td>${formatCurrency(pedido.importe, pedido.moneda)}</td>
                    <td>${termsHtml}</td>
                    <td style="text-align:center">${estadoHtml}</td>
                    <td>${envioHtml}</td>
                    <td style="text-align:center">${creditoHtml}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
    }

    html += '</div>';
    portal.innerHTML = html;

    // Filters
    if (pedidos.length > 0) {
        document.getElementById('portalBuscar').addEventListener('input', filtrarPortal);
        document.getElementById('portalFiltroEstado').addEventListener('change', filtrarPortal);
    }
}

function filtrarPortal() {
    const busqueda = document.getElementById('portalBuscar').value.toLowerCase();
    const estadoFiltro = document.getElementById('portalFiltroEstado').value;
    const filas = document.querySelectorAll('#portalTableBody tr');

    filas.forEach(fila => {
        const numero = fila.getAttribute('data-numero');
        const joorpo = fila.getAttribute('data-joorpo') || '';
        const estado = fila.getAttribute('data-estado');

        const coincideBusqueda = !busqueda || numero.includes(busqueda) || joorpo.includes(busqueda);
        const coincideEstado = !estadoFiltro || estado === estadoFiltro;

        fila.style.display = (coincideBusqueda && coincideEstado) ? '' : 'none';
    });
}

