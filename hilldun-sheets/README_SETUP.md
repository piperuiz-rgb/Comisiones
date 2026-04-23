# Hilldun Google Sheet — Instalación

## Estructura en Google Drive

```
📁 Hilldun/
   ├── 📊 Hilldun  ← este Google Sheet
   └── 📁 BASE DE DATOS/
       ├── 📁 EURO/    ← archivos XLS de credit status en EUR (de Hilldun)
       ├── 📁 DOLAR/   ← archivos XLS de credit status en USD (de Hilldun)
       └── Clientes.xlsx  ← exportación de clientes desde Gextia (col: id, name, agent)
```

La primera vez que ejecutes "Configurar", el script crea automáticamente las carpetas que no existan.

---

## Instalación del script (una sola vez)

1. Abre el Google Sheet **Hilldun** en Google Drive.
2. En el menú: **Extensiones → Apps Script**.
3. Elimina el contenido del archivo `Code.gs` que aparece por defecto.
4. Copia el contenido de `Code.gs` de este repositorio y pégalo en ese archivo.
5. Crea un nuevo archivo de script: botón **+** → **Script** → nómbralo `BaseDatos`.
6. Pega el contenido de `BaseDatos.gs` en él.
7. **Activa la Drive API avanzada:**
   - En el menú lateral del editor: **Servicios** (icono "+")
   - Busca **Drive API** → pulsa **Añadir**
8. Guarda el proyecto (Ctrl+S o el icono de disquete).

---

## Primer uso

1. **Prepara los archivos en Drive:**
   - Sube los archivos XLS de credit status a `BASE DE DATOS/EURO` o `BASE DE DATOS/DOLAR` según corresponda.
   - Sube el Excel de clientes exportado de Gextia a `BASE DE DATOS/` (debe contener en el nombre "clientes" o "partners").

2. **Configura el script:**
   - En el Google Sheet: menú **Hilldun → ⚙️ Configurar**
   - El script localiza las carpetas y prepara la pestaña "Clientes".

3. **Importa los clientes:**
   - Menú **Hilldun → 🔄 Actualizar Clientes desde Drive**
   - El script lee todos los archivos XLS de credit status y rellena la pestaña "Clientes".

4. **Revisa los matches automáticos:**
   - La columna **Gextia_Nombre** (fondo amarillo) se rellena automáticamente con el mejor candidato del Excel de clientes Gextia.
   - Verifica y corrige manualmente los que estén vacíos o incorrectos.
   - Este campo es fundamental: es el nombre que se usará para enlazar con las facturas al generar el archivo de Hilldun.

5. **Completa los datos manuales:**
   - **CP** (código postal): los archivos Hilldun no incluyen el CP. Añádelo manualmente.
   - **Teléfono**: añadir si es necesario.

---

## Pestaña Clientes — Columnas

| Col | Nombre | Origen | Editable |
|-----|--------|--------|----------|
| A | Hilldun_Code | Auto (Hilldun XLS) | No |
| B | Hilldun_Nombre | Auto (Hilldun XLS) | No |
| C | **Gextia_Nombre** | Auto-sugerido | **Sí** |
| D | Direccion1 | Auto (Hilldun XLS) | No |
| E | Direccion2 | — | Sí |
| F | Ciudad | Auto (Hilldun XLS) | No |
| G | Estado | Auto (Hilldun XLS) | No |
| H | CP | — | **Sí** |
| I | Pais | Auto (Hilldun XLS) | No |
| J | Telefono | — | Sí |
| K | Terminos | Auto (Hilldun XLS) | No |
| L | Monedas | Auto (EUR/USD/EUR+USD) | No |
| M | Activo | Auto (true) | Sí |
| N | Notas | — | Sí |
| O | Ultima_Actualizacion | Auto | No |

---

## Archivos de credit status de Hilldun

El script reconoce automáticamente el formato de los archivos XLS de credit status. Cabecera esperada (fila 1):

```
debtor | company | address | city | state | country | refnumber | start | completion | terms | ponumber | amount | decision | clicompany
```

Si hay varios archivos para el mismo cliente (varias solicitudes de crédito), se conserva la dirección y términos del más reciente (campo `start`).

Si el mismo cliente aparece en archivos EURO y DOLAR, la columna `Monedas` mostrará `EUR+USD`.

---

## Auto-matching con Gextia

El script normaliza los nombres (minúsculas, sin puntuación ni abreviaciones legales como SRL/LTD/SPA/LLC) y busca el nombre Gextia con mayor proporción de palabras en común.

Umbral de confianza: ≥50% de palabras clave coincidentes. Los que no alcanzan el umbral aparecen con `Gextia_Nombre` vacío — rellénalos manualmente.

Ejemplos:
- `HARRODS LTD` → `Harrods (London)` ✓
- `BIFFI BOUTIQUE SPA` → `Biffi Boutiques S.p.A.` ✓
- `YOOX NET A PORTER GROUP YNAP SPA` → busca "ynap" → `Ynap Corporation (clifton)` ✓
