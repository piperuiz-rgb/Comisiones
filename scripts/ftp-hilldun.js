#!/usr/bin/env node
/**
 * ftp-hilldun.js
 * Automatización FTP/SFTP con Hilldun
 *
 * Modos de uso:
 *   node ftp-hilldun.js --modo=enviar      → Genera CSV de solicitudes pendientes y las sube por SFTP
 *   node ftp-hilldun.js --modo=descargar   → Descarga respuestas de Hilldun y actualiza Firestore
 *   node ftp-hilldun.js --modo=sincronizar → Hace ambas operaciones en secuencia
 *
 * Requisitos:
 *   1. Copiar .env.example como .env y rellenar los valores
 *   2. Descargar serviceAccountKey.json desde Firebase Console
 *   3. npm install
 */

'use strict';

require('dotenv').config();
const SftpClient = require('ssh2-sftp-client');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURACIÓN Y CONSTANTES
// ============================================================

const CONFIG = {
    sftp: {
        host: process.env.SFTP_HOST || 'ftp.hilldun.com',
        port: parseInt(process.env.SFTP_PORT || '22', 10),
        username: process.env.SFTP_USER,
        password: process.env.SFTP_PASSWORD,
    },
    paths: {
        inbound:  process.env.SFTP_INBOUND  || '/inbound',
        outbound: process.env.SFTP_OUTBOUND || '/outbound',
    },
    local: {
        uploadDir:   process.env.CSV_UPLOAD_DIR   || path.join(__dirname, 'csv_pendientes'),
        downloadDir: process.env.CSV_DOWNLOAD_DIR  || path.join(__dirname, 'csv_respuestas'),
        logFile:     process.env.LOG_FILE          || path.join(__dirname, 'hilldun_ftp.log'),
    },
};

// ============================================================
// LOGGING
// ============================================================

function log(nivel, mensaje) {
    const ts = new Date().toISOString();
    const linea = `[${ts}] [${nivel.toUpperCase()}] ${mensaje}`;
    console.log(linea);
    fs.appendFileSync(CONFIG.local.logFile, linea + '\n');
}

// ============================================================
// FIREBASE ADMIN
// ============================================================

function inicializarFirebase() {
    if (admin.apps.length > 0) return;

    const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(__dirname, 'serviceAccountKey.json');
    if (!fs.existsSync(keyPath)) {
        log('ERROR', `No se encuentra el archivo de cuenta de servicio: ${keyPath}`);
        log('INFO', 'Descárgalo desde Firebase Console > Configuración del proyecto > Cuentas de servicio');
        process.exit(1);
    }

    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
    });
    log('INFO', 'Firebase Admin inicializado correctamente');
}

const db = () => admin.firestore();

// ============================================================
// ACCESO A DATOS EN FIRESTORE
// ============================================================

async function obtenerColeccion(nombre) {
    const snap = await db().collection(nombre).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function actualizarDocumento(coleccion, id, datos) {
    await db().collection(coleccion).doc(id).update(datos);
}

async function obtenerHilldunConfig() {
    const snap = await db().collection('hilldunConfig').limit(1).get();
    if (snap.empty) return {};
    return snap.docs[0].data();
}

// ============================================================
// UTILIDADES CSV
// ============================================================

function escaparCampo(valor) {
    if (valor == null) return '';
    const str = String(valor);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function formatearFecha(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
}

function generarBatchId() {
    const now = new Date();
    return [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
    ].join('');
}

function clientCode(config, moneda) {
    return moneda === 'USD'
        ? (config.clientCodeUSD || config.clientCodeEUR || '')
        : (config.clientCodeEUR || '');
}

function parsearLineaCSV(linea) {
    const campos = [];
    let actual = '';
    let enComillas = false;
    for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (enComillas) {
            if (c === '"') {
                if (i + 1 < linea.length && linea[i + 1] === '"') { actual += '"'; i++; }
                else enComillas = false;
            } else actual += c;
        } else {
            if (c === '"') enComillas = true;
            else if (c === ',') { campos.push(actual); actual = ''; }
            else actual += c;
        }
    }
    campos.push(actual);
    return campos;
}

function convertirFechaHilldun(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return dateStr;
}

// ============================================================
// GENERACIÓN DE CSV CREDIT REQUESTS
// ============================================================

async function generarCSVCreditRequests(config, solicitudes, pedidos, clientes, batchId) {
    const encabezado = [
        "Hilldun's Client Code", 'ClientOrderNumber', 'PO Number', 'PO Amount',
        'PO Date', 'DeliveryStartDate', 'DeliveryEndDate', 'TermsCode',
        'TermsDescription', 'NetDays', 'CustomerCode', 'CustomerName',
        'BillToAddress1', 'BillToAddress2', 'BillToCity', 'BillToState',
        'BillToZip', 'BillToCountry', 'BillToContact', 'BillToPhone',
        'BillToEmailAddress', 'BillToRegistration', 'Count', 'Total',
        'Currency', 'BatchID',
    ];

    const total = solicitudes.reduce(
        (s, sol) => s + (sol.importeCredito != null ? sol.importeCredito : (sol.importePedido || 0)), 0
    );

    const filas = solicitudes.map(sol => {
        const pedido  = pedidos.find(p => p.id === sol.pedidoId);
        const cliente = clientes.find(c => c.id === sol.clienteId);
        const moneda  = sol.moneda || (pedido ? pedido.moneda : 'EUR');
        const importe = sol.importeCredito != null ? sol.importeCredito : (sol.importePedido || (pedido ? pedido.importe : 0));

        return [
            clientCode(config, moneda),
            pedido ? pedido.numero : '',
            sol.poNumber || (pedido ? pedido.numero : ''),
            Math.round(importe),
            formatearFecha(pedido ? pedido.fecha : sol.fecha),
            formatearFecha(sol.deliveryStartDate || sol.fecha),
            formatearFecha(sol.deliveryEndDate || ''),
            config.termsCode || '', config.termsDesc || '', config.netDays || 30,
            cliente ? (cliente.customerCode || '') : '', cliente ? cliente.nombre : '',
            cliente ? (cliente.address1 || '') : '', cliente ? (cliente.address2 || '') : '',
            cliente ? (cliente.city || '') : '', cliente ? (cliente.state || '') : '',
            cliente ? (cliente.zip || '') : '', cliente ? (cliente.country || '') : '',
            cliente ? (cliente.contact || '') : '', cliente ? (cliente.phone || '') : '',
            cliente ? (cliente.email || '') : '', cliente ? (cliente.vatRegistration || '') : '',
            solicitudes.length, total, moneda, batchId,
        ];
    });

    const lineas = [encabezado.map(escaparCampo).join(',')];
    filas.forEach(f => lineas.push(f.map(escaparCampo).join(',')));
    return lineas.join('\r\n');
}

// ============================================================
// MODO: ENVIAR
// ============================================================

async function modoEnviar() {
    log('INFO', '=== MODO ENVIAR: Generando y subiendo solicitudes a Hilldun ===');

    inicializarFirebase();

    const [config, solicitudes, pedidos, clientes] = await Promise.all([
        obtenerHilldunConfig(),
        obtenerColeccion('solicitudesCredito'),
        obtenerColeccion('pedidos'),
        obtenerColeccion('clientes'),
    ]);

    if (!config.clientCodeEUR && !config.clientCodeUSD) {
        log('ERROR', 'No hay Client Code de Hilldun configurado. Configúralo en la app web.');
        process.exit(1);
    }

    const pendientes = solicitudes.filter(s => s.estado === 'pendiente');
    if (pendientes.length === 0) {
        log('INFO', 'No hay solicitudes de crédito pendientes para enviar.');
        return;
    }

    log('INFO', `Encontradas ${pendientes.length} solicitudes pendientes.`);

    const batchId = generarBatchId();
    const csvContent = await generarCSVCreditRequests(config, pendientes, pedidos, clientes, batchId);

    // Guardar CSV localmente
    fs.mkdirSync(CONFIG.local.uploadDir, { recursive: true });
    const codigoPrincipal = config.clientCodeEUR || config.clientCodeUSD || 'XXXX';
    const nombreArchivo = `${batchId}-${codigoPrincipal}-CreditRequests.csv`;
    const rutaLocal = path.join(CONFIG.local.uploadDir, nombreArchivo);
    fs.writeFileSync(rutaLocal, csvContent, 'utf8');
    log('INFO', `CSV generado localmente: ${rutaLocal}`);

    // Verificar credenciales SFTP
    const sftpHost = config.sftpHost || CONFIG.sftp.host;
    const sftpUser = config.sftpUser || CONFIG.sftp.username;
    const sftpPass = config.sftpPassword || CONFIG.sftp.password;

    if (!sftpHost || !sftpUser || !sftpPass) {
        log('WARN', 'Faltan credenciales SFTP. El CSV se ha generado localmente pero NO se ha subido.');
        log('INFO', `Archivo listo para subir manualmente: ${rutaLocal}`);
        log('INFO', 'Configura SFTP_HOST, SFTP_USER y SFTP_PASSWORD en el archivo .env o en la app web.');
        return;
    }

    // Subir por SFTP
    const sftp = new SftpClient();
    try {
        log('INFO', `Conectando a SFTP: ${sftpUser}@${sftpHost}...`);
        await sftp.connect({
            host: sftpHost,
            port: config.sftpPort || CONFIG.sftp.port,
            username: sftpUser,
            password: sftpPass,
        });

        const carpetaRemota = config.sftpInbound || CONFIG.paths.inbound;
        const rutaRemota = `${carpetaRemota}/${nombreArchivo}`;
        log('INFO', `Subiendo archivo a: ${rutaRemota}`);
        await sftp.put(rutaLocal, rutaRemota);
        log('INFO', `Archivo subido correctamente: ${nombreArchivo}`);

        // Actualizar estado en Firestore
        log('INFO', 'Actualizando estado de solicitudes en Firestore...');
        const ahora = new Date().toISOString().split('T')[0];
        const actualizaciones = pendientes.map(sol =>
            actualizarDocumento('solicitudesCredito', sol.id, {
                estado: 'enviada',
                batchId: batchId,
                fechaEnvio: ahora,
            })
        );
        await Promise.all(actualizaciones);
        log('INFO', `${pendientes.length} solicitudes marcadas como "enviada" en Firestore.`);

    } catch (err) {
        log('ERROR', `Error SFTP: ${err.message}`);
        log('INFO', `El CSV se guardó localmente en: ${rutaLocal}`);
        throw err;
    } finally {
        await sftp.end().catch(() => {});
    }
}

// ============================================================
// MODO: DESCARGAR
// ============================================================

async function modoDescargar() {
    log('INFO', '=== MODO DESCARGAR: Descargando respuestas de Hilldun ===');

    inicializarFirebase();

    const config = await obtenerHilldunConfig();

    const sftpHost = config.sftpHost || CONFIG.sftp.host;
    const sftpUser = config.sftpUser || CONFIG.sftp.username;
    const sftpPass = config.sftpPassword || CONFIG.sftp.password;

    if (!sftpHost || !sftpUser || !sftpPass) {
        log('ERROR', 'Faltan credenciales SFTP. Configúralas en la app web o en el archivo .env.');
        process.exit(1);
    }

    fs.mkdirSync(CONFIG.local.downloadDir, { recursive: true });

    const sftp = new SftpClient();
    let archivosDescargados = 0;

    try {
        log('INFO', `Conectando a SFTP: ${sftpUser}@${sftpHost}...`);
        await sftp.connect({
            host: sftpHost,
            port: config.sftpPort || CONFIG.sftp.port,
            username: sftpUser,
            password: sftpPass,
        });

        const carpetaRemota = config.sftpOutbound || CONFIG.paths.outbound;
        log('INFO', `Listando archivos en: ${carpetaRemota}`);

        let archivosRemotos;
        try {
            archivosRemotos = await sftp.list(carpetaRemota);
        } catch (e) {
            log('WARN', `No se pudo listar el directorio remoto: ${e.message}`);
            archivosRemotos = [];
        }

        const csvRemotos = archivosRemotos.filter(f => f.name.toLowerCase().endsWith('.csv'));
        log('INFO', `Archivos CSV encontrados en outbound: ${csvRemotos.length}`);

        for (const archivo of csvRemotos) {
            const rutaLocal = path.join(CONFIG.local.downloadDir, archivo.name);

            // No re-descargar si ya existe
            if (fs.existsSync(rutaLocal)) {
                log('INFO', `Omitiendo (ya existe localmente): ${archivo.name}`);
                continue;
            }

            const rutaRemota = `${carpetaRemota}/${archivo.name}`;
            log('INFO', `Descargando: ${archivo.name}`);
            await sftp.get(rutaRemota, rutaLocal);
            log('INFO', `Descargado: ${rutaLocal}`);
            archivosDescargados++;
        }

        log('INFO', `Total archivos descargados: ${archivosDescargados}`);

    } catch (err) {
        log('ERROR', `Error SFTP: ${err.message}`);
        throw err;
    } finally {
        await sftp.end().catch(() => {});
    }

    // Procesar los CSV descargados e importar respuestas a Firestore
    if (archivosDescargados > 0) {
        log('INFO', 'Procesando respuestas descargadas...');
        await procesarRespuestasDescargadas();
    }
}

// ============================================================
// PROCESAMIENTO DE RESPUESTAS CSV
// ============================================================

async function procesarRespuestasDescargadas() {
    const dir = CONFIG.local.downloadDir;
    if (!fs.existsSync(dir)) return;

    const archivos = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.csv'));
    if (archivos.length === 0) {
        log('INFO', 'No hay archivos CSV de respuesta para procesar.');
        return;
    }

    inicializarFirebase();
    const [solicitudes, pedidos] = await Promise.all([
        obtenerColeccion('solicitudesCredito'),
        obtenerColeccion('pedidos'),
    ]);

    let totalActualizadas = 0;
    let totalNoEncontradas = 0;

    for (const nombreArchivo of archivos) {
        const rutaProcesado = path.join(dir, nombreArchivo + '.procesado');
        if (fs.existsSync(rutaProcesado)) {
            log('INFO', `Omitiendo (ya procesado): ${nombreArchivo}`);
            continue;
        }

        log('INFO', `Procesando respuesta: ${nombreArchivo}`);
        const texto = fs.readFileSync(path.join(dir, nombreArchivo), 'utf8');
        const lineas = texto.split(/\r?\n/).filter(l => l.trim());

        if (lineas.length < 2) {
            log('WARN', `Archivo vacío o sin datos: ${nombreArchivo}`);
            continue;
        }

        const primeraLinea = lineas[0].toLowerCase();
        const tieneEncabezado = primeraLinea.includes('timestamp') ||
                                primeraLinea.includes('client code') ||
                                primeraLinea.includes('action');
        const inicioFila = tieneEncabezado ? 1 : 0;

        const actualizaciones = [];

        for (let i = inicioFila; i < lineas.length; i++) {
            const campos = parsearLineaCSV(lineas[i]);
            if (campos.length < 17) continue;

            const approvalCode      = (campos[2]  || '').trim();
            const clientOrderNumber = (campos[3]  || '').trim();
            const approvedAmount    = parseFloat(campos[8]) || 0;
            const postDate          = (campos[9]  || '').trim();
            const expirationDate    = (campos[12] || '').trim();
            const termsNetDays      = (campos[13] || '').trim();
            const actionCode        = (campos[14] || '').trim();
            const reasonCodes       = (campos[15] || '').trim();
            const hilldunDecision   = (campos[16] || '').trim();
            const reasons = [];
            for (let r = 17; r <= 21 && r < campos.length; r++) {
                if (campos[r] && campos[r].trim()) reasons.push(campos[r].trim());
            }

            const pedido = pedidos.find(p => p.numero === clientOrderNumber);
            const solicitud = pedido ? solicitudes.find(s => s.pedidoId === pedido.id) : null;

            if (!solicitud) {
                log('WARN', `Solicitud no encontrada para pedido: ${clientOrderNumber}`);
                totalNoEncontradas++;
                continue;
            }

            let nuevoEstado;
            switch (actionCode.toUpperCase()) {
                case 'AC':            nuevoEstado = 'aprobada';  break;
                case 'DR': case 'CI': case 'SP': nuevoEstado = 'rechazada'; break;
                case 'HC':            nuevoEstado = 'enviada';   break;
                default:              nuevoEstado = actionCode ? 'enviada' : 'pendiente';
            }

            const condiciones = [
                hilldunDecision,
                reasons.length > 0 ? 'Razones: ' + reasons.join(', ') : '',
                termsNetDays    ? 'Net Days: ' + termsNetDays : '',
                expirationDate  ? 'Expira: '   + expirationDate : '',
            ].filter(Boolean).join(' | ');

            actualizaciones.push(
                actualizarDocumento('solicitudesCredito', solicitud.id, {
                    estado:          nuevoEstado,
                    referencia:      approvalCode,
                    limiteCredito:   approvedAmount,
                    fechaRespuesta:  postDate ? convertirFechaHilldun(postDate) : new Date().toISOString().split('T')[0],
                    hilldunDecision: hilldunDecision,
                    actionCode:      actionCode,
                    reasonCodes:     reasonCodes,
                    condiciones:     condiciones,
                })
            );

            log('INFO', `  Pedido ${clientOrderNumber}: ${actionCode} → estado="${nuevoEstado}" importe=${approvedAmount}`);
            totalActualizadas++;
        }

        await Promise.all(actualizaciones);

        // Marcar como procesado
        fs.writeFileSync(rutaProcesado, new Date().toISOString(), 'utf8');
        log('INFO', `Archivo procesado: ${nombreArchivo} (${actualizaciones.length} solicitudes actualizadas)`);
    }

    log('INFO', `Resumen: ${totalActualizadas} solicitudes actualizadas, ${totalNoEncontradas} no encontradas.`);
}

// ============================================================
// MODO: SINCRONIZAR
// ============================================================

async function modoSincronizar() {
    log('INFO', '=== MODO SINCRONIZAR: Enviar + Descargar ===');
    await modoEnviar();
    await modoDescargar();
}

// ============================================================
// PUNTO DE ENTRADA
// ============================================================

async function main() {
    const args = process.argv.slice(2);
    const modoArg = args.find(a => a.startsWith('--modo='));
    const modo = modoArg ? modoArg.split('=')[1] : 'sincronizar';

    // Crear directorios si no existen
    fs.mkdirSync(CONFIG.local.uploadDir,   { recursive: true });
    fs.mkdirSync(CONFIG.local.downloadDir, { recursive: true });

    log('INFO', `Iniciando ftp-hilldun.js | modo=${modo}`);

    try {
        switch (modo) {
            case 'enviar':      await modoEnviar();       break;
            case 'descargar':   await modoDescargar();    break;
            case 'sincronizar': await modoSincronizar();  break;
            default:
                log('ERROR', `Modo desconocido: "${modo}". Usa --modo=enviar, --modo=descargar o --modo=sincronizar`);
                process.exit(1);
        }
        log('INFO', 'Operación completada con éxito.');
    } catch (err) {
        log('ERROR', `Operación fallida: ${err.message}`);
        if (process.env.DEBUG) console.error(err);
        process.exit(1);
    }
}

main();
