# ⚠️ IMPORTANTE - Sistema de Almacenamiento

## 🔒 Los Datos Son Locales

Este sistema usa **localStorage** del navegador para guardar los datos.

### ¿Qué significa esto?

```
Persona A (en su navegador)          Persona B (en su navegador)
├── Showrooms: 5                     ├── Showrooms: 0 (vacío)
├── Clientes: 15                     ├── Clientes: 0 (vacío)
├── Facturas: 25                     ├── Facturas: 0 (vacío)
└── Cobros: 35                       └── Cobros: 0 (vacío)
```

**CADA PERSONA DEBE:**
1. Abrir la aplicación en SU navegador
2. Importar SUS propios datos
3. Los datos se guardan SOLO en su navegador

## 💾 Implicaciones Importantes

### ✅ Ventajas:
- No necesitas servidor/base de datos
- Funciona offline
- Gratis
- Privado (los datos no salen de tu ordenador)

### ⚠️ Limitaciones:
- **NO se comparten entre equipos**
- **NO se sincronizan entre navegadores**
- Si limpias caché del navegador → Pierdes datos
- Si cambias de ordenador → Empiezas de cero

## 🔄 ¿Cómo Compartir Datos Entre Personas?

Tienes **3 opciones**:

### Opción 1: Exportar/Importar Excel (Recomendado)

**Persona A:**
1. Exporta Showrooms → `Showrooms.xlsx`
2. Exporta Clientes → `Clientes.xlsx`
3. Exporta Pedidos → (manualmente)
4. Exporta Facturas → (manualmente)
5. Exporta Cobros → (manualmente)
6. Envía los archivos a Persona B

**Persona B:**
1. Recibe los archivos
2. Los importa en su navegador
3. Ahora tiene los mismos datos

### Opción 2: Compartir Informes

- Los informes de comisiones se generan en Excel
- Se pueden descargar y compartir
- Son "fotos" del momento, no datos vivos

### Opción 3: Usar un Solo Ordenador/Navegador

- Todos usan el mismo ordenador
- Todos usan el mismo navegador
- Todos ven los mismos datos

## 🏢 Uso Recomendado para Empresa

### Escenario 1: Una Persona Gestiona
```
Administrador:
└── Su navegador tiene todos los datos
└── Genera informes mensuales en Excel
└── Comparte los informes Excel con dirección
```

### Escenario 2: Varias Personas
```
Cada persona:
├── Importa datos base (Showrooms, Clientes)
├── Registra SUS cobros/facturas
├── Exporta SUS datos al final del mes
└── Un administrador consolida todo
```

### Escenario 3: Datos Compartidos (Opción Avanzada)

Para compartir datos en tiempo real entre equipos, necesitarías:
- ❌ Base de datos (MySQL, PostgreSQL)
- ❌ Servidor backend (Node.js, Python)
- ❌ Hosting
- ❌ Desarrollo adicional
- 💰 Costes de servidor

**Esta versión NO incluye esto** (por simplicidad y costo cero).

## 💡 Recomendación Práctica

**Para Charo Ruiz Ibiza:**

1. **Designa una persona** responsable del sistema
2. Esa persona usa **un navegador específico** (ej: Chrome) siempre
3. Todos los datos se registran ahí
4. **Backup semanal**: Exportar todos los datos a Excel
5. **Fin de mes**: Generar informes de comisiones
6. **Compartir**: Los informes Excel con dirección/contabilidad

## 🔄 Backup Recomendado

**Cada semana:**
```
1. Exportar Showrooms → Guardar en carpeta "Backups/Semana_XX"
2. Exportar Clientes → Guardar en carpeta "Backups/Semana_XX"
3. (Opcional) Copiar informes generados
```

**Si algo falla:**
```
1. Abrir aplicación
2. Importar archivos del último backup
3. Continuar desde ahí
```

## 📊 Flujo de Trabajo Ideal

```
Inicio de Mes:
└── Importar base (si es necesario)

Durante el Mes:
├── Registrar pedidos cuando llegan
├── Registrar facturas cuando se emiten
└── Registrar cobros cuando se reciben

Fin de Mes:
├── Generar informe de comisiones del mes
├── Descargar Excel del informe
├── Compartir con dirección/contabilidad
└── (Opcional) Exportar backup de todo

Inicio del Mes Siguiente:
└── Repetir el ciclo
```

## ⚡ Acceso Rápido

Para que varios ordenadores tengan los datos base (Showrooms, Clientes):

1. **Primera vez**: Importa los datos en el ordenador principal
2. **Exporta** Showrooms y Clientes
3. **Sube** esos archivos a una carpeta compartida (Google Drive, OneDrive)
4. **Otros ordenadores**: Descargan e importan esos archivos
5. Ahora todos tienen la misma base

## 🆘 Si Necesitas Compartir Datos en Tiempo Real

Necesitarías una versión con backend. Opciones:

1. **Airtable/Google Sheets** + Integraciones (solución sin código)
2. **Desarrollo a medida** con base de datos (más caro, más complejo)
3. **Software comercial** de gestión de comisiones (suscripción mensual)

Esta versión está diseñada para **simplicidad y costo cero**, no para colaboración en tiempo real.

---

**¿Necesitas ayuda para decidir el mejor flujo de trabajo para tu empresa?** 
Pregúntame y te ayudo a diseñarlo.
