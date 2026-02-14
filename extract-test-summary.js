const fs=require('fs');
const c=fs.readFileSync('test-clean.txt','utf8');
const lines=c.split('\n');
const fails=lines.filter(l=>l.includes('FAIL')||l.includes(' fail')||l.includes('Error')||l.includes('PASS')||l.includes('Tests ')||l.includes('Test Files'));
console.log(fails.join('\n'));
