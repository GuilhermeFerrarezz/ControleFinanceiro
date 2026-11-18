import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter(file => /\.tsx?$/.test(file)).map(file => path.resolve('src', file));
const known = new Set(files);
const graph = new Map<string, string[]>();
const clients: string[] = [];
const serverModules = new Set<string>();
for (const file of files) {
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  if (ast.statements.some(node => ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression) && node.expression.text === 'use client')) clients.push(file);
  const edges: string[] = [];
  function dependency(specifier: string) {
    if (specifier === 'server-only' || specifier.startsWith('node:') || ['pg', 'bcryptjs', 'fs', 'crypto', 'next/headers', 'next/server'].includes(specifier)) serverModules.add(file);
    const base = specifier.startsWith('@/') ? path.resolve(specifier.slice(2)) : specifier.startsWith('.') ? path.resolve(path.dirname(file), specifier) : null;
    if (!base) return;
    const target = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(candidate => known.has(candidate));
    if (target) edges.push(target);
  }
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (ts.isImportDeclaration(node)) {
        if (node.importClause?.isTypeOnly) return;
        const bindings = node.importClause?.namedBindings;
        if (!node.importClause?.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every(element => element.isTypeOnly)) return;
      } else if (node.isTypeOnly || (node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.every(element => element.isTypeOnly))) return;
      dependency(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) dependency(node.arguments[0].text);
    if (ts.isPropertyAccessExpression(node) && node.expression.getText(ast) === 'process' && node.name.text === 'env') {
      const access = node.parent;
      const publicAccess = ts.isPropertyAccessExpression(access) && (access.name.text.startsWith('NEXT_PUBLIC_') || access.name.text === 'NODE_ENV');
      if (!publicAccess) serverModules.add(file);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  graph.set(file, edges);
}

test('componentes de cliente não alcançam banco, segredos ou módulos de servidor', () => {
  assert.ok(clients.length > 0);
  for (const root of clients) {
    const seen = new Set<string>();
    function visit(file: string, trail: string[]) {
      if (seen.has(file)) return;
      seen.add(file);
      assert.equal(serverModules.has(file) || file.includes(`${path.sep}models${path.sep}`), false, trail.map(item => path.relative('.', item)).join(' -> '));
      for (const dependency of graph.get(file) || []) visit(dependency, [...trail, dependency]);
    }
    visit(root, [root]);
  }
});

test('imports de execução do projeto não contêm dependências circulares', () => {
  const visited = new Set<string>();
  const stack: string[] = [];
  function visit(file: string) {
    assert.equal(stack.includes(file), false, [...stack, file].map(item => path.relative('.', item)).join(' -> '));
    if (visited.has(file)) return;
    visited.add(file); stack.push(file);
    for (const dependency of graph.get(file) || []) visit(dependency);
    stack.pop();
  }
  files.forEach(visit);
});

test('fronteiras de banco, envio e identidade administrativa têm marcador server-only', () => {
  for (const file of ['db.ts', 'auth-email.ts', 'platform-owner.ts']) assert.match(readFileSync(`src/lib/${file}`, 'utf8'), /import 'server-only'/);
});
