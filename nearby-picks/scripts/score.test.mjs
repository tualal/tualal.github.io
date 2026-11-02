import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bayesianRating, foodTier, normalizeName, pressBonus, priorMean } from './lib/score.mjs';

test('bayesian rating shrinks low-volume ratings toward the prior', () => {
  const C = 4.3;
  const tiny = bayesianRating(4.9, 12, C, 100);
  const big = bayesianRating(4.7, 3000, C, 100);
  assert.ok(tiny < big, `${tiny} should be < ${big}`);
  assert.ok(Math.abs(bayesianRating(4.7, 1e7, C, 100) - 4.7) < 1e-3);
  assert.equal(bayesianRating(0, 0, C, 100), C);
});

test('prior mean is review-weighted', () => {
  const m = priorMean([
    { rating: 5, reviewCount: 1 },
    { rating: 4, reviewCount: 99 },
  ]);
  assert.ok(Math.abs(m - 4.01) < 1e-9);
  assert.equal(priorMean([], 4.2), 4.2);
});

test('press bonus matches by place id or normalized name, once per list, capped', () => {
  const press = {
    bonusPerList: 0.1,
    maxBonus: 0.25,
    lists: [
      { name: 'A', places: [{ name: "Tad's Chicken 'n Dumplins" }] },
      { name: 'B', places: [{ name: 'Something else', googlePlaceId: 'pid1' }] },
      { name: 'C', places: [{ name: 'tads chicken n dumplins' }, { name: "Tad’s Chicken ’n Dumplins" }] },
      { name: 'D', places: [{ name: "Tad's Chicken 'n Dumplins", googlePlaceId: 'other' }] },
    ],
  };
  const r = pressBonus({ name: "Tad's Chicken 'n Dumplins", googlePlaceId: 'pid1' }, press);
  assert.deepEqual(r.lists, ['A', 'B', 'C']);
  assert.equal(r.bonus, 0.25);
  assert.equal(pressBonus({ name: 'Nope', googlePlaceId: 'x' }, press).bonus, 0);
});

test('food tiers', () => {
  assert.equal(foodTier(4.65), 'must-try');
  assert.equal(foodTier(4.45), 'great');
  assert.equal(foodTier(4.2), 'good');
  assert.equal(foodTier(4.1), null);
});

test('normalizeName', () => {
  assert.equal(normalizeName('Tortillería y Tienda de León'), 'tortilleria y tienda de leon');
  assert.equal(normalizeName('Boccherini’s Coffee & Tea'), 'boccherinis coffee and tea');
});
