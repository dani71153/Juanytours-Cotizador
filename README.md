# Cotizador — Juanytours

Sistema de cotización web offline para Juanytours. Corre directamente en el navegador (sin servidor), guarda todo en IndexedDB y localStorage.

---

## Funciones a Futuro

Ideas pendientes de implementar — agregar aquí antes de olvidar.

- [ ] **Envío por WhatsApp / Email** — botón para compartir el PDF o un resumen de la cotización directamente desde la app
- [ ] **Historial de cambios** — ver versiones anteriores de una cotización antes de sobreescribir
- [ ] **Múltiples empresas** — soporte para cambiar entre perfiles de empresa sin editar el JS
- [ ] **Plantillas de servicios** — guardar descripciones y montos frecuentes para insertar con un clic
- [ ] **Descuentos por ítem o globales** — campo de descuento (%) sobre la tabla de servicios
- [ ] **ITBIS configurable por ítem** — además de exento/gravado, permitir porcentajes distintos por fila
- [ ] **Sincronización en la nube** — backup automático a Google Drive, Dropbox, o un backend propio
- [ ] **Modo oscuro** — toggle en la barra de control
- [ ] **Estadísticas** — pantalla en la biblioteca con totales del mes, cliente más frecuente, etc.
- [ ] **Numeración por tipo de documento** — secuencias separadas para Cotización, Factura, Proforma
- [ ] **Firma digital / sello** — área para agregar imagen de firma en el pie del documento
- [ ] Compartir en linea - Agregar un link ,como google drive que te permite ir al formulario alojado en mi pagina web, y ver la cotización, el link podria expirar en un tiempo determinado, y asi podria enviarlo a mis compañeros de equipo y trabajar sobre una base especifica.

---

## Estructura del Proyecto

```
Juanytours- Cotizador/
├── index.html                 # Estructura completa de la UI
├── data/
│   └── empresa.js             # Datos de la empresa (editable)
├── shared/
│   └── tasa.js                # Módulo de tasa de cambio (TasaCambio)
├── database/
│   ├── db.js                  # Inicialización de IndexedDB (JDB)
│   └── cotizaciones.js        # CRUD sobre la base de datos (CotDB)
├── permanencia/
│   ├── sesion.js              # Persistencia de pestañas abiertas (Sesion)
│   └── borrador.js            # Autoguardado continuo del editor (Borrador)
├── js/
│   └── app.js                 # Lógica principal, TabManager, Biblioteca
└── css/
    ├── estilos.css            # Estilos del documento/editor
    └── biblioteca.css         # Estilos del panel biblioteca y componentes
```

---

## Bloques Funcionales

### 1. `data/empresa.js` — Configuración de Empresa

Objeto global `window.EMPRESA` con toda la información de la empresa. Es el único archivo que el usuario necesita editar para personalizar la app.

| Sección | Qué contiene |
|---|---|
| `empresa` | Nombre, RNC, dirección, teléfono, email, ruta del logo |
| `banco` | Nombre del banco, cuentas USD/DOP, IBANs, SWIFT |
| `fiscal` | Porcentaje ITBIS, moneda local (DOP), moneda extranjera (USD), tasa de cambio por defecto |
| `numeracion` | Prefijo de numeración (`COT-`) y número de inicio |

---

### 2. `shared/tasa.js` — Módulo de Tasa de Cambio (`TasaCambio`)

Módulo IIFE que gestiona dos tasas independientes:

- **Tasa oficial** — referencia del Banco Central (informativa)
- **Tasa fija** — tasa bloqueada para el documento actual; si está definida, sobreescribe la oficial en los cálculos

**API pública relevante:**

| Método | Qué hace |
|---|---|
| `TasaCambio.get()` | Devuelve la tasa activa (fija si existe, si no la oficial) |
| `TasaCambio.setOficial(n)` | Actualiza la tasa de referencia |
| `TasaCambio.setFija(n)` | Bloquea una tasa personalizada (`null` = quitar) |
| `TasaCambio.mostrarEditor()` | Abre el modal de gestión de tasa |
| `TasaCambio.confirmarEditor()` | Aplica los valores ingresados en el modal |

El badge `· tasa oficial` / `★ tasa fija` en el documento refleja el modo activo. Al hacer clic en el badge también abre el modal.

---

### 3. `database/db.js` — Base de Datos IndexedDB (`JDB`)

Abre y configura la base de datos `JuanytoursDB` (versión 1). Exporta `window.JDB`.

- Crea el object store `cotizaciones` con `autoIncrement` en la primera ejecución
- Índices creados: `idx_numero`, `idx_estado`, `idx_fechaCreacion`, `idx_cliente`
- Reutiliza la misma instancia de `IDBDatabase` entre llamadas (caché interna `_db`)
- Expone `JDB.getDB()` → `Promise<IDBDatabase>` para que el resto de módulos abran transacciones

---

### 4. `database/cotizaciones.js` — CRUD de Cotizaciones (`CotDB`)

Capa de acceso a datos sobre el store de IndexedDB. Exporta `window.CotDB`.

Cada registro almacenado tiene la forma:

```js
{
  id, numero, cliente, estado,   // "activa" | "archivada"
  cantItems, totalDOP,
  fechaCreacion, fechaModif,
  datos  // snapshot completo del editor (serializado)
}
```

| Método | Qué hace |
|---|---|
| `CotDB.guardar(registro)` | Inserta una cotización nueva, devuelve el `id` |
| `CotDB.actualizar(id, cambios)` | Merge con el registro existente, actualiza `fechaModif` |
| `CotDB.obtener(id)` | Lee un registro por id |
| `CotDB.listar()` | Devuelve todos los registros |
| `CotDB.archivar(id)` / `restaurar(id)` | Cambia `estado` sin eliminar |
| `CotDB.eliminar(id)` | Eliminación definitiva |
| `CotDB.buscar(texto)` | Filtra por número o nombre de cliente (case-insensitive) |

---

### 5. `permanencia/sesion.js` — Persistencia de Sesión (`Sesion`)

Guarda en `localStorage` (`jt_sesion`) qué pestañas estaban abiertas y cuál era la activa. Permite restaurar exactamente el estado visual al reabrir el navegador.

| Método | Qué hace |
|---|---|
| `Sesion.guardar(tabs, activeTabId)` | Serializa el estado de pestañas actual |
| `Sesion.restaurar(tabManager)` | Al iniciar: recrea las pestañas y activa la última abierta. Si hay un borrador más reciente que el guardado en DB, lo usa y muestra aviso. Devuelve `true` si restauró algo. |
| `Sesion.limpiar()` | Borra la sesión guardada |

---

### 6. `permanencia/borrador.js` — Autoguardado del Editor (`Borrador`)

Guarda en `localStorage` (`jt_borrador`) el estado del editor activo cada vez que el usuario edita algo, con un debounce de 1.5 segundos. Si el navegador se cierra inesperadamente, el borrador se recupera al volver.

| Método | Qué hace |
|---|---|
| `Borrador.guardar(estado, tabId)` | Guarda con debounce de 1.5s |
| `Borrador.guardarUltimoConocido()` | Guarda inmediatamente el último estado recibido (usado en `beforeunload`) |
| `Borrador.cargar()` | Devuelve `{ timestamp, tabId, estado }` o `null` |
| `Borrador.limpiar()` | Elimina el borrador (se llama cuando se persiste en IndexedDB) |
| `Borrador.existe()` | Boolean — hay borrador pendiente |

---

### 7. `js/app.js` — Lógica Principal

Archivo central. Contiene los siguientes sub-bloques:

#### 7.1 Inicialización (`DOMContentLoaded`)
Carga datos de empresa, registra listeners, sincroniza el contador de numeración contra IndexedDB y arranca `TabManager`.

#### 7.2 Datos de Empresa (`poblarEmpresa`, `renderBanco`)
Toma `window.EMPRESA` y llena el DOM del encabezado: logo, nombre, dirección, RNC, teléfono, cuentas bancarias, ITBIS. Guarda defaults en `window._DEFAULTS` para nuevas cotizaciones.

#### 7.3 TabManager
Objeto que gestiona las pestañas abiertas. Cada pestaña es `{ id, tipo, numero, dbId, sinGuardar }`.

| Método | Qué hace |
|---|---|
| `TabManager.init()` | Carga la pestaña Biblioteca + intenta restaurar sesión anterior |
| `TabManager.nuevaTab(datos, dbId)` | Abre una pestaña nueva (cotización en blanco o con datos) |
| `TabManager.activar(tabId)` | Cambia de pestaña activa; autoguarda la anterior |
| `TabManager.cerrar(tabId, e)` | Cierra una pestaña; autoguarda si era la activa |
| `TabManager.marcarSinGuardar()` | Pone el punto naranja en la pestaña y lanza `Borrador.guardar()` |
| `TabManager._autoGuardar()` | Persiste la pestaña activa en IndexedDB sin interacción del usuario |
| `TabManager.renderTabs()` | Regenera el HTML de la barra de pestañas |

#### 7.4 Serialización del Editor (`capturarEstado`, `restaurarEstado`, `iniciarEstadoVacio`)

- `capturarEstado()` — lee todos los campos del DOM y devuelve un objeto plano con el estado completo de la cotización (campos de cabecera, items, tasa)
- `restaurarEstado(datos)` — aplica un objeto guardado al DOM
- `iniciarEstadoVacio(numero)` — resetea el editor para una cotización nueva, añade una fila vacía

#### 7.5 Guardar / Cargar

| Función | Qué hace |
|---|---|
| `guardarManual()` | Guarda o actualiza en IndexedDB, muestra toast de confirmación |
| `cargarCotizacion(id)` | Carga desde DB; si ya está abierta, activa esa pestaña |
| `archivarCotizacion(id)` | Alterna entre archivar/restaurar una cotización de la biblioteca |
| `eliminarCotizacionDB(id)` | Elimina de DB y cierra la pestaña si estaba abierta |
| `duplicarCotizacion(id)` | Copia los datos con un número nuevo y la abre en pestaña nueva |

#### 7.6 Biblioteca (`renderBiblioteca`, `_crearItemBib`)

Panel principal de la app. Muestra todas las cotizaciones guardadas ordenadas por fecha de modificación. Soporta búsqueda en tiempo real por número o cliente. Cada tarjeta muestra estado (activa/archivada), número, cliente, cantidad de servicios, total DOP y acciones: Cargar, Duplicar, PDF, Archivar/Restaurar, Eliminar.

#### 7.7 Respaldo JSON (`exportarRespaldoJSON`, `importarRespaldoJSON`)

- **Exportar** — descarga un `.json` con todas las cotizaciones de la base de datos
- **Importar** — lee ese `.json`, inserta cada cotización con un `id` nuevo (evita conflictos), actualiza el contador de numeración

#### 7.8 Filas de Servicios

| Función | Qué hace |
|---|---|
| `agregarFila()` | Agrega un ítem de servicio nuevo |
| `agregarNota()` | Agrega una fila de texto libre (no suma a totales) |
| `eliminarFila(id)` | Elimina; protege contra eliminar el último ítem |
| `moverFila(id, dir)` | Sube o baja una fila (reordena `cot.items`) |
| `renderFilas()` | Regenera el `<tbody>` completo desde `cot.items`; agrega filas decorativas si hay menos de 3 ítems |
| `actualizarFila(id, campo, valor)` | Parsea y guarda un campo editado en el objeto de la fila |
| `cambiarTipo(id, tipo)` | Alterna exento/gravado de un ítem y recalcula |
| `_syncItemsDesdeDOM()` | Lee el DOM y actualiza `cot.items` antes de serializar (para capturar ediciones en curso) |

#### 7.9 Cálculo de Totales (`calcularTotales`)

Lee cantidad y monto de cada fila del DOM, separa exentos y gravados, aplica ITBIS al subtotal gravado, muestra Total DOP y convierte a USD usando la tasa activa. Se llama cada vez que hay un cambio en montos, cantidades o tasa.

#### 7.10 Tipo de Documento (`cambiarTipoDoc`)

Sincroniza el selector de tipo (COTIZACIÓN / FACTURA DE CRÉDITO FISCAL / FACTURA / PROFORMA) con los dos textos del documento que muestran el tipo.

#### 7.11 Exportar PDF (`exportarPDF`, `exportarPDFGuardada`)

Cambia el `document.title` al número de la cotización para que el nombre del archivo PDF sea correcto, luego llama `window.print()`. Los elementos con clase `.no-print` (barra de control, columnas de acciones, modal) se ocultan via CSS.

#### 7.12 Listeners Globales (`iniciarListeners`)

Registra eventos sobre: cambio de tipo de documento, edición directa de la tasa en el documento, cambio de fecha, edición del número, clic en el badge de tasa, `beforeunload` (guarda sesión y borrador de emergencia), y todos los `contenteditable` del documento para marcar sin guardar.

#### 7.13 Helpers Internos

| Función | Qué hace |
|---|---|
| `_generarNumero()` | Genera el siguiente número con prefijo, incrementa el contador en localStorage |
| `_sincronizarContador()` | Al iniciar o importar: lee IndexedDB y localStorage para partir del número más alto existente |
| `_metaDatos(estado)` | Extrae los campos de índice (número, cliente, cantItems, totalDOP) para guardar en el registro de DB |
| `_computarTotal(items, itbsPct)` | Calcula el total DOP de un snapshot de items (usado al guardar metadata) |
| `_formatFecha(iso)` | Convierte una fecha ISO a texto relativo ("hace 5 min", "hace 2 días") o fecha corta |
| `mostrarToast(msg, error)` | Muestra la notificación flotante de confirmación/error por 2.2 segundos |
| `formatNum(n)` | Formatea número con separadores de miles en locale `es-DO` |
| `parseMonto(str)` | Parsea un string con comas y espacios a `float` |
| `escHTML(str)` | Escapa caracteres HTML para inserción segura en el DOM |

---

### 8. `index.html` — Estructura de la UI

| Sección | Descripción |
|---|---|
| **Barra de Control** (`#barra-control`) | Logo + nombre del sistema. Muestra acciones contextuales: en vista Biblioteca → botón "Nueva Cotización"; en vista Editor → Guardar, + Servicio, + Nota, Tasa, PDF |
| **Tab Bar** (`#tab-bar`) | Barra de pestañas generada por `TabManager.renderTabs()`. La primera pestaña siempre es "Biblioteca". |
| **Panel Biblioteca** (`#panel-biblioteca`) | Vista principal al abrir la app. Encabezado con contador, botones de importar/exportar respaldo, buscador y lista de cotizaciones. |
| **Documento / Editor** (`#documento`) | El documento imprimible: encabezado con logo y datos de empresa, sección cliente, tabla de servicios, bloque de totales con tasa de cambio, sección de pago con cuentas bancarias. |
| **Modal Tasa de Cambio** (`#modal-tasa`) | Permite ingresar la tasa oficial del Banco Central (referencia) y elegir entre usarla o definir una tasa fija para el documento. |
| **Toast de Guardado** (`#toast-guardado`) | Notificación flotante de confirmación, oculta por defecto. |

---

### 9. `css/estilos.css` y `css/biblioteca.css` — Estilos

- **`estilos.css`** — estilos del documento imprimible (encabezado, tabla de servicios, totales, sección de pago, modal de tasa, barra de control, tab bar, toast). Incluye reglas `@media print` que ocultan todo lo que no va al PDF.
- **`biblioteca.css`** — estilos del panel biblioteca (tarjetas de cotización, buscador, badges de estado activa/archivada, botones de acción por tarjeta).

---

## Flujo de Datos

```
Inicio
  └─ DOMContentLoaded
       ├─ poblarEmpresa()       ← lee empresa.js
       ├─ iniciarListeners()
       ├─ _sincronizarContador() ← Lee IndexedDB + localStorage
       └─ TabManager.init()
            └─ Sesion.restaurar()
                 ├─ [sí hay sesión] recrea pestañas + carga desde IndexedDB
                 │    └─ [hay borrador más reciente] usa borrador de localStorage
                 └─ [no hay sesión] muestra Biblioteca

Editar cotización
  └─ cambios en DOM
       ├─ calcularTotales()
       └─ TabManager.marcarSinGuardar()
            └─ Borrador.guardar()  ← debounce 1.5s → localStorage

Guardar (manual o al cambiar de pestaña)
  └─ CotDB.guardar() / CotDB.actualizar()  ← IndexedDB
       └─ Borrador.limpiar() + Sesion.guardar()

Exportar PDF
  └─ document.title = numero → window.print() → restaurar title
```
