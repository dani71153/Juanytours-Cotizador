// =============================================
//  PERMANENCIA / sesion.js
//
//  Controla qué pestañas estaban abiertas,
//  cuál estaba activa y sus referencias a
//  IndexedDB. Permite restaurar exactamente
//  el estado visual al reabrir la app.
//
//  localStorage key: "jt_sesion"
//  Expone: window.Sesion
// =============================================

window.Sesion = (function () {

  const KEY     = 'jt_sesion';
  const VERSION = 1;

  // ── Guardar estado de tabs ─────────────────
  // Llamar cada vez que TabManager cambia de estado.
  function guardar(tabs, activeTabId) {
    try {
      const datos = {
        version:     VERSION,
        timestamp:   new Date().toISOString(),
        activeTabId: activeTabId,
        tabs: tabs.map(t => ({
          id:    t.id,
          tipo:  t.tipo,
          numero:t.numero  || '',
          dbId:  t.dbId    || null
        }))
      };
      localStorage.setItem(KEY, JSON.stringify(datos));
    } catch (e) {
      console.warn('[Sesion] Error guardando sesión:', e);
    }
  }

  // ── Restaurar sesión al abrir la app ───────
  // Recibe el TabManager para poder manipularlo.
  // Devuelve true si hubo algo que restaurar.
  async function restaurar(tabManager) {
    const sesion = _leer();
    if (!sesion) return false;

    const tabsGuardadas = sesion.tabs.filter(t => t.tipo === 'cotizacion');
    if (!tabsGuardadas.length) return false;

    // Recrear las pestañas en el TabManager
    for (const td of tabsGuardadas) {
      // Evitar duplicados
      if (tabManager.tabs.find(t => t.id === td.id)) continue;
      tabManager.tabs.push({
        id:         td.id,
        tipo:       'cotizacion',
        numero:     td.numero || '',
        dbId:       td.dbId  || null,
        sinGuardar: false
      });
    }

    tabManager.renderTabs();

    // Activar la pestaña que estaba activa
    const activo = sesion.tabs.find(t => t.id === sesion.activeTabId);

    if (activo && activo.tipo === 'cotizacion') {
      try {
        // Copia guardada en IndexedDB (si la cotización se guardó alguna vez)
        let datos = null;
        let tsDB  = 0;
        if (activo.dbId) {
          const reg = await CotDB.obtener(activo.dbId);
          if (reg) { datos = reg.datos; tsDB = new Date(reg.fechaModif || 0); }
        }

        // Borrador de esta pestaña. Manda si es más reciente que lo
        // guardado y, sobre todo, es la ÚNICA copia cuando la cotización
        // nunca se guardó: antes se descartaba en ese caso y al recargar
        // se perdía todo lo escrito (importes ajustados incluidos).
        const borrador = Borrador.cargar();
        let recuperado = false;
        if (borrador && borrador.tabId === activo.id) {
          const tsBorrador = new Date(borrador.timestamp);
          if (!datos || tsBorrador > tsDB) {
            datos      = borrador.estado;
            recuperado = true;
            const tab = tabManager.tabs.find(t => t.id === activo.id);
            if (tab) tab.sinGuardar = true;
            tabManager.renderTabs();
            setTimeout(() => mostrarToast('Borrador recuperado ↑', false), 600);
          } else {
            Borrador.limpiar();   // más antiguo que lo guardado: ya no sirve
          }
        }

        if (datos) {
          await tabManager._activarTab(activo.id, datos);
          // El borrador recuperado no se borra: si se vuelve a recargar
          // sin guardar, sigue siendo la única copia.
          if (recuperado) Borrador.guardarYa(datos, activo.id);
          return true;
        }
      } catch (e) {
        console.warn('[Sesion] Error cargando tab activo:', e);
      }
    }

    // Si el activo era la biblioteca (o falló la carga), mostrar biblioteca
    await tabManager._activarTab('biblioteca', null);
    return true;
  }

  // ── Limpiar ────────────────────────────────
  function limpiar() {
    localStorage.removeItem(KEY);
  }

  // ── Privado ────────────────────────────────
  function _leer() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return (d && d.version === VERSION) ? d : null;
    } catch (e) {
      return null;
    }
  }

  return { guardar, restaurar, limpiar };

})();
