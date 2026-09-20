const http = require('http');

http.get('http://127.0.0.1:9229/json', (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const targets = JSON.parse(body);
    const target = targets[0];
    const wsUrl = target.webSocketDebuggerUrl;
    const WebSocket = require('/app/applet/node_modules/ws');
    const ws = new WebSocket(wsUrl);
    
    let id = 1;
    ws.on('open', () => {
      // get scripts
      ws.send(JSON.stringify({ id: id++, method: 'Debugger.enable' }));
    });
    
    let serverTsScriptId = null;
    
    ws.on('message', (msg) => {
      const data = JSON.parse(msg);
      if (data.method === 'Debugger.scriptParsed') {
        if (data.params.url === 'file:///app/applet/server.ts' || data.params.url.endsWith('server.ts')) {
          serverTsScriptId = data.params.scriptId;
          ws.send(JSON.stringify({
            id: id++,
            method: 'Debugger.getScriptSource',
            params: { scriptId: serverTsScriptId }
          }));
        }
      }
      if (data.result && data.result.scriptSource) {
        const fs = require('fs');
        fs.writeFileSync('server.ts.recovered', data.result.scriptSource);
        console.log('Recovered!');
        process.exit(0);
      }
    });
  });
});
