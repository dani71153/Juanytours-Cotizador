// =============================================
//  DATABASE / cotizaciones.js
//  CRUD completo sobre el store "cotizaciones".
//
//  Cada registro tiene la forma:
//  {
//    id:            number (auto),
//    numero:        string   "COT-001",
//    cliente:       string,
//    estado:        "activa" | "archivada",
//    cantItems:     number,
//    totalDOP:      number,
//    fechaCreacion: ISO string,
//    fechaModif:    ISO string,
//    datos:         object  (snapshot completo del editor)
//  }
//
//  Exporta: window.CotDB
// =============================================

window.CotDB = (function () {

  // Abre una transacción y devuelve el store
  async function _store(mode) {
    const db    = await window.JDB.getDB();
    const tx    = db.transaction(window.JDB.STORE, mode);
    return tx.objectStore(window.JDB.STORE);
  }

  // Convierte un IDBRequest en Promise
  function _p(req) {
    return new Promise((res, rej) => {
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  // ── Insertar nueva cotización ──────────────
  async function guardar(registro) {
    const s = await _store('readwrite');
    const id = await _p(s.add({
      estado:        'activa',
      fechaCreacion: new Date().toISOString(),
      fechaModif:    new Date().toISOString(),
      ...registro
    }));
    return id; // devuelve el id asignado
  }

  // ── Actualizar campos de un registro existente ──
  async function actualizar(id, cambios) {
    const s      = await _store('readwrite');
    const actual = await _p(s.get(id));
    if (!actual) throw new Error(`Cotización id=${id} no encontrada.`);
    return _p(s.put({
      ...actual,
      ...cambios,
      fechaModif: new Date().toISOString()
    }));
  }

  // ── Leer un registro por id ────────────────
  async function obtener(id) {
    const s = await _store('readonly');
    return _p(s.get(id));
  }

  // ── Listar todos los registros ─────────────
  async function listar() {
    const s = await _store('readonly');
    return _p(s.getAll());
  }

  // ── Archivar (cambia estado, no elimina) ──
  async function archivar(id) {
    return actualizar(id, { estado: 'archivada' });
  }

  // ── Restaurar a activa ─────────────────────
  async function restaurar(id) {
    return actualizar(id, { estado: 'activa' });
  }

  // ── Eliminar definitivamente ───────────────
  async function eliminar(id) {
    const s = await _store('readwrite');
    return _p(s.delete(id));
  }

  // ── Buscar por texto (numero o cliente) ────
  async function buscar(texto) {
    const todos  = await listar();
    const q      = texto.toLowerCase().trim();
    if (!q) return todos;
    return todos.filter(r =>
      (r.numero  || '').toLowerCase().includes(q) ||
      (r.cliente || '').toLowerCase().includes(q)
    );
  }

  return { guardar, actualizar, obtener, listar, archivar, restaurar, eliminar, buscar };

})();
