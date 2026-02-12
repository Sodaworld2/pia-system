import http from 'http';
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  const req = http.request({hostname:'localhost',port:3000,path:'/api/hooks/events',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer pia-local-dev-token-2024'}}, () => {});
  req.on('error', () => {});
  req.end(data);
});
