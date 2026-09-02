// =============================================
//  PLANTILLA DEL DOCUMENTO
//
//  Fuente única del markup de la cotización.
//  La usan los dos consumidores:
//    · el editor (modo 'editor')  → monta el esqueleto en #documento
//    · exportarHTML (modo 'export') → genera el archivo autocontenido
//
//  Es una función pura: no toca el DOM ni lee globales, así que
//  se puede probar en Node. Todo lo variable entra por ctx.
//
//  Expone: window.Plantilla
// =============================================

(function (root) {

  const TIPOS_DOC = [
    'COTIZACIÓN',
    'FACTURA DE CRÉDITO FISCAL',
    'FACTURA',
    'PROFORMA'
  ];

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function num(n) {
    return Number(n).toLocaleString('es-DO',
      { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ── Grid de cuentas bancarias ──────────────
  // Devuelve '' si no hay ninguna cuenta configurada.
  function cuentas(ba) {
    ba = ba || {};
    if (!(ba.cuentaUSD || ba.cuentaDOP || ba.ibanUSD || ba.ibanDOP)) return '';
    return `
    <div class="pc-celda pc-cuenta"><span class="pc-label">${esc(ba.cuentaUSDLabel || 'CUENTA USD AHORRO')}:</span> ${esc(ba.cuentaUSD || '')}</div>
    <div class="pc-celda pc-iban"><span class="pc-label">IBAN:</span> ${esc(ba.ibanUSD || '')}</div>
    <div class="pc-swift" style="grid-row:1/3"><span class="pc-label">SWIFT:</span><span>${esc(ba.swift || '')}</span></div>
    <div class="pc-celda pc-cuenta" style="border-bottom:none"><span class="pc-label">${esc(ba.cuentaDOPLabel || 'CUENTA DOP CORRIENTE')}:</span> ${esc(ba.cuentaDOP || '')}</div>
    <div class="pc-celda pc-iban" style="border-bottom:none"><span class="pc-label">IBAN:</span> ${esc(ba.ibanDOP || '')}</div>`;
  }

  // ── Filas de la tabla para el HTML exportado ──
  // En el editor las filas las arma renderFilas(), que además
  // engancha listeners por celda; aquí sólo hace falta el markup.
  function filasExport(items) {
    let html = '', numItem = 0;
    (items || []).forEach(f => {
      if (f.type === 'nota') {
        html += `      <tr class="tr-nota">
        <td class="td-nota" colspan="4" contenteditable="true">${esc(f.texto || '')}</td>
        <td></td>
      </tr>\n`;
      } else {
        numItem++;
        const tipo    = f.tipo || 'exento';
        const visible = f.visible !== false;
        html += `      <tr data-tipo="${tipo}"${visible ? '' : ' class="fila-oculta"'}>
        <td class="td-num">${numItem}</td>
        <td class="td-det" contenteditable="true" data-field="desc" data-placeholder="Descripci&oacute;n del servicio">${esc(f.desc || '')}</td>
        <td class="td-cantidad" contenteditable="true" data-field="cantidad" data-placeholder="1">${f.cantidad || 1}</td>
        <td class="td-monto" contenteditable="true" data-field="monto" data-placeholder="0.00">${num(f.monto || 0)}</td>
        <td class="td-tipo no-print">
          <select class="sel-tipo-item">
            <option value="exento"${tipo === 'exento' ? ' selected' : ''}>Exento</option>
            <option value="gravado"${tipo === 'gravado' ? ' selected' : ''}>Gravado</option>
          </select>
        </td>
      </tr>\n`;
      }
    });
    const totalItems = (items || []).filter(f => f.type === 'item').length;
    for (let x = totalItems; x < 3; x++) {
      html += `      <tr class="tr-vacio"><td></td><td></td><td></td><td></td><td></td></tr>\n`;
    }
    return html;
  }

  // ── Documento completo ─────────────────────
  //  ctx = {
  //    modo:        'editor' | 'export',
  //    estado:      objeto de capturarEstado() (puede venir vacío),
  //    empresa:     window.EMPRESA.empresa,
  //    banco:       window.EMPRESA.banco,
  //    fiscal:      window.EMPRESA.fiscal,
  //    logo:        src de la imagen (ruta o data:),
  //    tasa:        tasa a mostrar,
  //    cuentasHTML: markup del grid bancario,
  //    filasHTML:   contenido del <tbody> (sólo en export)
  //  }
  //  Devuelve el INTERIOR de .pagina — quien llama pone el contenedor,
  //  que es donde viven las clases sin-* de visibilidad.
  function interior(ctx) {
    ctx = ctx || {};
    const modo   = ctx.modo === 'export' ? 'export' : 'editor';
    const editor = modo === 'editor';
    const e      = ctx.estado  || {};
    const emp    = ctx.empresa || {};
    const ban    = ctx.banco   || {};
    const fi     = ctx.fiscal  || {};

    const tipoDoc   = e.tipoDoc || 'COTIZACIÓN';
    const etqRncEmp = emp.rncLabel || 'RNC';
    const etqIdCli  = e.idCliente  || 'RNC';
    const itbisPct  = fi.itbisPorcentaje  || 18;
    const monLocal  = fi.monedaLocal      || 'DOP';
    const monExt    = fi.monedaExtranjera || 'USD';
    const tasa      = ctx.tasa != null ? ctx.tasa : (fi.tipoCambioDefault || 60.65);

    const tiposOpts = TIPOS_DOC
      .map(t => `<option value="${t}"${t === tipoDoc ? ' selected' : ''}>${t}</option>`)
      .join('');

    // El editor rellena el <tbody> con renderFilas(); el export lo trae hecho.
    const cuerpoTabla = editor ? '\n' : '\n' + (ctx.filasHTML || '');

    return `
    <!-- ENCABEZADO -->
    <div class="encabezado">
      <div class="enc-izq">
        <img id="doc-logo" src="${esc(ctx.logo || '')}" alt="Logo" class="doc-logo" />
        <div class="doc-empresa-datos">
          <p id="doc-empresa-nombre" class="empresa-nombre">${esc(emp.nombre || '')}</p>
          <p id="doc-empresa-dir">${esc(emp.direccion || '')}</p>
          <p id="doc-empresa-ciudad">${esc(emp.ciudad || '')}</p>
          <p id="doc-empresa-tel">${emp.telefono ? 'Teléfono: ' + esc(emp.telefono) : ''}</p>
          <p id="doc-empresa-rnc">${emp.rnc ? esc(etqRncEmp) + ': ' + esc(emp.rnc) : ''}</p>
        </div>
      </div>
      <div class="enc-der">
        <div class="doc-numero-wrap">
          <span class="doc-numero" contenteditable="true" id="doc-numero">${esc(e.numero || '001')}</span>
        </div>
        <div class="doc-titulo-tipo">
          <select id="sel-tipo-doc" class="sel-tipo no-print" onchange="cambiarTipoDoc(this.value)">${tiposOpts}</select>
          <span id="doc-titulo-texto" class="doc-titulo-texto">${esc(tipoDoc)}</span>
        </div>
        <div class="doc-fecha-ref">
          <div class="fr-fila">
            <span class="fr-label">FECHA:</span>
            <input type="date" id="doc-fecha" class="inp-fecha" value="${esc(e.fecha || '')}" />
          </div>
          <div class="fr-fila fr-fila-ref">
            <span class="fr-label">REFERENCIA:</span>
            <span class="fr-val" contenteditable="true" id="doc-ref" data-placeholder="0">${esc(e.ref || '')}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- LÍNEA SEPARADORA -->
    <div class="linea-azul"></div>

    <!-- SECCIÓN CLIENTE -->
    <div class="seccion-cliente">
      <div class="cli-izq">
        <p>
          <span class="cli-label">CLIENTE:</span>
          <span class="cli-val" contenteditable="true" id="doc-cliente" data-placeholder="Nombre del cliente">${esc(e.cliente || '')}</span>
        </p>
        <p>
          <span class="cli-label">TEL.:</span>
          <span class="cli-val" contenteditable="true" id="doc-cli-tel" data-placeholder="Teléfono">${esc(e.telCli || '')}</span>
        </p>
        <p>
          <span class="cli-label" id="lbl-cli-rnc">${esc(etqIdCli)}:</span>
          <span class="cli-val" contenteditable="true" id="doc-cli-rnc" data-placeholder="${esc(etqIdCli)}">${esc(e.rncCli || '')}</span>
        </p>
      </div>
      <div class="cli-der">
        <p class="cli-tipo-doc" id="cli-tipo-doc-texto">${esc(tipoDoc)}</p>
        <p class="cli-fila-ncf">
          <span class="cli-label">NCF:</span>
          <span class="cli-val" contenteditable="true" id="doc-ncf" data-placeholder="0">${esc(e.ncf || '')}</span>
        </p>
      </div>
    </div>

    <!-- TABLA DE SERVICIOS -->
    <table class="tabla-servicios">
      <thead>
        <tr>
          <th class="th-num">Cant.</th>
          <th class="th-det">Detalles</th>
          <th class="th-cantidad">Cantidad</th>
          <th class="th-monto">Monto</th>
          <th class="th-tipo no-print">Tipo</th>
${editor ? '          <th class="th-del  no-print"></th>\n' : ''}        </tr>
      </thead>
      <tbody id="tabla-body">${cuerpoTabla}      </tbody>
    </table>

    <!-- TOTALES + TIPO DE CAMBIO -->
    <div class="seccion-totales">
      <div class="tot-izq">
        <p class="tipo-cambio-texto">
          Tipo de cambio Banco Central
          <span id="doc-moneda-ext">${esc(monExt)}</span> x
          <span contenteditable="true" id="doc-tasa" class="tasa-val"${editor ? '' : ' oninput="calcTotales()"'}>${tasa}</span>
${editor ? '          <span id="tasa-indicador" class="tasa-indicador tasa-ind-oficial no-print">· tasa oficial</span>\n' : ''}        </p>
      </div>
      <div class="tot-der">
        <table class="tabla-totales">
          <tr class="tot-fila-excento">
            <td class="tot-label">TOTAL EXCENTO</td>
            <td class="tot-signo">$</td>
            <td class="tot-val" id="tot-excento">0.00</td>
          </tr>
          <tr class="tot-fila-gravado">
            <td class="tot-label">TOTAL GRAVADO</td>
            <td class="tot-signo">$</td>
            <td class="tot-val" id="tot-gravado">0.00</td>
          </tr>
          <tr class="tot-fila-itbis">
            <td class="tot-label">ITBIS <span id="doc-itbis-pct">${itbisPct}</span>%</td>
            <td class="tot-signo">$</td>
            <td class="tot-val" id="tot-itbis">0.00</td>
          </tr>
          <tr class="tot-fila-dop">
            <td class="tot-label"><strong>TOTAL <span id="lbl-moneda-local">${esc(monLocal)}</span></strong></td>
            <td class="tot-signo"><strong>$</strong></td>
            <td class="tot-val" id="tot-dop"><strong>0.00</strong></td>
          </tr>
          <tr class="tot-fila-usd">
            <td class="tot-label"><strong>TOTAL <span id="lbl-moneda-ext">${esc(monExt)}</span></strong></td>
            <td class="tot-signo"><strong>$</strong></td>
            <td class="tot-val" id="tot-usd"><strong>0.00</strong></td>
          </tr>
        </table>
      </div>
    </div>

    <!-- SECCIÓN DE PAGO -->
    <div class="seccion-pago">
      <div class="pago-head">
        <div class="ph-izq">Páguese A: <strong id="doc-pague-a">${esc(ban.pagueA || emp.nombre || '')}</strong></div>
        <div class="ph-der"><span id="lbl-rnc-pago">${esc(etqRncEmp)}</span>: <strong id="doc-rnc-pago">${esc(emp.rnc || '')}</strong></div>
      </div>
      <div class="pago-banco" id="doc-banco-nombre">${esc(ban.nombre || '')}</div>
      <div class="pago-cuentas" id="bloque-cuentas">${ctx.cuentasHTML != null ? ctx.cuentasHTML : cuentas(ban)}</div>
      <div class="pago-metodo">
        <span>Método de pago:</span>
        <span contenteditable="true" id="doc-metodo" data-placeholder="Transferencia">${esc(e.metodo || '')}</span>
      </div>
      <div class="pago-notas" contenteditable="true" id="doc-notas" data-placeholder="Notas adicionales...">${esc(e.notas || '')}</div>
    </div>
`;
  }

  const Plantilla = { TIPOS_DOC, interior, cuentas, filasExport, esc, num };

  root.Plantilla = Plantilla;
  if (typeof module !== 'undefined' && module.exports) module.exports = Plantilla;

})(typeof window !== 'undefined' ? window : globalThis);
