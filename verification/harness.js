// Runs the UNCHANGED browser files (transactions.js + script.js) in a Node VM
// with a minimal fake DOM, so the page logic can be tested from the command line.
const fs = require('fs'), path = require('path'), vm = require('vm');
function fakeEl(id) {
  return { id, _html: '', value: '', dataset: {}, children: [],
    set innerHTML(h) { this._html = h; }, get innerHTML() { return this._html; },
    set textContent(t) { this._html = String(t); }, get textContent() { return this._html.replace(/<[^>]*>/g, ''); },
    querySelectorAll() { return []; }, querySelector() { return { addEventListener() {} }; }, addEventListener() {} };
}
function load(dir, { scriptFile = 'script.js', extra = '' } = {}) {
  const els = {};
  const document = { readyState: 'complete', body: fakeEl('body'),
    getElementById: id => (els[id] ||= fakeEl(id)), createElement: () => fakeEl('scratch'), addEventListener() {} };
  const els0 = { 'min-support': { value: '1', addEventListener() {} }, 'min-confidence': { value: '30', addEventListener() {} } };
  Object.assign(els, Object.fromEntries(Object.entries(els0).map(([k, v]) => [k, Object.assign(fakeEl(k), v)])));
  const window = {};
  const ctx = vm.createContext({ window, document, console, Map, Set, WeakMap, Math, Number, String, Array, Object, Error, JSON, Uint32Array, Int32Array, Float64Array, performance });
  vm.runInContext(fs.readFileSync(path.join(dir, 'transactions.js'), 'utf8'), ctx, { filename: 'transactions.js' });
  const src = fs.readFileSync(path.join(dir, scriptFile), 'utf8') + '\n' + extra + '\n;globalThis.__get = n => eval(n);';
  vm.runInContext(src, ctx, { filename: scriptFile });
  ctx.els = els;
  return ctx;
}
module.exports = { load };
