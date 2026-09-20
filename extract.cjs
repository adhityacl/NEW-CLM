const fs = require('fs');

const code = fs.readFileSync('server.ts', 'utf8');
const lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('app.get(') || lines[i].startsWith('app.post(') || lines[i].startsWith('app.put(') || lines[i].startsWith('app.delete(')) {
    console.log(`${i+1}: ${lines[i].substring(0, 80)}`);
  }
}
