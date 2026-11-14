// Collects every piece of text the app can show into src/i18n/catalog.json.
//
// The app is written in English. At run time each text that is about to be drawn is looked up in this catalog:
// what is in it is the app's own wording and gets translated; what is not (a client's name, a job title, an AI
// answer) is the user's own content and is left alone. Sentences with values in them become patterns:
//   `${n} of ${total} to-dos done`  →  "{0} of {1} to-dos done"
// and small either/or pieces are written out in full, so each language gets whole sentences to translate:
//   `${n} photo${n === 1 ? '' : 's'}`  →  "{0} photo", "{0} photos"
//
// Run: node scripts/i18n-extract.mjs        (writes the catalog)
//      node scripts/i18n-extract.mjs --check (fails if the catalog is out of date)
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(SRC, 'i18n', 'catalog.json');

/** Files whose strings never reach the screen (instructions for the AI, storage, tests). */
const SKIP_FILE = /(\.test\.tsx?$|\/i18n\/|\/cloud\/config\.ts$|\/store\/sanitize\.ts$|\.d\.ts$)/;
/** Inside these functions and constants the text is an instruction for the AI, not something the user reads. */
const SKIP_SCOPE = /(prompt|system|schema|instruction|^demoAI$|^pickJobType$|regex|pattern|^RE_|_RE$|css|svg|html$)/i;
/** JSX attributes and call arguments that are never shown as words. */
const SKIP_ATTR = new Set(['style', 'name', 'icon', 'kind', 'tone', 'accessibilityRole', 'testID', 'key', 'href', 'behavior', 'keyboardType', 'autoCapitalize', 'autoComplete', 'textContentType', 'returnKeyType', 'resizeMode', 'animationType', 'presentation', 'animation', 'pointerEvents', 'art', 'accessibilityLabel', 'accessibilityHint', 'fontFamily', 'value', 'id', 'type', 'mode', 'source', 'uri', 'keyboardShouldPersistTaps', 'keyboardDismissMode', 'inputMode']);
const SKIP_CALL = /^(require|console\.\w+|router\.\w+|Linking\.\w+|fetch|encodeURIComponent|RegExp|Date\.parse|JSON\.\w+|\w+\.(includes|startsWith|endsWith|indexOf|split|join|replace|replaceAll|match|test|padStart|padEnd|localeCompare|toLocaleString|toLocaleDateString|toLocaleTimeString|getItem|setItem|removeItem|from|rpc|select|eq|order|storage|addListener|has|get|set|delete|add|querySelector|createElement|setAttribute|log|warn|error)|TypeError|useLocalSearchParams|Symbol|Intl\.\w+)$/;
const SKIP_PROP = new Set(['scrollSnapType', 'scrollSnapAlign', 'id', 'key', 'route', 'icon', 'unit', 'kind', 'type', 'role', 'status', 'mode', 'value', 'path', 'uri', 'url', 'href', 'color', 'bg', 'fg', 'tone', 'model', 'method', 'fontFamily', 'fontWeight', 'trade', 'category', 'lang', 'locale', 'code', 'jobTypeId', 'finish', 'level', 'field', 'name_', 'keys', 'keywords', 'vi', 'es', 'answerVi', 'event', 'platform', 'stage', 'art', 'contentType', 'accept', 'mime', 'ext']);

const MAX_VARIANTS = 12;
const exact = new Map(); // text -> first place seen
const patterns = new Map();

/** Text that looks like words but is never read by a person: plural endings glued on in code, database column lists, AI instructions. */
const NOT_WORDS = /^(s (are|need|were)|id, [a-z_, ]+|Reply with the single word OK\.|You help a construction contractor\..*|No JSON in reply|.* is web-only|no data|use\w+ (must be used inside|outside) \w+)$/;

const wordy = (s) => {
  const t = s.trim();
  if (NOT_WORDS.test(t)) return false;
  if (t.length < 2 || t.length > 1400) return false;
  if (!/\p{L}{2}/u.test(t)) return false; // needs a real word
  if (/^(https?:|mailto:|tel:|sms:|data:|file:|#|\/|\.\/|@\/|\.\.\/)/.test(t)) return false;
  if (/^[a-z0-9_.:/-]+$/.test(t)) return false; // ids, icon names, style values, routes
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 3 && !/\s/.test(t)) return false; // CONSTANT_NAMES
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(t)) return false; // camelCase
  if (/^(<|\{|\[|\()/.test(t) && /[<>{}]/.test(t)) return false; // markup, JSON
  if (/^[\w-]+(\.[\w-]+)+$/.test(t)) return false; // file.names, dotted.keys
  if (/^(rgba?|hsla?)\(/.test(t)) return false;
  if (/<\/?[a-z!][^>]*>/i.test(t)) return false; // markup: documents are translated where they are built
  if (/\\[sdwb]|\(\?[:=!]|\[\^/.test(t)) return false; // regular expressions
  if (/[À-ɏḀ-ỿ]/.test(t.replace(/[éÉ×÷]/g, ''))) return false; // already another language (crew and client documents)
  if (/^[\w$.]+\(|^[\w$]+ = |;\s*$|^\s*(const|let|var|function|return)\b|=>|&&|\|\|/.test(t)) return false; // code
  if (!/\s/.test(t) && !/^\p{Lu}\p{Ll}/u.test(t) && !/[.!?…:]$/.test(t)) return false; // one lowercase word: an enum value
  return true;
};
const letters = (s) => (s.match(/\p{L}/gu) ?? []).length;
const where = (sf, node) => `${path.relative(ROOT, sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
const addExact = (s, at, onScreen = false) => { const t = s.trim(); if ((wordy(t) || (onScreen && /^[A-Z][A-Z ]{2,24}$/.test(t))) && !exact.has(t)) exact.set(t, at); };
const addPattern = (p, at) => {
  const t = p.trim();
  if (!/\{\d+\}/.test(t)) return addExact(t, at, true);
  const lit = t.replace(/\{\d+\}/g, '');
  if (letters(lit) < 3 || t.length > 1400) return;
  // Not words for a person: markup, PDF and calendar files, links, file names, storage keys.
  if (/[<>]|^\/|^[\w.+-]+:\S|^[A-Z-]+[;:]|\.(csv|json|ics|jpg|pdf|png)$|^[\w-]*\/\{\d+\}|^\{\d+\}\/\w+[-\/]|\[\w+=|\{\d+\}deg$|^\w+_\{\d+\}$|\bobj$|\bR >>|^Bearer |cm \/Im0|VCALENDAR|^xref|^[\w-]+\/[\w\/-]*\{\d+\}$/.test(t)) return;
  if (!patterns.has(t)) patterns.set(t, at);
};

/** The text a JSX child shows, with JSX's own whitespace rules applied. */
function jsxText(raw) {
  const lines = raw.split(/\r\n|\n|\r/);
  const out = [];
  lines.forEach((line, i) => {
    let l = line.replace(/\t/g, ' ');
    if (i !== 0) l = l.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) l = l.replace(/[ ]+$/, '');
    if (l) out.push(l);
  });
  return out.join(' ');
}

const unquote = (n) => (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ? n.text : null);
const unwrap = (n) => { while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) n = n.expression; return n; };

/**
 * Every way an expression can read once it is on screen, as lists of parts: a string is fixed text, null is a
 * value filled in at run time. Either/or pieces are written out; anything else is one value.
 */
function variants(node, sf) {
  node = unwrap(node);
  const lit = unquote(node);
  if (lit !== null) return [[lit]];
  if (ts.isTemplateExpression(node)) {
    let acc = [[node.head.text]];
    for (const span of node.templateSpans) {
      const vs = variants(span.expression, sf);
      const next = [];
      for (const a of acc) for (const v of vs) next.push([...a, ...v, span.literal.text]);
      acc = next.length > MAX_VARIANTS ? acc.map((a) => [...a, null, span.literal.text]) : next;
    }
    return acc;
  }
  if (ts.isConditionalExpression(node)) {
    const a = variants(node.whenTrue, sf); const b = variants(node.whenFalse, sf);
    const all = [...a, ...b];
    // Only worth writing out when a branch is fixed text; two computed values are simply "a value".
    if (all.some((v) => v.some((p) => typeof p === 'string' && p.length)) || all.some((v) => v.length === 1 && v[0] === '')) return all.length <= MAX_VARIANTS ? all : [[null]];
    return [[null]];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = variants(node.left, sf); const b = variants(node.right, sf);
    const strish = (vs) => vs.some((v) => v.some((p) => typeof p === 'string'));
    if (strish(a) || strish(b)) {
      const out = [];
      for (const x of a) for (const y of b) out.push([...x, ...y]);
      return out.length <= MAX_VARIANTS ? out : [[null]];
    }
  }
  return [[null]];
}

/** Turn parts into "text {0} text": neighbours that are text are joined, values are numbered. */
function toPattern(parts) {
  let out = ''; let n = 0;
  for (const p of parts) out += p === null ? `{${n++}}` : p.replace(/[{}]/g, '');
  return out;
}

function inSkippedScope(node) {
  for (let p = node.parent; p; p = p.parent) {
    const name = (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isMethodDeclaration(p) || ts.isPropertyAssignment(p)) && p.name && ts.isIdentifier(p.name) ? p.name.text : null;
    if (name && SKIP_SCOPE.test(name)) return true;
  }
  return false;
}

function skippedByContext(node, sf) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isLiteralTypeNode(p)) return true;
  if (ts.isPropertyAssignment(p)) {
    if (p.name === node) return true;
    const key = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
    if (key === 'category' && /engine\/catalog\.ts$/.test(sf.fileName)) return false; // material group names are section headers
    if (SKIP_PROP.has(key)) return true;
  }
  if (ts.isJsxAttribute(p) && SKIP_ATTR.has(p.name.getText(sf))) return true;
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent) && SKIP_ATTR.has(p.parent.name.getText(sf))) return true;
  if (ts.isCallExpression(p) && p.arguments.includes(node) && SKIP_CALL.test(p.expression.getText(sf).replace(/\s+/g, ''))) return true;
  if (ts.isNewExpression(p) && SKIP_CALL.test(p.expression.getText(sf))) return true;
  if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p) || ts.isElementAccessExpression(p) || ts.isTypeOfExpression(p)) return true;
  // `throw new Error('…')` messages are shown in alerts, so they are words for people (kept). A bare `throw 'x'` is not.
  if (ts.isThrowStatement(p)) return true;
  return false;
}

function visit(node, sf) {
  // <Text>Paid {a} of {b}</Text> is one sentence; with a <Text> inside it, each run of words stands alone.
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    const kids = node.children.filter((c) => !(ts.isJsxText(c) && !jsxText(c.text)) && !(ts.isJsxExpression(c) && !c.expression));
    const simple = kids.length > 0 && kids.every((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && c.expression));
    if (simple && kids.some((c) => ts.isJsxText(c))) {
      let acc = [[]];
      for (const c of kids) {
        const vs = ts.isJsxText(c) ? [[jsxText(c.text)]] : variants(c.expression, sf);
        const next = [];
        for (const a of acc) for (const v of vs) next.push([...a, ...v]);
        acc = next.length > MAX_VARIANTS ? acc.map((a) => [...a, null]) : next;
      }
      for (const parts of acc) addPattern(toPattern(parts), where(sf, node));
    } else {
      for (const c of kids) if (ts.isJsxText(c)) addExact(jsxText(c.text), where(sf, c), true);
    }
  }
  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !skippedByContext(node, sf) && !inSkippedScope(node)) {
    // A value given straight to a component (title="PROFIT") is on screen for sure.
    addExact(node.text, where(sf, node), ts.isJsxAttribute(node.parent));
    // A unit after a number box (suffix="days") is one lowercase word, which otherwise reads as a code value.
    if (ts.isJsxAttribute(node.parent) && node.parent.name.getText(sf) === 'suffix' && /^[a-z]{3,12}$/.test(node.text) && !exact.has(node.text)) exact.set(node.text, where(sf, node));
  }
  if (ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent) && !skippedByContext(node, sf) && !inSkippedScope(node)) {
    for (const parts of variants(node, sf)) addPattern(toPattern(parts), where(sf, node));
  }
  ts.forEachChild(node, (c) => visit(c, sf));
}

function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(f) && !SKIP_FILE.test(full)) {
      const sf = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      visit(sf, sf);
    }
  }
}
walk(SRC);

// The how-to topics live in a data file.
for (const t of JSON.parse(fs.readFileSync(path.join(SRC, 'engine', 'help.json'), 'utf8'))) {
  for (const k of ['title', 'answer', 'link']) if (typeof t[k] === 'string' && !exact.has(t[k].trim())) exact.set(t[k].trim(), 'src/engine/help.json'); // always for people, even when they name a language
}

const sortKeys = (m) => [...m.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const catalog = { exact: sortKeys(exact), patterns: sortKeys(patterns) };
const json = `${JSON.stringify(catalog, null, 0).replace(/","/g, '",\n"').replace('{"exact":[', '{"exact":[\n').replace('],"patterns":[', '\n],"patterns":[\n').replace(/\]\}$/, '\n]}')}\n`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== json) { console.error('src/i18n/catalog.json is out of date. Run: node scripts/i18n-extract.mjs'); process.exit(1); }
  console.log('catalog is up to date');
} else {
  fs.writeFileSync(OUT, json);
  if (process.argv.includes('--where')) fs.writeFileSync(path.join(ROOT, 'i18n-where.txt'), [...exact, ...patterns].map(([k, v]) => `${v}\t${k}`).join('\n'));
  console.log(`${catalog.exact.length} texts, ${catalog.patterns.length} patterns, ${Math.round(json.length / 1024)} KB`);
}
