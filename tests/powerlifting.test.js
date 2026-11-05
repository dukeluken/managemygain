import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  LIFTS, esc, parseKg, sameKg, generatePlan, sanitizePlan, belongsToPlan, inCurrentCycle, templateCycleWeeks
} from '../src/lib/engine/powerlifting.js';

const triples = { squat: 140, bench: 100, deadlift: 180 };

test('alle 72 Generator-Vorlagen erzeugen gültige Pläne', () => {
  let count = 0;
  for (const frequency of [2, 3, 4, 5]) for (const focus of LIFTS) for (const phase of ['hypertrophy', 'strength']) for (const level of ['beginner', 'intermediate', 'advanced']) {
    const plan = generatePlan({ frequency, focus, phase, level, triples, name: 'Test' });
    count += 1;
    assert.equal(plan.days.length, frequency);
    assert.equal(plan.cycleWeeks, templateCycleWeeks(frequency, level));
    const exercises = plan.days.flatMap(day => day.exercises);
    for (const day of plan.days) assert.ok(day.exercises.length >= 4 && day.exercises.length <= 6, `${plan.templateId}: ${day.exercises.length} Übungen`);
    for (const lift of LIFTS) {
      const main = exercises.filter(exercise => exercise.category === `${lift}Main`);
      assert.ok(main.length > 0, `${plan.templateId}: keine Hauptübung für ${lift}`);
      for (const exercise of main) {
        assert.equal(exercise.weekWeights.length, plan.cycleWeeks);
        assert.ok(exercise.weekWeights.every(value => Number.isFinite(value) && value > 0), `${plan.templateId}: ungültige Gewichte für ${lift}`);
      }
    }
    for (const exercise of exercises) for (const key of ['weekSets', 'weekReps', 'weekRpes', 'actualWeights', 'actualRpes']) assert.equal(exercise[key].length, plan.cycleWeeks, key);
    assert.deepEqual(sanitizePlan(plan).days.length, plan.days.length);
  }
  assert.equal(count, 72);
});

test('sanitizePlan entschärft manipulierte geteilte Pläne', () => {
  const payload = '<img src=x onerror=alert(1)>';
  const plan = sanitizePlan({
    name: payload, frequency: payload, cycleWeeks: payload, currentWeek: payload, level: payload, phase: payload, focus: payload,
    days: [{ name: payload, weekDay: payload, exercises: [{ exercise: payload, category: payload, lift: payload, sets: payload, weekSets: [payload], weekWeights: [payload], weekRpes: [payload], actualRpes: [payload] }, null, 'x'] }],
    evil: payload
  });
  assert.equal(plan.frequency, 1);
  assert.equal(plan.cycleWeeks, 4);
  assert.equal(plan.currentWeek, 1);
  assert.equal(plan.level, 'intermediate');
  assert.equal(plan.evil, undefined);
  const [exercise] = plan.days[0].exercises;
  assert.equal(exercise.category, 'back');
  assert.equal(exercise.lift, null);
  assert.deepEqual(exercise.weekSets, [1]);
  assert.deepEqual(exercise.weekWeights, ['']);
  assert.deepEqual(exercise.weekRpes, [7]);
  assert.deepEqual(exercise.actualRpes, ['']);
  assert.equal(plan.days[0].exercises.length, 3);
  // Texte bleiben Text und werden beim Rendern maskiert.
  assert.ok(!esc(plan.name).includes('<'));
  assert.equal(sanitizePlan(null), null);
  assert.equal(sanitizePlan([1]), null);
});

test('sanitizePlan erhält gültige Daten', () => {
  const original = generatePlan({ frequency: 4, focus: 'bench', phase: 'strength', level: 'advanced', triples, name: 'Bench', id: 'abc' });
  original.days[0].exercises[0].actualWeights[0] = 102.5;
  original.days[0].exercises[0].actualRpes[0] = 8.5;
  const clean = sanitizePlan(JSON.parse(JSON.stringify(original)));
  assert.equal(clean.id, 'abc');
  assert.equal(clean.days[0].exercises[0].actualWeights[0], 102.5);
  assert.equal(clean.days[0].exercises[0].actualRpes[0], 8.5);
  assert.deepEqual(clean.days[0].exercises[0].weekWeights, original.days[0].exercises[0].weekWeights);
  assert.deepEqual(clean.weeklyProgression, original.weeklyProgression);
});

test('parseKg behandelt leere Eingaben als ungültig', () => {
  assert.ok(Number.isNaN(parseKg('')));
  assert.ok(Number.isNaN(parseKg(null)));
  assert.equal(parseKg('102,5'), 102.5);
  assert.ok(sameKg('', undefined));
  assert.ok(sameKg('100', 100));
  assert.ok(!sameKg('', 100));
});

test('Historie wird über planId statt Planname zugeordnet', () => {
  const a = { id: 'a', name: 'Block', cycle: 2, days: [{ name: 'Tag 01 · Squat' }] };
  const b = { id: 'b', name: 'Block', days: [{ name: 'Tag 01 · Squat' }] };
  const entry = { planId: 'a', planName: 'Block', name: 'Tag 01 · Squat', cycle: 2 };
  assert.ok(belongsToPlan(entry, a));
  assert.ok(!belongsToPlan(entry, b));
  assert.ok(inCurrentCycle(entry, a));
  assert.ok(!inCurrentCycle({ ...entry, cycle: 1 }, a));
  assert.ok(!inCurrentCycle({ planId: 'a' }, a), 'Einträge ohne cycle gehören zu Zyklus 1');
  // Altdaten ohne planId fallen auf den Namen zurück.
  assert.ok(belongsToPlan({ planName: 'Block' }, b));
});

// ---------------------------------------------------------------------------
// Lastmodell (RPE-Tabelle) und Programmstruktur
// ---------------------------------------------------------------------------
import { rpePercent, e1rmFromSet, expectedMax, plannedLoad, updateMaxFromSet, migratePlanLoadModel, rebaseMaxesForNewCycle, applyPlannedLoadsToPlan, estimateOneRmFrom3x3, LOAD_MODEL } from '../src/lib/engine/powerlifting.js';
const allTemplates = () => {
  const plans = [];
  for (const frequency of [2, 3, 4, 5]) for (const focus of LIFTS) for (const phase of ['hypertrophy', 'strength']) for (const level of ['beginner', 'intermediate', 'advanced'])
    plans.push(generatePlan({ frequency, focus, phase, level, triples, name: 'T' }));
  return plans;
};

test('RPE-Tabelle entspricht den Ankerpunkten nach Helms et al. 2016', () => {
  assert.ok(Math.abs(rpePercent(6, 10) - .837) < .001);
  assert.equal(rpePercent(4, 8), rpePercent(6, 10), '4 Wdh. @ RPE 8 = 6 Wdh. @ RPE 10');
  assert.equal(rpePercent(3, 7), rpePercent(6, 10));
  assert.ok(Math.abs(rpePercent(1, 10) - 1) < 1e-9);
  assert.ok(rpePercent(6, 6.5) > rpePercent(6, 6));
  assert.ok(Math.abs(e1rmFromSet(140, 3, 8) - 140 / .863) < .01);
});

test('Geplante Gewichte überschreiten nie die Ziel-Anstrengung (≤ RPE 9 inkl. Rundung)', () => {
  for (const plan of allTemplates()) for (const day of plan.days) for (const exercise of day.exercises) {
    if (!exercise.lift) continue;
    const factor = exercise.category.endsWith('Var') ? .9 : 1;
    exercise.weekWeights.forEach((weight, index) => {
      const ceiling = expectedMax(plan, exercise.lift, index) * factor * rpePercent(exercise.weekReps[index], 9);
      assert.ok(weight <= ceiling + 1.25, `${plan.templateId} ${exercise.exercise} W${index + 1}: ${weight} kg > ${ceiling.toFixed(1)} kg`);
      assert.equal(weight % 2.5, 0, 'Standardrundung 2,5 kg');
    });
  }
});

test('Bench in jeder Vorlage mindestens 2× pro Woche, Deadlift mit weniger Volumen als Squat', () => {
  for (const plan of allTemplates()) {
    const exercises = plan.days.flatMap(day => day.exercises);
    const exposures = lift => exercises.filter(exercise => exercise.lift === lift).length;
    const sets = lift => exercises.filter(exercise => exercise.lift === lift).reduce((sum, exercise) => sum + exercise.weekSets[0], 0);
    assert.ok(exposures('bench') >= 2, `${plan.templateId}: Bench ${exposures('bench')}×`);
    if (plan.focus !== 'deadlift') assert.ok(sets('deadlift') < sets('squat'), `${plan.templateId}: Deadlift ${sets('deadlift')} ≥ Squat ${sets('squat')}`);
    for (const day of plan.days) assert.ok(day.exercises.length >= 4 && day.exercises.length <= 5, `${plan.templateId}: ${day.exercises.length} Übungen`);
  }
});

test('Wiederholungen sinken über den Block, Volumentag hat mehr Wiederholungen als der schwere Tag', () => {
  const plan = generatePlan({ frequency: 4, focus: 'bench', phase: 'hypertrophy', level: 'intermediate', triples, name: 'T' });
  const benches = plan.days.flatMap(day => day.exercises).filter(exercise => exercise.category === 'benchMain');
  assert.equal(benches.length, 2);
  const [heavy, volume] = benches;
  assert.ok(Number(heavy.weekReps.at(-1)) < Number(heavy.weekReps[0]), 'Wdh. sinken über den Block');
  assert.ok(Number(volume.weekReps[0]) > Number(heavy.weekReps[0]), 'Volumentag hat mehr Wdh.');
  assert.ok(volume.weekRpes[0] < heavy.weekRpes[0], 'Volumentag hat niedrigere Ziel-RPE');
});

test('Kreuzheben-Stil bestimmt die Variante, Bench-Variante ist die lange Pause', () => {
  const sumo = generatePlan({ frequency: 4, focus: 'deadlift', phase: 'strength', level: 'intermediate', triples, name: 'T', deadliftStance: 'sumo' });
  const names = sumo.days.flatMap(day => day.exercises.map(exercise => exercise.exercise));
  assert.ok(names.includes('Konventionelles Kreuzheben'));
  assert.ok(names.includes('Bankdrücken lange Pause (3 s)'));
  assert.equal(sumo.deadliftStance, 'sumo');
});

test('Autoregulation: begrenzt, gemittelt und nur bei verlässlicher RPE', () => {
  const plan = generatePlan({ frequency: 4, focus: 'squat', phase: 'strength', level: 'intermediate', triples, name: 'T' });
  const before = expectedMax(plan, 'squat', 2);
  assert.equal(updateMaxFromSet(plan, 'squat', 150, 3, 5, 2), false, 'RPE 5 wird ignoriert');
  assert.equal(updateMaxFromSet(plan, 'squat', 150, 12, 8, 2), false, '12 Wdh. werden ignoriert');
  assert.ok(updateMaxFromSet(plan, 'squat', 200, 3, 8, 2), 'Ausreißer nach oben');
  assert.ok(Math.abs(plan.maxes.squat - Math.round((before + before * 1.05) / 2 * 10) / 10) < .01, 'auf +5 % begrenzt und gemittelt');
  const squat = plan.days[0].exercises[0];
  const oldWeek4 = squat.weekWeights[3];
  applyPlannedLoadsToPlan(plan, 3, 'squat');
  assert.ok(squat.weekWeights[3] >= oldWeek4, 'Folgewochen werden neu berechnet');
});

test('Neuer Zyklus übernimmt das erwartete 1RM vom Blockende', () => {
  const plan = generatePlan({ frequency: 3, focus: 'squat', phase: 'strength', level: 'beginner', triples, name: 'T' });
  const end = expectedMax(plan, 'squat', plan.cycleWeeks);
  rebaseMaxesForNewCycle(plan);
  assert.ok(Math.abs(plan.maxes.squat - end) < .1);
  assert.equal(plan.maxAnchor.squat, 0);
});

test('Manuelle Wochengewichte bleiben bei Neuberechnung erhalten, Rundung ist einstellbar', () => {
  const plan = generatePlan({ frequency: 4, focus: 'bench', phase: 'strength', level: 'advanced', triples, name: 'T' });
  const bench = plan.days.flatMap(day => day.exercises).find(exercise => exercise.category === 'benchMain');
  bench.weekWeights[2] = 111; bench.weekWeightOverrides[2] = true;
  plan.rounding = 1.25; applyPlannedLoadsToPlan(plan, 0);
  assert.equal(bench.weekWeights[2], 111);
  assert.ok(bench.weekWeights.every((weight, index) => index === 2 || Math.abs(weight / 1.25 - Math.round(weight / 1.25)) < 1e-9));
});

test('Alte Pläne mit linearer kg-Steigerung werden auf das RPE-Modell migriert', () => {
  const max = estimateOneRmFrom3x3(140);
  const legacy = sanitizePlan({ id: 'old', name: 'Alt', level: 'advanced', phase: 'strength', cycleWeeks: 16, currentWeek: 5, triples, maxes: { squat: max, bench: 116, deadlift: 210 }, weeklyProgression: { squat: 2.5, bench: 1.25, deadlift: 2.5 },
    days: [{ name: 'Tag 01', exercises: [{ exercise: 'Wettkampfkniebeuge', category: 'squatMain', lift: 'squat', isMain: true, reps: 3, weekReps: Array(16).fill(3), weekRpes: Array(16).fill(8), weekSets: Array(16).fill(5),
      weekWeights: Array.from({ length: 16 }, (_, index) => 130 + 2.5 * index), weekWeightOverrides: Array(16).fill(false) }] }] });
  const squat = legacy.days[0].exercises[0];
  migratePlanLoadModel(legacy);
  assert.equal(legacy.loadModel, LOAD_MODEL);
  assert.deepEqual(squat.weekWeights.slice(0, 4), [130, 132.5, 135, 137.5], 'trainierte Wochen bleiben');
  assert.ok(Math.max(...squat.weekWeights.slice(4)) <= max * .92, 'keine Vorgaben mehr nahe/über dem 1RM');
});
