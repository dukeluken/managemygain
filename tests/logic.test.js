const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LIFTS, esc, parseKg, sameKg, generatePlan, sanitizePlan, belongsToPlan, inCurrentCycle, templateCycleWeeks
} = require('../logic.js');

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
