// Reine Logik ohne DOM-Zugriff: wird im Browser als klassisches Skript vor app.js
// geladen (globale Funktionen) und in Node über module.exports getestet.
const EXERCISES = [
  ['Wettkampfkniebeuge','Kniebeuge'],['Pause Squat','Kniebeuge'],['Frontkniebeuge','Kniebeuge'],['High-Bar Kniebeuge','Kniebeuge'],['Safety-Bar Squat','Kniebeuge'],['Beinpresse','Quadrizeps'],['Bulgarian Split Squat','Quadrizeps'],['Beinstrecker','Quadrizeps'],['Rumänisches Kreuzheben','hintere Kette'],['Beinbeuger liegend','hintere Kette'],['Beinbeuger sitzend','hintere Kette'],['Hip Thrust','hintere Kette'],['Good Morning','hintere Kette'],['Wettkampfbankdrücken','Brust'],['Pause Bankdrücken','Brust'],['Schrägbankdrücken','Brust'],['Kurzhantel-Bankdrücken','Brust'],['Kabel-Flys','Brust'],['Enges Bankdrücken','Trizeps'],['Trizepsdrücken am Kabel','Trizeps'],['Skull Crusher','Trizeps'],['Überkopf-Trizepsstrecken','Trizeps'],['Langhantelrudern','Rücken'],['Brustgestütztes Rudern','Rücken'],['Latzug','Rücken'],['Klimmzüge','Rücken'],['Face Pulls','Rücken'],['Wettkampfkreuzheben','Kreuzheben'],['Pause Kreuzheben','Kreuzheben'],['Block Pull','Kreuzheben'],['Defizit-Kreuzheben','Kreuzheben'],['Sumo Kreuzheben','Kreuzheben'],['Seitheben','Schultern'],['Schulterdrücken','Schultern'],['Bauchrolle','Core'],['Cable Crunch','Core'],['Pallof Press','Core'],['Wadenheben','Waden']
].map(([name, group]) => ({ name, group }));
const TRAINING_CATS = [['squatMain','Main Lift · Squat'],['squatVar','Squat-Assistenz'],['benchMain','Main Lift · Bench'],['benchVar','Bench-Assistenz'],['deadliftMain','Main Lift · Deadlift'],['deadliftVar','Deadlift-Assistenz'],['back','Assistenz · Rücken'],['chest','Assistenz · Brust'],['triceps','Assistenz · Trizeps'],['shoulders','Assistenz · Schultern'],['quads','Assistenz · Quadrizeps'],['hamstrings','Assistenz · hintere Kette'],['core','Assistenz · Core'],['calves','Assistenz · Waden']];
const CAT_LABEL = Object.fromEntries(TRAINING_CATS);
const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const LIFTS = ['squat','bench','deadlift'];
const LEVELS = ['beginner','intermediate','advanced'];
const PHASES = ['hypertrophy','strength'];
const DEFAULT_PROGRESSION = { squat: 2.5, bench: 1.25, deadlift: 2.5 };
const MAX_WEEKS = 52, MAX_DAYS = 14, MAX_EXERCISES = 30;

function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function parseKg(value) { const text = String(value ?? '').trim().replace(',', '.'); if (!text) return NaN; const parsed = Number(text); return Number.isFinite(parsed) ? parsed : NaN; }
function sameKg(a, b) { const x = parseKg(a), y = parseKg(b); return (Number.isNaN(x) && Number.isNaN(y)) || x === y; }
function roundedWeight(value) { return value ? Math.round(value / 2.5) * 2.5 : ''; }
function roundKg(value) { return Math.round(Number(value) * 4) / 4; }
function estimateOneRmFrom3x3(weight) { return Math.round(Number(weight) * (1 + 5 / 30) * 10) / 10; }
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
  if (name === 'Wettkampfbankdrücken') return 'benchMain'; if (name === 'Pause Bankdrücken') return 'benchVar';
  if (name === 'Wettkampfkreuzheben') return 'deadliftMain';
  if (['Pause Kreuzheben','Block Pull','Defizit-Kreuzheben','Sumo Kreuzheben'].includes(name)) return 'deadliftVar';
  const exercise = catalogExercise || EXERCISES.find(item => item.name === name); if (!exercise) return 'back';
  if (exercise.group === 'Rücken') return 'back'; if (exercise.group === 'Brust') return 'chest'; if (exercise.group === 'Trizeps') return 'triceps';
  if (exercise.group === 'Schultern') return 'shoulders'; if (exercise.group === 'Core') return 'core'; if (exercise.group === 'Waden') return 'calves';
  if (exercise.group === 'Quadrizeps') return 'quads'; return 'hamstrings';
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
    2: {
      squat: [['squat', 'bench'], ['deadlift', 'squatVar']],
      bench: [['bench', 'squat'], ['deadlift', 'benchVar']],
      deadlift: [['deadlift', 'bench'], ['squat', 'deadliftVar']]
    },
    3: {
      squat: [['squat'], ['bench'], ['deadlift', 'squatVar']],
      bench: [['bench'], ['squat'], ['deadlift', 'benchVar']],
      deadlift: [['deadlift'], ['bench'], ['squat', 'deadliftVar']]
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
  return base + (lift === focus ? 2 : 0) + (lift === 'bench' ? 1 : 0);
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
function calcLoad(max, reps, rpe, factor = 1) {
  if (!max) return ''; const repsDone = Number.parseInt(reps, 10) || 1; const rir = Math.max(0, 10 - Number(rpe || 7));
  return roundedWeight(max * Math.max(.5, Math.min(.92, 1 - (repsDone + rir) / 30)) * factor);
}

// Erzeugt einen vollständigen Plan aus den Generator-Eingaben. Wirft keine
// DOM-Abhängigkeiten ein, damit alle Vorlagen automatisiert getestet werden können.
function generatePlan({ frequency, level, focus, phase, cycleWeeks, triples, name, authorName = 'Athlet', catalog = EXERCISES, id, createdAt = new Date().toISOString() }) {
  const startDay = 1;
  const weeks = cycleWeeks || templateCycleWeeks(frequency, level);
  const categoryOf = exerciseName => categoryInCatalog(exerciseName, catalog);
  const maxes = Object.fromEntries(LIFTS.map(lift => [lift, estimateOneRmFrom3x3(triples[lift])]));
  const schedule = templateSchedule(frequency, focus);
  const liftMeta = {
    squat: { main: ['Wettkampfkniebeuge', 'squatMain'], variation: ['Pause Squat', 'squatVar'], accessories: ['quads', 'hamstrings', 'core', 'back'] },
    bench: { main: ['Wettkampfbankdrücken', 'benchMain'], variation: ['Pause Bankdrücken', 'benchVar'], accessories: ['back', 'triceps', 'shoulders', 'chest'] },
    deadlift: { main: ['Wettkampfkreuzheben', 'deadliftMain'], variation: ['Pause Kreuzheben', 'deadliftVar'], accessories: ['back', 'hamstrings', 'core', 'quads'] }
  };
  const weekRpes = phaseRpeTargets(phase, level, weeks);
  const weekTypes = Array.from({ length: weeks }, (_, index) => (index + 1) % 4 === 0 ? 'deload' : 'regular');
  const slotsByLift = Object.fromEntries(LIFTS.map(lift => [lift, []]));
  schedule.forEach((slots, dayIndex) => slots.forEach((slot, slotIndex) => slotsByLift[slot.lift].push({ ...slot, dayIndex, slotIndex })));
  const mainSetTargets = Object.fromEntries(LIFTS.map(lift => [lift, weeklyMainSetTarget(phase, level, lift, focus)]));
  const maximumSets = phase === 'hypertrophy' ? 6 : 5;
  const setAllocation = Object.fromEntries(Object.entries(slotsByLift).map(([lift, slots]) => [lift, allocateLiftSets(slots, mainSetTargets[lift], maximumSets)]));
  const accessoryCursor = { back: 0, chest: 0, triceps: 0, shoulders: 0, quads: 0, hamstrings: 0, core: 0 };
  const accessorySets = phase === 'hypertrophy' ? { beginner: 2, intermediate: 3, advanced: 3 }[level] : { beginner: 2, intermediate: 2, advanced: 3 }[level];
  const accessoryRpes = weekRpes.map((rpe, index) => index % 4 === 3 ? 6 : Math.max(6, rpe - 1));
  const days = schedule.map((slots, dayIndex) => {
    const exercises = slots.map((slot, slotIndex) => {
      const meta = liftMeta[slot.lift]; const [defaultExerciseName, category] = slot.variation ? meta.variation : meta.main;
      const exerciseName = catalog.find(item => categoryOf(item.name) === category)?.name || defaultExerciseName;
      const allocationIndex = slotsByLift[slot.lift].findIndex(item => item.dayIndex === dayIndex && item.slotIndex === slotIndex);
      const sets = setAllocation[slot.lift][allocationIndex] || 3;
      const reps = phase === 'hypertrophy' ? (slot.variation ? 8 : level === 'advanced' ? 5 : 6) : (slot.variation ? 5 : level === 'advanced' ? 3 : 4);
      const prescribedRpes = weekRpes.map(value => Math.max(6, value - (slot.variation ? .5 : 0)));
      const weekSets = buildWeekSets(sets, maximumSets, weeks);
      const startingWeight = calcLoad(maxes[slot.lift], reps, prescribedRpes[0], slot.variation ? .9 : 1);
      const step = DEFAULT_PROGRESSION[slot.lift];
      const weekWeights = prescribedRpes.map((rpe, index) => {
        if (slot.variation) return calcLoad(maxes[slot.lift], reps, rpe, .9);
        const previousProgression = Number(startingWeight) + step * (weekTypes[index] === 'deload' ? index - 1 : index);
        return roundKg(weekTypes[index] === 'deload' ? previousProgression * .9 : previousProgression);
      });
      return { exercise: exerciseName, category, sets, reps, weekReps: Array(weeks).fill(reps), rpe: prescribedRpes[0], weekSets, weekRpes: prescribedRpes, weight: weekWeights[0], weekWeights, weekWeightOverrides: Array(weeks).fill(false), actualWeights: Array(weeks).fill(''), actualRpes: Array(weeks).fill(''), note: '', done: false, isMain: true, lift: slot.lift };
    });
    const accessoryCategoriesPerDay = slots.length > 1 ? 3 : 4;
    const availableCategories = [...new Set(slots.flatMap(slot => liftMeta[slot.lift].accessories))];
    const liftSet = [...new Set(slots.map(slot => slot.lift))].sort().join('-');
    const combinationOrder = {
      'bench-deadlift': ['back', 'triceps', 'core', 'hamstrings'],
      'bench-squat': ['back', 'triceps', 'hamstrings', 'quads', 'shoulders', 'core'],
      'deadlift-squat': ['quads', 'hamstrings', 'core', 'back']
    };
    const accessoryOrder = slots.length === 1 ? liftMeta[slots[0].lift].accessories : (combinationOrder[liftSet] || availableCategories);
    const selectedCategories = accessoryOrder.filter(category => availableCategories.includes(category)).slice(0, accessoryCategoriesPerDay);
    selectedCategories.forEach(category => {
      const candidates = catalog.filter(item => categoryOf(item.name) === category);
      if (!candidates.length) return;
      const candidate = candidates[accessoryCursor[category]++ % candidates.length];
      const reps = phase === 'hypertrophy' ? '8–15' : '6–12';
      const weekSets = buildWeekSets(accessorySets, 3, weeks);
      exercises.push({ exercise: candidate.name, category, sets: accessorySets, reps, weekReps: Array(weeks).fill(reps), weekSets, weekRpes: [...accessoryRpes], rpe: accessoryRpes[0], weight: '', weekWeights: Array(weeks).fill(''), weekWeightOverrides: Array(weeks).fill(false), actualWeights: Array(weeks).fill(''), actualRpes: Array(weeks).fill(''), note: '', done: false, isMain: false, lift: null });
    });
    const focusLabel = slots.map(slot => liftName(slot.lift)).join(' + ');
    return { name: `Tag ${String(dayIndex + 1).padStart(2, '0')} · ${focusLabel}`, weekDay: (startDay + Math.floor(dayIndex * 7 / frequency)) % 7, exercises };
  });
  const actualWeeklyTargets = Object.fromEntries(Object.entries(setAllocation).map(([lift, sets]) => [lift, sets.reduce((sum, value) => sum + value, 0)]));
  return {
    id: id || `plan-${Date.now()}`, templateId: `${frequency}d-${focus}-${phase}-${level}-v1`, templateName: `${frequency} Tage · ${liftName(focus)}-Spezialisierung · ${phaseName(phase)} · ${levelName(level)}`,
    name, authorName, createdAt, level, frequency, startDay, focus, phase, triples, maxes, weeklyProgression: { ...DEFAULT_PROGRESSION }, weekTypes,
    setCaps: actualWeeklyTargets, weeklySetTargets: { ...actualWeeklyTargets }, currentWeek: 1, cycle: 1, nextDayIndex: 0, cycleWeeks: weeks, editedWeeks: [], days
  };
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
    weeklyProgression: liftMap(raw.weeklyProgression, (value, lift) => toNum(value, raw.weeklyProgression ? 0 : DEFAULT_PROGRESSION[lift], 0, 50)),
    editedWeeks: toList(raw.editedWeeks, value => toInt(value, 1, 1, MAX_WEEKS)) || [],
    days
  };
  const weekTypes = toList(raw.weekTypes, value => value === 'deload' ? 'deload' : 'regular');
  if (weekTypes) plan.weekTypes = weekTypes;
  for (const key of ['setCaps', 'weeklySetTargets']) if (raw[key]) plan[key] = liftMap(raw[key], value => toInt(value, 0, 0, 200));
  for (const [key, max] of [['templateId', 60], ['templateName', 160], ['authorName', 80], ['createdAt', 40], ['sharedSourceId', 100]]) {
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EXERCISES, TRAINING_CATS, CAT_LABEL, LIFTS, esc, parseKg, sameKg, roundKg, estimateOneRmFrom3x3, categoryInCatalog, templateCycleWeeks, templateSchedule, phaseRpeTargets, buildWeekSets, calcLoad, generatePlan, sanitizePlan, belongsToPlan, inCurrentCycle };
}
