# Comisiones CRI — Google Sheets + AppScript

Herramienta para calcular comisiones de showrooms de Charo Ruiz Ibiza, implementada como Google Sheets con Google Apps Script.

## Ventajas sobre la web app

| | Web App (GitHub Pages) | Google Sheets |
|--|----------------------|--------------|
| Privacidad | Público (requiere pago para privado) | Privado por defecto en Google Drive |
| Acceso | URL pública | Solo personas invitadas |
| Autenticación | Firebase Auth | Cuenta de Google |
| Colaboración | Firebase real-time | Google Sheets nativo |
| Setup | Firebase + hosting | Solo compartir el archivo |

---

## Instalación (una sola vez)

### Paso 1: Crear el Google Sheets

1. Ve a [sheets.google.com](https://sheets.google.com) y crea una hoja nueva.
2. Ponle nombre, por ejemplo: **Comisiones CRI 2024**.

### Paso 2: Abrir el editor de Apps Script

1. En Google Sheets, ve al menú: **Extensiones → Apps Script**
2. Se abrirá el editor de código.

### Paso 3: Crear los archivos de script

En el editor, **elimina el contenido del archivo `Code.gs`** que aparece por defecto y crea los siguientes archivos:

| Archivo | Descripción |
|---------|-------------|
| `Code.gs` | Menú principal y punto de entrada |
| `Comisiones.gs` | Motor de cálculo de comisiones |
| `Helpers.gs` | Utilidades y acceso a datos |
| `Informe.gs` | Generación del informe |
| `Importador.gs` | Importación desde Excel |

Para crear un archivo nuevo: haz clic en **"+"** junto a "Archivos" en el panel izquierdo → "Script".

Copia el contenido de cada archivo `.gs` de esta carpeta en el archivo correspondiente del editor.

### Paso 4: Guardar y cerrar el editor

Pulsa **Ctrl+S** (o el icono de guardar) en el editor. Cierra la pestaña.

### Paso 5: Crear la estructura de hojas

1. Recarga el Google Sheets (F5).
2. Verás el menú **"Comisiones CRI"** en la barra de menús.
3. Ve a: **Comisiones CRI → Crear estructura de hojas**
4. Acepta cuando pregunte si deseas continuar.
5. Se crearán automáticamente todas las hojas necesarias.

---

## Estructura de hojas creadas

| Hoja | Descripción |
|------|-------------|
| **Showrooms** | Showrooms con su % de comisión |
| **Clientes** | Clientes vinculados a cada showroom |
| **Pedidos** | Pedidos (órdenes de compra) |
| **Facturas** | Facturas y abonos (notas de crédito) |
| **Cobros** | Registros de cobros parciales o totales |
| **Liquidaciones** | Registro de comisiones pagadas |
| **Informe_Parametros** | Donde configuras el período del informe |
| **Informe_Resumen** | Resumen generado (solo lectura) |
| **Informe_Detalle** | Detalle generado (solo lectura) |
| **Historico_Informes** | Log de informes generados |
| **TEMP_Import** | Hoja auxiliar para importar datos |

---

## Uso diario

### Introducir datos

Puedes introducir datos directamente en cada hoja (Showrooms, Clientes, Pedidos, Facturas, Cobros) o importarlos desde Excel.

**Columnas requeridas por hoja:**

**Showrooms:** `Nombre` | `Comision_Pct` | `Idioma` (es/en)

**Clientes:** `Nombre` | `Showroom_Nombre` (debe coincidir exactamente con el nombre en Showrooms)

**Pedidos:** `Numero` | `Cliente_Nombre` | `Fecha` | `Moneda` | `Importe`

**Facturas:** `Numero` | `Cliente_Nombre` | `Pedidos_Ref` | `Fecha` | `Vencimiento` | `Moneda` | `Importe` | `Es_Abono` | `Facturas_Abonadas` | `Notas`
- `Es_Abono`: TRUE para abonos/notas de crédito, FALSE para facturas normales
- `Facturas_Abonadas`: solo para abonos — números de factura separados por coma
- `Importe`: positivo para facturas, negativo para abonos (o positivo, se convertirá automáticamente al importar)

**Cobros:** `Factura_Ref` | `Pedido_Ref` | `Fecha` | `Moneda` | `Importe` | `Es_Ajuste`
- `Factura_Ref`: número de factura a la que se aplica el cobro
- `Pedido_Ref`: solo para anticipos (cobros vinculados a pedido, no a factura)
- `Importe`: siempre positivo

### Importar desde Excel

1. Abre tu archivo Excel con los datos a importar.
2. Selecciona **todos los datos de la hoja correspondiente** (incluyendo la fila de cabeceras).
3. Copia (Ctrl+C).
4. En Google Sheets, ve a la hoja **TEMP_Import** y pega (Ctrl+V).
5. Ejecuta: **Comisiones CRI → Importar datos → Importar [entidad]**
6. La hoja TEMP_Import se limpiará automáticamente.

> Las cabeceras de tu Excel deben seguir el mismo orden que se indica en la sección anterior.

### Generar un informe de comisiones

1. Ve a la hoja **Informe_Parametros**.
2. En la celda **C3** introduce la fecha de inicio del período (ej: `2024-01-01`).
3. En la celda **C4** introduce la fecha de fin (ej: `2024-01-31`).
4. En **C5** puedes escribir el nombre de un showroom para filtrar (o dejarlo vacío para todos).
5. Ejecuta: **Comisiones CRI → Calcular Comisiones**

El informe se generará en las hojas **Informe_Resumen** e **Informe_Detalle**.

> **Regla de cálculo:** Solo se incluyen facturas cobradas al 100% cuya fecha de cobro completo cae dentro del período seleccionado.

---

## Lógica de comisiones

### Regla básica
Una factura genera comisión en el período en que se cobra el **último pago que completa el 100%** del importe.

**Ejemplo:** Factura de 1.000 €, pagada en 3 cuotas (300 € enero, 200 € febrero, 500 € marzo). La comisión aparece en **marzo** (cuando se alcanzó el 100%), sobre el importe total de 1.000 €.

### Abonos (notas de crédito)

Hay 3 escenarios según cuándo se emite el abono respecto a los cobros:

| Escenario | Situación | Resultado |
|-----------|-----------|-----------|
| **1 y 2** | El abono se emite mientras la factura aún no está totalmente cobrada | La comisión del abono (negativa) se incluye en el mismo período que la factura |
| **3** | El abono se emite después de que la factura ya estaba totalmente cobrada | La comisión del abono (negativa) se incluye en el período de la fecha del abono |

---

## Compartir con el equipo

1. En Google Sheets, pulsa el botón **"Compartir"** (arriba a la derecha).
2. Añade los emails de los miembros del equipo.
3. Elige nivel de acceso: **Editor** (pueden introducir datos y generar informes) o **Lector** (solo consulta).

Los datos son privados y solo accesibles para las personas que tú invites.

---

## Validar datos

Antes de generar un informe, puedes verificar la integridad de los datos:

**Comisiones CRI → Validar datos**

Detecta:
- Clientes con showroom no encontrado
- Facturas con cliente no encontrado  
- Abonos con facturas referenciadas no encontradas
- Cobros con factura referenciada no encontrada

---

## Solución de problemas

**"El menú Comisiones CRI no aparece"**
→ Recarga la página (F5). Si sigue sin aparecer, ve a Extensiones → Apps Script y verifica que el código esté guardado correctamente.

**"No se encontró la hoja: Facturas"**
→ Ejecuta Comisiones CRI → Crear estructura de hojas.

**"No hay facturas cobradas al 100% en el periodo"**
→ Verifica que las fechas de los cobros estén en el período seleccionado. Recuerda que la comisión se asigna a la fecha del **último cobro** que completa la factura.

**Fechas con formato incorrecto**
→ Usa el formato `yyyy-MM-dd` (ej: `2024-03-15`) o `dd/MM/yyyy` (ej: `15/03/2024`).
