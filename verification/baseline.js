const { load } = require('./harness');
const c = load(process.argv[2] || require('path').join(__dirname, '..', 'week4')); const r = c.__get('runTests')();
console.log(`pass ${r.passed} / fail ${r.failed} / pending ${r.pending}`);
for (const ch of r.checks) console.log(' ', ch.status.padEnd(7), ch.name, ch.detail ? '— ' + ch.detail : '');
