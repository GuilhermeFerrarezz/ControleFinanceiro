import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donutSlicePath } from '../src/lib/donut-path';

test('atributos SVG permanecem iguais com diferenças de precisão entre servidor e navegador', t => {
  const slices = Array.from({ length: 29 }, (_, index) => ({ start: index / 29, fraction: 1 / 29 }));
  const expected = slices.map(slice => donutSlicePath(slice.start, slice.fraction));
  const originalSin = Math.sin, originalCos = Math.cos;
  // Simulate the tiny runtime differences that caused hydration warnings.
  t.mock.method(Math, 'sin', (angle: number) => originalSin(angle) + Number.EPSILON);
  t.mock.method(Math, 'cos', (angle: number) => originalCos(angle) - Number.EPSILON);
  assert.deepEqual(slices.map(slice => donutSlicePath(slice.start, slice.fraction)), expected);
});

test('uma única categoria mantém as duas metades de cada arco e fecha o círculo', () => {
  const path = donutSlicePath(0, 1);
  assert.match(path, /^M110\.0000,10\.0000 A100,100 0 0,1 110\.0000,210\.0000 A100,100 0 0,1 110\.0000,10\.0000/);
  assert.match(path, /L110\.0000,42\.0000 A68,68 0 0,0 110\.0000,178\.0000 A68,68 0 0,0 110\.0000,42\.0000 Z$/);
});
