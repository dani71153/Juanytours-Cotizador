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
    notas:       getCE('doc-notas')
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
