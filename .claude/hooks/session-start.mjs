import http from 'http';
let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  try {
    const parsed = JSON.parse(data);
    const body = JSON.stringify({session_id: parsed.session_id || 'unknown', hook_event_name: 'SessionStart', status: 'started', message: 'Claude Code session started'});
    const req = http.request({hostname:'localhost',port:3000,path:'/api/hooks/events',method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer pia-local-dev-token-2024'}}, () => {});
    req.on('error', () => {});
    req.end(body);
  } catch {}
});
