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
  if (!window.PERFILES && !window.EMPRESA) {
    alert('No se pudo cargar data/empresa.js'); return;
  }

  Perfiles.iniciar();             // ← elige empresa activa + aplica overrides
  montarDocumento();              // ← el markup viene de js/plantilla.js
  poblarEmpresa(window.EMPRESA);
  iniciarListeners();             // ← después de montar: engancha nodos del documento
  await _sincronizarContador();   // ← inicializa el contador de numeración
  await TabManager.init();
});

// =============================================
//  PERFILES DE EMPRESA
//  Cada perfil trae sus datos y su plantilla.
//  Los overrides de EmpresaCfg se guardan por perfil.
// =============================================
const Perfiles = {
  KEY: 'jt_perfil_activo',

  lista() {
    return Object.entries(window.PERFILES || {}).map(([id, p]) => ({
      id,
      nombre:    p.nombre || id,
      plantilla: p.plantilla || 'clasica',
      logo:      p.empresa?.logo || '',
      razon:     p.empresa?.nombre || ''
    }));
  },

  activoId() {
    const guardado = localStorage.getItem(this.KEY);
    if (guardado && window.PERFILES?.[guardado]) return guardado;
    return window.PERFIL_DEFECTO || Object.keys(window.PERFILES || {})[0];
  },

  plantilla() {
    return window.EMPRESA?.plantilla || 'clasica';
  },

  // Deja window.EMPRESA apuntando al perfil pedido (sin tocar el DOM)
  _resolver(id) {
    const P = window.PERFILES || {};
    const perfil = P[id] || P[window.PERFIL_DEFECTO] || Object.values(P)[0];
    window.EMPRESA = perfil;
    return perfil;
  },

  // Carga el perfil al arrancar
  iniciar() {
    const id = this.activoId();
    this._resolver(id);
    EmpresaCfg.aplicarGuardado();
    return id;
  },

  // Deja el perfil activo y vuelve a montar el documento con su
  // plantilla. No conserva lo escrito: eso lo decide quien llama.
  async _aplicar(id) {
    localStorage.setItem(this.KEY, id);
    this._resolver(id);
    EmpresaCfg.aplicarGuardado();
    montarDocumento();
    poblarEmpresa(window.EMPRESA);
    iniciarListenersDocumento();
    await _sincronizarContador();   // cada empresa tiene su propia numeración
  },

  // Cambia de empresa conservando lo que el usuario ya escribió
  async cambiar(id) {
    if (!window.PERFILES?.[id] || id === this.activoId()) return;
    await TabManager._autoGuardar();

    const estado = capturarEstado();
    await this._aplicar(id);
    restaurarEstado(estado);

    renderModalOpciones();
    mostrarToast('✓ Empresa: ' + (window.EMPRESA.nombre || id));
  },

  // Deja listo un perfil para una cotización nueva (sin estado previo)
  async seleccionar(id) {
    if (!window.PERFILES?.[id]) return;
    await this._aplicar(id);
  },

  // Al abrir una cotización guardada: si se creó con otra empresa,
  // se cambia para que salga con su plantilla original.
  async asegurar(id) {
    if (!id || !window.PERFILES?.[id] || id === this.activoId()) return false;
    await this._aplicar(id);
    return true;
  }
};

// =============================================
//  MODAL: ELEGIR EMPRESA AL CREAR UNA COTIZACIÓN
// =============================================
function nuevaCotizacion() {
  const perfiles = Perfiles.lista();

  // Con una sola empresa configurada no tiene sentido preguntar
  if (perfiles.length < 2) { TabManager.nuevaTab(); return; }

  const cont = document.getElementById('perfil-opciones');
  if (!cont) { TabManager.nuevaTab(); return; }

  const activo = Perfiles.activoId();
  cont.innerHTML = perfiles.map(p => {
    const inicial = (p.nombre || '?').trim().charAt(0).toUpperCase();
    const marca = p.logo
      ? `<img src="${escHTML(p.logo)}" alt="" onerror="this.remove()" />
         <span class="po-inicial">${escHTML(inicial)}</span>`
      : `<span class="po-inicial">${escHTML(inicial)}</span>`;
    const desc = p.plantilla === 'laps'
      ? 'Columnas UD. M y TOTAL &middot; pie de firmas'
      : 'Excento / gravado &middot; total en USD';
    return `
    <button class="perfil-opcion${p.id === activo ? ' perfil-opcion-activa' : ''}"
            onclick="crearCotizacionCon('${p.id}')">
      <span class="po-marca">${marca}</span>
      <span class="po-texto">
        <span class="po-fila">
          <span class="po-nombre">${escHTML(p.nombre)}</span>
          ${p.id === activo ? '<span class="po-badge">Última usada</span>' : ''}
        </span>
        <span class="po-desc">${desc}</span>
      </span>
      <span class="po-flecha">&#8250;</span>
    </button>`;
  }).join('');

  document.getElementById('modal-perfil')?.classList.add('visible');
}

function cerrarModalPerfil() {
  document.getElementById('modal-perfil')?.classList.remove('visible');
}

async function crearCotizacionCon(id) {
  cerrarModalPerfil();

  // Guardar la cotización abierta antes de tocar el documento:
  // seleccionar() lo remonta y perderíamos lo que hubiera dentro.
  await TabManager._autoGuardar();

  if (id !== Perfiles.activoId()) await Perfiles.seleccionar(id);

  await TabManager.nuevaTab(null, null, true);
}

function cambiarPerfil(id) { Perfiles.cambiar(id); }

// =============================================
//  MONTAJE DEL DOCUMENTO
//  El markup vive en js/plantilla.js y lo comparten
//  el editor y la exportación a HTML. Se monta una
//  sola vez: después los valores se escriben campo a
//  campo (setCE) para no perder el cursor al escribir.
// =============================================
function montarDocumento() {
  const cont = document.getElementById('documento');
  if (!cont) return;
  if (typeof Plantilla === 'undefined') {
    console.error('[Documento] No se pudo cargar js/plantilla.js');
    return;
  }
  const E = window.EMPRESA || {};
  const pl = E.plantilla || 'clasica';
  cont.innerHTML = Plantilla.interior({
    modo:      'editor',
    plantilla: pl,
    estado:    {},
    empresa:   E.empresa,
    banco:     E.banco,
    fiscal:    E.fiscal,
    defectos:  E.defectos,
    logo:      E.empresa?.logo || ''
  });
  // La clase de plantilla vive en el contenedor, junto a las sin-*
  cont.classList.remove('pl-clasica', 'pl-laps');
  cont.classList.add('pl-' + pl);
}

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
  const etqRnc = em.rncLabel || 'RNC';
  setText('doc-empresa-rnc',    em.rnc      ? etqRnc + ': ' + em.rnc : '');
  setText('lbl-rnc-pago',       etqRnc);

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
    // ?? y no ||: un prefijo vacío es válido (LAPS numera sin prefijo)
    prefijo:     nu.prefijo   ?? 'COT-',
    siguiente:   nu.siguiente || 1,
    itbis:       fi.itbisPorcentaje || 18
  };

  renderBanco(ba);
}

function renderBanco(ba) {
  const c = document.getElementById('bloque-cuentas');
  if (c) c.innerHTML = Plantilla.cuentas(ba);
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
    'opc-emp-rnc-lbl':  ['empresa', 'rncLabel'],
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

  // Todos los overrides, indexados por perfil
  leerTodo() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; }
    catch (e) { return {}; }
  },

  leer() {
    return this.leerTodo()[Perfiles.activoId()] || {};
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
    try {
      const todo = this.leerTodo();
      todo[Perfiles.activoId()] = cfg;
      localStorage.setItem(this.KEY, JSON.stringify(todo));
    } catch (e) { console.warn('[EmpresaCfg] No se pudo guardar:', e); }
    poblarEmpresa(E);
  },

  // Descarta los overrides y recarga los valores de data/empresa.js
  // Descarta sólo los overrides del perfil activo
  restablecer() {
    const todo = this.leerTodo();
    delete todo[Perfiles.activoId()];
    localStorage.setItem(this.KEY, JSON.stringify(todo));
    return true;
  }
};

function guardarEmpresaOpciones() {
  EmpresaCfg.guardarDesdeInputs();

  const inp = document.getElementById('opc-prox-numero');
  if (inp && inp.value !== '') fijarProximoNumero(inp.value);

  renderProximoNumero();
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
const OPC_VIS = ['tasa', 'numero', 'ref', 'ncf', 'excento', 'gravado', 'itbis', 'dop', 'usd', 'iban', 'swift'];

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

// Atajos de la sección de totales.
//  · uniforme → oculta el desglose y deja sólo el total en moneda local
//  · desglose → vuelve a mostrarlo todo
function aplicarPresetTotales(preset) {
  const doc = document.getElementById('documento');
  if (!doc) return;
  const uniforme = preset === 'uniforme';

  ['excento', 'gravado', 'itbis'].forEach(k => doc.classList.toggle('sin-' + k, uniforme));
  doc.classList.remove('sin-dop');                 // el total siempre se ve
  if (!uniforme) doc.classList.remove('sin-usd');  // desglose = todo visible

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
    const sinTotal = vis.dop && vis.usd;
    exp.textContent = sinTotal
      ? '⚠ Ocultaste los dos totales: el documento saldrá sin importe final.'
      : uniforme
        ? 'Modo total uniforme: sólo se imprime el TOTAL. El ITBIS se sigue calculando y está incluido en el monto.'
        : 'Lo que ocultes desaparece del PDF y del HTML exportado, pero se sigue sumando al TOTAL.';
  }
}

// ── Etiqueta de identificación del cliente (RNC / CÉDULA / …) ──
// Es un valor por cotización: una persona física lleva cédula
// y una empresa lleva RNC, aunque el documento sea el mismo.
function leerEtiquetaIdCliente() {
  const el = document.getElementById('lbl-cli-rnc');
  return (el?.textContent || 'RNC:').replace(/:\s*$/, '').trim() || 'RNC';
}

function aplicarEtiquetaIdCliente(valor) {
  const etq = (valor || 'RNC').trim() || 'RNC';
  setText('lbl-cli-rnc', etq + ':');

  const inp = document.getElementById('doc-cli-rnc');
  if (inp) inp.dataset.placeholder = etq;

  const sel = document.getElementById('opc-sel-idcli');
  if (sel) {
    // Si la etiqueta guardada no está entre las opciones, no forzar el select
    if ([...sel.options].some(o => o.value === etq)) sel.value = etq;
  }
}

function cambiarEtiquetaIdCliente(valor) {
  aplicarEtiquetaIdCliente(valor);
  TabManager.marcarSinGuardar();
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
  // yaGuardado: quien llama ya autoguardó la pestaña activa. Hace falta
  // cuando el documento se remontó antes (cambio de empresa), porque
  // entonces capturarEstado() leería un documento ya vaciado.
  async nuevaTab(datos = null, dbId = null, yaGuardado = false) {
    if (!yaGuardado) await this._autoGuardar();

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
        await Perfiles.asegurar(datosIniciales.perfil);   // plantilla con la que se creó
        restaurarEstado(datosIniciales);
      } else {
        // Tab restaurado de sesión: cargar desde IndexedDB si tiene dbId
        const tab = this._tabActivo();
        if (tab?.dbId) {
          try {
            const reg = await CotDB.obtener(tab.dbId);
            if (reg) {
              await Perfiles.asegurar(reg.datos?.perfil);
              restaurarEstado(reg.datos);
              return;
            }
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
    idCliente:   leerEtiquetaIdCliente(),
    // Perfil de empresa con el que se creó (define la plantilla)
    perfil:      Perfiles.activoId(),
    // Campos que sólo usa la plantilla LAPS; en la clásica quedan vacíos
    dirCliente:    getCE('doc-cli-dir'),
    codigoCliente: getCE('doc-cod-cliente'),
    validoHasta:   getCE('doc-valido-hasta'),
    vendedor:      getCE('doc-vendedor'),
    vencimiento:   document.getElementById('doc-vencimiento')?.value || '',
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

  // Campos de la plantilla LAPS (inofensivos si no existen)
  setCE('doc-cli-dir',      datos.dirCliente    || '');
  setCE('doc-cod-cliente',  datos.codigoCliente || '');
  setCE('doc-vendedor',     datos.vendedor      || window.EMPRESA?.defectos?.vendedor    || '');
  setCE('doc-valido-hasta', datos.validoHasta   || window.EMPRESA?.defectos?.validoHasta || '');
  const venc = document.getElementById('doc-vencimiento');
  if (venc) venc.value = datos.vencimiento || '';

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
  aplicarEtiquetaIdCliente(datos.idCliente || 'RNC');

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
  setCE('doc-cli-dir',     '');
  setCE('doc-cod-cliente', '');
  setCE('doc-vendedor',     window.EMPRESA?.defectos?.vendedor    || '');
  setCE('doc-valido-hasta', window.EMPRESA?.defectos?.validoHasta || '');
  const vencNuevo = document.getElementById('doc-vencimiento');
  if (vencNuevo) vencNuevo.value = '';

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
  aplicarEtiquetaIdCliente('RNC');

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

    const laps = Perfiles.plantilla() === 'laps';

    if (fila.type === 'nota') {
      tr.className = 'tr-nota';
      tr.innerHTML = `
        <td class="td-nota" colspan="${laps ? 5 : 4}" contenteditable="true"
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
      const celdaNum    = laps ? '' : `<td class="td-num">${numItem}</td>`;
      const celdaUnidad = laps
        ? `<td class="td-unidad" contenteditable="true" data-field="unidad"
               data-placeholder="UNIDAD">${escHTML(fila.unidad || 'UNIDAD')}</td>`
        : '';
      const celdaLinea  = laps
        ? `<td class="td-linea" data-field="linea">${formatNum((fila.monto || 0) * (fila.cantidad || 1))}</td>`
        : '';
      tr.innerHTML = `
        ${celdaNum}
        <td class="td-det" contenteditable="true" data-field="desc"
            data-placeholder="Descripción del servicio&#10;(puede ser multilínea)"
        >${escHTML(fila.desc)}</td>
        ${celdaUnidad}
        <td class="td-cantidad" contenteditable="true" data-field="cantidad"
            data-placeholder="1">${fila.cantidad}</td>
        <td class="td-monto"   contenteditable="true" data-field="monto"
            data-placeholder="0.00">${formatNum(fila.monto)}</td>
        ${celdaLinea}
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
    tr2.innerHTML = '<td></td>'.repeat(Perfiles.plantilla() === 'laps' ? 5 : 4);
    tbody.appendChild(tr2);
  }
}

function actualizarFila(id, campo, valor) {
  const fila = cot.items.find(f => f.id === id);
  if (!fila) return;
  if (campo === 'cantidad') fila.cantidad = parseFloat(valor) || 1;
  else if (campo === 'monto')  fila.monto  = parseMonto(valor);
  else if (campo === 'desc')   fila.desc   = valor;
  else if (campo === 'unidad') fila.unidad = valor;
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
      const u = tr.querySelector('[data-field="unidad"]');
      if (d) fila.desc     = d.innerText;
      if (c) fila.cantidad = parseFloat(c.innerText) || 1;
      if (m) fila.monto    = parseMonto(m.innerText);
      if (u) fila.unidad   = u.innerText.trim();
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

    // Columna TOTAL por línea (sólo existe en la plantilla LAPS)
    const celLinea = tr.querySelector('[data-field="linea"]');
    if (celLinea) celLinea.textContent = formatNum(total);
  });

  const itbs     = gravado * (itbsPct / 100);
  const totalDOP = excento + gravado + itbs;
  const totalUSD = tasa > 0 ? totalDOP / tasa : 0;

  setText('tot-excento',  formatNum(excento));
  setText('tot-gravado',  formatNum(gravado));
  setText('tot-itbis',    formatNum(itbs));
  // Filas propias de LAPS: Subtotal = base imponible, Suma = subtotal + ITBIS
  setText('tot-subtotal', formatNum(gravado));
  setText('tot-suma',     formatNum(gravado + itbs));
  setHTML('tot-dop', '<strong>' + formatNum(totalDOP) + '</strong>');
  setHTML('tot-usd', '<strong>' + formatNum(totalUSD) + '</strong>');
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
//  VISTA DE IMPRESIÓN
//  Aplica en pantalla las mismas reglas que @media print,
//  para que lo que se ve sea lo que se imprime.
// =============================================
function toggleVistaImpresion() {
  const activa = document.body.classList.toggle('vista-impresion');
  const btn = document.getElementById('btn-vista');
  if (btn) {
    btn.classList.toggle('activa', activa);
    btn.innerHTML = activa ? '\u270E Volver a editar' : '\u{1F441} Vista final';
  }
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

  // Etiqueta de identificación del cliente
  aplicarEtiquetaIdCliente(leerEtiquetaIdCliente());

  // Empresa activa + numeración + datos de empresa / banco
  renderSelectorPerfil();
  renderProximoNumero();
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

// Muestra el próximo número de la empresa activa y su vista previa
function renderProximoNumero() {
  const inp = document.getElementById('opc-prox-numero');
  if (!inp) return;
  inp.value = _contadorActual() + 1;
  inp.oninput = actualizarPreviewNumero;
  actualizarPreviewNumero();
}

function actualizarPreviewNumero() {
  const inp  = document.getElementById('opc-prox-numero');
  const prev = document.getElementById('opc-prox-preview');
  if (!inp || !prev) return;
  const n = parseInt(inp.value, 10);
  const prefijo = window._DEFAULTS?.prefijo ?? 'COT-';
  prev.value = (isNaN(n) || n < 1) ? '—' : prefijo + String(n).padStart(3, '0');
}

// Llena el desplegable de empresas del modal
function renderSelectorPerfil() {
  const sel = document.getElementById('opc-sel-perfil');
  if (!sel) return;
  const activo = Perfiles.activoId();
  sel.innerHTML = Perfiles.lista()
    .map(p => `<option value="${p.id}"${p.id === activo ? ' selected' : ''}>${escHTML(p.nombre)}</option>`)
    .join('');

  const exp = document.getElementById('opc-explica-perfil');
  if (exp) {
    const pl = Perfiles.plantilla();
    exp.textContent = pl === 'laps'
      ? 'Plantilla LAPS: logo centrado, columnas UD. M y TOTAL por línea, y pie de firmas.'
      : 'Plantilla clásica: logo a la izquierda, totales con excento/gravado y conversión a USD.';
  }
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
  document.title = _marcaArchivo() + '-' + num.trim();
  window.print();
  document.title = titulo;
}

// =============================================
//  LISTENERS GLOBALES
// =============================================
function iniciarListeners() {
  iniciarListenersDocumento();
  iniciarListenersGlobales();
}

// Nodos que viven dentro de #documento: se vuelven a enganchar
// cada vez que montarDocumento() regenera el markup.
function iniciarListenersDocumento() {
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

  // Marcar sin guardar en todos los contenteditable del documento
  document.getElementById('documento')?.querySelectorAll('[contenteditable]').forEach(el => {
    if (el.id === 'doc-tasa' || el.id === 'doc-numero') return; // ya manejados
    el.addEventListener('input', () => TabManager.marcarSinGuardar());
  });

  // Fecha de vencimiento (sólo plantilla LAPS)
  document.getElementById('doc-vencimiento')?.addEventListener('change', () => {
    TabManager.marcarSinGuardar();
  });
}

// Se registran una sola vez, sobre document / window.
function iniciarListenersGlobales() {
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
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
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

// Nombre de la empresa activa, saneado para usarlo en archivos
function _marcaArchivo() {
  const n = window.EMPRESA?.nombre || window.EMPRESA?.empresa?.nombre || 'Cotizacion';
  return n.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'Cotizacion';
}

// Cada empresa lleva su propia numeración: si compartieran contador,
// el "siguiente" de un perfil arrastraría la numeración del otro.
function _claveContador(perfil) {
  return 'jt_num_counter_' + (perfil || 'default');
}

// Contador de la empresa activa, leyéndolo de nuevo si cambió de perfil
function _contadorActual() {
  const perfil = Perfiles.activoId();
  if (window._cotNumPerfil !== perfil) {
    const d = window._DEFAULTS || {};
    window._cotNumCounter = Math.max(
      (d.siguiente || 1) - 1,
      parseInt(localStorage.getItem(_claveContador(perfil)) || '0', 10) || 0
    );
    window._cotNumPerfil = perfil;
  }
  return window._cotNumCounter;
}

function _generarNumero() {
  const d       = window._DEFAULTS || {};
  const prefijo = d.prefijo ?? 'COT-';
  const perfil  = Perfiles.activoId();

  window._cotNumCounter = _contadorActual() + 1;
  window._cotNumPerfil  = perfil;
  localStorage.setItem(_claveContador(perfil), window._cotNumCounter);

  return prefijo + String(window._cotNumCounter).padStart(3, '0');
}

// Fija manualmente el próximo número de la empresa activa
function fijarProximoNumero(n) {
  const valor = parseInt(n, 10);
  if (isNaN(valor) || valor < 1) return false;
  const perfil = Perfiles.activoId();
  window._cotNumCounter = valor - 1;
  window._cotNumPerfil  = perfil;
  localStorage.setItem(_claveContador(perfil), window._cotNumCounter);
  return true;
}

// Lee el número más alto guardado (IndexedDB + localStorage) para evitar duplicados
async function _sincronizarContador() {
  const d       = window._DEFAULTS || {};
  const prefijo = d.prefijo ?? 'COT-';
  const perfil  = Perfiles.activoId();

  let max = Math.max(
    (d.siguiente || 1) - 1,
    parseInt(localStorage.getItem(_claveContador(perfil)) || '0', 10) || 0
  );

  try {
    const todas = await CotDB.listar();
    todas.forEach(reg => {
      // Sólo cuentan las de esta empresa. Las guardadas antes de que
      // existieran los perfiles pertenecen al perfil por defecto.
      const suPerfil = reg.datos?.perfil || window.PERFIL_DEFECTO;
      if (suPerfil !== perfil) return;

      const numero = String(reg.numero || '');
      if (prefijo && !numero.startsWith(prefijo)) return;

      const n = parseInt(numero.slice(prefijo.length), 10);
      if (!isNaN(n)) max = Math.max(max, n);
    });
  } catch (e) { /* si IndexedDB aún no tiene datos, seguimos con max */ }

  window._cotNumCounter = max;
  window._cotNumPerfil  = perfil;
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
  const E        = window.EMPRESA || {};
  const fi       = E.fiscal || {};
  const itbisPct = fi.itbisPorcentaje || 18;
  const tasa     = typeof TasaCambio !== 'undefined' ? TasaCambio.get() : 60.65;
  const vis      = leerOpcionesVis();
  const clasesVis = OPC_VIS.filter(k => vis[k]).map(k => ' sin-' + k).join('');
  const pl        = E.plantilla || 'clasica';
  const marca     = E.empresa?.nombre || 'Cotizacion';

  // Mismo markup que el editor — ver js/plantilla.js
  const documentoHTML = Plantilla.interior({
    modo:      'export',
    plantilla: pl,
    estado:    estado,
    empresa:   E.empresa,
    banco:     E.banco,
    fiscal:    E.fiscal,
    defectos:  E.defectos,
    logo:      logoSrc,
    tasa:      tasa,
    filasHTML: Plantilla.filasExport(estado.items, pl)
  });

  const scriptInline = `(function(){
  var ITBIS=${itbisPct};
  var MARCA=${JSON.stringify(_marcaArchivo())};
  function pM(s){return parseFloat(String(s).replace(/[\s,]/g,''))||0;}
  function fN(n){return Number(n).toLocaleString('es-DO',{minimumFractionDigits:2,maximumFractionDigits:2});}
  function sT(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  function sH(id,h){var el=document.getElementById(id);if(el)el.innerHTML=h;}
  window.calcTotales=function(){
    var tasa=pM(document.getElementById('doc-tasa')?.innerText||'60.65')||60.65;
    var ex=0,gr=0;
    document.querySelectorAll('#tabla-body tr[data-tipo]').forEach(function(tr){
      var monto=pM((tr.querySelector('[data-field="monto"]')||{}).innerText||'0');
      var cant=parseFloat((tr.querySelector('[data-field="cantidad"]')||{}).innerText||'1')||1;
      var tot=monto*cant;
      if(tr.dataset.tipo==='gravado') gr+=tot; else ex+=tot;
      var cl=tr.querySelector('[data-field="linea"]');
      if(cl) cl.textContent=fN(tot);
    });
    var itbs=gr*(ITBIS/100),dop=ex+gr+itbs,usd=tasa>0?dop/tasa:0;
    sT('tot-excento',fN(ex));sT('tot-gravado',fN(gr));sT('tot-itbis',fN(itbs));
    sT('tot-subtotal',fN(gr));sT('tot-suma',fN(gr+itbs));
    sH('tot-dop','<strong>'+fN(dop)+'</strong>');
    sH('tot-usd','<strong>'+fN(usd)+'</strong>');
  };
  window.cambiarTipoDoc=function(v){sT('doc-titulo-texto',v);sT('cli-tipo-doc-texto',v);};
  window.imprimir=function(){
    var num=document.getElementById('doc-numero')?.textContent||'cotizacion';
    var t=document.title;document.title=MARCA+'-'+num.trim();window.print();document.title=t;
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
  <title>${escHTML(marca)} — ${escHTML(numRaw)}</title>
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
.sin-excento .tot-fila-excento,.sin-gravado .tot-fila-gravado,.sin-itbis .tot-fila-itbis,
.sin-dop .tot-fila-dop,.sin-usd .tot-fila-usd,
.sin-iban .pc-iban,.sin-swift .pc-swift{opacity:.3;}
@media print{
  .exp-bar{display:none!important;}
  body{padding-top:0!important;background:#fff!important;}
  .sin-tasa .tot-izq,.sin-numero .doc-numero-wrap,.sin-ref .fr-fila-ref,
  .sin-ncf .cli-fila-ncf{display:none!important;opacity:1!important;}
  .tot-der{margin-left:auto;}
  .sin-excento .tot-fila-excento,.sin-gravado .tot-fila-gravado,
  .sin-itbis .tot-fila-itbis,
  .sin-dop .tot-fila-dop,.sin-usd .tot-fila-usd{display:none!important;}
  .sin-iban .pc-iban,.sin-swift .pc-swift{display:none!important;}
  .sin-iban .pago-cuentas{grid-template-columns:1fr auto!important;}
  .sin-swift .pago-cuentas{grid-template-columns:1fr 1fr!important;}
  .sin-iban.sin-swift .pago-cuentas{grid-template-columns:1fr!important;}
  .sin-swift .pc-iban{border-right:none!important;}
  .sin-iban.sin-swift .pc-cuenta{border-right:none!important;}
}
  </style>
</head>
<body>
<div class="exp-bar">
  <span class="exp-titulo">${escHTML(marca)} &mdash; ${escHTML(numRaw)}</span>
  <div class="exp-btns">
    <span class="exp-nota">Los campos son editables &middot; los cambios no se guardan automáticamente</span>
    <button class="exp-btn exp-btn-print" onclick="imprimir()">&#x2B07; Imprimir / PDF</button>
  </div>
</div>

<div class="pagina pl-${pl}${clasesVis}">${documentoHTML}</div>

<script>${scriptInline}<` + `/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${_marcaArchivo()}-${numRaw.replace(/[^a-z0-9\-_]/gi, '_')}.html`;
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
