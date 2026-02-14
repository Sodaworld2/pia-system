const fs = require('fs');
const p = 'C:\\Users\\User\\Documents\\GitHub\\DAOV1\\backend\\src\\routes\\council.ts';
let c = fs.readFileSync(p, 'utf8');
// Fix: move the alias outside of sum()
const bad = `.sum(db.raw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END as completed"))`;
const good = `.sum(db.raw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END") + ' as completed')`;
// Actually for knex raw, we need a different approach - use select with raw
// The issue is sum(CASE...END as alias) - SQLite wants sum(CASE...END) as alias
const bad2 = `db.raw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END as completed")`;
const good2 = `db.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed")`;
if (c.includes(bad)) {
  // Replace .sum(db.raw("CASE...END as completed")) with .select(db.raw("SUM(CASE...END) as completed"))
  c = c.replace(
    `.count('* as total')\n        .sum(db.raw("CASE WHEN status = 'completed' THEN 1 ELSE 0 END as completed"))`,
    `.count('* as total')\n        .select(db.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed"))`
  );
  fs.writeFileSync(p, c);
  console.log('FIXED council.ts - replaced sum(raw()) with select(raw())');
} else if (c.includes(bad2)) {
  c = c.replace(bad2, good2);
  fs.writeFileSync(p, c);
  console.log('FIXED council.ts - replaced raw alias');
} else {
  console.log('Could not find the exact pattern. Trying broader fix...');
  // Try a broader match
  const sumPattern = /\.sum\(db\.raw\("CASE WHEN status = 'completed' THEN 1 ELSE 0 END as completed"\)\)/;
  if (sumPattern.test(c)) {
    c = c.replace(sumPattern, `.select(db.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed"))`);
    fs.writeFileSync(p, c);
    console.log('FIXED council.ts via regex');
  } else {
    console.log('Pattern not found at all - checking file content...');
    const idx = c.indexOf('CASE WHEN status');
    if (idx > 0) {
      console.log('Found CASE at index', idx);
      console.log('Context:', c.substring(idx-50, idx+100));
    } else {
      console.log('No CASE statement found');
    }
  }
}
