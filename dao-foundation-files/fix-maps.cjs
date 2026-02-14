const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'backend', 'src', 'modules');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));

for (const file of files) {
  const fp = path.join(dir, file);
  let c = fs.readFileSync(fp, 'utf8');
  let changed = false;

  // Generic fix: .map((:any)=> X where X starts with `${VARNAME.
  // We extract the variable name from the template literal
  const mapPattern = /\.map\(\(:any\)=>\s*(`\$\{(\w+)\.|[`(])/g;
  let match;
  const replacements = [];

  while ((match = mapPattern.exec(c)) !== null) {
    const varName = match[2] || 'x';
    replacements.push({
      start: match.index,
      end: match.index + 12, // length of .map((:any)=>
      replacement: `.map((${varName}: any)=>`
    });
  }

  // Apply replacements in reverse order to preserve indices
  for (const r of replacements.reverse()) {
    c = c.substring(0, r.start) + r.replacement + c.substring(r.end);
    changed = true;
  }

  // Also fix .filter((:any)=> patterns
  c = c.replace(/\.filter\(\(:any\)=>/g, '.filter((item: any)=>');

  // Fix remaining .map((:any)=> that didn't match template patterns
  c = c.replace(/\.map\(\(:any\)=>\s*\(\{/g, '.map((row: any)=> ({');
  c = c.replace(/\.map\(\(:any\)=>/g, '.map((x: any)=>');

  fs.writeFileSync(fp, c, 'utf8');
  console.log('Fixed:', file, changed ? '(with map fixes)' : '(no map issues)');
}
console.log('All done');
