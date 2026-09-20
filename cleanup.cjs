const fs = require('fs');

let code = fs.readFileSync('recovered.js', 'utf8');

// 1. Remove __name and __defProp
code = code.replace(/var __defProp = Object\.defineProperty;\n/, '');
code = code.replace(/var __name = \(target, value\) => __defProp\(target, "name", \{ value, configurable: true \}\);\n/, '');
code = code.replace(/__name\([a-zA-Z0-9_]+,\s*"[a-zA-Z0-9_]+"\);\n/g, '');

// 2. Add types to (req, res) =>
code = code.replace(/\(req, res\) =>/g, '(req: express.Request, res: express.Response) =>');
code = code.replace(/\(req, res, next\) =>/g, '(req: express.Request, res: express.Response, next: express.NextFunction) =>');
code = code.replace(/\(err, req, res, next\) =>/g, '(err: any, req: express.Request, res: express.Response, next: express.NextFunction) =>');

// Wait, some places use _req
code = code.replace(/\(_req, _options\) =>/g, '(_req: any, _options: any) =>');

fs.writeFileSync('server.ts', code);
