const fs = require('fs');

// Fix server.ts dangling brackets
let s = fs.readFileSync('server.ts', 'utf8').split('\n');
let newS = [];
for (let i = 0; i < s.length; i++) {
  if (s[i] === '  }' && i > 120 && i < 140) continue; 
  newS.push(s[i]);
}
fs.writeFileSync('server.ts', newS.join('\n'));

// Fix db.ts
let db = fs.readFileSync('src/server/db.ts', 'utf8').split('\n');
let newDb = [];
for (let i = 0; i < db.length; i++) {
  if (db[i] === '  }' && i > 1750) continue; 
  if (db[i] === '})' && i > 1750) continue;
  newDb.push(db[i]);
}
fs.writeFileSync('src/server/db.ts', newDb.join('\n'));

console.log('Fixed');
