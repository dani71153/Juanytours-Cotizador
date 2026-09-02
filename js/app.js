// =============================================
//  JUANYTOURS — COTIZADOR
//  app.js — Lógica principal + TabManager + Biblioteca
// =============================================

// Estado del editor (cotización actualmente visible)
const cot = {
  items: []     // tipo 'item': { id, type, desc, cantidad, monto, tipo }
                // tipo 'nota': { id, type, texto }
};

let contadorFilas = 0;

// =============================================
//  INIT
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  const emp = window.EMPRESA;
  if (!emp) { alert('No se pudo cargar empresa.js'); return; }

  EmpresaCfg.aplicarGuardado();   // ← overrides de RNC / banco desde Opciones
  poblarEmpresa(emp);
  iniciarListeners();
  await _sincronizarContador();   // ← inicializa el contador de numeración
  await TabManager.init();
});

// =============================================
//  DATOS DE EMPRESA
// =============================================
function poblarEmpresa(e) {
  const em = e.empresa, ba = e.banco, fi = e.fiscal, nu = e.numeracion;

  setImg('doc-logo', em.logo || '');
  setImg('nav-logo', em.logo || '');

  setText('doc-empresa-nombre', em.nombre   || '');
  setText('doc-empresa-dir',    em.direccion || '');
  setText('doc-empresa-ciudad', em.ciudad   || '');
  setText('doc-empresa-tel',    em.telefono ? 'Teléfono: ' + em.telefono : '');
  setText('doc-empresa-rnc',    em.rnc      ? 'RNC: ' + em.rnc : '');

  setText('doc-itbis-pct',    fi.itbisPorcentaje   || 18);
  setText('doc-moneda-ext',   fi.monedaExtranjera  || 'USD');
  setText('lbl-moneda-local', fi.monedaLocal        || 'DOP');
  setText('lbl-moneda-ext',   fi.monedaExtranjera  || 'USD');

  setText('doc-pague-a',      ba.pagueA   || em.nombre);
  setText('doc-rnc-pago',     em.rnc      || '');
  setText('doc-banco-nombre', ba.nombre   || '');

  // Guardar defaults para nuevas cotizaciones
  window._DEFAULTS = {
    tasaOficial: fi.tipoCambioDefault || 60.65,
    prefijo:     nu.prefijo     || 'COT-',
    siguiente:   nu.siguiente   || 1,
    itbis:       fi.itbisPorcentaje || 18
  };

  renderBanco(ba);
}

function renderBanco(ba) {
  const ok = ba.cuentaUSD || ba.cuentaDOP || ba.ibanUSD || ba.ibanDOP;
  const c  = document.getElementById('bloque-cuentas');
  if (!ok) { c.innerHTML = ''; return; }
  c.innerHTML = `
    <div class="pc-celda"><span class="pc-label">${ba.cuentaUSDLabel||'CUENTA USD AHORRO'}:</span> ${ba.cuentaUSD||''}</div>
    <div class="pc-celda"><span class="pc-label">IBAN:</span> ${ba.ibanUSD||''}</div>
    <div class="pc-swift" style="grid-row:1/3"><span class="pc-label">SWIFT:</span><span>${ba.swift||''}</span></div>
    <div class="pc-celda" style="border-bottom:none"><span class="pc-label">${ba.cuentaDOPLabel||'CUENTA DOP CORRIENTE'}:</span> ${ba.cuentaDOP||''}</div>
    <div class="pc-celda" style="border-bottom:none"><span class="pc-label">IBAN:</span> ${ba.ibanDOP||''}</div>`;
}

// =============================================
//  CONFIGURACIÓN DE EMPRESA / BANCO EDITABLE
//  Guarda overrides en localStorage y los aplica
//  sobre window.EMPRESA (data/empresa.js queda intacto).
// =============================================
const EmpresaCfg = {
  KEY: 'jt_empresa_cfg',

  // Campos editables: id del input → ruta dentro de window.EMPRESA
  CAMPOS: {
    'opc-emp-rnc':      ['empresa', 'rnc'],
    'opc-ban-pague':    ['banco',   'pagueA'],
    'opc-ban-nombre':   ['banco',   'nombre'],
    'opc-ban-usd-lbl':  ['banco',   'cuentaUSDLabel'],
    'opc-ban-usd':      ['banco',   'cuentaUSD'],
    'opc-ban-iban-usd': ['banco',   'ibanUSD'],
    'opc-ban-dop-lbl':  ['banco',   'cuentaDOPLabel'],
    'opc-ban-dop':      ['banco',   'cuentaDOP'],
    'opc-ban-iban-dop': ['banco',   'ibanDOP'],
    'opc-ban-swift':    ['banco',   'swift']
  },

  leer() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; }
    catch (e) { return {}; }
  },

  // Mezcla el override guardado sobre window.EMPRESA
  aplicarGuardado() {
    const cfg = this.leer();
    const E   = window.EMPRESA;
    if (!E) return;
    Object.values(this.CAMPOS).forEach(([sec, key]) => {
      const val = cfg[sec]?.[key];
      if (val !== undefined && E[sec]) E[sec][key] = val;
    });
  },

  // Vuelca los valores actuales en los inputs del modal
  poblarInputs() {
    const E = window.EMPRESA || {};
    Object.entries(this.CAMPOS).forEach(([id, [sec, key]]) => {
      const inp = document.getElementById(id);
      if (inp) inp.value = E[sec]?.[key] ?? '';
    });
  },

  // Lee los inputs, persiste y refresca el documento
  guardarDesdeInputs() {
    const cfg = {};
    const E   = window.EMPRESA || {};
    Object.entries(this.CAMPOS).forEach(([id, [sec, key]]) => {
      const inp = document.getElementById(id);
      if (!inp) return;
      const val = inp.value.trim();
      (cfg[sec] = cfg[sec] || {})[key] = val;
      if (E[sec]) E[sec][key] = val;
    });
    try { localStorage.setItem(this.KEY, JSON.stringify(cfg)); }
    catch (e) { console.warn('[EmpresaCfg] No se pudo guardar:', e); }
    poblarEmpresa(E);
  },

  // Descarta los overrides y recarga los valores de data/empresa.js
  restablecer() {
    localStorage.removeItem(this.KEY);
    return true;
  }
};

function guardarEmpresaOpciones() {
  EmpresaCfg.guardarDesdeInputs();
  mostrarToast('✓ Datos de empresa aplicados');
}

function restablecerEmpresaOpciones() {
  if (!confirm('¿Restablecer el RNC y los datos bancarios a los valores originales de empresa.js? Se recargará la página.')) return;
  EmpresaCfg.restablecer();
  location.reload();
}

// =============================================
//  VISIBILIDAD DE ELEMENTOS DEL DOCUMENTO
//  Cada clave añade la clase "sin-<clave>" al
//  documento: se atenúa en pantalla y desaparece
//  al imprimir / exportar. El dato nunca se borra.
// =============================================
const OPC_VIS = ['tasa', 'numero', 'ref', 'ncf', 'excento', 'gravado', 'itbis'];

// Lee el estado de visibilidad actual desde las clases del documento
function leerOpcionesVis() {
  const doc = document.getElementById('documento');
  const o   = {};
  OPC_VIS.forEach(k => { o[k] = !!doc?.classList.contains('sin-' + k); });
  return o;
}

// Aplica un objeto de visibilidad al documento
function aplicarOpcionesVis(ocultar) {
  const doc = document.getElementById('documento');
  if (!doc) return;
  const o = ocultar || {};
  OPC_VIS.forEach(k => doc.classList.toggle('sin-' + k, !!o[k]));
}

function toggleOpcion(clave) {
  const doc = document.getElementById('documento');
  if (!doc || !OPC_VIS.includes(clave)) return;
  doc.classList.toggle('sin-' + clave);
  actualizarTogglesOpciones();
  TabManager.marcarSinGuardar();
}

// Atajos: "Total uniforme" deja sólo TOTAL DOP / TOTAL USD
function aplicarPresetTotales(preset) {
  const doc = document.getElementById('documento');
  if (!doc) return;
  const ocultar = preset === 'uniforme';
  ['excento', 'gravado', 'itbis'].forEach(k => doc.classList.toggle('sin-' + k, ocultar));
  actualizarTogglesOpciones();
  TabManager.marcarSinGuardar();
}

// Refresca el texto/color de todos los botones del modal
function actualizarTogglesOpciones() {
  const vis = leerOpcionesVis();
  OPC_VIS.forEach(k => {
    const btn = document.getElementById('opc-toggle-' + k);
    if (!btn) return;
    btn.textContent = vis[k] ? 'Oculto' : 'Visible';
    btn.className   = 'opc-toggle ' + (vis[k] ? 'opc-toggle-off' : 'opc-toggle-on');
  });

  const exp = document.getElementById('opc-explica-totales');
  if (exp) {
    const uniforme = vis.excento && vis.gravado && vis.itbis;
    exp.textContent = uniforme
      ? 'Modo total uniforme: sólo se imprime el TOTAL. El ITBIS se sigue calculando y está incluido en el monto.'
      : 'Lo que ocultes desaparece del PDF y del HTML exportado, pero se sigue sumando al TOTAL.';
  }
}

// Compatibilidad con la versión anterior (botón de tasa)
function toggleOcultarTasa()   { toggleOpcion('tasa'); }
function actualizarToggleTasa() { actualizarTogglesOpciones(); }

// =============================================
//  TAB MANAGER
// =============================================
const TabManager = {
  tabs:      [],   // [{ id, tipo:'biblioteca'|'cotizacion', numero, dbId, sinGuardar }]
  activeId:  'biblioteca',

  async init() {
    this.tabs    = [{ id: 'biblioteca', tipo: 'biblioteca' }];
    this.activeId = 'biblioteca';

    // Intentar restaurar sesión anterior
    const restaurado = await Sesion.restaurar(this);
    if (!restaurado) {
      this.renderTabs();
      this._modoEditor(false);
      await renderBiblioteca();
    }
  },

  // Crear nueva pestaña de cotización
  async nuevaTab(datos = null, dbId = null) {
    await this._autoGuardar();

    const tabId  = 'tab-' + Date.now();
    const numero = datos?.numero || _generarNumero();

    this.tabs.push({ id: tabId, tipo: 'cotizacion', numero, dbId, sinGuardar: !dbId });
    await this._activarTab(tabId, datos);
    Sesion.guardar(this.tabs, this.activeId);
  },

  // Activar pestaña
  async activar(tabId) {
    if (tabId === this.activeId) return;
    await this._autoGuardar();
    await this._activarTab(tabId, null);
    Sesion.guardar(this.tabs, this.activeId);
  },

  // Cerrar pestaña
  async cerrar(tabId, e) {
    e.stopPropagation();
    if (this.activeId === tabId) await this._autoGuardar();
    this.tabs = this.tabs.filter(t => t.id !== tabId);
    if (this.activeId === tabId) {
      const prev = this.tabs[this.tabs.length - 1] || this.tabs[0];
      await this._activarTab(prev.id, null);
    } else {
      this.renderTabs();
    }
    Sesion.guardar(this.tabs, this.activeId);
  },

  // Marcar pestaña activa como sin guardar (al editar)
  marcarSinGuardar() {
    const tab = this._tabActivo();
    if (tab && tab.tipo === 'cotizacion') {
      tab.sinGuardar = true;
      this.renderTabs();
      // Guardar borrador en localStorage (debounced 1.5s)
      Borrador.guardar(capturarEstado(), tab.id);
    }
  },

  // Actualizar el título de la pestaña activa
  actualizarNumero(numero) {
    const tab = this._tabActivo();
    if (tab) { tab.numero = numero; this.renderTabs(); }
  },

  // ── Privados ────────────────────────────────
  async _activarTab(tabId, datosIniciales) {
    this.activeId = tabId;
    this.renderTabs();

    if (tabId === 'biblioteca') {
      this._modoEditor(false);
      await renderBiblioteca();
    } else {
      this._modoEditor(true);
      if (datosIniciales) {
        restaurarEstado(datosIniciales);
      } else {
        // Tab restaurado de sesión: cargar desde IndexedDB si tiene dbId
        const tab = this._tabActivo();
        if (tab?.dbId) {
          try {
            const reg = await CotDB.obtener(tab.dbId);
            if (reg) { restaurarEstado(reg.datos); return; }
          } catch (e) {
            console.warn('[Tab] Error cargando desde DB:', e);
          }
        }
        iniciarEstadoVacio(tab?.numero);
      }
    }
  },

  async _autoGuardar() {
    const tab = this._tabActivo();
    if (!tab || tab.tipo === 'biblioteca') return;
    try {
      const estado = capturarEstado();
      const meta   = _metaDatos(estado);
      if (tab.dbId) {
        await CotDB.actualizar(tab.dbId, { ...meta, datos: estado });
      } else {
        const id = await CotDB.guardar({ ...meta, datos: estado, estado: 'activa' });
        tab.dbId = id;
      }
      tab.sinGuardar = false;
      this.renderTabs();
      Borrador.limpiar();                              // ya está en IndexedDB, no hace falta el borrador
      Sesion.guardar(this.tabs, this.activeId);        // actualizar referencia de dbId en localStorage
    } catch (err) {
      console.warn('[AutoGuardado] Error:', err);
    }
  },

  _tabActivo() {
    return this.tabs.find(t => t.id === this.activeId);
  },

  _modoEditor(mostrar) {
    const bib  = document.getElementById('bc-bib-acciones');
    const edit = document.getElementById('bc-editor-acciones');
    const pan  = document.getElementById('panel-biblioteca');
    const doc  = document.getElementById('documento');
    if (bib)  bib.style.display  = mostrar ? 'none' : '';
    if (edit) edit.style.display = mostrar ? ''     : 'none';
    if (pan)  pan.style.display  = mostrar ? 'none' : '';
    if (doc)  doc.style.display  = mostrar ? ''     : 'none';
  },

  renderTabs() {
    const lista = document.getElementById('tabs-lista');
    lista.innerHTML = '';

    this.tabs.forEach(tab => {
      const el = document.createElement('div');
      el.className = 'tab-item' + (tab.id === this.activeId ? ' activo' : '');
      el.onclick   = () => this.activar(tab.id);

      if (tab.tipo === 'biblioteca') {
        el.classList.add('tab-biblioteca');
        el.innerHTML = '<span class="tab-ico">&#x1F4DA;</span> Biblioteca';
      } else {
        const punto = tab.sinGuardar ? ' <span style="color:#F0A500;font-size:16px">•</span>' : '';
        el.innerHTML = `
          <span class="tab-num">${escHTML(tab.numero || 'Nueva')}${punto}</span>
          <button class="tab-cerrar"
                  onclick="TabManager.cerrar('${tab.id}', event)"
                  title="Cerrar">&#215;</button>`;
      }

      lista.appendChild(el);
    });
  }
};

// =============================================
//  SERIALIZACIÓN DEL EDITOR
// =============================================

// Captura el estado actual del editor a un objeto plano
function capturarEstado() {
  _syncItemsDesdeDOM(); // asegura que cot.items esté actualizado

  return {
    numero:      getCE('doc-numero'),
    tipoDoc:     document.getElementById('sel-tipo-doc')?.value || 'COTIZACIÓN',
    fecha:       document.getElementById('doc-fecha')?.value    || hoy(),
    ref:         getCE('doc-ref'),
    cliente:     getCE('doc-cliente'),
    telCli:      getCE('doc-cli-tel'),
    rncCli:      getCE('doc-cli-rnc'),
    ncf:         getCE('doc-ncf'),
    items:       JSON.parse(JSON.stringify(cot.items)),
    tasaOficial: typeof TasaCambio !== 'undefined' ? TasaCambio.getOficial() : 60.65,
    tasaFija:    typeof TasaCambio !== 'undefined' ? TasaCambio.getFija()    : null,
    metodo:      getCE('doc-metodo'),
    notas:       getCE('doc-notas'),
    ocultar:     leerOpcionesVis(),
    // Se conserva por compatibilidad con cotizaciones guardadas antes
    ocultarTasa: document.getElementById('documento')?.classList.contains('sin-tasa') || false
  };
}

// Aplica un estado guardado al editor
function restaurarEstado(datos) {
  setCE('doc-numero', datos.numero || '');
  setCE('doc-ref',    datos.ref    || '');
  setCE('doc-cliente',datos.cliente|| '');
  setCE('doc-cli-tel',datos.telCli || '');
  setCE('doc-cli-rnc',datos.rncCli || '');
  setCE('doc-ncf',    datos.ncf    || '');
  setCE('doc-metodo', datos.metodo || '');
  setCE('doc-notas',  datos.notas  || '');

  const sel = document.getElementById('sel-tipo-doc');
  if (sel && datos.tipoDoc) { sel.value = datos.tipoDoc; cambiarTipoDoc(datos.tipoDoc); }

  const fecha = document.getElementById('doc-fecha');
  if (fecha) fecha.value = datos.fecha || hoy();

  // Restaurar items
  cot.items    = datos.items ? JSON.parse(JSON.stringify(datos.items)) : [];
  contadorFilas = cot.items.reduce((m, f) => Math.max(m, f.id), 0);
  renderFilas();

  // Restaurar tasa
  if (typeof TasaCambio !== 'undefined') {
    TasaCambio.setOficial(datos.tasaOficial || window._DEFAULTS?.tasaOficial || 60.65);
    TasaCambio.setFija(datos.tasaFija ?? null);
  }

  // Restaurar visibilidad de elementos en PDF/exportación
  // (formato antiguo: sólo existía "ocultarTasa")
  aplicarOpcionesVis(datos.ocultar || { tasa: !!datos.ocultarTasa });

  calcularTotales();
}

// Inicializa una cotización en blanco (nueva pestaña)
// numero: si ya fue generado por nuevaTab(), úsalo directamente para no incrementar el contador dos veces
function iniciarEstadoVacio(numero = null) {
  const d = window._DEFAULTS || {};
  const num = numero || _generarNumero();

  setCE('doc-numero', num);
  setCE('doc-ref',    '');
  setCE('doc-cliente','');
  setCE('doc-cli-tel','');
  setCE('doc-cli-rnc','');
  setCE('doc-ncf',    '');
  setCE('doc-metodo', '');
  setCE('doc-notas',  '');

  const sel = document.getElementById('sel-tipo-doc');
  if (sel) { sel.value = 'COTIZACIÓN'; cambiarTipoDoc('COTIZACIÓN'); }

  document.getElementById('doc-fecha').value = hoy();

  cot.items = [];
  contadorFilas = 0;
  agregarFila();

  if (typeof TasaCambio !== 'undefined') {
    TasaCambio.setOficial(d.tasaOficial || 60.65);
    TasaCambio.setFija(null);
  }

  aplicarOpcionesVis({});

  calcularTotales();
  TabManager.actualizarNumero(num);
}

// =============================================
//  GUARDAR / CARGAR
// =============================================

// Guardado manual (con toast de confirmación)
async function guardarManual() {
  const tab = TabManager.tabs.find(t => t.id === TabManager.activeId);
  if (!tab || tab.tipo === 'biblioteca') return;

  try {
    const estado = capturarEstado();
    const meta   = _metaDatos(estado);

    if (tab.dbId) {
      await CotDB.actualizar(tab.dbId, { ...meta, datos: estado });
    } else {
      const id = await CotDB.guardar({ ...meta, datos: estado, estado: 'activa' });
      tab.dbId = id;
    }

    tab.sinGuardar = false;
    TabManager.renderTabs();
    Borrador.limpiar();
    Sesion.guardar(TabManager.tabs, TabManager.activeId);
    mostrarToast('✓ Guardado');
  } catch (err) {
    console.error('[Guardar]', err);
    mostrarToast('✗ Error al guardar', true);
  }
}

// Cargar desde la biblioteca
async function cargarCotizacion(id) {
  try {
    const reg = await CotDB.obtener(id);
    if (!reg) { alert('Cotización no encontrada.'); return; }

    // Si ya está abierta, activar esa pestaña
    const existente = TabManager.tabs.find(t => t.dbId === id);
    if (existente) { await TabManager.activar(existente.id); return; }

    await TabManager.nuevaTab(reg.datos, id);
  } catch (err) {
    console.error('[Cargar]', err);
    alert('Error al cargar la cotización.');
  }
}

// Archivar desde la biblioteca
async function archivarCotizacion(id) {
  try {
    const reg = await CotDB.obtener(id);
    if (!reg) return;
    const accion = reg.estado === 'activa' ? 'archivar' : 'restaurar';
    if (!confirm(`¿Deseas ${accion} esta cotización?`)) return;
    if (reg.estado === 'activa') {
      await CotDB.archivar(id);
    } else {
      await CotDB.restaurar(id);
    }
    await renderBiblioteca();
  } catch (err) { console.error('[Archivar]', err); }
}

// Eliminar desde la biblioteca
async function eliminarCotizacionDB(id) {
  if (!confirm('¿Eliminar esta cotización? Esta acción no se puede deshacer.')) return;
  try {
    await CotDB.eliminar(id);
    // Si está abierta en una pestaña, cerrarla
    const tab = TabManager.tabs.find(t => t.dbId === id);
    if (tab) {
      TabManager.tabs = TabManager.tabs.filter(t => t.id !== tab.id);
      if (TabManager.activeId === tab.id) {
        await TabManager._activarTab('biblioteca', null);
      }
      TabManager.renderTabs();
    }
    await renderBiblioteca();
  } catch (err) { console.error('[Eliminar]', err); }
}

// =============================================
//  BIBLIOTECA
// =============================================
async function renderBiblioteca() {
  const lista   = document.getElementById('bib-lista');
  const busqueda = document.getElementById('bib-buscar-inp')?.value || '';

  lista.innerHTML = '<p class="bib-cargando">Cargando...</p>';

  try {
    let items = busqueda.trim()
      ? await CotDB.buscar(busqueda)
      : await CotDB.listar();

    // Ordenar: más recientes primero
    items.sort((a, b) => new Date(b.fechaModif || 0) - new Date(a.fechaModif || 0));

    const activas = items.filter(i => i.estado === 'activa').length;
    setText('bib-contador', `${activas} guardada${activas !== 1 ? 's' : ''}`);

    if (!items.length) {
      lista.innerHTML = `<p class="bib-vacia">
        ${busqueda ? 'No se encontraron resultados.' : 'No hay cotizaciones guardadas aún.<br>Presiona <strong>+ Nueva Cotización</strong> para comenzar.'}
      </p>`;
      return;
    }

    lista.innerHTML = '';
    items.forEach(item => lista.appendChild(_crearItemBib(item)));

  } catch (err) {
    lista.innerHTML = '<p class="bib-error">Error al cargar la biblioteca.</p>';
    console.error(err);
  }
}

function _crearItemBib(item) {
  const div = document.createElement('div');
  div.className = 'bib-item' + (item.estado === 'archivada' ? ' bib-item-archivada' : '');

  const esActiva  = item.estado === 'activa';
  const fechaStr  = _formatFecha(item.fechaModif || item.fechaCreacion);
  const totalStr  = item.totalDOP ? `RD$ ${formatNum(item.totalDOP)}` : '';
  const abierta   = TabManager.tabs.find(t => t.dbId === item.id);

  div.innerHTML = `
    <div class="bi-badge ${esActiva ? 'bi-badge-activa' : 'bi-badge-archivada'}">
      ${esActiva ? '● Activa' : '◉ Archivada'}
    </div>
    <div class="bi-info">
      <div class="bi-numero">${escHTML(item.numero || 'Sin número')}${abierta ? ' <span style="font-size:10px;color:#0052A5">(abierta)</span>' : ''}</div>
      <div class="bi-cliente">${escHTML(item.cliente || 'Sin cliente')}</div>
      <div class="bi-meta">
        <span>&#x1F4CB; ${item.cantItems || 0} servicio${item.cantItems !== 1 ? 's' : ''}</span>
        ${totalStr ? `<span>${totalStr}</span>` : ''}
        <span>&#x1F551; ${fechaStr}</span>
      </div>
    </div>
    <div class="bi-acciones">
      <button class="bi-btn bi-btn-cargar"
              onclick="cargarCotizacion(${item.id})">&#x2191; Cargar</button>
      <button class="bi-btn bi-btn-duplicar"
              onclick="duplicarCotizacion(${item.id})">Duplicar</button>
      <button class="bi-btn bi-btn-pdf"
              onclick="exportarPDFGuardada(${item.id})">&#x2193; PDF</button>
      <button class="bi-btn ${esActiva ? 'bi-btn-archivar' : 'bi-btn-restaurar'}"
              onclick="archivarCotizacion(${item.id})">
        ${esActiva ? 'Archivar' : 'Restaurar'}
      </button>
      <button class="bi-btn bi-btn-eliminar"
              onclick="eliminarCotizacionDB(${item.id})">Eliminar</button>
    </div>`;

  return div;
}

// Exportar PDF de una cotización guardada (cargándola primero)
async function exportarPDFGuardada(id) {
  await cargarCotizacion(id);
  // Pequeño delay para que el DOM se pinte
  setTimeout(exportarPDF, 300);
}

// ─── Duplicar cotización ──────────────────────
async function duplicarCotizacion(id) {
  try {
    const reg = await CotDB.obtener(id);
    if (!reg) return;
    const nuevoNumero = _generarNumero();
    const estado = { ...reg.datos, numero: nuevoNumero };
    await TabManager.nuevaTab(estado, null);   // null = nuevo registro, aún sin guardar
  } catch (err) { console.error('[Duplicar]', err); }
}

// ─── Exportar respaldo JSON ───────────────────
async function exportarRespaldoJSON() {
  try {
    const todas = await CotDB.listar();
    const payload = {
      version:      1,
      timestamp:    new Date().toISOString(),
      empresa:      window.EMPRESA?.empresa?.nombre || 'Juanytours',
      cotizaciones: todas
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `juanytours-respaldo-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast(`✓ Respaldo de ${todas.length} cotizaciones descargado`);
  } catch (err) {
    console.error('[Exportar respaldo]', err);
    mostrarToast('✗ Error al exportar', true);
  }
}

// ─── Importar respaldo JSON ───────────────────
function importarRespaldoJSON() {
  const inp    = document.createElement('input');
  inp.type     = 'file';
  inp.accept   = '.json';
  inp.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const texto = await file.text();
      const datos = JSON.parse(texto);
      if (!datos.cotizaciones || !Array.isArray(datos.cotizaciones)) {
        alert('El archivo no es un respaldo válido de Juanytours.');
        return;
      }
      let importadas = 0;
      for (const cot of datos.cotizaciones) {
        const { id, ...sinId } = cot;    // descartar el id original, IndexedDB asigna uno nuevo
        await CotDB.guardar(sinId);
        importadas++;
      }
      await _sincronizarContador();      // actualizar contador de numeración
      await renderBiblioteca();
      mostrarToast(`✓ ${importadas} cotizaciones importadas`);
    } catch (err) {
      console.error('[Importar respaldo]', err);
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  inp.click();
}

// =============================================
//  FILAS DE SERVICIOS
// =============================================

function agregarFila() {
  contadorFilas++;
  cot.items.push({ id: contadorFilas, type: 'item', desc: '', cantidad: 1, monto: 0, tipo: 'exento' });
  renderFilas();
  TabManager.marcarSinGuardar();
}

function agregarNota() {
  contadorFilas++;
  cot.items.push({ id: contadorFilas, type: 'nota', texto: '' });
  renderFilas();
  TabManager.marcarSinGuardar();
}

function eliminarFila(id) {
  const esItem     = cot.items.find(f => f.id === id)?.type === 'item';
  const totalItems = cot.items.filter(f => f.type === 'item').length;
  if (esItem && totalItems <= 1) return;
  cot.items = cot.items.filter(f => f.id !== id);
  renderFilas();
  calcularTotales();
  TabManager.marcarSinGuardar();
}

function moverFila(id, dir) {
  const idx = cot.items.findIndex(f => f.id === id);
  if (idx === -1) return;
  const nuevoIdx = idx + dir;
  if (nuevoIdx < 0 || nuevoIdx >= cot.items.length) return;
  [cot.items[idx], cot.items[nuevoIdx]] = [cot.items[nuevoIdx], cot.items[idx]];
  renderFilas();
  calcularTotales();
  TabManager.marcarSinGuardar();
}

function renderFilas() {
  const tbody = document.getElementById('tabla-body');
  tbody.innerHTML = '';
  let numItem = 0;

  cot.items.forEach((fila, idx) => {
    const tr      = document.createElement('tr');
    tr.dataset.id = fila.id;
    if (fila.type === 'item' && fila.visible === false) tr.classList.add('fila-oculta');
    const isFirst = idx === 0;
    const isLast  = idx === cot.items.length - 1;
    const btnOrden = `
      <button class="btn-mover" onclick="moverFila(${fila.id},-1)" ${isFirst ? 'disabled' : ''} title="Subir">&#8593;</button>
      <button class="btn-mover" onclick="moverFila(${fila.id}, 1)" ${isLast  ? 'disabled' : ''} title="Bajar">&#8595;</button>`;

    if (fila.type === 'nota') {
      tr.className = 'tr-nota';
      tr.innerHTML = `
        <td class="td-nota" colspan="4" contenteditable="true"
            data-field="texto"
            data-placeholder="Escribe aquí la nota o aclaración..."
        >${escHTML(fila.texto)}</td>
        <td class="td-tipo no-print"></td>
        <td class="td-del  no-print">
          ${btnOrden}
          <button class="btn-eliminar" onclick="eliminarFila(${fila.id})">&#215;</button>
        </td>`;
      const cel = tr.querySelector('[contenteditable]');
      cel.addEventListener('blur',  () => { fila.texto = cel.innerText.trim(); TabManager.marcarSinGuardar(); });

    } else {
      numItem++;
      tr.innerHTML = `
        <td class="td-num">${numItem}</td>
        <td class="td-det" contenteditable="true" data-field="desc"
            data-placeholder="Descripción del servicio&#10;(puede ser multilínea)"
        >${escHTML(fila.desc)}</td>
        <td class="td-cantidad" contenteditable="true" data-field="cantidad"
            data-placeholder="1">${fila.cantidad}</td>
        <td class="td-monto"   contenteditable="true" data-field="monto"
            data-placeholder="0.00">${formatNum(fila.monto)}</td>
        <td class="td-tipo no-print">
          <select class="sel-tipo-item" onchange="cambiarTipo(${fila.id}, this.value)">
            <option value="exento"  ${fila.tipo==='exento'  ? 'selected' : ''}>Exento</option>
            <option value="gravado" ${fila.tipo==='gravado' ? 'selected' : ''}>Gravado</option>
          </select>
        </td>
        <td class="td-del no-print">
          ${btnOrden}
          <button class="btn-eliminar" onclick="eliminarFila(${fila.id})">&#215;</button>
        </td>`;

      tr.querySelectorAll('[contenteditable]').forEach(cel => {
        cel.addEventListener('blur',  () => { actualizarFila(fila.id, cel.dataset.field, cel.innerText.trim()); TabManager.marcarSinGuardar(); });
        cel.addEventListener('input', () => { if (cel.dataset.field === 'monto' || cel.dataset.field === 'cantidad') calcularTotales(); });
      });
    }

    tbody.appendChild(tr);
  });

  // Filas vacías decorativas
  const total = cot.items.filter(f => f.type === 'item').length;
  for (let x = total; x < 3; x++) {
    const tr2 = document.createElement('tr');
    tr2.className = 'tr-vacio';
    tr2.innerHTML = '<td></td><td></td><td></td><td></td>';
    tbody.appendChild(tr2);
  }
}

function actualizarFila(id, campo, valor) {
  const fila = cot.items.find(f => f.id === id);
  if (!fila) return;
  if (campo === 'cantidad') fila.cantidad = parseFloat(valor) || 1;
  else if (campo === 'monto') fila.monto  = parseMonto(valor);
  else if (campo === 'desc')  fila.desc   = valor;
  calcularTotales();
}

function cambiarTipo(id, tipo) {
  const fila = cot.items.find(f => f.id === id);
  if (fila) { fila.tipo = tipo; calcularTotales(); }
}

// Sincroniza cot.items desde el DOM (antes de serializar)
function _syncItemsDesdeDOM() {
  const tbody = document.getElementById('tabla-body');
  cot.items.forEach(fila => {
    const tr = tbody.querySelector(`tr[data-id="${fila.id}"]`);
    if (!tr) return;
    if (fila.type === 'nota') {
      const cel = tr.querySelector('[data-field="texto"]');
      if (cel) fila.texto = cel.innerText;
    } else {
      const d = tr.querySelector('[data-field="desc"]');
      const c = tr.querySelector('[data-field="cantidad"]');
      const m = tr.querySelector('[data-field="monto"]');
      if (d) fila.desc     = d.innerText;
      if (c) fila.cantidad = parseFloat(c.innerText) || 1;
      if (m) fila.monto    = parseMonto(m.innerText);
    }
  });
}

// =============================================
//  CÁLCULO DE TOTALES
// =============================================
window.calcularTotales = calcularTotales;
function calcularTotales() {
  const tasa    = parseMonto(document.getElementById('doc-tasa')?.innerText || '60.65') || 60.65;
  const itbsPct = parseFloat(document.getElementById('doc-itbis-pct')?.textContent)    || 18;
  const tbody   = document.getElementById('tabla-body');

  let excento = 0, gravado = 0;

  cot.items.forEach(fila => {
    if (fila.type === 'nota') return;
    const tr     = tbody.querySelector(`tr[data-id="${fila.id}"]`);
    if (!tr) return;
    const monto  = parseMonto(tr.querySelector('[data-field="monto"]')?.innerText    || '0');
    const cant   = parseFloat(tr.querySelector('[data-field="cantidad"]')?.innerText || '1') || 1;
    const total  = monto * cant;
    if (fila.tipo === 'gravado') gravado += total; else excento += total;
  });

  const itbs     = gravado * (itbsPct / 100);
  const totalDOP = excento + gravado + itbs;
  const totalUSD = tasa > 0 ? totalDOP / tasa : 0;

  setText('tot-excento', formatNum(excento));
  setText('tot-gravado', formatNum(gravado));
  setText('tot-itbis',   formatNum(itbs));
  document.getElementById('tot-dop').innerHTML = '<strong>' + formatNum(totalDOP) + '</strong>';
  document.getElementById('tot-usd').innerHTML = '<strong>' + formatNum(totalUSD) + '</strong>';
}

// =============================================
//  TIPO DE DOCUMENTO
// =============================================
function cambiarTipoDoc(valor) {
  setText('doc-titulo-texto',  valor);
  setText('cli-tipo-doc-texto',valor);
}

// =============================================
//  VISIBILIDAD TASA EN PDF
// =============================================
function toggleOcultarTasa() {
  const doc = document.getElementById('documento');
  if (!doc) return;
  doc.classList.toggle('sin-tasa');
  TabManager.marcarSinGuardar();
}

function actualizarToggleTasa() {
  const btn   = document.getElementById('opc-toggle-tasa');
  if (!btn) return;
  const oculta = document.getElementById('documento')?.classList.contains('sin-tasa') || false;
  btn.textContent = oculta ? 'Oculto' : 'Visible';
  btn.className   = `opc-toggle ${oculta ? 'opc-toggle-off' : 'opc-toggle-on'}`;
}

// =============================================
//  MODAL OPCIONES DE IMPRESIÓN
// =============================================
function abrirModalOpciones() {
  renderModalOpciones();
  const modal = document.getElementById('modal-opciones');
  if (modal) modal.classList.add('visible');
}

function cerrarModalOpciones() {
  const modal = document.getElementById('modal-opciones');
  if (modal) modal.classList.remove('visible');
}

// Cambia de pestaña dentro del modal de opciones
function opcTab(nombre) {
  document.querySelectorAll('.opc-tab').forEach(b => {
    b.classList.toggle('opc-tab-activa', b.dataset.tab === nombre);
  });
  document.querySelectorAll('.opc-panel').forEach(p => {
    p.classList.toggle('opc-panel-visible', p.id === 'opc-panel-' + nombre);
  });
}

function renderModalOpciones() {
  // Toggles de visibilidad (encabezado + totales)
  actualizarTogglesOpciones();

  // Datos de empresa / banco
  EmpresaCfg.poblarInputs();

  // Lista de servicios
  const lista  = document.getElementById('opc-lista-servicios');
  if (!lista) return;

  const items = cot.items.filter(f => f.type === 'item');
  if (!items.length) {
    lista.innerHTML = '<p style="padding:8px 0;color:#aaa;font-size:12.5px">No hay servicios agregados.</p>';
    return;
  }

  lista.innerHTML = '';
  items.forEach((f, idx) => {
    const visible = f.visible !== false;
    const desc    = f.desc
      ? (f.desc.length > 42 ? f.desc.slice(0, 42) + '…' : f.desc)
      : '(sin descripción)';
    const div = document.createElement('div');
    div.className = 'opc-item';
    div.innerHTML =
      `<span class="opc-item-num">${idx + 1}</span>` +
      `<span class="opc-item-label" title="${escHTML(f.desc || '')}">${escHTML(desc)}</span>` +
      `<button class="opc-toggle ${visible ? 'opc-toggle-on' : 'opc-toggle-off'}"
               onclick="toggleVisibilidadFila(${f.id})">
         ${visible ? 'Visible' : 'Oculto'}
       </button>`;
    lista.appendChild(div);
  });
}

function toggleVisibilidadFila(id) {
  const fila = cot.items.find(f => f.id === id);
  if (!fila || fila.type !== 'item') return;
  fila.visible = fila.visible === false;  // false→true, true/undefined→false
  renderFilas();
  renderModalOpciones();
  TabManager.marcarSinGuardar();
}

// =============================================
//  DROPDOWN EXPORTAR
// =============================================
function toggleExportMenu(e) {
  e.stopPropagation();
  document.getElementById('export-menu')?.classList.toggle('visible');
}

function cerrarExportMenu() {
  document.getElementById('export-menu')?.classList.remove('visible');
}

// =============================================
//  EXPORTAR PDF
// =============================================
function exportarPDF() {
  const num   = document.getElementById('doc-numero')?.textContent || 'cotizacion';
  const titulo = document.title;
  document.title = 'Juanytours-' + num.trim();
  window.print();
  document.title = titulo;
}

// =============================================
//  LISTENERS GLOBALES
// =============================================
function iniciarListeners() {
  document.getElementById('sel-tipo-doc')?.addEventListener('change', function () {
    cambiarTipoDoc(this.value);
    TabManager.marcarSinGuardar();
  });

  document.getElementById('doc-tasa')?.addEventListener('blur', function () {
    const val = parseMonto(this.innerText);
    if (val > 0 && typeof TasaCambio !== 'undefined') TasaCambio.setFija(val);
    else calcularTotales();
    TabManager.marcarSinGuardar();
  });

  document.getElementById('doc-fecha')?.addEventListener('change', () => {
    calcularTotales();
    TabManager.marcarSinGuardar();
  });

  document.getElementById('doc-numero')?.addEventListener('blur', function () {
    TabManager.actualizarNumero(this.textContent.trim());
    TabManager.marcarSinGuardar();
  });

  // Badge de tasa abre el modal
  document.getElementById('tasa-indicador')?.addEventListener('click', () => {
    if (typeof TasaCambio !== 'undefined') TasaCambio.mostrarEditor();
  });

  // Cerrar dropdown exportar al hacer clic fuera
  document.addEventListener('click', () => cerrarExportMenu());

  // Antes de cerrar: guardar sesión y borrador del estado actual
  window.addEventListener('beforeunload', () => {
    const tab = TabManager.tabs.find(t => t.id === TabManager.activeId);
    if (tab && tab.tipo === 'cotizacion') {
      Borrador.guardarUltimoConocido();      // usa el último estado capturado (síncrono)
    }
    Sesion.guardar(TabManager.tabs, TabManager.activeId);
  });

  // Marcar sin guardar en todos los contenteditable del documento
  document.getElementById('documento')?.querySelectorAll('[contenteditable]').forEach(el => {
    if (el.id === 'doc-tasa' || el.id === 'doc-numero') return; // ya manejados
    el.addEventListener('input', () => TabManager.marcarSinGuardar());
  });
}

function sincronizarTasa() {
  if (typeof TasaCambio !== 'undefined') {
    TasaCambio.setOficial(window._DEFAULTS?.tasaOficial || 60.65);
  } else {
    setText('doc-tasa', window._DEFAULTS?.tasaOficial || 60.65);
  }
}

// =============================================
//  HELPERS
// =============================================

function hoy() { return new Date().toISOString().slice(0, 10); }

function formatNum(n) {
  return Number(n).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMonto(str) {
  return parseFloat(String(str).replace(/\s/g, '').replace(/,/g, '')) || 0;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function getCE(id) {
  return document.getElementById(id)?.textContent.trim() || '';
}
function setCE(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function setImg(id, src) {
  const el = document.getElementById(id);
  if (el && src) { el.src = src; }
}
function escHTML(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _generarNumero() {
  const d      = window._DEFAULTS || {};
  const prefijo = d.prefijo || 'COT-';
  window._cotNumCounter = (window._cotNumCounter || 0) + 1;
  localStorage.setItem('jt_num_counter', window._cotNumCounter);   // persiste entre recargas
  return prefijo + String(window._cotNumCounter).padStart(3, '0');
}

// Lee el número más alto guardado (IndexedDB + localStorage) para evitar duplicados
async function _sincronizarContador() {
  const d      = window._DEFAULTS || {};
  const prefijo = d.prefijo || 'COT-';
  let max = Math.max(
    (d.siguiente || 1) - 1,
    parseInt(localStorage.getItem('jt_num_counter') || '0')
  );
  try {
    const todas = await CotDB.listar();
    todas.forEach(reg => {
      if (reg.numero && reg.numero.startsWith(prefijo)) {
        const n = parseInt(reg.numero.slice(prefijo.length));
        if (!isNaN(n)) max = Math.max(max, n);
      }
    });
  } catch (e) { /* si IndexedDB aún no tiene datos, seguimos con max */ }
  window._cotNumCounter = max;
}

function _metaDatos(estado) {
  const totDOP = _computarTotal(estado.items, 18);
  return {
    numero:    estado.numero,
    cliente:   estado.cliente,
    cantItems: estado.items.filter(f => f.type === 'item').length,
    totalDOP:  totDOP
  };
}

function _computarTotal(items, itbsPct) {
  let ex = 0, gr = 0;
  items.filter(f => f.type === 'item').forEach(f => {
    const t = (f.monto || 0) * (f.cantidad || 1);
    if (f.tipo === 'gravado') gr += t; else ex += t;
  });
  return ex + gr + gr * (itbsPct / 100);
}

function _formatFecha(iso) {
  if (!iso) return '';
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)          return 'ahora mismo';
  if (diff < 3600)        return `hace ${Math.floor(diff/60)} min`;
  if (diff < 86400)       return `hace ${Math.floor(diff/3600)}h`;
  if (diff < 86400 * 7)   return `hace ${Math.floor(diff/86400)} día${Math.floor(diff/86400)>1?'s':''}`;
  return d.toLocaleDateString('es-DO', { day:'2-digit', month:'short', year:'numeric' });
}

let _toastTimer = null;
function mostrarToast(msg, error = false) {
  const el = document.getElementById('toast-guardado');
  if (!el) return;
  el.textContent = msg;
  el.style.background = error ? '#8B0000' : '#1A6B3C';
  el.style.display = 'block';
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2200);
}

// =============================================
//  EXPORTAR HTML EDITABLE (auto-contenido)
// =============================================
async function exportarHTML() {
  const estado   = capturarEstado();
  const numRaw   = estado.numero || 'cotizacion';
  const logoSrc  = await _logoABase64();
  const cssText  = _extractCSS();
  const emp      = window.EMPRESA?.empresa || {};
  const ban      = window.EMPRESA?.banco   || {};
  const fi       = window.EMPRESA?.fiscal  || {};
  const tipoDoc  = estado.tipoDoc || 'COTIZACIÓN';
  const tasa     = typeof TasaCambio !== 'undefined' ? TasaCambio.get() : 60.65;
  const itbisPct = fi.itbisPorcentaje || 18;
  const cuentasHTML = document.getElementById('bloque-cuentas')?.innerHTML || '';
  const vis         = leerOpcionesVis();
  const clasesVis   = OPC_VIS.filter(k => vis[k]).map(k => ' sin-' + k).join('');
  const filasHTML   = _htmlFilas(estado.items, itbisPct);

  const tiposOpts = ['COTIZACIÓN','FACTURA DE CRÉDITO FISCAL','FACTURA','PROFORMA']
    .map(t => `<option value="${t}"${t === tipoDoc ? ' selected' : ''}>${t}</option>`).join('');

  const scriptInline = `(function(){
  var ITBIS=${itbisPct};
  function pM(s){return parseFloat(String(s).replace(/[\\s,]/g,''))||0;}
  function fN(n){return Number(n).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function sT(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  window.calcTotales=function(){
    var tasa=pM(document.getElementById('doc-tasa')?.innerText||'60.65')||60.65;
    var ex=0,gr=0;
    document.querySelectorAll('#tabla-body tr[data-tipo]').forEach(function(tr){
      var monto=pM((tr.querySelector('[data-field="monto"]')||{}).innerText||'0');
      var cant=parseFloat((tr.querySelector('[data-field="cantidad"]')||{}).innerText||'1')||1;
      if(tr.dataset.tipo==='gravado') gr+=monto*cant; else ex+=monto*cant;
    });
    var itbs=gr*(ITBIS/100),dop=ex+gr+itbs,usd=tasa>0?dop/tasa:0;
    sT('tot-excento',fN(ex));sT('tot-gravado',fN(gr));sT('tot-itbis',fN(itbs));
    document.getElementById('tot-dop').innerHTML='<strong>'+fN(dop)+'</strong>';
    document.getElementById('tot-usd').innerHTML='<strong>'+fN(usd)+'</strong>';
  };
  window.cambiarTipoDoc=function(v){sT('doc-titulo-texto',v);sT('cli-tipo-doc-texto',v);};
  window.imprimir=function(){
    var num=document.getElementById('doc-numero')?.textContent||'cotizacion';
    var t=document.title;document.title='Juanytours-'+num.trim();window.print();document.title=t;
  };
  document.querySelectorAll('[data-field="monto"],[data-field="cantidad"]').forEach(function(el){
    el.addEventListener('input',window.calcTotales);
  });
  document.querySelectorAll('.sel-tipo-item').forEach(function(sel){
    sel.addEventListener('change',function(){this.closest('tr').dataset.tipo=this.value;window.calcTotales();});
  });
  window.calcTotales();
})();`;

  const html =
`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Juanytours — ${escHTML(numRaw)}</title>
  <style>
${cssText}
body{padding-top:52px!important;background:#DEE6EF;}
.exp-bar{position:fixed;top:0;left:0;right:0;height:44px;background:#003A78;display:flex;
  align-items:center;justify-content:space-between;padding:0 24px;z-index:1000;
  box-shadow:0 2px 8px rgba(0,0,0,.35);font-family:Arial,Helvetica,sans-serif;}
.exp-titulo{color:#fff;font-weight:bold;font-size:14px;}
.exp-btns{display:flex;align-items:center;gap:14px;}
.exp-nota{color:#AAC4E8;font-size:11.5px;}
.exp-btn{padding:6px 16px;border:none;border-radius:5px;font-size:13px;font-weight:bold;
  cursor:pointer;font-family:inherit;}
.exp-btn-print{background:#E85421;color:#fff;}
.exp-btn-print:hover{opacity:.85;}
.sin-tasa .tot-izq,.sin-numero .doc-numero-wrap,.sin-ref .fr-fila-ref,.sin-ncf .cli-fila-ncf,
.sin-excento .tot-fila-excento,.sin-gravado .tot-fila-gravado,.sin-itbis .tot-fila-itbis{opacity:.3;}
@media print{
  .exp-bar{display:none!important;}
  body{padding-top:0!important;background:#fff!important;}
  .sin-tasa .tot-izq,.sin-numero .doc-numero-wrap,.sin-ref .fr-fila-ref,
  .sin-ncf .cli-fila-ncf{visibility:hidden!important;opacity:1!important;}
  .sin-excento .tot-fila-excento,.sin-gravado .tot-fila-gravado,
  .sin-itbis .tot-fila-itbis{display:none!important;}
}
  </style>
</head>
<body>
<div class="exp-bar">
  <span class="exp-titulo">Juanytours &mdash; ${escHTML(numRaw)}</span>
  <div class="exp-btns">
    <span class="exp-nota">Los campos son editables &middot; los cambios no se guardan automáticamente</span>
    <button class="exp-btn exp-btn-print" onclick="imprimir()">&#x2B07; Imprimir / PDF</button>
  </div>
</div>

<div class="pagina${clasesVis}">
  <div class="encabezado">
    <div class="enc-izq">
      ${logoSrc ? `<img src="${logoSrc}" alt="Logo" class="doc-logo"/>` : ''}
      <div class="doc-empresa-datos">
        <p class="empresa-nombre">${escHTML(emp.nombre || '')}</p>
        <p>${escHTML(emp.direccion || '')}</p>
        <p>${escHTML(emp.ciudad || '')}</p>
        ${emp.telefono ? `<p>Tel&eacute;fono: ${escHTML(emp.telefono)}</p>` : ''}
        ${emp.rnc     ? `<p>RNC: ${escHTML(emp.rnc)}</p>` : ''}
      </div>
    </div>
    <div class="enc-der">
      <div class="doc-numero-wrap">
        <span class="doc-numero" contenteditable="true" id="doc-numero">${escHTML(numRaw)}</span>
      </div>
      <div class="doc-titulo-tipo">
        <select id="sel-tipo-doc" class="sel-tipo" onchange="cambiarTipoDoc(this.value)">${tiposOpts}</select>
        <span id="doc-titulo-texto" class="doc-titulo-texto">${escHTML(tipoDoc)}</span>
      </div>
      <div class="doc-fecha-ref">
        <div class="fr-fila">
          <span class="fr-label">FECHA:</span>
          <input type="date" id="doc-fecha" class="inp-fecha" value="${escHTML(estado.fecha || '')}"/>
        </div>
        <div class="fr-fila fr-fila-ref">
          <span class="fr-label">REFERENCIA:</span>
          <span class="fr-val" contenteditable="true" data-placeholder="0">${escHTML(estado.ref || '')}</span>
        </div>
      </div>
    </div>
  </div>

  <div class="linea-azul"></div>

  <div class="seccion-cliente">
    <div class="cli-izq">
      <p><span class="cli-label">CLIENTE:</span>
         <span class="cli-val" contenteditable="true" data-placeholder="Nombre del cliente">${escHTML(estado.cliente || '')}</span></p>
      <p><span class="cli-label">TEL.:</span>
         <span class="cli-val" contenteditable="true" data-placeholder="Tel&eacute;fono">${escHTML(estado.telCli || '')}</span></p>
      <p><span class="cli-label">RNC:</span>
         <span class="cli-val" contenteditable="true" data-placeholder="RNC / C&eacute;dula">${escHTML(estado.rncCli || '')}</span></p>
    </div>
    <div class="cli-der">
      <p class="cli-tipo-doc" id="cli-tipo-doc-texto">${escHTML(tipoDoc)}</p>
      <p class="cli-fila-ncf"><span class="cli-label">NCF:</span>
         <span class="cli-val" contenteditable="true" data-placeholder="0">${escHTML(estado.ncf || '')}</span></p>
    </div>
  </div>

  <table class="tabla-servicios">
    <thead>
      <tr>
        <th class="th-num">Cant.</th>
        <th class="th-det">Detalles</th>
        <th class="th-cantidad">Cantidad</th>
        <th class="th-monto">Monto</th>
        <th class="th-tipo">Tipo</th>
      </tr>
    </thead>
    <tbody id="tabla-body">
${filasHTML}    </tbody>
  </table>

  <div class="seccion-totales">
    <div class="tot-izq">
      <p class="tipo-cambio-texto">
        Tipo de cambio Banco Central
        ${escHTML(fi.monedaExtranjera || 'USD')} x
        <span contenteditable="true" id="doc-tasa" class="tasa-val" oninput="calcTotales()">${tasa}</span>
      </p>
    </div>
    <div class="tot-der">
      <table class="tabla-totales">
        <tr class="tot-fila-excento"><td class="tot-label">TOTAL EXCENTO</td><td class="tot-signo">$</td><td class="tot-val" id="tot-excento">0.00</td></tr>
        <tr class="tot-fila-gravado"><td class="tot-label">TOTAL GRAVADO</td><td class="tot-signo">$</td><td class="tot-val" id="tot-gravado">0.00</td></tr>
        <tr class="tot-fila-itbis"><td class="tot-label">ITBIS ${itbisPct}%</td><td class="tot-signo">$</td><td class="tot-val" id="tot-itbis">0.00</td></tr>
        <tr class="tot-fila-dop">
          <td class="tot-label"><strong>TOTAL ${escHTML(fi.monedaLocal || 'DOP')}</strong></td>
          <td class="tot-signo"><strong>$</strong></td>
          <td class="tot-val" id="tot-dop"><strong>0.00</strong></td>
        </tr>
        <tr class="tot-fila-usd">
          <td class="tot-label"><strong>TOTAL ${escHTML(fi.monedaExtranjera || 'USD')}</strong></td>
          <td class="tot-signo"><strong>$</strong></td>
          <td class="tot-val" id="tot-usd"><strong>0.00</strong></td>
        </tr>
      </table>
    </div>
  </div>

  <div class="seccion-pago">
    <div class="pago-head">
      <div class="ph-izq">P&aacute;guese A: <strong>${escHTML(ban.pagueA || emp.nombre || '')}</strong></div>
      <div class="ph-der">RNC: <strong>${escHTML(emp.rnc || '')}</strong></div>
    </div>
    <div class="pago-banco">${escHTML(ban.nombre || '')}</div>
    <div class="pago-cuentas">${cuentasHTML}</div>
    <div class="pago-metodo">
      <span>M&eacute;todo de pago:</span>
      <span contenteditable="true" data-placeholder="Transferencia">${escHTML(estado.metodo || '')}</span>
    </div>
    <div class="pago-notas" contenteditable="true" data-placeholder="Notas adicionales...">${escHTML(estado.notas || '')}</div>
  </div>
</div>

<script>${scriptInline}<` + `/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `Juanytours-${numRaw.replace(/[^a-z0-9\-_]/gi, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
  mostrarToast('✓ HTML descargado');
}

async function _logoABase64() {
  return new Promise(resolve => {
    const img = document.getElementById('doc-logo');
    if (!img || !img.naturalWidth) { resolve(''); return; }
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    } catch(e) { resolve(''); }
  });
}

function _extractCSS() {
  let css = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) {
        css += rule.cssText + '\n';
      }
    } catch(e) { /* cross-origin, skip */ }
  }
  return css;
}

function _htmlFilas(items, itbisPct) {
  let html = '';
  let numItem = 0;
  items.forEach(f => {
    if (f.type === 'nota') {
      html += `      <tr class="tr-nota">
        <td class="td-nota" colspan="4" contenteditable="true">${escHTML(f.texto || '')}</td>
        <td></td>
      </tr>\n`;
    } else {
      numItem++;
      const tipo    = f.tipo || 'exento';
      const visible = f.visible !== false;
      html += `      <tr data-tipo="${tipo}"${visible ? '' : ' class="fila-oculta"'}>
        <td class="td-num">${numItem}</td>
        <td class="td-det" contenteditable="true" data-field="desc" data-placeholder="Descripci&oacute;n del servicio">${escHTML(f.desc || '')}</td>
        <td class="td-cantidad" contenteditable="true" data-field="cantidad" data-placeholder="1">${f.cantidad || 1}</td>
        <td class="td-monto" contenteditable="true" data-field="monto" data-placeholder="0.00">${formatNum(f.monto || 0)}</td>
        <td class="td-tipo">
          <select class="sel-tipo-item">
            <option value="exento"${tipo === 'exento' ? ' selected' : ''}>Exento</option>
            <option value="gravado"${tipo === 'gravado' ? ' selected' : ''}>Gravado</option>
          </select>
        </td>
      </tr>\n`;
    }
  });
  const totalItems = items.filter(f => f.type === 'item').length;
  for (let x = totalItems; x < 3; x++) {
    html += `      <tr class="tr-vacio"><td></td><td></td><td></td><td></td><td></td></tr>\n`;
  }
  return html;
}
