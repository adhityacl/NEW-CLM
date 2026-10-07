import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const root = resolve('.');
const json = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'));
const dirs = ['apps/backend', 'apps/frontend', 'apps/system-console', 'packages/platform-console', 'packages/ui-components', 'packages/ts-config', 'packages/types', 'packages/shared'];

test('deployable apps and shared packages are real npm workspaces with isolated environment and build output', () => {
  assert.deepEqual(json('package.json').workspaces, ['apps/*', 'packages/*']);
  for (const dir of dirs) assert.ok(json(`${dir}/package.json`).name.startsWith('@legalio/'), dir);
  for (const app of ['backend', 'frontend']) {
    assert.ok(existsSync(join(root, `apps/${app}/Dockerfile`)));
    assert.ok(existsSync(join(root, `apps/${app}/.env.example`)));
    assert.ok(existsSync(join(root, `apps/${app}/src`)));
  }
  assert.ok(!existsSync(join(root, '.env')), 'backend secrets belong to apps/backend');
  assert.ok(!existsSync(join(root, 'src')), 'application source must be inside its workspace');
  assert.ok(!existsSync(join(root, 'server.ts')));
  assert.ok(json('turbo.json').tasks.build.outputs.includes('dist/**'));
});

test('workspace imports declare dependencies and never reach into another application', () => {
  for (const dir of dirs.filter((dir) => !dir.endsWith('ts-config'))) {
    const manifest = json(`${dir}/package.json`);
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    const source = join(root, dir, 'src');
    for (const name of readdirSync(source, { recursive: true }).map(String).filter((name) => /\.tsx?$/.test(name))) {
      const file = join(source, name);
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest);
      const visit = (node: ts.Node) => {
        const literal = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
          : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
        if (literal && ts.isStringLiteral(literal)) {
          const specifier = literal.text;
          if (specifier.startsWith('.')) {
            const target = resolve(dirname(file), specifier);
            assert.ok(target.startsWith(join(root, dir) + '/') || target.startsWith(join(root, 'packages') + '/'), `${file}: ${specifier} crosses an application boundary`);
          } else if (!specifier.startsWith('node:') && !builtinModules.includes(specifier)) {
            const dependency = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
            assert.ok(dependencies[dependency], `${file}: ${dependency} is undeclared`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(ast);
    }
  }
});
