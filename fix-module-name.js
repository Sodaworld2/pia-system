const fs = require('fs');
const p = 'backend/src/modules/index.ts';
let c = fs.readFileSync(p, 'utf8');
const old = 'mod = new Ctor(this.db);';
const nl = String.fromCharCode(13,10);
const fix = 'mod = new Ctor(this.db);' + nl + '      (mod as any).name = id;';
if (c.includes('(mod as any).name = id')) {
  console.log('SKIP: already patched');
} else if (c.includes(old)) {
  c = c.replace(old, fix);
  fs.writeFileSync(p, c);
  console.log('FIXED: module name set from registry key');
} else {
  console.log('Pattern not found');
}
