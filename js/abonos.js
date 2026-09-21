// Shared by the editor and the standalone HTML export. Amounts are stored in DOP.
function crearAbonos() {
  const redondear = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const formato = n => n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function resumen(abonos, total, factor = 1) {
    const pagado = redondear(abonos.reduce((s, a) => s + redondear(a.monto * factor), 0));
    return { pagado, saldo: redondear(redondear(total) - pagado) };
  }
  function pintar(abonos, total, factor, moneda, cambiar, totales) {
    const host = document.getElementById('juany-abonos');
    if (!host) return;
    host.replaceChildren();
    host.classList.toggle('sin-abonos', !abonos.length);
    const titulo = document.createElement('h3');
    titulo.textContent = 'Abonos y avances';
    host.append(titulo);
    const tabla = document.createElement('table');
    tabla.className = 'tabla-abonos';
    const cab = tabla.createTHead().insertRow();
    ['Pago', 'Fecha', 'Referencia', 'Monto (' + moneda + ')', ''].forEach(t => {
      const th = document.createElement('th'); th.textContent = t; cab.append(th);
    });
    const body = tabla.createTBody();
    abonos.forEach((a, i) => {
      const fila = body.insertRow();
      fila.insertCell().textContent = 'Abono ' + (i + 1);
      function campo(tipo, valor, etiqueta, guardar) {
        const celda = fila.insertCell();
        const texto = document.createElement('span');
        texto.className = 'abono-impreso';
        texto.textContent = tipo === 'number' ? '−' + formato(Number(valor)) : valor || '—';
        const input = document.createElement('input');
        input.type = tipo; input.value = valor; input.className = 'no-print';
        input.setAttribute('aria-label', etiqueta + ' del abono ' + (i + 1));
        if (tipo === 'number') { input.min = '0'; input.step = '0.01'; input.readOnly = moneda === 'USD'; input.title = 'Registra el monto en la vista DOP'; }
        input.addEventListener('input', () => {
          if (!input.validity.valid) return;
          guardar(input.value);
          texto.textContent = tipo === 'number' ? '−' + formato(Number(input.value)) : input.value || '—';
          actualizar(); cambiar();
        });
        celda.append(input, texto);
      }
      campo('date', a.fecha || '', 'Fecha', v => a.fecha = v);
      campo('text', a.referencia || '', 'Referencia', v => a.referencia = v);
      campo('number', redondear(a.monto * factor).toFixed(2), 'Monto', v => a.monto = redondear(Number(v)));
      const eliminar = document.createElement('button');
      eliminar.type = 'button'; eliminar.className = 'no-print'; eliminar.textContent = 'Eliminar';
      eliminar.setAttribute('aria-label', 'Eliminar abono ' + (i + 1));
      eliminar.onclick = () => { abonos.splice(i, 1); pintar(abonos, total, factor, moneda, cambiar, totales); cambiar(); };
      fila.insertCell().append(eliminar);
    });
    host.append(tabla);
    const agregar = document.createElement('button');
    agregar.type = 'button'; agregar.className = 'no-print'; agregar.textContent = '+ Agregar abono';
    agregar.disabled = moneda === 'USD';
    agregar.title = 'Registra los abonos en la vista DOP';
    agregar.onclick = () => {
      const d = new Date();
      const fecha = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      abonos.push({ fecha, monto: 0, referencia: '' });
      pintar(abonos, total, factor, moneda, cambiar, totales); cambiar();
    };
    function actualizar() {
      const r = resumen(abonos, total, factor);
      const hayAbonos = abonos.length > 0;
      host.closest('.pagina')?.classList.toggle('con-abonos', hayAbonos);
      const filaAbonado = document.getElementById('juany-fila-abonado');
      if (filaAbonado) filaAbonado.hidden = !hayAbonos;
      const poner = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };
      poner('juany-moneda-abonado', moneda);
      poner('juany-total-abonado', '−' + formato(r.pagado));
      if (totales) {
        const saldoDOP = resumen(abonos, totales.dop).saldo;
        const saldoUSD = resumen(abonos, totales.usd, 1 / totales.tasa).saldo;
        poner('tot-dop', formato(hayAbonos ? Math.abs(saldoDOP) : totales.dop));
        poner('tot-usd', formato(hayAbonos ? Math.abs(saldoUSD) : totales.usd));
        poner('juany-label-dop', hayAbonos ? (saldoDOP < 0 ? 'A FAVOR' : 'SALDO') : 'TOTAL');
        poner('juany-label-usd', hayAbonos ? (saldoUSD < 0 ? 'A FAVOR' : 'SALDO') : 'TOTAL');
      }
    }
    actualizar(); host.append(agregar);
  }
  return { pintar, resumen };
}
const Abonos = crearAbonos();
