// =============================================
//  FÓRMULAS EN LA COLUMNA DE IMPORTES
//
//  Evaluador propio —sin eval()— para expresiones aritméticas
//  básicas escritas a mano en las celdas de importe:
//
//    1500 + 1500*10%    → 1,650.00   (precio viejo + aumento)
//    1500 + 10%         → 1,650.00   (el % suelto se aplica sobre
//                                     lo acumulado a su izquierda)
//    1500 + 1500(10%)   → 1,650.00   (multiplicación implícita)
//    (120 + 30) * 2     → 300.00
//    1,250.50 x 3       → 3,751.50
//    2500 / 2           → 1,250.00
//
//  Operadores: + - * / (también x, × y ÷), paréntesis y %.
//  La coma se trata como separador de miles (es-DO).
//
//  La celda guarda la fórmula en data-formula y muestra el
//  resultado ya formateado; al enfocarla vuelve a aparecer la
//  fórmula para poder corregirla, como en una hoja de cálculo.
//
//  Expone: window.Formula
//   · evaluar(texto)      → { ok, valor, esFormula, error }
//   · esFormula(texto)    → true si no es un número pelado
//   · formatear(n)        → '1,650.00'
//   · valorCelda(cel)     → número vigente de una celda
//   · datosCelda(cel)     → { monto, formula }
//   · engancharCelda(cel, opts) → comportamiento de hoja de cálculo
//   · fuente()            → código del módulo, para incrustarlo en
//                           el HTML exportado (ver exportarHTML)
// =============================================

(function (root) {

  // Todo el módulo vive dentro de esta función para poder
  // serializarlo con toString() y reinyectarlo en el export:
  // así el archivo exportado usa exactamente este mismo motor.
  function crearFormula() {

    // ── Normalización ────────────────────────
    // Deja sólo los caracteres que entiende el tokenizador.
    function normalizar(txt) {
      return String(txt == null ? '' : txt)
        .replace(/[\s ]/g, '')
        .replace(/,/g, '')            // 1,250.50 → 1250.50
        .replace(/[xX×]/g, '*')
        .replace(/[÷:]/g, '/')
        .replace(/[−–—]/g, '-')
        .replace(/[·•]/g, '*')
        .replace(/[[{]/g, '(')
        .replace(/[\]}]/g, ')')
        .replace(/=+$/, '');          // "1500+10%=" al estilo calculadora
    }

    function fallo(msg) { return new Error(msg); }

    // ── Tokenizador ──────────────────────────
    function tokenizar(s) {
      const toks = [];
      let i = 0;
      while (i < s.length) {
        const c = s[i];
        if ((c >= '0' && c <= '9') || c === '.') {
          let j = i;
          while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
          const txt = s.slice(i, j);
          if ((txt.match(/\./g) || []).length > 1) throw fallo('número inválido "' + txt + '"');
          if (txt === '.') throw fallo('falta un número antes o después del punto');
          toks.push({ t: 'num', v: parseFloat(txt) });
          i = j;
        } else if ('+-*/'.indexOf(c) !== -1) {
          toks.push({ t: 'op', v: c }); i++;
        } else if (c === '(' || c === ')' || c === '%') {
          toks.push({ t: c }); i++;
        } else {
          throw fallo('"' + c + '" no es un operador válido');
        }
      }
      return toks;
    }

    // ── Analizador (descenso recursivo) ──────
    //   expresion := termino (('+'|'-') termino)*
    //   termino   := factor (('*'|'/'| implícito) factor)*
    //   factor    := ('+'|'-')* primario '%'*
    //   primario  := numero | '(' expresion ')'
    function analizar(toks) {
      let pos = 0;
      const ver  = () => toks[pos];
      const esOp = c => { const t = ver(); return !!t && t.t === 'op' && t.v === c; };

      function primario() {
        const t = ver();
        if (!t)            throw fallo('la fórmula queda incompleta');
        if (t.t === 'num') { pos++; return t.v; }
        if (t.t === '(') {
          pos++;
          const v = expresion().v;
          if (!ver() || ver().t !== ')') throw fallo('falta cerrar un paréntesis');
          pos++;
          return v;
        }
        if (t.t === ')')   throw fallo('hay un ")" que nunca se abrió');
        throw fallo('se esperaba un número');
      }

      function factor() {
        let signo = 1;
        while (esOp('+') || esOp('-')) { if (esOp('-')) signo = -signo; pos++; }
        let v   = signo * primario();
        let pct = false;
        while (ver() && ver().t === '%') { v = v / 100; pct = true; pos++; }
        return { v: v, pct: pct };
      }

      function termino() {
        const f = factor();
        let v = f.v, pct = f.pct;
        for (;;) {
          const t = ver();
          if (!t) break;
          if (t.t === 'op' && (t.v === '*' || t.v === '/')) {
            const op = t.v; pos++;
            const g  = factor();
            if (op === '/') {
              if (g.v === 0) throw fallo('no se puede dividir entre cero');
              v = v / g.v;
            } else {
              v = v * g.v;
            }
            pct = false;
          } else if (t.t === 'num' || t.t === '(') {
            // Multiplicación implícita: 1500(10%) = 150
            v   = v * factor().v;
            pct = false;
          } else {
            break;
          }
        }
        return { v: v, pct: pct };
      }

      function expresion() {
        const t0 = termino();
        let v = t0.v, pct = t0.pct;
        for (;;) {
          if (!(esOp('+') || esOp('-'))) break;
          const signo = esOp('-') ? -1 : 1;
          pos++;
          const t = termino();
          // Un término que es SÓLO un porcentaje (…+10%) se aplica
          // sobre lo acumulado, como en una calculadora de mano.
          v  += signo * (t.pct ? v * t.v : t.v);
          pct = false;
        }
        return { v: v, pct: pct };
      }

      const r = expresion();
      if (pos < toks.length) throw fallo('sobra algo al final de la fórmula');
      return r.v;
    }

    // ── API de cálculo ───────────────────────
    function esFormula(txt) {
      const s = normalizar(txt);
      return s !== '' && !/^-?\d+(\.\d+)?$/.test(s);
    }

    function evaluar(txt) {
      const s = normalizar(txt);
      if (s === '') return { ok: true, valor: 0, esFormula: false };
      const formula = esFormula(txt);
      try {
        const v = analizar(tokenizar(s));
        if (!isFinite(v)) throw fallo('el resultado no es un número');
        // Los importes son dinero: el resultado de una fórmula se
        // cuadra a 2 decimales (y de paso mata el ruido del float).
        return { ok: true, valor: formula ? Math.round(v * 100) / 100 : v, esFormula: formula };
      } catch (e) {
        return { ok: false, valor: 0, esFormula: formula, error: e.message };
      }
    }

    function formatear(n) {
      return Number(n).toLocaleString('es-DO',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // ── Celdas ───────────────────────────────
    // Texto vigente de la celda: mientras se edita manda lo que hay
    // escrito; el resto del tiempo, la fórmula guardada (si tiene).
    function textoCelda(cel) {
      if (!cel) return '';
      const editando = typeof document !== 'undefined' && document.activeElement === cel;
      if (!editando && cel.dataset && cel.dataset.formula) return cel.dataset.formula;
      return cel.innerText;
    }

    function valorCelda(cel) {
      const r = evaluar(textoCelda(cel));
      return r.ok ? r.valor : 0;
    }

    function datosCelda(cel) {
      const txt = String(textoCelda(cel)).trim();
      const r   = evaluar(txt);
      if (!r.ok)       return { monto: 0,       formula: txt };
      if (r.esFormula) return { monto: r.valor, formula: txt };
      return { monto: r.valor, formula: '' };
    }

    // Deja la celda en reposo: resultado formateado, fórmula
    // guardada en data-formula y marca visual.
    function pintarCelda(cel, res, txt) {
      if (!res.ok) {
        cel.dataset.formula = txt;
        cel.classList.add('formula-error');
        cel.classList.remove('con-formula');
        cel.title = 'Fórmula inválida: ' + res.error;
        return;
      }
      cel.textContent = formatear(res.valor);
      cel.classList.remove('formula-error');
      if (res.esFormula) {
        cel.dataset.formula = txt;
        cel.classList.add('con-formula');
        cel.title = 'Fórmula: ' + txt + '  =  ' + formatear(res.valor);
      } else {
        delete cel.dataset.formula;
        cel.classList.remove('con-formula');
        cel.removeAttribute('title');
      }
    }

    // ── Globito con el resultado en vivo ─────
    let globo = null;
    function verGlobo(cel, texto, error) {
      if (!globo) {
        globo = document.createElement('div');
        globo.id        = 'formula-globo';
        globo.className = 'formula-globo no-print';
        document.body.appendChild(globo);
      }
      globo.textContent = texto;
      globo.classList.toggle('formula-globo-error', !!error);
      globo.style.display = 'block';
      const r = cel.getBoundingClientRect();
      globo.style.top  = (r.bottom + 6) + 'px';
      globo.style.left = Math.max(8, r.right - globo.offsetWidth) + 'px';
    }
    function ocultarGlobo() { if (globo) globo.style.display = 'none'; }

    // ── Enganche de una celda de importe ─────
    //  opts.alCambiar(valor, formula, cel) → en cada tecla y al salir
    //  opts.alGuardar(valor, formula, cel) → sólo al salir de la celda
    function engancharCelda(cel, opts) {
      if (!cel || cel._formulaEnganchada) return;
      cel._formulaEnganchada = true;
      opts = opts || {};

      const avisar = (fn, res, txt) => {
        if (typeof fn !== 'function') return;
        fn(res.ok ? res.valor : 0, (res.esFormula || !res.ok) ? txt : '', cel);
      };

      cel.addEventListener('focus', () => {
        // Vuelve a mostrar la fórmula para poder editarla
        if (cel.dataset.formula) cel.textContent = cel.dataset.formula;
        colocarCaretAlFinal(cel);
      });

      cel.addEventListener('input', () => {
        const txt = cel.innerText.trim();
        const res = evaluar(txt);
        if (res.esFormula || !res.ok) {
          verGlobo(cel, res.ok ? '= ' + formatear(res.valor) : '⚠ ' + res.error, !res.ok);
        } else {
          ocultarGlobo();
        }
        avisar(opts.alCambiar, res, txt);
      });

      cel.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); cel.blur(); }
        if (ev.key === 'Escape') {
          ev.preventDefault();
          cel.textContent = cel.dataset.formula || cel.innerText;
          cel.blur();
        }
      });

      cel.addEventListener('blur', () => {
        ocultarGlobo();
        const txt = cel.innerText.trim();
        const res = evaluar(txt);
        pintarCelda(cel, res, txt);
        avisar(opts.alCambiar, res, txt);
        avisar(opts.alGuardar, res, txt);
      });
    }

    function colocarCaretAlFinal(cel) {
      try {
        const rango = document.createRange();
        rango.selectNodeContents(cel);
        rango.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(rango);
      } catch (e) { /* navegador sin Selection API */ }
    }

    // Atributos que debe llevar una celda de importe al renderizarse.
    // Se usa en el editor y en el HTML exportado.
    function attrsCelda(fila) {
      const f = (fila && fila.formula) || '';
      if (!f) return '';
      const esc = String(f).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                           .replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return ' data-formula="' + esc + '" title="Fórmula: ' + esc + '"';
    }

    return {
      evaluar:        evaluar,
      esFormula:      esFormula,
      formatear:      formatear,
      textoCelda:     textoCelda,
      valorCelda:     valorCelda,
      datosCelda:     datosCelda,
      pintarCelda:    pintarCelda,
      attrsCelda:     attrsCelda,
      engancharCelda: engancharCelda,
      ocultarGlobo:   ocultarGlobo
    };
  }

  root.Formula = crearFormula();

  // Código fuente del módulo para el HTML exportado: una sola
  // implementación, sin copias que se desincronicen.
  root.Formula.fuente = function () {
    return '(' + crearFormula.toString() + ')()';
  };

})(typeof window !== 'undefined' ? window : globalThis);
