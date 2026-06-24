// =============================================
//  PERMANENCIA / borrador.js
//
//  Guarda el estado del editor activo en
//  localStorage como respaldo continuo.
//  Si el usuario cierra el navegador sin
//  guardar, el borrador se recupera al volver.
//
//  localStorage key: "jt_borrador"
//  Expone: window.Borrador
//
//  API:
//    Borrador.guardar(estado, tabId)  → debounced (1.5s)
//    Borrador.guardarYa(estado, tabId)→ inmediato (para beforeunload)
//    Borrador.cargar()                → { timestamp, tabId, estado } | null
//    Borrador.limpiar()               → borra el borrador
//    Borrador.existe()                → boolean
// =============================================

window.Borrador = (function () {

  const KEY    = 'jt_borrador';
  let  _timer  = null;
  let  _ultimo = null; // último estado recibido (para beforeunload)

  // ── Guardar con espera (1.5s sin cambios) ──
  function guardar(estado, tabId) {
    _ultimo = { estado, tabId };               // guardar referencia para beforeunload
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => _escribir(estado, tabId), 1500);
  }

  // ── Guardar inmediato (beforeunload) ───────
  function guardarYa(estado, tabId) {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _escribir(estado, tabId);
  }

  // ── Guardar el último estado conocido ──────
  // Útil para beforeunload cuando no tenemos el estado fresco.
  function guardarUltimoConocido() {
    if (_ultimo) _escribir(_ultimo.estado, _ultimo.tabId);
  }

  // ── Cargar ─────────────────────────────────
  function cargar() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ── Limpiar ────────────────────────────────
  function limpiar() {
    if (_timer) { clearTimeout(_timer); _timer = null; }
    _ultimo = null;
    localStorage.removeItem(KEY);
  }

  // ── ¿Existe un borrador? ───────────────────
  function existe() {
    return !!localStorage.getItem(KEY);
  }

  // ── Privado ────────────────────────────────
  function _escribir(estado, tabId) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        timestamp: new Date().toISOString(),
        tabId,
        estado
      }));
    } catch (e) {
      console.warn('[Borrador] localStorage lleno o error:', e);
    }
  }

  return { guardar, guardarYa, guardarUltimoConocido, cargar, limpiar, existe };

})();
