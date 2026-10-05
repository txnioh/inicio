import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, primaryAnomaly } from '../model/analyze.ts';
import { costOfInaction, DEFAULT_ASSUMPTIONS, euros } from '../model/economics.ts';
import { applyFeedback, simulateVisit } from '../model/feedback.ts';
import { generateFarm } from '../model/generate.ts';
import { pointInPolygon } from '../model/geometry.ts';
import { planRoute } from '../model/route.ts';
import type { AnomalyType, Cause, Task } from '../model/types.ts';

const farm = generateFarm(2026);
const twin = analyze(farm);
const latest = twin.campaigns[2];
const DIAGNOSIS: Record<Cause, AnomalyType> = { riego: 'estres', nitrogeno: 'vigor', verticilosis: 'copa', poda: 'poda' };

test('the same seed grows the same farm', () => {
  const again = generateFarm(2026);
  assert.equal(again.trees.length, farm.trees.length);
  assert.deepEqual(again.trees[1234], farm.trees[1234]);
  assert.notDeepEqual(generateFarm(7).trees[1234], farm.trees[1234]);
});

test('about 15,000 trees on about 150 ha, each inside its plot', () => {
  const hectares = farm.plots.reduce((sum, p) => sum + p.hectares, 0);
  assert.ok(hectares > 140 && hectares < 160, `${hectares} ha`);
  assert.ok(farm.trees.length > 14_000 && farm.trees.length < 17_000, `${farm.trees.length} trees`);
  for (const tree of farm.trees) assert.ok(pointInPolygon(tree.x, tree.y, farm.plots[tree.plot].polygon), tree.id);
  assert.equal(new Set(farm.trees.map(t => t.id)).size, farm.trees.length);
});

test('every planted problem is found in 2026, with the right diagnosis', () => {
  for (const cause of ['riego', 'nitrogeno', 'verticilosis', 'poda'] as Cause[]) {
    const trees = farm.trees.filter(t => t.cause === cause);
    const found = trees.filter(t => primaryAnomaly(latest.anomalies[t.index])?.type === DIAGNOSIS[cause]);
    // The nitrogen patch fades towards its edge, so its rim is legitimately missed.
    const recall = found.length / trees.length;
    assert.ok(recall >= (cause === 'nitrogeno' ? 0.4 : 0.85), `${cause}: ${Math.round(recall * 100)} %`);
  }
});

test('healthy trees are rarely flagged, and almost never red', () => {
  const healthy = farm.trees.filter(t => !t.cause);
  const flagged = healthy.filter(t => latest.status[t.index] > 0).length;
  const red = healthy.filter(t => latest.status[t.index] === 2).length;
  assert.ok(flagged / healthy.length < 0.006, `${flagged} flagged`);
  assert.ok(red / healthy.length < 0.002, `${red} red`);
});

test('problems appear over time: 2024 has no water or canopy alarms', () => {
  const early = twin.campaigns[0];
  const watered = farm.trees.filter(t => t.cause === 'riego' && early.status[t.index] > 0);
  assert.equal(watered.length, 0);
  assert.ok(early.anomalies.every(list => !list?.some(a => a.type === 'copa')));
});

test('losses are non-negative, only on flagged trees, and add up', () => {
  let sum = 0;
  latest.lossKg.forEach((kg, i) => {
    assert.ok(kg >= 0);
    if (!latest.status[i]) assert.equal(kg, 0);
    sum += kg;
  });
  assert.ok(Math.abs(sum - latest.totals.lossKg) < 1e-6);
  assert.ok(latest.totals.low < latest.totals.kg && latest.totals.kg < latest.totals.high);
  const flagged = latest.status.findIndex((s, i) => s === 2 && latest.lossKg[i] > 0);
  const [low, high] = costOfInaction(latest.lossKg[flagged], latest.anomalies[flagged], DEFAULT_ASSUMPTIONS);
  assert.ok(low > 0 && low < euros(latest.lossKg[flagged], DEFAULT_ASSUMPTIONS) && high > low);
});

test('a route visits every tree once', () => {
  const points = farm.trees.slice(0, 120).map(t => ({ x: t.x, y: t.y }));
  const { order, length } = planRoute(farm.gate, points);
  assert.deepEqual([...order].sort((a, b) => a - b), points.map((_, i) => i));
  assert.ok(length > 0);
});

test('a false positive from the field clears that diagnosis', () => {
  const index = farm.trees.findIndex(t => !t.cause && latest.status[t.index] > 0);
  const anomaly = primaryAnomaly(latest.anomalies[index])!.type;
  const outcome = simulateVisit(farm.trees[index], anomaly);
  assert.equal(outcome, 'falso');
  const task: Task = {
    id: 't', type: 'inspeccion', title: '', createdAt: '', campaign: 2, route: [index], distanceM: 0, hours: 0,
    done: true, results: { [index]: outcome }, anomaly,
  };
  const feedback = applyFeedback(latest, [task]);
  assert.ok(!feedback.anomalies[index]?.some(a => a.type === anomaly));
  assert.equal(feedback.precision[anomaly]?.checked, 1);
  assert.equal(latest.status[index] > 0, true, 'the analysis itself is untouched');
});
