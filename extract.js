const fs = require('fs');

const code = fs.readFileSync('server.ts', 'utf8');

// Find occurrences of app.get, app.post, etc.
const routeRegex = /^app\.(get|post|put|delete|patch)\((['"\[].+?['"\]])/gm;
let match;
while ((match = routeRegex.exec(code)) !== null) {
  // console.log(match.index, match[2]);
}
