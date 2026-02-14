# 💰 Sistema de Comisiones de Showrooms | Charo Ruiz Ibiza

Sistema completo de gestión de comisiones para showrooms basado en facturas cobradas al 100%.

## ✨ Características

### 📊 Dashboard Inteligente
- Estadísticas en tiempo real
- Facturas pendientes ordenadas por vencimiento
- Alertas de facturas vencidas
- Comisiones del mes actual

### 🏢 Gestión de Showrooms
- CRUD completo (Crear, Editar, Eliminar)
- Configuración de % de comisión por showroom
- Importación masiva desde Excel
- Exportación a Excel

### 👥 Base de Datos de Clientes
- Asignación de cliente a showroom
- Importación y exportación Excel
- Edición manual

### 📦 Gestión de Pedidos
- Registro de pedidos por cliente
- Soporte para EUR y USD
- Importador de pedidos masivos

### 📄 Control de Facturas
- Vinculación a uno o varios pedidos origen
- Fechas de emisión y vencimiento
- Estados: Pendiente, Parcial, Cobrada
- Seguimiento detallado

### 💰 Registro de Cobros
- Cobros parciales o totales
- Actualización automática de saldos
- **Alerta de saldo residual**: Pregunta si marcar como pagada cuando queda un saldo pequeño
- Información en tiempo real del estado de cada factura

### 📈 Informes de Comisiones
- Generación de informes en Excel
- Filtrado por periodo (fecha de cobro 100%)
- Filtrado por showroom específico o todos
- Incluye:
  - Hoja resumen con totales
  - Hoja detallada por cada showroom
  - Listado de facturas con su comisión

## 🎯 Lógica de Comisiones

### Regla Principal
**Las comisiones se pagan SOLO sobre facturas cobradas al 100%**

### Cálculo del Periodo
La comisión de un mes se calcula sobre las facturas que en ese mes quedaron cobradas al 100%, incluyendo **todos los cobros** desde que se emitió la factura (anticipos + pagos posteriores).

### Ejemplo:
```
Factura: 1.000€
Anticipos: 300€ (enero) + 200€ (febrero)
Cobro final: 500€ (marzo)

Resultado: La comisión se paga en MARZO (mes del último cobro que completó el 100%)
Base comisión: 1.000€ (todo el importe de la factura)
```

## 🔢 Umbrales de Saldo Residual

El sistema detecta automáticamente cuando el saldo pendiente es muy pequeño y pregunta si marcar la factura como pagada al 100%:

- **Facturas < 1.000€** → Umbral: 30€
- **Facturas 1.000€ - 10.000€** → Umbral: 50€
- **Facturas > 10.000€** → Umbral: 100€

## 🚀 Instalación

### Opción 1: GitHub Pages
1. Sube los archivos al repositorio
2. Activa GitHub Pages en Settings
3. Accede desde: `https://tu-usuario.github.io/tu-repo`

### Opción 2: Local
1. Descarga los archivos
2. Abre `index.html` en tu navegador
3. ¡Listo!

## 📁 Estructura de Archivos

```
showrooms-comisiones/
├── index.html          # HTML principal
├── styles.css          # Estilos JOOR
├── app.js              # Lógica completa
└── README.md           # Este archivo
```

## 📋 Formatos de Importación

### Showrooms
```
Nombre | % Comisión
Showroom Madrid | 5
Showroom Barcelona | 4.5
```

### Clientes
```
Nombre | Showroom
Cliente A | Showroom Madrid
Cliente B | Showroom Barcelona
```

### Pedidos
```
Número | Cliente | Fecha | Moneda | Importe
PED001 | Cliente A | 2026-01-15 | EUR | 5000
PED002 | Cliente B | 2026-01-20 | USD | 3000
```

### Facturas
```
Número | Cliente | Pedidos | Fecha | Vencimiento | Moneda | Importe
FAC001 | Cliente A | PED001 | 2026-02-01 | 2026-03-01 | EUR | 5000
FAC002 | Cliente B | PED002, PED003 | 2026-02-05 | 2026-03-05 | USD | 6000
```

### Cobros
```
Factura | Fecha | Moneda | Importe
FAC001 | 2026-02-15 | EUR | 2000
FAC001 | 2026-03-01 | EUR | 3000
```

## 💾 Almacenamiento

- **Tecnología**: localStorage del navegador
- **Capacidad**: ~5MB por dominio
- **Persistencia**: Los datos se mantienen aunque cierres el navegador
- **Backup**: Exporta regularmente tus datos a Excel

⚠️ **Importante**: Los datos se borran si limpias la caché del navegador

## 🎨 Diseño

- Estilo JOOR profesional
- Diseño responsive (móvil, tablet, desktop)
- Paleta de colores corporativa
- Tipografía Inter

## 🔐 Privacidad

- ✅ **100% offline** después de la carga inicial
- ✅ **Sin servidor** - Todo se procesa en tu navegador
- ✅ **Sin envío de datos** - Tu información nunca sale de tu ordenador
- ✅ **Sin cookies de terceros**

## 🛠️ Tecnologías

- HTML5 + CSS3 + JavaScript vanilla
- XLSX.js para importación/exportación Excel
- localStorage para persistencia
- Sin dependencias backend

## 📱 Compatibilidad

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 📊 Flujo de Trabajo Típico

1. **Configurar**: Crear showrooms y asignar clientes
2. **Registrar**: Cargar pedidos cuando se reciben
3. **Facturar**: Crear facturas vinculadas a pedidos
4. **Cobrar**: Registrar cobros (parciales o totales)
5. **Informar**: Generar informe mensual de comisiones

## 💡 Casos de Uso

### Caso 1: Factura con Anticipo
```
1. Cliente hace pedido de 10.000€
2. Paga anticipo de 3.000€ → Registrar cobro
3. Se envía mercancía y se factura 10.000€
4. Cliente paga 7.000€ restantes → Registrar cobro
5. Sistema detecta: 100% cobrado en el mes actual
6. Comisión generada sobre 10.000€
```

### Caso 2: Saldo Residual
```
1. Factura de 1.500€
2. Cliente paga 1.480€
3. Sistema alerta: "Quedan 20€ pendientes (umbral: 50€)"
4. Usuario confirma: "Marcar como pagada al 100%"
5. Sistema crea cobro ajuste automático de 20€
6. Factura queda marcada como cobrada
```

## 🔄 Actualización de Datos

Para actualizar datos:
1. Exporta a Excel
2. Edita el Excel
3. Elimina los registros antiguos en la app
4. Importa el Excel actualizado

## 📞 Soporte

Para consultas o problemas, contacta con el departamento de administración.

---

**Versión:** 1.0.0  
**Última actualización:** Febrero 2026  
**Desarrollado para:** Charo Ruiz Ibiza

## 📝 Licencia

© 2026 Charo Ruiz Ibiza. Todos los derechos reservados.
