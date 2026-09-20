const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Insert polyfill at the top
const polyfill = `var __defProp = Object.defineProperty;\nvar __name = (target, value) => __defProp(target, "name", { value, configurable: true });\n`;
code = polyfill + code;

fs.writeFileSync('server.ts', code);
