// =============================================
//  DATABASE / db.js
//  Abre y configura IndexedDB para Juanytours.
//  Exporta: window.JDB.getDB()  → Promise<IDBDatabase>
//           window.JDB.STORE    → nombre del object store
// =============================================

(function () {

  const DB_NAME    = 'JuanytoursDB';
  const DB_VERSION = 1;
  const STORE      = 'cotizaciones';

  let _db = null; // instancia reutilizable

  function getDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      // Se ejecuta solo al crear o actualizar la base de datos
      req.onupgradeneeded = function (e) {
        const db = e.target.result;

        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {
            keyPath:       'id',
            autoIncrement: true
          });
          // Índices para búsquedas y ordenamiento
          store.createIndex('idx_numero',        'numero',        { unique: false });
          store.createIndex('idx_estado',        'estado',        { unique: false });
          store.createIndex('idx_fechaCreacion', 'fechaCreacion', { unique: false });
          store.createIndex('idx_cliente',       'cliente',       { unique: false });
        }
      };

      req.onsuccess = function (e) {
        _db = e.target.result;

        // Si la conexión se cierra inesperadamente, limpiar caché
        _db.onclose      = () => { _db = null; };
        _db.onversionchange = () => { _db.close(); _db = null; };

        resolve(_db);
      };

      req.onerror   = e => reject(e.target.error);
      req.onblocked = () => console.warn('[JDB] Base bloqueada — cierra otras pestañas del cotizador.');
    });
  }

  window.JDB = { getDB, STORE };

})();
