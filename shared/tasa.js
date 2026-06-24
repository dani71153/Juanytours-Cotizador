// =============================================
//  SHARED — Módulo de Tasa de Cambio
//
//  Dos tasas independientes:
//    tasaOficial → referencia del Banco Central
//    tasaFija    → tasa bloqueada para esta cotización
//                  (si está definida, sobrescribe la oficial)
//
//  API pública:
//    TasaCambio.get()           → tasa activa (fija ?? oficial)
//    TasaCambio.getOficial()    → solo tasa oficial
//    TasaCambio.getFija()       → tasa fija (null si no hay)
//    TasaCambio.setOficial(n)   → actualiza tasa de referencia
//    TasaCambio.setFija(n)      → define tasa fija (null = quitar)
//    TasaCambio.clearFija()     → elimina la tasa fija
//    TasaCambio.set(n)          → alias de setFija (compat.)
//    TasaCambio.mostrarEditor() → abre el modal
//    TasaCambio.cerrarEditor()  → cierra el modal
//    TasaCambio.confirmarEditor()→ aplica los valores del modal
//    TasaCambio.toggleFija(bool)→ activa/desactiva input fija
//    TasaCambio.URL_BANCENTRAL  → URL oficial de consulta
// =============================================

window.TasaCambio = (function () {

  // URL oficial del Banco Central de la República Dominicana
  const URL_BANCENTRAL = 'https://www.bancentral.gov.do/SectorExterno/HistoricoTasas';

  // Estado interno
  let tasaOficial = 60.65; // referencia informativa
  let tasaFija    = null;  // si es null, se usa tasaOficial en cálculos

  // ── Getters ─────────────────────────────────
  function get()       { return tasaFija !== null ? tasaFija : tasaOficial; }
  function getOficial(){ return tasaOficial; }
  function getFija()   { return tasaFija; }
  function tieneFija() { return tasaFija !== null; }

  // ── Setters ─────────────────────────────────
  function setOficial(val) {
    const n = _parsear(val);
    if (!n) return false;
    tasaOficial = n;
    _actualizarDOM();
    return true;
  }

  function setFija(val) {
    if (val === null || val === '' || val === undefined) {
      tasaFija = null;
    } else {
      const n = _parsear(val);
      if (!n) return false;
      tasaFija = n;
    }
    _actualizarDOM();
    return true;
  }

  function clearFija() { return setFija(null); }

  // Alias de compatibilidad con versión anterior
  function set(val) { return setFija(val); }

  // ── DOM ─────────────────────────────────────
  function _actualizarDOM() {
    // Actualiza el valor visible en el documento
    const el = document.getElementById('doc-tasa');
    if (el) el.textContent = get().toFixed(2);

    // Actualiza el badge indicador
    _actualizarIndicador();

    // Recalcula todos los totales
    if (typeof window.calcularTotales === 'function') window.calcularTotales();
  }

  function _actualizarIndicador() {
    const ind = document.getElementById('tasa-indicador');
    if (!ind) return;
    if (tasaFija !== null) {
      ind.textContent = '★ tasa fija';
      ind.className   = 'tasa-indicador tasa-ind-fija no-print';
    } else {
      ind.textContent = '· tasa oficial';
      ind.className   = 'tasa-indicador tasa-ind-oficial no-print';
    }
  }

  // ── Modal ────────────────────────────────────
  function mostrarEditor() {
    const modal = document.getElementById('modal-tasa');
    if (!modal) return;

    // Rellenar tasa oficial
    _setInpVal('inp-tasa-oficial', tasaOficial.toFixed(2));
    _setInpVal('inp-tasa-fija',    (tasaFija !== null ? tasaFija : tasaOficial).toFixed(2));

    // Seleccionar modo
    const radioFija = document.getElementById('radio-fija');
    const radioOf   = document.getElementById('radio-oficial');
    const inpFija   = document.getElementById('inp-tasa-fija');
    if (tasaFija !== null) {
      if (radioFija) radioFija.checked = true;
      if (inpFija)   inpFija.disabled  = false;
    } else {
      if (radioOf)  radioOf.checked  = true;
      if (inpFija)  inpFija.disabled = true;
    }

    modal.classList.add('visible');
  }

  function cerrarEditor() {
    const modal = document.getElementById('modal-tasa');
    if (modal) modal.classList.remove('visible');
  }

  function confirmarEditor() {
    // 1. Tasa oficial
    const valOf = document.getElementById('inp-tasa-oficial')?.value;
    if (!setOficial(valOf)) {
      _marcarError('inp-tasa-oficial'); return;
    }

    // 2. Modo de cotización
    const usarFija = document.getElementById('radio-fija')?.checked;
    if (usarFija) {
      const valFija = document.getElementById('inp-tasa-fija')?.value;
      if (!setFija(valFija)) {
        _marcarError('inp-tasa-fija'); return;
      }
    } else {
      tasaFija = null;
      _actualizarDOM();
    }

    cerrarEditor();
  }

  // Activa/desactiva el input de tasa fija desde el radio button
  function toggleFija(activar) {
    const inp = document.getElementById('inp-tasa-fija');
    if (!inp) return;
    inp.disabled = !activar;
    if (activar) {
      inp.value = (tasaFija !== null ? tasaFija : tasaOficial).toFixed(2);
      setTimeout(() => inp.focus(), 50);
    }
  }

  // ── Helpers internos ─────────────────────────
  function _parsear(val) {
    const n = parseFloat(String(val).replace(',', '.'));
    return (!isNaN(n) && n > 0) ? n : null;
  }

  function _setInpVal(id, val) {
    const el = document.getElementById(id);
    if (el) { el.value = val; el.style.borderColor = ''; }
  }

  function _marcarError(id) {
    const el = document.getElementById(id);
    if (el) { el.style.borderColor = '#cc0000'; el.focus(); }
  }

  // ── API pública ──────────────────────────────
  return {
    URL_BANCENTRAL,
    get, getOficial, getFija, tieneFija,
    set, setOficial, setFija, clearFija,
    mostrarEditor, cerrarEditor, confirmarEditor, toggleFija
  };

})();
