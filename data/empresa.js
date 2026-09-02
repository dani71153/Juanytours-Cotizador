// ============================================================
//  PERFILES DE EMPRESA
//
//  Cada perfil trae sus datos y la plantilla con la que se
//  imprime. Para agregar una empresa, copia un bloque y
//  cámbiale los datos.
//
//  plantilla: 'clasica' → diseño Juanytours (logo a la izquierda,
//                          totales con excento/gravado, DOP + USD)
//             'laps'    → diseño LAPS (logo centrado, cabecera en
//                          caja, columnas UD.M y TOTAL, firmas)
//
//  Expone: window.PERFILES y window.EMPRESA (el perfil activo,
//  que app.js reasigna al cambiar de empresa).
// ============================================================

window.PERFILES = {

  // ══════════════════════════════════════════
  juanytours: {
    nombre:    "Juanytours",
    plantilla: "clasica",

    empresa: {
      nombre:    "Juanytours",
      rnc:       "133029189",
      // Rótulo que se imprime antes del número: "RNC" o "CÉDULA"
      rncLabel:  "RNC",
      direccion: "El Millón, Calle Caña Dulce",
      ciudad:    "República Dominicana",
      telefono:  "809-771-2790",
      email:     "reservas@juanytours.com",
      // Ruta relativa a index.html (el logo está junto a él, en la raíz)
      logo:      "Logo de Juanytours nav-bar sin fondo.png"
    },

    banco: {
      pagueA:          "Juanytours",
      nombre:          "BANCO DE RESERVAS (BANRESERVAS), REPÚBLICA DOMINICANA",
      cuentaUSDLabel:  "CUENTA USD AHORRO",
      cuentaUSD:       "",
      cuentaDOPLabel:  "CUENTA DOP CORRIENTE",
      cuentaDOP:       "",
      ibanUSD:         "",
      ibanDOP:         "",
      swift:           ""
    },

    fiscal: {
      itbisPorcentaje:   18,
      etiquetaItbis:     "ITBIS",
      simboloMoneda:     "$",
      monedaLocal:       "DOP",
      monedaExtranjera:  "USD",
      tipoCambioDefault: 60.65
    },

    numeracion: {
      prefijo:   "COT-",
      siguiente: 1
    }
  },

  // ══════════════════════════════════════════
  laps: {
    nombre:    "LAPS",
    plantilla: "laps",

    empresa: {
      nombre:    "LAS AMERICAS PROFESSIONAL SERVICES, S.R.L.",
      rnc:       "130-00182-2",
      rncLabel:  "RNC",
      direccion: "C/ Guarocuya no. 82, el Millón",
      ciudad:    "Santo Domingo, R.D.",
      telefono:  "809 770-1279",
      email:     "lapsrdgerencia@gmail.com",
      logo:      "Logo de LAPS.png"
    },

    banco: {
      pagueA:          "Las Americas Professional Srl",
      nombre:          "Banco Popular Dominicano",
      cuentaDOPLabel:  "Cuenta Corriente",
      cuentaDOP:       "836970897",
      cuentaUSDLabel:  "",
      cuentaUSD:       "",
      ibanUSD:         "",
      ibanDOP:         "",
      swift:           ""
    },

    fiscal: {
      itbisPorcentaje:   18,
      etiquetaItbis:     "ITEBIS",
      simboloMoneda:     "RD$",
      monedaLocal:       "DOP",
      monedaExtranjera:  "USD",
      tipoCambioDefault: 60.65
    },

    numeracion: {
      prefijo:   "",
      siguiente: 273
    },

    // Valores que la plantilla LAPS usa por defecto
    defectos: {
      vendedor:    "ANTONIO PAULINO",
      validoHasta: "Valido hasta 31 Diciembre 2026"
    }
  }

};

// Perfil que se abre al arrancar si no hay otro guardado
window.PERFIL_DEFECTO = 'juanytours';

// app.js reasigna esto al activar un perfil
window.EMPRESA = window.PERFILES[window.PERFIL_DEFECTO];
