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
│   ├── formula.js             # Evaluador de fórmulas de la columna de importes (Formula)
│   ├── plantilla.js           # Markup del documento (Plantilla)
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

Si la cotización activa **nunca se guardó** (`dbId: null`), el borrador es la única copia que
existe: antes se descartaba en ese caso y al recargar se perdía todo lo escrito — el síntoma
era "el ajuste de importes se pierde al recargar". Ahora se aplica igual, la pestaña queda
marcada como sin guardar, y el borrador **no** se borra tras usarlo, para que una segunda
recarga sin guardar tampoco lo pierda.

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


`renderBanco(ba, em)` rellena el grid de cuentas de la plantilla clásica y, en LAPS, reconstruye las líneas bancarias con `Plantilla.lineasBanco()`. En LAPS `#doc-banco-nombre` es el contenedor de **todas** las líneas (banco, cuenta, páguese a, RNC), no sólo del nombre: escribir ahí un solo texto borraba las demás.

#### 7.2.1 Overrides de Empresa (`EmpresaCfg`)

Lo que se escribe en **Opciones → Empresa y banco** se guarda en `localStorage`
(`jt_empresa_cfg`, indexado por perfil) y se aplica encima de `data/empresa.js`, que queda
intacto.

Dos reglas que evitan perder datos sin darse cuenta:

- **Un campo en blanco no es un override**: significa "usa el valor de `data/empresa.js`".
  Antes se guardaba el vacío y se aplicaba encima, así que un campo que se quedó sin llenar
  al pulsar *Aplicar* borraba ese dato del documento **para siempre** y sin señal alguna —
  era lo que hacía desaparecer la cuenta bancaria de LAPS. Ahora sólo se persisten los
  campos con contenido, y vaciar uno equivale a quitarle el override.
- **`EmpresaCfg.base(sec, key)`** guarda una copia intacta de `window.PERFILES` (en
  `window.PERFILES_BASE`) antes de aplicar cualquier override, porque `aplicarGuardado()`
  escribe sobre los objetos del perfil. Sin esa copia, quitar un override no podía devolver
  el valor de partida.

El **vendedor es bidireccional**: al salir del campo en el documento, si el valor cambió,
`EmpresaCfg.fijar('defectos', 'vendedor', …)` lo guarda como defecto de la empresa (y refresca
el input de Opciones si el modal está abierto); desde Opciones viaja al documento abierto. Sólo
se sincroniza cuando el valor **cambió** durante esa edición, para que pasar por el campo de una
cotización vieja sin tocarlo no reescriba el defecto con un nombre antiguo.

`guardarEmpresaOpciones()` actualiza además el vendedor y el texto de validez del documento
abierto **si aún mostraban el defecto anterior** — comparando contra el valor que tenían los
defectos antes de guardar. Si se escribió un nombre a mano en el documento, se respeta.
(Antes sólo los rellenaba cuando el campo estaba vacío, y como la plantilla LAPS los
pre-rellena, nunca se actualizaban.)

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
| `actualizarFila(id, campo, valor)` | Parsea y guarda un campo editado en el objeto de la fila; en `monto` acepta fórmulas (ver `js/formula.js`) |
| `cambiarTipo(id, tipo)` | Alterna exento/gravado de un ítem y recalcula |
| `_syncItemsDesdeDOM()` | Lee el DOM y actualiza `cot.items` antes de serializar (para capturar ediciones en curso) |

#### 7.8.1 Fórmulas en la Columna de Importes (`js/formula.js` — `Formula`)

La celda de importe acepta expresiones aritméticas, no sólo números. Se evalúan con un
parser propio (descenso recursivo, **sin `eval()`**).

| Se escribe | Resultado | Para qué |
|---|---|---|
| `1500+1500*10%` | `1,650.00` | precio viejo + porciento de aumento |
| `1500+10%` | `1,650.00` | igual, en corto: un `%` suelto se aplica sobre lo acumulado a su izquierda |
| `1500+1500(10%)` | `1,650.00` | multiplicación implícita |
| `1500-10%` | `1,350.00` | descuento |
| `(120+30)*2` | `300.00` | agrupación |
| `1,250.50 x 3` | `3,751.50` | la coma es separador de miles; `x` y `×` valen por `*` |
| `2500/2` | `1,250.00` | división |

Comportamiento tipo hoja de cálculo:

- La celda **muestra el resultado** ya formateado; la fórmula tal como se escribió queda
  guardada en `data-formula` y en `fila.formula`.
- Al **enfocar** la celda reaparece la fórmula para poder corregirla; al salir (o con
  `Enter`) vuelve el resultado. `Escape` descarta lo escrito.
- Mientras se escribe, un globito muestra el resultado en vivo (`= 1,650.00`) o el error.
- Un triangulito en la esquina marca las celdas con fórmula. Es marca de editor:
  **no sale en la vista final ni impresa**.
- Una fórmula inválida se pinta en rojo, se muestra tal cual y suma `0` — el error salta
  a la vista en lugar de imprimir un `0.00` mudo.
- Las fórmulas **se guardan** con la cotización y **sobreviven al HTML exportado**, donde
  se siguen pudiendo editar (el export incrusta este mismo módulo vía `Formula.fuente()`).

| Función | Qué hace |
|---|---|
| `Formula.evaluar(texto)` | `{ ok, valor, esFormula, error }` |
| `Formula.esFormula(texto)` | `true` si no es un número pelado |
| `Formula.valorCelda(cel)` | Número vigente de una celda (respeta la edición en curso) |
| `Formula.datosCelda(cel)` | `{ monto, formula }` para serializar |
| `Formula.engancharCelda(cel, opts)` | Instala el comportamiento de hoja de cálculo |
| `Formula.attrsCelda(fila)` | Atributos `data-formula`/`title` al renderizar |
| `Formula.fuente()` | Código del módulo, para incrustarlo en el HTML exportado |

#### 7.8.3 Detector de Importes con Fórmula

El triangulito de la celda es discreto a propósito (no se imprime), pero al revisar una
cotización hace falta saber **de un golpe** qué importes salieron de una fórmula y si alguna
quedó mal escrita.

En la barra aparece un aviso **solo cuando el documento tiene fórmulas**:

- `ƒ 3 con fórmula` — cuántos importes se calcularon.
- `ƒ 5 · 1 con error` en rojo y latiendo — hay fórmulas inválidas (suman `0`).

Al pulsarlo se abre el listado (`#modal-formulas`): nº de fila, descripción, la fórmula tal
cual, su resultado, y un botón **Ver** que cierra el modal, lleva la fila a la vista y la
resalta un par de segundos. Las inválidas salen en rojo con el motivo.

Se recalcula solo: `actualizarAvisoFormulas()` se llama al final de `calcularTotales()` y de
`renderFilas()`, así que el aviso sigue al documento mientras se escribe, al aplicar un
ajuste en lote, al corregir una fórmula o al abrir una cotización guardada.

La vista previa del ajuste en lote (7.8.2) marca además con `ƒ` las filas que **ya** traían
fórmula, y el tooltip dice en qué se convertirá — `800+1200` → `(800+1200)+15%`.

| Función | Qué hace |
|---|---|
| `_filasConFormula()` | Filas con fórmula, con su nº visible, resultado y si es válida |
| `actualizarAvisoFormulas()` | Enciende, apaga y redacta el aviso de la barra |
| `abrirModalFormulas()` / `cerrarModalFormulas()` | Abren y cierran el listado |
| `renderModalFormulas()` | Pinta el listado y el resumen |
| `irAFila(id)` | Cierra el modal, hace scroll a la fila y la resalta |

#### 7.8.2 Ajuste de Importes por Rango de Filas

Botón **`% Ajustar`** de la barra (modal `#modal-ajuste`). Aplica un mismo ajuste a los
importes de las filas elegidas — un aumento a media cotización sin tocar celda por celda.

- **Ajuste**: `+10%`, `-5%`, `*1.18`, `/2`, `+250`. Sin signo delante se entiende que suma.
  Hay chips con los ajustes más usados.
- **Desde / hasta la fila**: dos selectores con las filas numeradas como en la tabla (las
  notas no cuentan; las filas ocultas se marcan `· oculta`). Si el rango va al revés, se endereza.
- **Vista previa**: cada fila afectada con su `viejo → nuevo`, más la suma de las filas
  afectadas (importe × cantidad) antes y después. `Aplicar` sólo se habilita si el ajuste es válido.
- El resultado queda como **fórmula editable** (`1500+10%`), no como número pelado, así que el
  precio anterior sigue a la vista en la celda. Si el importe ya tenía fórmula, se envuelve en
  paréntesis: `(800+200)*1.18`.
- **Deshacer**: el botón aparece en el modal tras aplicar y devuelve los importes al valor previo
  (sólo para la pestaña donde se aplicó).
- **Recuerda lo último** (mientras no se recargue la página): al reabrir el modal vuelven el
  ajuste y el rango de la vez anterior, así aplicar el mismo % a otro grupo de filas son dos clics.
  Si se borraron filas, el rango se recorta a las que existen.
- La tarjeta del modal está limitada a `88vh` con la cabecera y el pie fijos y el cuerpo
  desplazable: en portátiles de pantalla baja el botón **Aplicar** y los selectores de rango
  quedaban fuera de la pantalla y sin forma de desplazarse. `.modal-overlay` también desplaza
  (`align-items: flex-start` + `margin: auto` en la tarjeta), así que ningún modal puede
  recortarse fuera del alcance.

| Función | Qué hace |
|---|---|
| `abrirModalAjuste()` / `cerrarModalAjuste()` | Abre y cierra el modal; al abrir sincroniza desde el DOM y llena los selectores |
| `ponerAjuste(txt)` | Rellena el campo desde un chip |
| `previsualizarAjuste()` | Recalcula la vista previa, el conteo y el estado del botón Aplicar |
| `aplicarAjuste()` | Escribe las fórmulas nuevas, guarda el snapshot para deshacer y avisa por toast |
| `deshacerAjuste()` | Restaura los importes del último ajuste |
| `_itemsConNumero()` | Ítems con el número de fila visible (ignora notas) |
| `_normalizarAjuste(txt)` | Agrega el `+` implícito |
| `_formulaAjustada(fila, ajuste)` | Arma la fórmula nueva envolviendo la vieja si hacía falta |

#### 7.9 Cálculo de Totales (`calcularTotales`)

Lee cantidad y monto de cada fila del DOM (el monto vía `Formula.valorCelda`, por si es una fórmula), separa exentos y gravados, aplica ITBIS al subtotal gravado, muestra Total DOP y convierte a USD usando la tasa activa. Se llama cada vez que hay un cambio en montos, cantidades o tasa.

#### 7.10 Tipo de Documento (`cambiarTipoDoc`)

Sincroniza el selector de tipo (COTIZACIÓN / FACTURA DE CRÉDITO FISCAL / FACTURA / PROFORMA) con los dos textos del documento que muestran el tipo.

#### 7.11 Exportar PDF (`exportarPDF`, `exportarPDFGuardada`)

Cambia el `document.title` al número de la cotización para que el nombre del archivo PDF sea correcto, luego llama `window.print()`. Los elementos con clase `.no-print` (barra de control, columnas de acciones, modal) se ocultan via CSS.

#### 7.11.1 Documentos de Más de Una Hoja (`prepararImpresion`)

En una sola hoja conviene `@page { margin: 0 }`: sin margen el navegador no tiene dónde
imprimir su encabezado y su pie (título, fecha, URL, nº de página), y el margen visual lo
pone el `padding` de `.pagina`.

El problema es que el `padding` de un bloque sólo se dibuja al principio y al final del
bloque, **no en cada hoja**: en cuanto el documento pasaba de una página, la segunda salía
con el contenido pegado al borde del papel.

`prepararImpresion()` se llama en el evento `beforeprint` (lo dispara Ctrl+P, el botón PDF
y el diálogo del sistema) y también al exportar HTML. Mide el documento con la tipografía
de impresión — activando momentáneamente `.vista-impresion`, que la reproduce — y si no
cabe en la hoja elegida:

- pone la clase `doc-multi-hoja` en el `<body>`
- reescribe la regla de `#estilo-hoja` a `@page { margin: 14mm 0 }` — el margen vertical se
  repite en **todas** las hojas
- el margen lateral (16 mm) lo sigue poniendo el `padding` de `.pagina`, porque el padding
  horizontal sí se aplica en cada hoja; así la franja azul del encabezado sigue llegando a
  los dos bordes
- deja 3 mm de aire bajo esa franja azul en la primera hoja

Si el documento vuelve a caber en una hoja, la regla vuelve a `margin: 0`. Un documento de
una página imprime exactamente igual que antes de este cambio.

El archivo HTML exportado lleva las dos reglas y repite el cálculo en su propio
`beforeprint`: como sus campos son editables, puede pasar de una hoja después de exportarlo.

Los cortes los gobiernan reglas `break-inside` / `break-after` en `@media print`
(`css/estilos.css`): no se parte una fila de servicio ni el bloque de totales, datos
bancarios o firmas, el encabezado no se queda solo al final de una hoja, y los títulos de
columna de la tabla se repiten en cada página (`thead { display: table-header-group }`).

| Función | Qué hace |
|---|---|
| `prepararImpresion()` | Decide si hace falta paginar, marca el `body` y reescribe la regla `@page`; devuelve `true` si son varias hojas |
| `_documentoNoCabe(pag)` | Mide el contenido con la tipografía de impresión y lo compara con el alto útil de la hoja |
| `_altoHojaPx(hoja, orientacion)` | Alto de la hoja en px de pantalla |
| `_mmAPx(mm)` | Convierte mm a px de pantalla (misma proporción que el ancho) |
| `_reglaPagina(hoja, orientacion, multi)` | Genera la regla `@page` (y el padding de `.pagina` cuando hay varias hojas) |

#### 7.12 Listeners Globales (`iniciarListeners`)

Registra eventos sobre: cambio de tipo de documento, edición directa de la tasa en el documento, cambio de fecha, edición del número, clic en el badge de tasa, `beforeunload` (guarda sesión y borrador de emergencia), y todos los `contenteditable` del documento para marcar sin guardar. Sobre `window` engancha además `beforeprint` → `prepararImpresion()` (ver 7.11.1).

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
| **Barra de Control** (`#barra-control`) | Logo + nombre del sistema. Muestra acciones contextuales: en vista Biblioteca → botón "Nueva Cotización"; en vista Editor → Guardar, + Servicio, + Nota, % Ajustar, Tasa, Opciones, Vista final, Exportar |
| **Tab Bar** (`#tab-bar`) | Barra de pestañas generada por `TabManager.renderTabs()`. La primera pestaña siempre es "Biblioteca". |
| **Panel Biblioteca** (`#panel-biblioteca`) | Vista principal al abrir la app. Encabezado con contador, botones de importar/exportar respaldo, buscador y lista de cotizaciones. |
| **Documento / Editor** (`#documento`) | El documento imprimible: encabezado con logo y datos de empresa, sección cliente, tabla de servicios, bloque de totales con tasa de cambio, sección de pago con cuentas bancarias. |
| **Modal Tasa de Cambio** (`#modal-tasa`) | Permite ingresar la tasa oficial del Banco Central (referencia) y elegir entre usarla o definir una tasa fija para el documento. |
| **Modal Ajustar Importes** (`#modal-ajuste`) | Aplica un aumento o descuento a los importes de un rango de filas, con vista previa y deshacer (ver 7.8.2). |
| **Modal Importes con Fórmula** (`#modal-formulas`) | Listado de las filas cuyo importe sale de una fórmula, con su resultado y las inválidas en rojo (ver 7.8.3). Se abre desde el aviso `ƒ` de la barra. |
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
