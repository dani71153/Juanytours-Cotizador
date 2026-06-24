# Juanytours — Sistema de Cotización

Aplicación web de escritorio para crear, guardar y exportar cotizaciones de viaje. Funciona completamente **sin servidor ni internet** — solo abre `index.html` en Chrome o Edge.

---

## Cómo usar

1. Abre `index.html` en **Chrome** o **Edge**
2. La app carga con la **Biblioteca** (listado de cotizaciones guardadas)
3. Presiona **+ Nueva Cotización** para crear una
4. Edita el documento directamente haciendo clic sobre los campos
5. Usa **💾 Guardar** o cambia de pestaña para guardar automáticamente
6. Usa **↓ PDF** para exportar (imprime como PDF desde el navegador)

---

## Estructura de carpetas

```
cotizacion_plantilla/
│
├── index.html                 ← Punto de entrada — abre este archivo
│
├── data/
│   └── empresa.js             ← Datos de tu empresa (editable)
│
├── database/
│   ├── db.js                  ← Configuración de IndexedDB
│   └── cotizaciones.js        ← CRUD de cotizaciones en IndexedDB
│
├── shared/
│   └── tasa.js                ← Módulo de tasa de cambio USD/DOP
│
├── permanencia/
│   ├── sesion.js              ← Restaura pestañas abiertas al reabrir
│   └── borrador.js            ← Respaldo automático del editor
│
├── css/
│   ├── estilos.css            ← Estilos del documento/editor
│   └── biblioteca.css         ← Estilos del tab bar y la Biblioteca
│
└── js/
    └── app.js                 ← Lógica principal de la aplicación
```

---

## Archivos — detalle

### `index.html`
Estructura HTML principal. Contiene:
- **Barra de control** — botones de acción (guardar, agregar servicio, exportar PDF, tasa)
- **Tab bar** — pestañas de cotizaciones abiertas + pestaña Biblioteca
- **Panel Biblioteca** — lista de cotizaciones guardadas con buscador
- **Documento/Editor** — el cotizador en sí, con todos los campos editables
- **Modal de Tasa** — ventana para gestionar la tasa oficial y la tasa fija

Carga los scripts en este orden:
```html
data/empresa.js → shared/tasa.js → database/db.js → database/cotizaciones.js
→ permanencia/sesion.js → permanencia/borrador.js → js/app.js
```

---

### `data/empresa.js`

**Archivo de configuración principal.** Aquí se editan todos los datos de la empresa. Se carga como `window.EMPRESA`.

```js
window.EMPRESA = {
  empresa: {
    nombre:    "Juanytours",
    rnc:       "133029189",
    direccion: "El Millón, Calle Caña Dulce",
    ciudad:    "República Dominicana",
    telefono:  "809-771-2790",
    email:     "reservas@juanytours.com",
    logo:      "../Logo de Juanytours nav-bar sin fondo.png"
  },
  banco: {
    pagueA:         "Juanytours",
    nombre:         "BANCO DE RESERVAS ...",
    cuentaUSD:      "",        // ← completar
    cuentaDOP:      "",        // ← completar
    ibanUSD:        "",
    ibanDOP:        "",
    swift:          ""
  },
  fiscal: {
    itbisPorcentaje:   18,
    monedaLocal:       "DOP",
    monedaExtranjera:  "USD",
    tipoCambioDefault: 60.65
  },
  numeracion: {
    prefijo:   "COT-",
    siguiente: 1
  }
};
```

---

### `database/db.js`

Abre y configura la base de datos **IndexedDB** local del navegador.

- **Base de datos:** `JuanytoursDB` (versión 1)
- **Object Store:** `cotizaciones`
- **Índices:** `numero`, `estado`, `fechaCreacion`, `cliente`
- Reutiliza la conexión entre llamadas (caché interna)
- Expone: `window.JDB.getDB()` → `Promise<IDBDatabase>`

Los datos se guardan físicamente en el perfil del navegador en tu PC. No se borran al cerrar el navegador, solo si limpias el caché manualmente.

---

### `database/cotizaciones.js`

CRUD completo sobre el store de IndexedDB. Expone `window.CotDB`.

| Método | Descripción |
|---|---|
| `CotDB.guardar(registro)` | Crea una nueva cotización, devuelve el `id` asignado |
| `CotDB.actualizar(id, cambios)` | Actualiza campos de un registro existente |
| `CotDB.obtener(id)` | Lee un registro por su `id` |
| `CotDB.listar()` | Devuelve todos los registros |
| `CotDB.buscar(texto)` | Filtra por número o cliente |
| `CotDB.archivar(id)` | Cambia el estado a `"archivada"` |
| `CotDB.restaurar(id)` | Cambia el estado a `"activa"` |
| `CotDB.eliminar(id)` | Elimina definitivamente un registro |

**Estructura de cada registro:**
```js
{
  id:            number,      // auto-increment
  numero:        "COT-001",
  cliente:       "Juan Pérez",
  estado:        "activa" | "archivada",
  cantItems:     2,           // cantidad de servicios
  totalDOP:      65380.70,
  fechaCreacion: "2026-06-24T...",
  fechaModif:    "2026-06-24T...",
  datos:         { ... }      // snapshot completo del editor
}
```

---

### `shared/tasa.js`

Módulo compartido para gestionar la tasa de cambio USD → DOP. Puede importarse en cualquier otra página del sistema. Expone `window.TasaCambio`.

**Concepto de dos tasas:**
- **Tasa oficial** — publicada por el Banco Central (referencia informativa)
- **Tasa fija** — tasa personalizada que se usa en los cálculos del documento

URL del Banco Central: `https://www.bancentral.gov.do/SectorExterno/HistoricoTasas`

| Método | Descripción |
|---|---|
| `TasaCambio.get()` | Tasa activa (fija si está definida, si no la oficial) |
| `TasaCambio.getOficial()` | Solo la tasa oficial |
| `TasaCambio.getFija()` | La tasa fija (`null` si no hay) |
| `TasaCambio.setOficial(n)` | Actualiza la tasa de referencia |
| `TasaCambio.setFija(n)` | Define una tasa fija (pasa `null` para quitarla) |
| `TasaCambio.clearFija()` | Elimina la tasa fija, vuelve a usar la oficial |
| `TasaCambio.mostrarEditor()` | Abre el modal de gestión de tasas |
| `TasaCambio.confirmarEditor()` | Valida y aplica los valores del modal |
| `TasaCambio.URL_BANCENTRAL` | Constante con la URL oficial |

Un badge en el documento indica si se está usando la tasa oficial (🔵) o la tasa fija (🟡). Hacer clic en el badge abre el modal.

---

### `permanencia/sesion.js`

Controla **qué pestañas estaban abiertas** y cuál estaba activa. Guarda en `localStorage` con la clave `jt_sesion`.

Al cerrar la app:
- Se guarda un listado de tabs con su número y su `id` de IndexedDB

Al abrir la app:
1. Lee la sesión guardada
2. Recrea las pestañas en el Tab Manager
3. Carga el contenido del tab activo desde IndexedDB
4. Si hay un borrador más reciente, lo usa en vez del de IndexedDB

| Método | Descripción |
|---|---|
| `Sesion.guardar(tabs, activeTabId)` | Guarda el estado actual de los tabs |
| `Sesion.restaurar(tabManager)` | Restaura la sesión anterior (async) |
| `Sesion.limpiar()` | Borra la sesión guardada |

---

### `permanencia/borrador.js`

Guarda el **estado completo del editor** en `localStorage` (`jt_borrador`) continuamente mientras el usuario edita, como seguro ante cierres accidentales.

- Espera **1.5 segundos** sin cambios antes de escribir (debounce), para no saturar
- En `beforeunload` (cierre del navegador) guarda inmediatamente y de forma síncrona
- Si al abrir la app el borrador es más reciente que lo guardado en IndexedDB, se recupera automáticamente con un toast de aviso
- Se limpia automáticamente al guardar exitosamente en IndexedDB

| Método | Descripción |
|---|---|
| `Borrador.guardar(estado, tabId)` | Guarda con debounce de 1.5s |
| `Borrador.guardarUltimoConocido()` | Guarda inmediatamente (para beforeunload) |
| `Borrador.cargar()` | Lee el borrador guardado (`null` si no existe) |
| `Borrador.limpiar()` | Borra el borrador |
| `Borrador.existe()` | `true` si hay un borrador en localStorage |

---

### `css/estilos.css`

Estilos del **documento de cotización** (la hoja imprimible) y elementos globales.

- Variables de color: `--azul` `#0052A5`, `--azul-dark` `#003A78`
- Layout del documento: ancho 860px, centrado, sombra
- Encabezado con logo y datos de empresa
- Tabla de servicios con filas editables
- Sección de totales (Excento, Gravado, ITBIS, DOP, USD)
- Sección de pago / banco
- Modal de tasa de cambio
- `@media print` — oculta todos los controles, mantiene solo el documento

---

### `css/biblioteca.css`

Estilos del **sistema de pestañas** y del **panel Biblioteca**.

- Tab bar: fondo blanco, sombra, separación visual clara del header
- Tab activo: subrayado azul (`#0052A5`) en la parte inferior
- Panel Biblioteca: lista de cotizaciones con badge de estado, info y botones de acción
- Toast de confirmación de guardado
- `@media print` — oculta el tab bar y la biblioteca completamente

---

### `js/app.js`

Lógica principal de la aplicación. Contiene:

#### `TabManager`
Objeto que gestiona las pestañas abiertas.

| Método | Descripción |
|---|---|
| `TabManager.init()` | Inicializa, intenta restaurar sesión anterior |
| `TabManager.nuevaTab(datos, dbId)` | Crea y abre una pestaña nueva |
| `TabManager.activar(tabId)` | Cambia la pestaña activa (auto-guarda antes) |
| `TabManager.cerrar(tabId, e)` | Cierra una pestaña (auto-guarda antes) |
| `TabManager.marcarSinGuardar()` | Activa el punto naranja y dispara el borrador |
| `TabManager.actualizarNumero(num)` | Actualiza el título de la pestaña activa |

#### Serialización del editor

| Función | Descripción |
|---|---|
| `capturarEstado()` | Lee todo el DOM del editor y devuelve un objeto plano |
| `restaurarEstado(datos)` | Aplica un objeto plano al DOM del editor |
| `iniciarEstadoVacio()` | Carga una cotización en blanco en el editor |

#### Gestión de ítems en la tabla

| Función | Descripción |
|---|---|
| `agregarFila()` | Añade una fila de servicio |
| `agregarNota()` | Añade una fila de nota (ancho completo, sin montos) |
| `eliminarFila(id)` | Elimina una fila (mínimo 1 servicio siempre) |
| `renderFilas()` | Re-renderiza toda la tabla de items desde `cot.items` |
| `calcularTotales()` | Recalcula Excento, Gravado, ITBIS, DOP y USD |

#### Biblioteca

| Función | Descripción |
|---|---|
| `renderBiblioteca()` | Carga y muestra la lista de cotizaciones guardadas |
| `cargarCotizacion(id)` | Abre una cotización guardada en una pestaña |
| `duplicarCotizacion(id)` | Crea una copia de la cotización con número nuevo |
| `archivarCotizacion(id)` | Archiva o restaura una cotización |
| `eliminarCotizacionDB(id)` | Elimina definitivamente con confirmación |
| `exportarPDFGuardada(id)` | Carga la cotización y abre el diálogo de impresión |
| `exportarRespaldoJSON()` | Descarga todas las cotizaciones como archivo JSON |
| `importarRespaldoJSON()` | Importa cotizaciones desde un archivo JSON de respaldo |
| `moverFila(id, dir)` | Mueve una fila arriba (`-1`) o abajo (`1`) en la tabla |

---

## Flujos principales

### Crear y guardar una cotización

```
+ Nueva Cotización
    → crea pestaña nueva con número auto-generado (COT-001, COT-002…)
    → editor en blanco
    → usuario edita campos
        → cada cambio: marcarSinGuardar() → Borrador.guardar() [1.5s]
    → 💾 Guardar o cambiar de pestaña
        → capturarEstado() → CotDB.guardar/actualizar() → IndexedDB
        → Borrador.limpiar()
        → Sesion.guardar()
```

### Restaurar al reabrir la app

```
DOMContentLoaded
    → Sesion.restaurar()
        → lee jt_sesion de localStorage
        → recrea tabs en TabManager
        → carga el tab activo desde IndexedDB
        → ¿hay borrador en jt_borrador más reciente?
            Sí → usa el borrador, marca tab como sin guardar, toast "Borrador recuperado"
            No → usa los datos de IndexedDB
```

### Exportar a PDF

```
↓ PDF (en barra de control)
    → window.print()
    → CSS @media print oculta tab bar, barra, biblioteca, botones
    → el navegador muestra el diálogo de impresión
    → seleccionar "Guardar como PDF"
```

---

## Almacenamiento

| Qué | Dónde | Cuándo se borra |
|---|---|---|
| Cotizaciones guardadas | IndexedDB (`JuanytoursDB`) | Al eliminarlas manualmente |
| Pestañas abiertas | `localStorage` → `jt_sesion` | Al cerrar la pestaña del navegador no; persiste |
| Borrador activo | `localStorage` → `jt_borrador` | Al guardar exitosamente en IndexedDB |

> **Nota:** Los datos de IndexedDB están ligados al navegador y al perfil del usuario en esta PC. No se sincronizan entre computadoras. Para transferir cotizaciones, usa la función de exportar PDF.

---

## Configuración rápida

Para adaptar la app a otra empresa edita **solo** `data/empresa.js`:

1. Cambia `nombre`, `rnc`, `direccion`, `telefono`, `email`
2. Actualiza la ruta del `logo`
3. Completa los datos bancarios si los tienes (`cuentaUSD`, `cuentaDOP`, `ibanUSD`, `ibanDOP`, `swift`)
4. Ajusta `tipoCambioDefault` con la tasa actual
5. Cambia `prefijo` si quieres otro formato (ej. `"FAC-"` en vez de `"COT-"`)

No es necesario tocar ningún otro archivo.
