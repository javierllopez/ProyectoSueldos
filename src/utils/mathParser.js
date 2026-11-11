/**
 * Evaluador matemático y lógico basado en tokenizador + algoritmo Shunting-Yard (RPN).
 * Reemplaza el uso de `Function()` / `new Function()` eliminando la ejecución dinámica de JS.
 */

const MAX_EXPRESSION_LENGTH = 10000;
const MAX_RPN_CACHE = 1000;
const rpnCache = new Map();

const OPERATORS = {
  '||': { prec: 1, assoc: 'left', arity: 2, category: 'logic' },
  '&&': { prec: 2, assoc: 'left', arity: 2, category: 'logic' },
  '=': { prec: 3, assoc: 'left', arity: 2, category: 'logic' },
  '==': { prec: 3, assoc: 'left', arity: 2, category: 'logic' },
  '===': { prec: 3, assoc: 'left', arity: 2, category: 'logic' },
  '!=': { prec: 3, assoc: 'left', arity: 2, category: 'logic' },
  '<>': { prec: 3, assoc: 'left', arity: 2, category: 'logic' },
  '!==': { prec: 3, assoc: 'left', arity: 2, category: 'logic' },
  '<': { prec: 4, assoc: 'left', arity: 2, category: 'logic' },
  '<=': { prec: 4, assoc: 'left', arity: 2, category: 'logic' },
  '>': { prec: 4, assoc: 'left', arity: 2, category: 'logic' },
  '>=': { prec: 4, assoc: 'left', arity: 2, category: 'logic' },
  '+': { prec: 5, assoc: 'left', arity: 2, category: 'arith' },
  '-': { prec: 5, assoc: 'left', arity: 2, category: 'arith' },
  '*': { prec: 6, assoc: 'left', arity: 2, category: 'arith' },
  '/': { prec: 6, assoc: 'left', arity: 2, category: 'arith' },
  '%': { prec: 6, assoc: 'left', arity: 2, category: 'arith' },
  'u+': { prec: 7, assoc: 'right', arity: 1, category: 'arith' },
  'u-': { prec: 7, assoc: 'right', arity: 1, category: 'arith' },
  '!': { prec: 7, assoc: 'right', arity: 1, category: 'logic' },
};

const MULTI_CHAR_OPS = ['===', '!==', '==', '!=', '<>', '<=', '>=', '&&', '||'];
const SINGLE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '=', '<', '>', '!']);

function tokenize(expr, arithmeticOnly) {
  const tokens = [];
  let i = 0;
  const len = expr.length;
  let expectValue = true;

  while (i < len) {
    const ch = expr[i];

    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++;
      continue;
    }

    // Números (incluyendo decimales y notación científica como 1e-7)
    if ((ch >= '0' && ch <= '9') || (ch === '.' && i + 1 < len && expr[i + 1] >= '0' && expr[i + 1] <= '9')) {
      if (!expectValue) return null; // Dos valores seguidos sin operador
      let numStr = '';
      let hasDot = false;
      while (i < len) {
        const c = expr[i];
        if (c >= '0' && c <= '9') {
          numStr += c;
          i++;
        } else if (c === '.' && !hasDot) {
          hasDot = true;
          numStr += c;
          i++;
        } else {
          break;
        }
      }
      if (i < len && (expr[i] === 'e' || expr[i] === 'E')) {
        let expPart = expr[i];
        let j = i + 1;
        if (j < len && (expr[j] === '+' || expr[j] === '-')) {
          expPart += expr[j];
          j++;
        }
        let expDigits = '';
        while (j < len && expr[j] >= '0' && expr[j] <= '9') {
          expDigits += expr[j];
          j++;
        }
        if (!expDigits) return null;
        numStr += expPart + expDigits;
        i = j;
      }
      const numVal = Number(numStr);
      if (Number.isNaN(numVal)) return null;
      tokens.push({ type: 'num', value: numVal });
      expectValue = false;
      continue;
    }

    if (ch === '(') {
      if (!expectValue) return null; // Multiplicación implícita no soportada: 2(3)
      tokens.push({ type: 'lparen' });
      i++;
      expectValue = true;
      continue;
    }

    if (ch === ')') {
      if (expectValue) return null; // Paréntesis vacío () o trailing op (1+)
      tokens.push({ type: 'rparen' });
      i++;
      expectValue = false;
      continue;
    }

    let op = null;
    for (const candidate of MULTI_CHAR_OPS) {
      if (expr.startsWith(candidate, i)) {
        op = candidate;
        break;
      }
    }
    if (!op && SINGLE_CHAR_OPS.has(ch)) {
      op = ch;
    }

    if (!op) {
      return null; // Caracter no permitido
    }

    i += op.length;

    if (expectValue) {
      if (op === '+') op = 'u+';
      else if (op === '-') op = 'u-';
      else if (op !== '!') return null;
    } else if (op === '!') {
      return null;
    }

    const opMeta = OPERATORS[op];
    if (!opMeta) return null;
    if (arithmeticOnly && opMeta.category === 'logic') {
      return null;
    }

    tokens.push({ type: 'op', value: op });
    expectValue = true;
  }

  if (expectValue || tokens.length === 0) return null;
  return tokens;
}

function toRpn(tokens) {
  const output = [];
  const opStack = [];

  for (const token of tokens) {
    if (token.type === 'num') {
      output.push(token);
    } else if (token.type === 'op') {
      const o1 = OPERATORS[token.value];
      while (opStack.length > 0) {
        const top = opStack[opStack.length - 1];
        if (top.type !== 'op') break;
        const o2 = OPERATORS[top.value];
        if ((o1.assoc === 'left' && o1.prec <= o2.prec) || (o1.assoc === 'right' && o1.prec < o2.prec)) {
          output.push(opStack.pop());
        } else {
          break;
        }
      }
      opStack.push(token);
    } else if (token.type === 'lparen') {
      opStack.push(token);
    } else if (token.type === 'rparen') {
      let foundLeft = false;
      while (opStack.length > 0) {
        const top = opStack.pop();
        if (top.type === 'lparen') {
          foundLeft = true;
          break;
        }
        output.push(top);
      }
      if (!foundLeft) return null;
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop();
    if (top.type === 'lparen' || top.type === 'rparen') return null;
    output.push(top);
  }

  return output;
}

function toNumber(v) {
  return typeof v === 'boolean' ? (v ? 1 : 0) : Number(v);
}

function toBool(v) {
  return Boolean(v);
}

function evalRpn(rpn) {
  const stack = [];

  for (const token of rpn) {
    if (token.type === 'num') {
      stack.push(token.value);
      continue;
    }

    const op = token.value;
    const meta = OPERATORS[op];
    if (meta.arity === 1) {
      if (stack.length < 1) return NaN;
      const a = stack.pop();
      if (op === 'u-') stack.push(-toNumber(a));
      else if (op === 'u+') stack.push(+toNumber(a));
      else if (op === '!') stack.push(!toBool(a));
      continue;
    }

    if (stack.length < 2) return NaN;
    const b = stack.pop();
    const a = stack.pop();

    switch (op) {
      case '+':
        stack.push(toNumber(a) + toNumber(b));
        break;
      case '-':
        stack.push(toNumber(a) - toNumber(b));
        break;
      case '*':
        stack.push(toNumber(a) * toNumber(b));
        break;
      case '/':
        stack.push(toNumber(a) / toNumber(b));
        break;
      case '%':
        stack.push(toNumber(a) % toNumber(b));
        break;
      case '<':
        stack.push(toNumber(a) < toNumber(b));
        break;
      case '<=':
        stack.push(toNumber(a) <= toNumber(b));
        break;
      case '>':
        stack.push(toNumber(a) > toNumber(b));
        break;
      case '>=':
        stack.push(toNumber(a) >= toNumber(b));
        break;
      case '=':
      case '==':
      case '===':
        stack.push(toNumber(a) === toNumber(b));
        break;
      case '!=':
      case '<>':
      case '!==':
        stack.push(toNumber(a) !== toNumber(b));
        break;
      case '&&':
        stack.push(toBool(a) ? b : a);
        break;
      case '||':
        stack.push(toBool(a) ? a : b);
        break;
      default:
        return NaN;
    }
  }

  if (stack.length !== 1) return NaN;
  const raw = stack[0];
  return typeof raw === 'boolean' ? (raw ? 1 : 0) : Number(raw);
}

function compileExpression(normalized, arithmeticOnly) {
  const cacheKey = `${arithmeticOnly ? 'A' : 'L'}:${normalized}`;
  if (rpnCache.has(cacheKey)) {
    return rpnCache.get(cacheKey);
  }

  const tokens = tokenize(normalized, arithmeticOnly);
  const rpn = tokens ? toRpn(tokens) : null;

  if (rpnCache.size >= MAX_RPN_CACHE) {
    const keysToDelete = Array.from(rpnCache.keys()).slice(0, 200);
    for (const k of keysToDelete) rpnCache.delete(k);
  }
  rpnCache.set(cacheKey, rpn);
  return rpn;
}

/**
 * Evalúa una expresión matemática o lógico-relacional sin usar `eval` ni `Function`.
 * @param {string} expr Expresión a evaluar
 * @param {object} [options]
 * @param {boolean} [options.arithmeticOnly=false] Si true, permite únicamente operadores aritméticos
 * @param {*} [options.fallback=0] Valor devuelto ante expresiones inválidas o no finitas (Infinity/NaN)
 * @returns {number|null}
 */
export function evaluateMathExpression(expr, { arithmeticOnly = false, fallback = 0 } = {}) {
  if (!expr || typeof expr !== 'string') return fallback;
  if (expr.length > MAX_EXPRESSION_LENGTH) return fallback;

  // Normalizar comas decimales entre dígitos (ej: 0,25 -> 0.25)
  const normalized = expr.replace(/(\d+),(\d+)/g, '$1.$2').trim();
  if (!normalized) return fallback;

  const rpn = compileExpression(normalized, arithmeticOnly);
  if (!rpn) return fallback;

  const val = evalRpn(rpn);
  if (typeof val !== 'number' || Number.isNaN(val) || !Number.isFinite(val)) {
    return fallback;
  }

  return val;
}

