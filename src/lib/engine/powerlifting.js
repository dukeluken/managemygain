// Powerlifting-Engine: reine Logik ohne DOM-Zugriff, testbar in Node.
// Übernommen aus der v1-App (legacy/logic.js), jetzt als ES-Modul.
const EXERCISES = [
  ['Wettkampfkniebeuge','Kniebeuge'],['Pause Squat','Kniebeuge'],['Frontkniebeuge','Kniebeuge'],['High-Bar Kniebeuge','Kniebeuge'],['Safety-Bar Squat','Kniebeuge'],['Beinpresse','Quadrizeps'],['Bulgarian Split Squat','Quadrizeps'],['Beinstrecker','Quadrizeps'],['Rumänisches Kreuzheben','hintere Kette'],['Beinbeuger liegend','hintere Kette'],['Beinbeuger sitzend','hintere Kette'],['Hip Thrust','hintere Kette'],['Good Morning','hintere Kette'],['Wettkampfbankdrücken','Brust'],['Bankdrücken lange Pause (3 s)','Brust'],['Schrägbankdrücken','Brust'],['Kurzhantel-Bankdrücken','Brust'],['Kabel-Flys','Brust'],['Enges Bankdrücken','Trizeps'],['Trizepsdrücken am Kabel','Trizeps'],['Skull Crusher','Trizeps'],['Überkopf-Trizepsstrecken','Trizeps'],['Langhantelrudern','Rücken'],['Brustgestütztes Rudern','Rücken'],['Latzug','Rücken'],['Klimmzüge','Rücken'],['Face Pulls','Rücken'],['Wettkampfkreuzheben','Kreuzheben'],['Pause Kreuzheben','Kreuzheben'],['Block Pull','Kreuzheben'],['Defizit-Kreuzheben','Kreuzheben'],['Sumo Kreuzheben','Kreuzheben'],['Seitheben','Schultern'],['Schulterdrücken','Schultern'],['Bauchrolle','Core'],['Cable Crunch','Core'],['Pallof Press','Core'],['Wadenheben','Waden'],
  // Ab hier ergänzt (Ids builtin-39 ff.); explizite Kategorie, weil Gruppe ≠ Kategorie
  ['Spoto Press','Brust','benchVar'],['Larsen Press','Brust','benchVar'],['Board Press','Brust','benchVar'],['Floor Press','Trizeps','benchVar'],
  ['Pin Squat','Kniebeuge','squatVar'],['Tempo Squat (3-0-0)','Kniebeuge','squatVar'],['Belt Squat','Quadrizeps','quads'],['Hack Squat','Quadrizeps','quads'],
  ['Konventionelles Kreuzheben','Kreuzheben','deadliftVar'],['Gestrecktes Kreuzheben','hintere Kette','hamstrings'],['Rückenstrecker (Hyperextension)','hintere Kette','hamstrings'],['Reverse Hyper','hintere Kette','hamstrings'],
  ['Dips','Trizeps','triceps'],['JM Press','Trizeps','triceps'],['Reverse Flys','Schultern','shoulders'],['Bizepscurls','Bizeps','biceps'],['Hammercurls','Bizeps','biceps']
].map(([name, group, category]) => (category ? { name, group, category } : { name, group }));
const TRAINING_CATS = [['squatMain','Main Lift · Squat'],['squatVar','Squat-Assistenz'],['benchMain','Main Lift · Bench'],['benchVar','Bench-Assistenz'],['deadliftMain','Main Lift · Deadlift'],['deadliftVar','Deadlift-Assistenz'],['back','Assistenz · Rücken'],['chest','Assistenz · Brust'],['triceps','Assistenz · Trizeps'],['shoulders','Assistenz · Schultern'],['quads','Assistenz · Quadrizeps'],['hamstrings','Assistenz · hintere Kette'],['core','Assistenz · Core'],['calves','Assistenz · Waden'],['biceps','Assistenz · Bizeps']];
const CAT_LABEL = Object.fromEntries(TRAINING_CATS);
const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const LIFTS = ['squat','bench','deadlift'];
const LEVELS = ['beginner','intermediate','advanced'];
const PHASES = ['hypertrophy','strength'];
const LOAD_MODEL = 'rpe-v2';
const ROUNDING_STEPS = [2.5, 1.25, 1, 0.5];
const VARIATION_FACTOR = .9;
const DEADLIFT_STANCES = ['conventional', 'sumo'];
// Erwartete Steigerung des geschätzten 1RM pro Woche, nach Trainingsstand.
// Konservativ angelehnt an Langzeitdaten von Kraftdreikämpfern (Latella et al. 2020/2024);
// die tatsächliche Entwicklung kommt über die Autoregulation aus den geloggten Sätzen.
const WEEKLY_GROWTH = { beginner: .005, intermediate: .0025, advanced: .001 };
const MAX_WEEKS = 52, MAX_DAYS = 14, MAX_EXERCISES = 30;

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
// RPE-Tabelle nach Tuchscherer/RTS (vgl. Helms et al. 2016): % des 1RM für 1–12 Wdh. bei RPE 10.
// Andere RPE-Werte entsprechen „effektiven Wiederholungen“ = Wdh. + Reps in Reserve.
const RPE10_PERCENT = [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68];
function rpePercent(reps, rpe) {
  const repetitions = Math.max(1, Number.parseInt(reps, 10) || 1);
  const effort = Number(rpe); const reserve = Number.isFinite(effort) && effort > 0 ? Math.max(0, 10 - Math.min(10, effort)) : 2;
  const effective = repetitions + reserve;
  if (effective <= 12) {
    const low = Math.floor(effective), high = Math.ceil(effective);
    const a = RPE10_PERCENT[low - 1], b = RPE10_PERCENT[high - 1];
    return (a + (b - a) * (effective - low)) / 100;
  }
  return Math.max(.5, (68 - (effective - 12) * 2.7) / 100);
}
function e1rmFromSet(weight, reps, rpe) { const load = Number(weight); return Number.isFinite(load) && load > 0 ? load / rpePercent(reps, rpe) : null; }
function roundTo(value, step = 2.5) { const increment = Number(step) > 0 ? Number(step) : 2.5; return Math.round(Number(value) / increment) * increment; }
function parseKg(value) { const text = String(value ?? '').trim().replace(',', '.'); if (!text) return NaN; const parsed = Number(text); return Number.isFinite(parsed) ? parsed : NaN; }
function sameKg(a, b) { const x = parseKg(a), y = parseKg(b); return (Number.isNaN(x) && Number.isNaN(y)) || x === y; }
function roundKg(value) { return Math.round(Number(value) * 4) / 4; }
// 3×3-Arbeitsgewicht mit letztem Satz bei etwa RPE 8 → geschätztes 1RM.
function estimateOneRmFrom3x3(weight) { const max = e1rmFromSet(weight, 3, 8); return max ? Math.round(max * 10) / 10 : 0; }
function cycleRpe(week) { return [6.5, 7, 8, 6][week - 1] || 7; }
function liftName(lift) { return ({ squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' })[lift] || lift || 'Assistenz'; }
function phaseName(phase) { return phase === 'hypertrophy' ? 'Hypertrophie' : 'Kraft'; }
function levelName(level) { return ({ beginner: 'Einsteiger', intermediate: 'Fortgeschritten', advanced: 'Erfahren' })[level] || 'Fortgeschritten'; }
function catLift(category) { return ({ squatMain: 'squat', squatVar: 'squat', benchMain: 'bench', benchVar: 'bench', deadliftMain: 'deadlift', deadliftVar: 'deadlift' })[category] || null; }

function categoryInCatalog(name, catalog = EXERCISES) {
  const catalogExercise = catalog.find(item => item.name === name);
  if (catalogExercise?.category) return catalogExercise.category;
  if (name === 'Wettkampfkniebeuge') return 'squatMain';
  if (['Pause Squat','Frontkniebeuge','High-Bar Kniebeuge','Safety-Bar Squat'].includes(name)) return 'squatVar';
  if (name === 'Wettkampfbankdrücken') return 'benchMain';
  if (['Pause Bankdrücken','Bankdrücken lange Pause (3 s)','Spoto Press','Larsen Press','Board Press','Floor Press'].includes(name)) return 'benchVar';
  if (name === 'Wettkampfkreuzheben') return 'deadliftMain';
  if (['Pause Kreuzheben','Block Pull','Defizit-Kreuzheben','Sumo Kreuzheben','Konventionelles Kreuzheben'].includes(name)) return 'deadliftVar';
  const exercise = catalogExercise || EXERCISES.find(item => item.name === name); if (!exercise) return 'back';
  if (exercise.group === 'Rücken') return 'back'; if (exercise.group === 'Brust') return 'chest'; if (exercise.group === 'Trizeps') return 'triceps';
  if (exercise.group === 'Schultern') return 'shoulders'; if (exercise.group === 'Core') return 'core'; if (exercise.group === 'Waden') return 'calves';
  if (exercise.group === 'Quadrizeps') return 'quads'; if (exercise.group === 'Bizeps') return 'biceps'; return 'hamstrings';
}

function templateCycleWeeks(frequency, level) {
  const baseWeeks = { beginner: 8, intermediate: 12, advanced: 16 }[level] || 12;
  const frequencyAdjustment = { 2: 4, 3: 0, 4: 0, 5: -4 }[frequency] || 0;
  return Math.max(8, Math.min(16, baseWeeks + frequencyAdjustment));
}
function phaseRpeTargets(phase, level, cycleWeeks = 8) {
  const base = ({ beginner: { hypertrophy: 6, strength: 6.5 }, intermediate: { hypertrophy: 6.5, strength: 6.5 }, advanced: { hypertrophy: 7, strength: 7 } })[level]?.[phase] || 6.5;
  const ceiling = level === 'beginner' ? 8 : 8.5;
  return Array.from({ length: cycleWeeks }, (_, index) => {
    const weekInWave = index % 4;
    if (weekInWave === 3) return 6;
    return Math.min(ceiling, base + Math.min(1, Math.floor(index / 4) * .5) + [0, .5, 1][weekInWave]);
  });
}
function templateSchedule(frequency, focus) {
  const schedules = {
    // Bench ist in der Praxis der am häufigsten trainierte Lift (im Mittel ~2,5×/Woche,
    // Amdi et al. 2026) und wird deshalb in jeder Vorlage mindestens 2× pro Woche trainiert.
    2: {
      squat: [['squat', 'bench'], ['deadlift', 'benchVar', 'squatVar']],
      bench: [['bench', 'squat'], ['deadlift', 'benchVar']],
      deadlift: [['deadlift', 'bench'], ['squat', 'benchVar', 'deadliftVar']]
    },
    3: {
      squat: [['squat', 'benchVar'], ['bench'], ['deadlift', 'squatVar']],
      bench: [['bench'], ['squat'], ['deadlift', 'benchVar']],
      deadlift: [['deadlift', 'benchVar'], ['bench'], ['squat', 'deadliftVar']]
    },
    4: {
      squat: [['squat'], ['bench'], ['deadlift'], ['squatVar', 'benchVar']],
      bench: [['bench'], ['squat'], ['deadlift'], ['benchVar', 'bench']],
      deadlift: [['deadlift'], ['bench'], ['squat'], ['deadliftVar', 'benchVar']]
    },
    5: {
      squat: [['squat'], ['bench'], ['deadlift'], ['squatVar'], ['benchVar', 'squat']],
      bench: [['bench'], ['squat'], ['deadlift'], ['benchVar'], ['bench', 'squatVar']],
      deadlift: [['deadlift'], ['bench'], ['squat'], ['deadliftVar'], ['benchVar', 'deadlift']]
    }
  };
  const selected = schedules[frequency]?.[focus] || schedules[4].squat;
  return selected.map(day => day.map(code => ({ lift: code.replace('Var', ''), variation: code.endsWith('Var') })));
}
function allocateLiftSets(slots, target, maxPerExposure) {
  if (!slots.length) return [];
  const total = Math.max(slots.length * 2, Math.min(target, slots.length * maxPerExposure));
  const sets = slots.map(() => 2);
  for (let remaining = total - sets.length * 2; remaining > 0; remaining -= 1) {
    let best = -1; let lowestRatio = Infinity;
    slots.forEach((slot, index) => {
      if (sets[index] >= maxPerExposure) return;
      const ratio = sets[index] / (slot.variation ? .75 : 1);
      if (ratio < lowestRatio) { lowestRatio = ratio; best = index; }
    });
    if (best < 0) break;
    sets[best] += 1;
  }
  return sets;
}
function weeklyMainSetTarget(phase, level, lift, focus) {
  const base = phase === 'hypertrophy'
    ? { beginner: 8, intermediate: 10, advanced: 12 }[level]
    : { beginner: 6, intermediate: 8, advanced: 10 }[level];
  const target = base + (lift === focus ? 2 : 0) + (lift === 'bench' ? 1 : 0);
  // Deadlift ermüdet pro Satz stärker; übliche Praxis ist weniger Deadlift-Volumen als Squat.
  return lift === 'deadlift' ? Math.round(target * .75) : target;
}
function maxSetsPerExposure(phase, lift) { return lift === 'deadlift' ? (phase === 'hypertrophy' ? 5 : 4) : (phase === 'hypertrophy' ? 6 : 5); }
// Wiederholungen je Woche: schwerer Tag (erste Exposition) und Volumentag (+2 Wdh.,
// −0,5 RPE) pro Lift; über den Block sinken die Wiederholungen Welle für Welle
// Richtung schwererer, wettkampfnäherer Arbeit (Hypertrophie −2, Kraft −1 bis zur letzten Welle).
function repScheme(phase, level, lift, variation, exposure, waveIndex, waveCount) {
  let reps = phase === 'hypertrophy' ? (variation ? 8 : level === 'advanced' ? 5 : 6) : (variation ? 5 : level === 'advanced' ? 3 : 4);
  if (!variation && exposure > 0) reps += 2;
  const shift = waveCount > 1 ? Math.round(waveIndex / (waveCount - 1) * (phase === 'hypertrophy' ? 2 : 1)) : 0;
  reps = Math.max(variation ? 3 : 2, reps - shift);
  if (lift === 'deadlift') reps = Math.min(reps, 5);
  return reps;
}
function deloadSets(sets) { return Math.max(1, Math.floor(sets * .5)); }
function buildWeekSets(sets, maxSets, cycleWeeks) {
  return Array.from({ length: cycleWeeks }, (_, index) => {
    const wave = Math.floor(index / 4);
    const weekInWave = index % 4;
    const waveBase = Math.min(maxSets, sets + wave);
    return weekInWave === 3 ? deloadSets(waveBase) : Math.min(maxSets, waveBase + (weekInWave === 2 ? 1 : 0));
  });
}
function calcLoad(max, reps, rpe, factor = 1, step = 2.5) {
  if (!(Number(max) > 0)) return '';
  return roundTo(Number(max) * rpePercent(reps, rpe) * factor, step);
}
function defaultProgression(maxes, level) {
  const rate = WEEKLY_GROWTH[level] ?? WEEKLY_GROWTH.intermediate;
  return Object.fromEntries(LIFTS.map(lift => [lift, Math.round((Number(maxes?.[lift]) || 0) * rate * 4) / 4]));
}
function exerciseLift(exercise) { return LIFTS.includes(exercise?.lift) ? exercise.lift : catLift(exercise?.category); }
// Geplantes Gewicht: erwartetes 1RM der Woche × RPE-Tabelle(Wdh., Ziel-RPE).
// Die Progression entsteht aus steigender Ziel-RPE, Wiederholungswechseln und
// der erwarteten 1RM-Entwicklung – nicht aus festen Kilosprüngen.
function expectedMax(plan, lift, weekIndex) {
  const max = Number(plan.maxes?.[lift]); if (!(max > 0)) return null;
  const anchor = Number(plan.maxAnchor?.[lift]) || 0;
  const growth = Math.max(0, Number(plan.weeklyProgression?.[lift]) || 0);
  return max + growth * Math.max(0, weekIndex - anchor);
}
function plannedLoad(plan, exercise, weekIndex) {
  const lift = exerciseLift(exercise);
  if (!lift) return null;
  const isMain = exercise.category === `${lift}Main`, isVariation = exercise.category === `${lift}Var`;
  if (!isMain && !isVariation) return null;
  const max = expectedMax(plan, lift, weekIndex); if (!max) return '';
  const reps = exercise.weekReps?.[weekIndex] ?? exercise.reps;
  const rpe = exercise.weekRpes?.[weekIndex] ?? exercise.rpe;
  return calcLoad(max, reps, rpe, isVariation ? VARIATION_FACTOR : 1, plan.rounding || 2.5);
}
function applyPlannedLoads(plan, exercise, fromWeek = 0) {
  const weeks = Number(plan.cycleWeeks) || 1;
  exercise.weekWeights ||= Array(weeks).fill('');
  exercise.weekWeightOverrides ||= Array(weeks).fill(false);
  for (let weekIndex = Math.max(0, fromWeek); weekIndex < weeks; weekIndex += 1) {
    if (exercise.weekWeightOverrides[weekIndex]) continue;
    const load = plannedLoad(plan, exercise, weekIndex);
    if (load !== null) exercise.weekWeights[weekIndex] = load;
  }
  exercise.weight = exercise.weekWeights[0] ?? '';
}
function applyPlannedLoadsToPlan(plan, fromWeek = 0, lift = null) {
  (plan.days || []).forEach(day => day.exercises.forEach(exercise => { if (!lift || exerciseLift(exercise) === lift) applyPlannedLoads(plan, exercise, fromWeek); }));
}
// Autoregulation: geloggter Satz → neue 1RM-Schätzung. Nur bei RPE 6–10 und ≤ 10 Wdh.
// (sonst ist die RIR-Schätzung zu ungenau). Änderung je Update auf ±5 % begrenzt
// und zur Hälfte mit dem bisherigen Wert gemittelt, damit ein Tagesausreißer
// den Plan nicht umwirft.
function updateMaxFromSet(plan, lift, weight, reps, rpe, weekIndex) {
  const effort = Number(rpe), repetitions = Number.parseInt(reps, 10);
  if (!LIFTS.includes(lift) || !(effort >= 6 && effort <= 10) || !(repetitions >= 1 && repetitions <= 10)) return false;
  const estimate = e1rmFromSet(weight, repetitions, effort);
  const current = expectedMax(plan, lift, weekIndex);
  if (!estimate || !current) return false;
  const bounded = Math.min(current * 1.05, Math.max(current * .95, estimate));
  plan.maxes = { ...(plan.maxes || {}), [lift]: Math.round((current + bounded) / 2 * 10) / 10 };
  plan.maxAnchor = { ...(plan.maxAnchor || {}), [lift]: weekIndex };
  return true;
}
// Neuer Zyklus: erwartetes 1RM am Blockende wird neuer Ausgangswert.
function rebaseMaxesForNewCycle(plan) {
  const weeks = Number(plan.cycleWeeks) || 1;
  plan.maxes = Object.fromEntries(LIFTS.map(lift => { const max = expectedMax(plan, lift, weeks); return [lift, max ? Math.round(max * 10) / 10 : (plan.maxes?.[lift] ?? '')]; }));
  plan.maxAnchor = Object.fromEntries(LIFTS.map(lift => [lift, 0]));
}
// Alte Pläne (feste kg-Steigerung pro Woche) auf das RPE-Lastmodell umstellen.
// Bereits trainierte Wochen bleiben unverändert.
function migratePlanLoadModel(plan) {
  if (!plan || plan.loadModel === LOAD_MODEL) return plan;
  const hasMax = LIFTS.some(lift => Number(plan.maxes?.[lift]) > 0);
  if (!hasMax) plan.maxes = Object.fromEntries(LIFTS.map(lift => [lift, Number(plan.triples?.[lift]) > 0 ? estimateOneRmFrom3x3(plan.triples[lift]) : '']));
  plan.weeklyProgression = defaultProgression(plan.maxes, plan.level);
  plan.maxAnchor = Object.fromEntries(LIFTS.map(lift => [lift, 0]));
  plan.rounding ||= 2.5;
  plan.loadModel = LOAD_MODEL;
  applyPlannedLoadsToPlan(plan, Math.max(0, (Number(plan.currentWeek) || 1) - 1));
  return plan;
}

// Erzeugt einen vollständigen Plan aus den Generator-Eingaben (ohne DOM-Zugriff,
// damit alle Vorlagen automatisiert getestet werden können).
function generatePlan({ frequency, level, focus, phase, cycleWeeks, triples, name, authorName = 'Athlet', catalog = EXERCISES, id, createdAt = new Date().toISOString(), deadliftStance = 'conventional', rounding = 2.5 }) {
  const startDay = 1;
  const weeks = cycleWeeks || templateCycleWeeks(frequency, level);
  const waveCount = Math.ceil(weeks / 4);
  const stance = DEADLIFT_STANCES.includes(deadliftStance) ? deadliftStance : 'conventional';
  const categoryOf = exerciseName => categoryInCatalog(exerciseName, catalog);
  const pick = (category, preferred) => catalog.find(item => item.name === preferred && categoryOf(item.name) === category)?.name
    || catalog.find(item => categoryOf(item.name) === category)?.name || preferred;
  const maxes = Object.fromEntries(LIFTS.map(lift => [lift, estimateOneRmFrom3x3(triples[lift])]));
  const schedule = templateSchedule(frequency, focus);
  const liftMeta = {
    squat: { main: ['Wettkampfkniebeuge', 'squatMain'], variation: ['Pause Squat', 'squatVar'], accessories: ['quads', 'hamstrings', 'core', 'back'] },
    // Im Wettkampf (IPF) ist die Pause beim Bankdrücken Pflicht – Variante ist daher die lange Pause.
    bench: { main: ['Wettkampfbankdrücken', 'benchMain'], variation: ['Bankdrücken lange Pause (3 s)', 'benchVar'], accessories: ['back', 'triceps', 'shoulders', 'chest'] },
    // Wer sumo zieht, nutzt konventionelles Kreuzheben als Variante (und umgekehrt Pause-Kreuzheben).
    deadlift: { main: ['Wettkampfkreuzheben', 'deadliftMain'], variation: [stance === 'sumo' ? 'Konventionelles Kreuzheben' : 'Pause Kreuzheben', 'deadliftVar'], accessories: ['back', 'hamstrings', 'core', 'quads'] }
  };
  const weekRpes = phaseRpeTargets(phase, level, weeks);
  const weekTypes = Array.from({ length: weeks }, (_, index) => (index + 1) % 4 === 0 ? 'deload' : 'regular');
  const slotsByLift = Object.fromEntries(LIFTS.map(lift => [lift, []]));
  schedule.forEach((slots, dayIndex) => slots.forEach((slot, slotIndex) => slotsByLift[slot.lift].push({ ...slot, dayIndex, slotIndex })));
  const setAllocation = Object.fromEntries(LIFTS.map(lift => [lift, allocateLiftSets(slotsByLift[lift], weeklyMainSetTarget(phase, level, lift, focus), maxSetsPerExposure(phase, lift))]));
  const exposureCount = Object.fromEntries(LIFTS.map(lift => [lift, 0]));
  const accessoryCursor = {};
  const accessorySets = phase === 'hypertrophy' ? { beginner: 2, intermediate: 3, advanced: 3 }[level] : { beginner: 2, intermediate: 2, advanced: 3 }[level];
  const accessoryRpes = weekRpes.map((rpe, index) => index % 4 === 3 ? 6 : Math.max(6, rpe - 1));
  const days = schedule.map((slots, dayIndex) => {
    const exercises = slots.map((slot, slotIndex) => {
      const meta = liftMeta[slot.lift]; const [defaultExerciseName, category] = slot.variation ? meta.variation : meta.main;
      const exposure = slot.variation ? 0 : exposureCount[slot.lift]++;
      const allocationIndex = slotsByLift[slot.lift].findIndex(item => item.dayIndex === dayIndex && item.slotIndex === slotIndex);
      const sets = setAllocation[slot.lift][allocationIndex] || 3;
      const weekReps = Array.from({ length: weeks }, (_, index) => repScheme(phase, level, slot.lift, slot.variation, exposure, Math.floor(index / 4), waveCount));
      const rpeOffset = slot.variation || exposure > 0 ? .5 : 0;
      const prescribedRpes = weekRpes.map(value => Math.max(6, value - rpeOffset));
      return { exercise: pick(category, defaultExerciseName), category, sets, reps: weekReps[0], weekReps, rpe: prescribedRpes[0], weekSets: buildWeekSets(sets, maxSetsPerExposure(phase, slot.lift), weeks), weekRpes: prescribedRpes, weight: '', weekWeights: Array(weeks).fill(''), weekWeightOverrides: Array(weeks).fill(false), actualWeights: Array(weeks).fill(''), actualRpes: Array(weeks).fill(''), note: '', done: false, isMain: true, lift: slot.lift };
    });
    const accessoryCategoriesPerDay = Math.max(2, 5 - slots.length);
    const availableCategories = [...new Set(slots.flatMap(slot => liftMeta[slot.lift].accessories))];
    const liftSet = [...new Set(slots.map(slot => slot.lift))].sort().join('-');
    const combinationOrder = {
      'bench-deadlift': ['back', 'triceps', 'core', 'hamstrings'],
      'bench-squat': ['back', 'triceps', 'hamstrings', 'quads', 'shoulders', 'core'],
      'deadlift-squat': ['quads', 'hamstrings', 'core', 'back'],
      'bench-deadlift-squat': ['back', 'hamstrings', 'triceps', 'core']
    };
    const accessoryOrder = slots.length === 1 ? liftMeta[slots[0].lift].accessories : (combinationOrder[liftSet] || availableCategories);
    const selectedCategories = accessoryOrder.filter(category => availableCategories.includes(category)).slice(0, accessoryCategoriesPerDay);
    selectedCategories.forEach(category => {
      const candidates = catalog.filter(item => categoryOf(item.name) === category);
      if (!candidates.length) return;
      accessoryCursor[category] ||= 0;
      const candidate = candidates[accessoryCursor[category]++ % candidates.length];
      const reps = phase === 'hypertrophy' ? '8–15' : '6–12';
      exercises.push({ exercise: candidate.name, category, sets: accessorySets, reps, weekReps: Array(weeks).fill(reps), weekSets: buildWeekSets(accessorySets, 3, weeks), weekRpes: [...accessoryRpes], rpe: accessoryRpes[0], weight: '', weekWeights: Array(weeks).fill(''), weekWeightOverrides: Array(weeks).fill(false), actualWeights: Array(weeks).fill(''), actualRpes: Array(weeks).fill(''), note: '', done: false, isMain: false, lift: null });
    });
    const focusLabel = [...new Set(slots.map(slot => liftName(slot.lift)))].join(' + ');
    return { name: `Tag ${String(dayIndex + 1).padStart(2, '0')} · ${focusLabel}`, weekDay: (startDay + Math.floor(dayIndex * 7 / frequency)) % 7, exercises };
  });
  const actualWeeklyTargets = Object.fromEntries(Object.entries(setAllocation).map(([lift, sets]) => [lift, sets.reduce((sum, value) => sum + value, 0)]));
  const plan = {
    id: id || `plan-${Date.now()}`, templateId: `${frequency}d-${focus}-${phase}-${level}-v2`, templateName: `${frequency} Tage · ${liftName(focus)}-Spezialisierung · ${phaseName(phase)} · ${levelName(level)}`,
    name, authorName, createdAt, level, frequency, startDay, focus, phase, deadliftStance: stance, triples, maxes,
    weeklyProgression: defaultProgression(maxes, level), maxAnchor: Object.fromEntries(LIFTS.map(lift => [lift, 0])), rounding: ROUNDING_STEPS.includes(Number(rounding)) ? Number(rounding) : 2.5, loadModel: LOAD_MODEL,
    weekTypes, setCaps: actualWeeklyTargets, weeklySetTargets: { ...actualWeeklyTargets }, currentWeek: 1, cycle: 1, nextDayIndex: 0, cycleWeeks: weeks, editedWeeks: [], days
  };
  applyPlannedLoadsToPlan(plan, 0);
  return plan;
}

// --- Bereinigung: jeder Plan (eigene Daten und geteilte Links) wird auf bekannte
// Felder und Typen reduziert, bevor er gerendert oder gespeichert wird.
function toText(value, max = 120) { return (typeof value === 'string' || typeof value === 'number') ? String(value).slice(0, max) : ''; }
function toInt(value, fallback, min, max) { if (value === '' || value == null) return fallback; const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function toNum(value, fallback, min = -Infinity, max = Infinity) { if (value === '' || value == null || typeof value === 'boolean') return fallback; const n = parseKg(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; }
function toKg(value) { const n = typeof value === 'boolean' ? NaN : parseKg(value); return Number.isFinite(n) && n >= 0 ? Math.min(n, 2000) : ''; }
function toList(value, map, max = MAX_WEEKS) { return Array.isArray(value) ? value.slice(0, max).map(map) : undefined; }
function liftMap(value, map) { const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}; return Object.fromEntries(LIFTS.map(lift => [lift, map(source[lift], lift)])); }
function sanitizeExercise(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const exercise = {
    exercise: toText(source.exercise, 120) || 'Übung',
    category: Object.prototype.hasOwnProperty.call(CAT_LABEL, source.category) ? source.category : 'back',
    lift: LIFTS.includes(source.lift) ? source.lift : null,
    isMain: Boolean(source.isMain),
    sets: toInt(source.sets, 1, 1, 20),
    reps: toText(source.reps, 20) || '1',
    rpe: toNum(source.rpe, 7, 1, 10),
    weight: toKg(source.weight),
    note: toText(source.note, 240),
    done: Boolean(source.done)
  };
  const lists = {
    weekSets: value => toInt(value, exercise.sets, 1, 20),
    weekReps: value => toText(value, 20) || exercise.reps,
    weekRpes: value => toNum(value, exercise.rpe, 1, 10),
    weekWeights: toKg,
    actualWeights: toKg,
    actualRpes: value => toNum(value, '', 1, 10),
    weekWeightOverrides: value => Boolean(value)
  };
  for (const [key, map] of Object.entries(lists)) { const list = toList(source[key], map); if (list) exercise[key] = list; }
  return exercise;
}
function sanitizePlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cycleWeeks = toInt(raw.cycleWeeks, 4, 1, MAX_WEEKS);
  const days = (Array.isArray(raw.days) ? raw.days : []).slice(0, MAX_DAYS).map((rawDay, index) => {
    const source = rawDay && typeof rawDay === 'object' ? rawDay : {};
    const day = { name: toText(source.name, 80) || `Tag ${String(index + 1).padStart(2, '0')}`, exercises: (Array.isArray(source.exercises) ? source.exercises : []).slice(0, MAX_EXERCISES).map(sanitizeExercise) };
    const weekDay = toInt(source.weekDay, null, 0, 6);
    if (weekDay !== null) day.weekDay = weekDay;
    return day;
  });
  const plan = {
    id: toText(raw.id, 100),
    name: toText(raw.name, 120),
    level: LEVELS.includes(raw.level) ? raw.level : 'intermediate',
    phase: PHASES.includes(raw.phase) ? raw.phase : 'strength',
    focus: LIFTS.includes(raw.focus) ? raw.focus : 'squat',
    frequency: toInt(raw.frequency, days.length || 3, 1, 7),
    startDay: toInt(raw.startDay, 1, 0, 6),
    cycleWeeks,
    currentWeek: toInt(raw.currentWeek, 1, 1, cycleWeeks),
    cycle: toInt(raw.cycle, 1, 1, 100000),
    nextDayIndex: toInt(raw.nextDayIndex, 0, 0, Math.max(0, days.length - 1)),
    triples: liftMap(raw.triples, toKg),
    maxes: liftMap(raw.maxes, toKg),
    weeklyProgression: liftMap(raw.weeklyProgression, value => toNum(value, 0, 0, 50)),
    maxAnchor: liftMap(raw.maxAnchor, value => toInt(value, 0, 0, MAX_WEEKS)),
    rounding: ROUNDING_STEPS.includes(Number(raw.rounding)) ? Number(raw.rounding) : 2.5,
    deadliftStance: DEADLIFT_STANCES.includes(raw.deadliftStance) ? raw.deadliftStance : 'conventional',
    editedWeeks: toList(raw.editedWeeks, value => toInt(value, 1, 1, MAX_WEEKS)) || [],
    days
  };
  const weekTypes = toList(raw.weekTypes, value => value === 'deload' ? 'deload' : 'regular');
  if (weekTypes) plan.weekTypes = weekTypes;
  for (const key of ['setCaps', 'weeklySetTargets']) if (raw[key]) plan[key] = liftMap(raw[key], value => toInt(value, 0, 0, 200));
  for (const [key, max] of [['loadModel', 20], ['templateId', 60], ['templateName', 160], ['authorName', 80], ['createdAt', 40], ['sharedSourceId', 100]]) {
    const value = toText(raw[key], max); if (value) plan[key] = value;
  }
  return plan;
}

// Historie gehört genau dann zu einem Plan, wenn die planId übereinstimmt.
// Name/Tagesname dienen nur als Fallback für alte Einträge ohne planId.
function belongsToPlan(entry, plan) {
  if (!entry || !plan) return false;
  if (entry.planId != null && entry.planId !== '') return String(entry.planId) === String(plan.id);
  if (entry.planName) return entry.planName === plan.name;
  return (plan.days || []).some(day => day.name === entry.name);
}
function entryCycle(entry) { return Number(entry?.cycle) || 1; }
function planCycle(plan) { return Number(plan?.cycle) || 1; }
function inCurrentCycle(entry, plan) { return belongsToPlan(entry, plan) && entryCycle(entry) === planCycle(plan); }

export {
  LOAD_MODEL, rpePercent, e1rmFromSet, expectedMax, plannedLoad, applyPlannedLoadsToPlan, updateMaxFromSet, rebaseMaxesForNewCycle, migratePlanLoadModel, defaultProgression, maxSetsPerExposure, EXERCISES, TRAINING_CATS, CAT_LABEL, LIFTS, esc, parseKg, sameKg, roundKg, estimateOneRmFrom3x3, categoryInCatalog, templateCycleWeeks, templateSchedule, phaseRpeTargets, buildWeekSets, calcLoad, generatePlan, sanitizePlan, belongsToPlan, inCurrentCycle,
  WEEKDAYS, LEVELS, PHASES, ROUNDING_STEPS, DEADLIFT_STANCES
};
