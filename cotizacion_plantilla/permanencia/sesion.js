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

    if (activo && activo.tipo === 'cotizacion' && activo.dbId) {
      try {
        const reg = await CotDB.obtener(activo.dbId);
        if (reg) {
          // Verificar si hay un borrador más reciente para este tab
          const borrador = Borrador.cargar();
          let datos = reg.datos;

          if (borrador && borrador.tabId === activo.id) {
            const tsBorrador = new Date(borrador.timestamp);
            const tsDB       = new Date(reg.fechaModif || 0);
            if (tsBorrador > tsDB) {
              datos = borrador.estado;
              // Marcar la pestaña como sin guardar y avisarle al usuario
              const tab = tabManager.tabs.find(t => t.id === activo.id);
              if (tab) tab.sinGuardar = true;
              tabManager.renderTabs();
              setTimeout(() => mostrarToast('Borrador recuperado ↑', false), 600);
            }
            Borrador.limpiar(); // ya se usó o es más antiguo
          }

          await tabManager._activarTab(activo.id, datos);
          return true;
        }
      } catch (e) {
        console.warn('[Sesion] Error cargando tab activo desde DB:', e);
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
