import assert from 'assert';
import test from 'node:test';
import { rayRectIntersect } from '../src/geometry.js';

test('ray hits rectangle center', () => {
  const t = rayRectIntersect(0, 0, 1, 0, 5, 0, 1, 1);
  assert.ok(t !== null && t >= 4 && t <= 6);
});

test('ray misses behind', () => {
  const t = rayRectIntersect(0, 0, -1, 0, 5, 0, 1, 1);
  assert.strictEqual(t, null);
});
