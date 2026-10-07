const EXERCISES = [
  ['Wettkampfkniebeuge','Kniebeuge','Kniebeuge'],['Pause Squat','Kniebeuge','Kniebeuge'],['Frontkniebeuge','Kniebeuge','Quadrizeps'],['High-Bar Kniebeuge','Kniebeuge','Quadrizeps'],['Safety-Bar Squat','Kniebeuge','Quadrizeps'],['Beinpresse','Quadrizeps','Quadrizeps'],['Bulgarian Split Squat','Quadrizeps','Quadrizeps'],['Beinstrecker','Quadrizeps','Quadrizeps'],['Rumänisches Kreuzheben','hintere Kette','Hamstrings/Gluteus'],['Beinbeuger liegend','hintere Kette','Hamstrings'],['Beinbeuger sitzend','hintere Kette','Hamstrings'],['Hip Thrust','hintere Kette','Gluteus'],['Good Morning','hintere Kette','Rückenstrecker'],['Wettkampfbankdrücken','Brust','Brust'],['Pause Bankdrücken','Brust','Brust'],['Schrägbankdrücken','Brust','Brust/Schulter'],['Kurzhantel-Bankdrücken','Brust','Brust'],['Kabel-Flys','Brust','Brust'],['Enges Bankdrücken','Trizeps','Trizeps'],['Trizepsdrücken am Kabel','Trizeps','Trizeps'],['Skull Crusher','Trizeps','Trizeps'],['Überkopf-Trizepsstrecken','Trizeps','Trizeps'],['Langhantelrudern','Rücken','oberer Rücken'],['Brustgestütztes Rudern','Rücken','oberer Rücken'],['Latzug','Rücken','Latissimus'],['Klimmzüge','Rücken','Latissimus'],['Face Pulls','Rücken','hintere Schulter'],['Wettkampfkreuzheben','Kreuzheben','hintere Kette'],['Pause Kreuzheben','Kreuzheben','hintere Kette'],['Block Pull','Kreuzheben','hintere Kette'],['Defizit-Kreuzheben','Kreuzheben','hintere Kette'],['Sumo Kreuzheben','Kreuzheben','hintere Kette'],['Seitheben','Schultern','seitliche Schulter'],['Schulterdrücken','Schultern','Schulter'],['Bauchrolle','Core','Bauch'],['Cable Crunch','Core','Bauch'],['Pallof Press','Core','Core'],['Wadenheben','Waden','Wade']
].map(([name, group, muscle]) => ({ name, group, muscle }));
const TRAINING_CATS = [['squatMain','Main Lift · Squat'],['squatVar','Squat-Assistenz'],['benchMain','Main Lift · Bench'],['benchVar','Bench-Assistenz'],['deadliftMain','Main Lift · Deadlift'],['deadliftVar','Deadlift-Assistenz'],['back','Assistenz · Rücken'],['chest','Assistenz · Brust'],['triceps','Assistenz · Trizeps'],['shoulders','Assistenz · Schultern'],['quads','Assistenz · Quadrizeps'],['hamstrings','Assistenz · hintere Kette'],['core','Assistenz · Core'],['calves','Assistenz · Waden']];
const CAT_LABEL = Object.fromEntries(TRAINING_CATS);
const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const KEY = 'mmg-firebase-state-v1';
let state = load();
let editingPlanId = null;
let editingDayIndex = 0;
let activeDay = 0;
let editingWorkoutExercise = null;
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, current: null }; } catch { return { users: {}, current: null }; } }
function cacheState() { localStorage.setItem(KEY, JSON.stringify(state)); }
function user() { return state.users[state.current]; }
function activePlan() { const profile = user(); return profile?.plans?.find(plan => plan.id === profile.activePlanId) || profile?.plans?.[0] || null; }
function selectedPlan() { return user()?.plans?.find(plan => plan.id === editingPlanId) || activePlan(); }
function save() {
  cacheState();
  if (!state.current || !user() || !window.mmgFirebase?.configured) return;
  $('#syncStatus').textContent = 'SYNC';
  const profile = user();
  window.mmgFirebase.saveData(state.current, { plans: profile.plans || [], activePlanId: profile.activePlanId || null, plan: activePlan() || null, history: profile.history || [] })
    .then(() => $('#syncStatus').textContent = 'SYNCED').catch(error => { $('#syncStatus').textContent = 'OFFLINE'; console.warn('Firestore sync failed', error); });
}
function markWeekEdited(plan = selectedPlan()) {
  if (!plan) return;
  plan.editedWeeks ||= [];
  const week = Number(plan.currentWeek || 1);
  if (!plan.editedWeeks.includes(week)) plan.editedWeeks.push(week);
  plan.editedWeeks.sort((a, b) => a - b);
}
function upgradePlan(plan, index = 0) {
  if (!plan) return null;
  plan.id ||= `legacy-plan-${index + 1}`; plan.name ||= 'Mein Trainingsplan'; plan.cycleWeeks ||= 4; plan.currentWeek ||= 1; plan.days ||= []; plan.editedWeeks ||= []; plan.nextDayIndex = Number.isInteger(plan.nextDayIndex) ? plan.nextDayIndex : 0;
  if (plan.days.length) plan.nextDayIndex = Math.max(0, Math.min(plan.nextDayIndex, plan.days.length - 1));
  plan.days.forEach((day, dayIndex) => { day.weekDay ??= (Number(plan.startDay || 1) + Math.floor(dayIndex * 7 / Math.max(1, plan.days.length))) % 7; day.exercises ||= []; });
  return plan;
}
function buildProfile(firebaseUser, payload, fallback) {
  let plans;
  if (Array.isArray(payload?.plans)) plans = payload.plans;
  else if (payload?.plan) plans = [payload.plan];
  else if (Array.isArray(fallback?.plans)) plans = fallback.plans;
  else if (fallback?.plan) plans = [fallback.plan];
  else plans = [];
  plans = plans.map((plan, index) => upgradePlan(plan, index));
  const activePlanId = plans.some(plan => plan.id === payload?.activePlanId) ? payload.activePlanId : (fallback?.activePlanId && plans.some(plan => plan.id === fallback.activePlanId) ? fallback.activePlanId : plans[0]?.id || null);
  return { displayName: firebaseUser.displayName || fallback?.displayName || 'Athlet', email: firebaseUser.email || fallback?.email || '', plans, activePlanId, history: payload?.history || fallback?.history || [] };
}
function show(id) {
  ['authView','dashboard','planManagerView','planView','planEditorView','dayEditorView','workoutView','exerciseView'].forEach(view => $('#' + view).classList.toggle('hidden', view !== id));
  $('#userBadge').classList.toggle('hidden', !state.current); $('#logout').classList.toggle('hidden', !state.current); $('#catalogLink').classList.toggle('hidden', !state.current);
}
function goBack(target) { if (target === 'planEditorView') renderPlanEditor(); if (target === 'dashboard') renderDashboard(); show(target || 'dashboard'); }
function dayName(day) { return WEEKDAYS[Number(day)] || 'Tag auswählen'; }
function liftName(lift) { return ({ squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' })[lift] || lift || 'Assistenz'; }
function phaseName(phase) { return phase === 'hypertrophy' ? 'Hypertrophie' : 'Kraft'; }
function levelName(level) { return ({ beginner: 'Einsteiger', intermediate: 'Fortgeschritten', advanced: 'Erfahren' })[level] || 'Fortgeschritten'; }
function categoryForExercise(name) {
  if (name === 'Wettkampfkniebeuge') return 'squatMain';
  if (['Pause Squat','Frontkniebeuge','High-Bar Kniebeuge','Safety-Bar Squat'].includes(name)) return 'squatVar';
  if (name === 'Wettkampfbankdrücken') return 'benchMain'; if (name === 'Pause Bankdrücken') return 'benchVar';
  if (name === 'Wettkampfkreuzheben') return 'deadliftMain';
  if (['Pause Kreuzheben','Block Pull','Defizit-Kreuzheben','Sumo Kreuzheben'].includes(name)) return 'deadliftVar';
  const exercise = EXERCISES.find(item => item.name === name); if (!exercise) return 'back';
  if (exercise.group === 'Rücken') return 'back'; if (exercise.group === 'Brust') return 'chest'; if (exercise.group === 'Trizeps') return 'triceps';
  if (exercise.group === 'Schultern') return 'shoulders'; if (exercise.group === 'Core') return 'core'; if (exercise.group === 'Waden') return 'calves';
  if (exercise.group === 'Quadrizeps') return 'quads'; return 'hamstrings';
}
function catLift(category) { return ({ squatMain: 'squat', squatVar: 'squat', benchMain: 'bench', benchVar: 'bench', deadliftMain: 'deadlift', deadliftVar: 'deadlift' })[category] || null; }
function roundedWeight(value) { return value ? Math.round(value / 2.5) * 2.5 : ''; }
function estimateOneRmFrom3x3(weight) { return Math.round(Number(weight) * (1 + 5 / 30) * 10) / 10; }
function cycleRpe(week) { return [6.5, 7, 8, 6][week - 1] || 7; }
function phaseRpeTargets(phase, level) {
  const table = {
    beginner: { hypertrophy: [6, 6.5, 7, 6, 6.5, 7, 7.5, 6], strength: [6.5, 7, 7.5, 6, 7, 7.5, 8, 6] },
    intermediate: { hypertrophy: [6.5, 7, 7.5, 6, 7, 7.5, 8, 6], strength: [6.5, 7.5, 8, 6, 7.5, 8, 8.5, 6] },
    advanced: { hypertrophy: [7, 7.5, 8, 6, 7.5, 8, 8.5, 6], strength: [7, 7.5, 8.5, 6, 7.5, 8, 8.5, 6] }
  };
  return table[level]?.[phase] || table.intermediate[phase];
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
function buildWeekSets(sets, maxSets, cycleWeeks = 8) {
  const progression = [0, 0, 1, -1, 1, 1, 2, -1];
  return Array.from({ length: cycleWeeks }, (_, index) => progression[index] === -1
    ? deloadSets(sets)
    : Math.min(maxSets, sets + (progression[index] || 0)));
}
function calcLoad(max, reps, rpe, factor = 1) {
  if (!max) return ''; const repsDone = Number.parseInt(reps, 10) || 1; const rir = Math.max(0, 10 - Number(rpe || 7));
  return roundedWeight(max * Math.max(.5, Math.min(.92, 1 - (repsDone + rir) / 30)) * factor);
}
function dayFocus(day) { return liftName(day.exercises.find(exercise => exercise.lift)?.lift); }
function setDayWeight(exercise, week, value) { exercise.weekWeights ||= ['', '', '', '']; exercise.weekWeights[week - 1] = value; exercise.weight = exercise.weekWeights[0] || ''; }
function reprogramExercise(exercise, name, category) {
  const plan = selectedPlan(); const week = plan.currentWeek || 1; const cycleWeeks = plan.cycleWeeks || 4; const lift = catLift(category); const isMain = Boolean(lift); const variation = category.endsWith('Var'); const phase = plan.phase;
  const sets = isMain ? (phase === 'hypertrophy' ? (plan.level === 'beginner' ? 3 : 4) : (plan.level === 'advanced' ? 4 : 3)) : (phase === 'hypertrophy' ? (plan.level === 'beginner' ? 2 : 3) : 2);
  const reps = isMain ? (phase === 'hypertrophy' ? (variation ? 8 : plan.level === 'advanced' ? 5 : 6) : (variation ? 5 : plan.level === 'advanced' ? 3 : 4)) : (phase === 'hypertrophy' ? '8–12' : '6–10');
  const targets = phaseRpeTargets(phase, plan.level);
  const weekRpes = Array.from({ length: cycleWeeks }, (_, index) => isMain
    ? Math.max(6, targets[index] - (variation ? .5 : 0))
    : (index === 3 || index === 7 ? 6 : Math.max(6, (targets[index] || 7) - 1)));
  exercise.exercise = name; exercise.category = category; exercise.isMain = isMain; exercise.lift = lift; exercise.sets = sets; exercise.reps = reps;
  exercise.weekReps = Array(cycleWeeks).fill(reps); exercise.weekSets = buildWeekSets(sets, isMain ? (phase === 'hypertrophy' ? 6 : 5) : 3, cycleWeeks); exercise.weekRpes = weekRpes;
  exercise.weekWeights = Array.from({ length: cycleWeeks }, (_, index) => lift ? calcLoad(plan.maxes?.[lift], reps, weekRpes[index], variation ? .9 : 1) : '');
  exercise.actualWeights = Array(cycleWeeks).fill(''); exercise.actualRpes = Array(cycleWeeks).fill(''); exercise.done = false; exercise.rpe = exercise.weekRpes[week - 1]; exercise.weight = exercise.weekWeights[week - 1]; exercise.note ||= '';
}
function getStartLoad(plan, lift) { const main = plan.days.flatMap(day => day.exercises).find(exercise => exercise.lift === lift); return main?.weekWeights?.[0] || ''; }
function progressionLabel(plan) {
  const reps = plan.phase === 'hypertrophy' ? (plan.level === 'advanced' ? 5 : 6) : (plan.level === 'advanced' ? 3 : 4);
  const targets = phaseRpeTargets(plan.phase, plan.level);
  const endIndex = Math.min(6, (plan.cycleWeeks || 4) - 1);
  const one = 1 - (reps + 10 - targets[0]) / 30; const end = 1 - (reps + 10 - targets[endIndex]) / 30;
  return `+${Math.round((end / one - 1) * 100)}% bis W${endIndex + 1}`;
}function renderDashboard() {
  if (!state.current) { show('authView'); return; }
  show('dashboard'); const profile = user(); $('#userBadge').textContent = profile.email || profile.displayName || '';
  $('#hello').textContent = `Hey, ${(profile.displayName || 'Athlet').split(' ')[0]}.`;
  const plans = profile.plans || [];
  if (!plans.length) { $('#planList').innerHTML = '<div class="empty">Noch kein Trainingsplan. Erstelle deinen ersten Plan.</div>'; $('#activePlanSection').classList.add('hidden'); }
  else {
    $('#planList').innerHTML = plans.map(plan => {
      const selected = plan.id === profile.activePlanId;
      const starts = `S ${getStartLoad(plan, 'squat') || '–'} · B ${getStartLoad(plan, 'bench') || '–'} · D ${getStartLoad(plan, 'deadlift') || '–'} kg`;
      return `<article class="plan-summary-card ${selected ? 'selected' : ''}">
        <div class="plan-card-top"><button class="plan-select" data-activate-plan="${esc(plan.id)}"><strong>${esc(plan.name)}</strong>${selected ? '<span class="active-badge">AKTIV</span>' : ''}</button></div>
        <div class="plan-card-subtitle">${plan.frequency} Tage/Woche · Fokus ${esc(liftName(plan.focus))} · ${esc(phaseName(plan.phase))}</div>
        <div class="plan-hard-facts"><span><small>DAUER</small>${plan.cycleWeeks || 4} Wochen</span><span><small>PROGRESSION</small>${progressionLabel(plan)}</span><span><small>START S/B/D</small>${starts}</span></div>
      </article>`;
    }).join('');
    $$('[data-activate-plan]').forEach(button => button.onclick = () => { user().activePlanId = button.dataset.activatePlan; save(); renderDashboard(); });
    renderActivePlanDays();
  }
  renderHistory();
}
function renderActivePlanDays() {
  const plan = activePlan(); if (!plan) { $('#activePlanSection').classList.add('hidden'); return; }
  $('#activePlanSection').classList.remove('hidden'); $('#activePlanTitle').textContent = plan.name;
  $('#activePlanMeta').textContent = `${plan.frequency} Tage/Woche · Fokus ${liftName(plan.focus)} · ${phaseName(plan.phase)} · ${plan.cycleWeeks || 4}-Wochen-Block`;
  const dayIndex = plan.days.length ? (plan.nextDayIndex || 0) % plan.days.length : -1;
  const day = dayIndex >= 0 ? plan.days[dayIndex] : null;
  const week = plan.currentWeek || 1;
  if (day) {
    const details = day.exercises.map(exercise => {
      const sets = exercise.weekSets?.[week - 1] || exercise.sets;
      const reps = exercise.weekReps?.[week - 1] || exercise.reps;
      const weight = exercise.weekWeights?.[week - 1];
      const rpe = exercise.weekRpes?.[week - 1] || exercise.rpe;
      return `<div class="next-exercise-row"><strong>${esc(exercise.exercise)}</strong><span>${sets} × ${esc(reps)}${weight ? ` · ${esc(weight)} kg` : ''}${rpe ? ` · RPE ${esc(rpe)}` : ''}</span></div>`;
    }).join('');
    $('#nextSessionCard').innerHTML = `<article class="next-session-card"><div class="next-session-head"><div><div class="eyebrow">W${week}-D${dayIndex + 1} · ${esc(dayName(day.weekDay).toUpperCase())}</div><h4>${esc(day.name)}</h4><p>${esc(dayFocus(day))} · ${day.exercises.length} Übungen</p></div><button class="complete-session-button" id="completeNextSession" aria-label="Training abschließen">✓</button></div><div class="next-session-exercises">${details || '<span class="muted">Noch keine Übungen eingetragen.</span>'}</div><button class="button ghost next-session-open" id="openNextSession">Training öffnen</button></article>`;
    $('#completeNextSession').onclick = () => openSatisfaction(dayIndex);
    $('#openNextSession').onclick = () => openWorkout(dayIndex);
  } else $('#nextSessionCard').innerHTML = '<p class="empty">Dieser Plan hat noch keine Trainingstage.</p>';
  $('#progressGraphs').innerHTML = ['squat','bench','deadlift'].map(lift => renderLiftGraph(plan, lift)).join('');
}
function renderPlanManager() {
  const plans = user().plans || [];
  $('#planManagerList').innerHTML = plans.length ? plans.map(plan => `<article class="manager-plan-card"><div><strong>${esc(plan.name)}</strong><span>${plan.frequency} Tage · ${phaseName(plan.phase)} · Fokus ${liftName(plan.focus)}</span></div><button class="button ghost" data-edit-plan="${esc(plan.id)}">Plan bearbeiten ↗</button></article>`).join('') : '<p class="empty">Noch keine Pläne angelegt.</p>';
  $$('[data-edit-plan]').forEach(button => button.onclick = () => openPlanEditor(button.dataset.editPlan));
}
function plannedLiftWeights(plan, lift) {
  return Array.from({ length: plan.cycleWeeks || 4 }, (_, weekIndex) => {
    const rows = plan.days.flatMap(day => day.exercises).filter(exercise => exercise.lift === lift && exercise.category === `${lift}Main`)
      .map(exercise => Number(exercise.weekWeights?.[weekIndex])).filter(Number.isFinite).filter(value => value > 0);
    return rows.length ? rows.reduce((sum, value) => sum + value, 0) / rows.length : null;
  });
}
function estimateLift1Rm(weight, reps, rpe) {
  const load = Number(weight); const repetitions = Number.parseInt(reps, 10) || 1; const effort = Number(rpe) || 8;
  if (!Number.isFinite(load) || load <= 0) return null;
  const intensity = Math.max(.5, Math.min(.92, 1 - (repetitions + Math.max(0, 10 - effort)) / 30));
  return Math.round(load / intensity * 10) / 10;
}
function equivalentLoadAtRpe(weight, reps, actualRpe, targetRpe) {
  const max = estimateLift1Rm(weight, reps, actualRpe);
  if (!Number.isFinite(max)) return null;
  const repetitions = Number.parseInt(reps, 10) || 1;
  const targetIntensity = Math.max(.5, Math.min(.92, 1 - (repetitions + Math.max(0, 10 - Number(targetRpe || 8))) / 30));
  return Math.round(max * targetIntensity * 10) / 10;
}
function liftFromHistoryLoad(load) {
  if (['squat','bench','deadlift'].includes(load.lift)) return load.lift;
  if (load.category && ['squat','bench','deadlift'].some(lift => load.category === `${lift}Main`)) return load.category.replace('Main', '');
  return ({ 'Wettkampfkniebeuge': 'squat', 'Wettkampfbankdrücken': 'bench', 'Wettkampfkreuzheben': 'deadlift' })[load.exercise] || null;
}
function actualLiftWeeks(plan, lift) {
  const totalWeeks = plan.cycleWeeks || 4;
  const logs = (user().history || []).filter(entry => entry.planId === plan.id || entry.planName === plan.name || (!entry.planId && plan.days.some(day => day.name === entry.name)) || (!entry.planId && !entry.planName && String(plan.id).startsWith('legacy-plan')))
    .slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const values = Array(totalWeeks).fill(null);
  for (const day of plan.days) for (const exercise of day.exercises) {
    if (exercise.lift !== lift || exercise.category !== `${lift}Main`) continue;
    for (let index = 0; index < totalWeeks; index += 1) {
      const weight = exercise.actualWeights?.[index];
      if (!weight) continue;
      const achieved = equivalentLoadAtRpe(weight, exercise.reps, exercise.actualRpes?.[index] || exercise.weekRpes?.[index] || 8, exercise.weekRpes?.[index] || 8);
      if (Number.isFinite(achieved)) values[index] = achieved;
    }
  }
  let legacyWorkoutIndex = 0;
  for (const entry of logs) {
    let week = Number(entry.week);
    if (!week) { week = Math.min(totalWeeks, Math.floor(legacyWorkoutIndex / Math.max(1, plan.frequency || 4)) + 1); legacyWorkoutIndex += 1; }
    if (week < 1 || week > totalWeeks) continue;
    for (const load of entry.loads || []) {
      if (liftFromHistoryLoad(load) !== lift) continue;
      const matchingDay = plan.days[Number(entry.dayIndex)] || plan.days.find(day => day.name === entry.name);
      const matchingExercise = matchingDay?.exercises.find(exercise => exercise.lift === lift && exercise.category === `${lift}Main`);
      const planned = load.planned || matchingExercise?.weekWeights?.[week - 1];
      const complete = Number(entry.done) >= Number(entry.total) && Number(entry.total) > 0;
      const weight = load.actual || (complete ? planned : '');
      if (!weight) continue;
      const targetRpe = load.plannedRpe || matchingExercise?.weekRpes?.[week - 1] || matchingExercise?.rpe || cycleRpe(week);
      const repetitions = load.reps || matchingExercise?.reps || 1;
      const achieved = equivalentLoadAtRpe(weight, repetitions, load.actualRpe || targetRpe, targetRpe);
      if (Number.isFinite(achieved) && achieved > 0) values[week - 1] = achieved;
    }
  }
  return values;
}
function renderLiftGraph(plan, lift) {
  const planned = plannedLiftWeights(plan, lift);
  const actual = actualLiftWeeks(plan, lift);
  const total = plan.cycleWeeks || 4;
  const numbers = [...planned, ...actual].filter(Number.isFinite);
  let min = numbers.length ? Math.floor(Math.min(...numbers) / 5) * 5 : 0;
  let max = numbers.length ? Math.ceil(Math.max(...numbers) / 5) * 5 : 10;
  if (max - min < 10) { min -= 5; max += 5; }
  const width = 340, height = 160, left = 34, right = 10, top = 14, bottom = 28;
  const x = index => left + (total <= 1 ? 0 : index * (width - left - right) / (total - 1));
  const y = value => top + (max - value) * (height - top - bottom) / (max - min);
  const path = series => {
    let drawing = false;
    return series.map((value, index) => {
      if (!Number.isFinite(value)) { drawing = false; return ''; }
      const command = `${drawing ? 'L' : 'M'} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
      drawing = true; return command;
    }).filter(Boolean).join(' ');
  };
  const actualPath = path(actual);
  const projection = planned;
  const projectionPath = path(planned);
  const grid = [0, .5, 1].map(ratio => {
    const gy = top + ratio * (height - top - bottom);
    const label = Math.round(max - ratio * (max - min));
    return `<line x1="${left}" y1="${gy}" x2="${width - right}" y2="${gy}" class="graph-grid"/><text x="${left - 5}" y="${gy + 3}" class="graph-axis" text-anchor="end">${label}</text>`;
  }).join('');
  const actualDots = actual.map((value, index) => Number.isFinite(value) ? `<circle cx="${x(index)}" cy="${y(value)}" r="4" class="graph-actual-dot"><title>Woche ${index + 1}: ${value} kg erreicht${Number.isFinite(planned[index]) ? ` · Plan ${planned[index]} kg` : ''}</title></circle>` : '').join('');
  const planDots = projection.map((value, index) => Number.isFinite(value) ? `<circle cx="${x(index)}" cy="${y(value)}" r="3" class="graph-plan-dot"><title>Woche ${index + 1}: ${value} kg geplant</title></circle>` : '').join('');
  const labels = Array.from({ length: total }, (_, index) => `<text x="${x(index)}" y="${height - 6}" class="graph-axis" text-anchor="middle">W${index + 1}</text>`).join('');
  const latest = [...actual].reverse().find(Number.isFinite);
  const liftLabel = liftName(lift);
  return `<article class="progress-graph-card"><div class="progress-graph-head"><strong>${esc(liftLabel)}</strong><span>${latest ? `${latest} kg zuletzt` : 'Noch kein Ist-Wert'}</span></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(liftLabel)}: geplante und erreichte Arbeitsgewichte pro Woche">${grid}<path d="${projectionPath}" class="graph-projection"/><path d="${actualPath}" class="graph-actual"/>${planDots}${actualDots}${labels}</svg>
    <div class="graph-legend"><span><i class="legend-dot achieved"></i>Erreicht</span><span><i class="legend-dot projected"></i>Plan / Prognose</span></div></article>`;
}
function renderHistory() {
  const history = user().history || [];
  $('#historyList').innerHTML = history.length ? history.slice(0, 6).map(item => {
    const timestamp = new Date(item.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
    const liftFacts = (item.loads || []).filter(load => load.lift && (load.actual || load.planned)).map(load => `${liftName(load.lift)} ${load.actual || load.planned} kg`).filter((fact, index, list) => list.indexOf(fact) === index).join(' · ');
    const rating = Number(item.satisfaction);
    return `<article class="history-item"><strong>${esc(item.name || item.planName)} <span class="history-week">W${item.week || 1}</span></strong><span class="history-time">${esc(timestamp)}</span><span>${item.done}/${item.total} Übungen${liftFacts ? ` · ${esc(liftFacts)}` : ''}</span>${rating ? `<span class="history-rating">Zufriedenheit ${rating}/5 ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</span>` : ''}</article>`;
  }).join('') : '<div class="empty">Absolviere dein erstes Training und es erscheint hier.</div>';
}
function openPlanEditor(planId) { editingPlanId = planId; renderPlanEditor(); show('planEditorView'); }
function renderPlanEditor() {
  const plan = selectedPlan(); if (!plan) { renderDashboard(); return; }
  $('#editorPlanTitle').textContent = plan.name; $('#editorPlanName').value = plan.name;
  $('#editorPlanFacts').textContent = `${plan.frequency} Trainingstage · ${plan.cycleWeeks || 4} Wochen · ${phaseName(plan.phase)} · Fokus ${liftName(plan.focus)}`;
  $('#editorDayList').innerHTML = plan.days.map((day, index) => `<article class="editor-day-card">
    <div class="editor-day-top"><div><div class="eyebrow">${esc(dayName(day.weekDay).toUpperCase())} · TAG ${String(index + 1).padStart(2, '0')} · FOKUS ${esc(dayFocus(day).toUpperCase())}</div><h3>${esc(day.name)}</h3></div><button class="icon-button" data-edit-day="${index}" aria-label="Tag bearbeiten" title="Tag bearbeiten">✎</button></div>
    <div class="editor-day-exercises">${day.exercises.map(exercise => `<div class="editor-exercise-summary"><span>${esc(CAT_LABEL[exercise.category] || 'Assistenz')}</span><strong>${esc(exercise.exercise)}</strong><span>${exercise.sets} × ${esc(exercise.reps)} · ${exercise.weekWeights?.[0] || '–'} kg · RPE ${exercise.weekRpes?.[0] || exercise.rpe || 7}</span></div>`).join('') || '<p class="micro">Noch keine Übungen.</p>'}</div>
  </article>`).join('');
  $$('[data-edit-day]').forEach(button => button.onclick = () => openDayEditor(+button.dataset.editDay));
}
function openDayEditor(index) {
  editingDayIndex = index; const day = selectedPlan().days[index];
  $('#dayEditorTitle').textContent = day.name; $('#dayNameInput').value = day.name;
  $('#dayWeekday').innerHTML = WEEKDAYS.map((name, value) => `<option value="${value}" ${Number(day.weekDay) === value ? 'selected' : ''}>${name}</option>`).join('');
  renderDayExerciseRows(); show('dayEditorView');
}
function makeExerciseRow(exercise, index) {
  const options = EXERCISES.filter(item => categoryForExercise(item.name) === exercise.category); const week = selectedPlan().currentWeek || 1;
  return `<article class="plan-exercise-row" data-exercise-row="${index}">
    <div class="plan-exercise-selects"><label>Kategorie<select data-row-category="${index}">${TRAINING_CATS.map(([id, label]) => `<option value="${id}" ${id === exercise.category ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Übung<select data-row-exercise="${index}">${options.map(item => `<option value="${esc(item.name)}" ${item.name === exercise.exercise ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label></div>
    <div class="plan-exercise-prescription"><label>Sätze<input data-row-field="sets" data-row-index="${index}" type="number" min="1" max="10" value="${exercise.weekSets?.[week - 1] || exercise.sets}"></label><label>Wdh.<input data-row-field="reps" data-row-index="${index}" value="${esc(exercise.reps)}"></label><label>Gewicht (kg)<input data-row-field="weight" data-row-index="${index}" type="number" min="0" step="0.5" value="${esc(exercise.weekWeights?.[week - 1] ?? '')}" placeholder="–"></label><label>RPE<input data-row-field="rpe" data-row-index="${index}" type="number" min="5" max="10" step="0.5" value="${exercise.weekRpes?.[week - 1] || exercise.rpe || 7}"></label><button class="icon-button delete-exercise" data-delete-exercise="${index}" aria-label="Übung löschen" title="Übung löschen">×</button></div>
  </article>`;
}
function renderDayExerciseRows() {
  const day = selectedPlan().days[editingDayIndex]; $('#dayEditorTitle').textContent = day.name;
  $('#dayExerciseRows').innerHTML = day.exercises.map(makeExerciseRow).join('') || '<p class="empty">Noch keine Übungen in diesem Trainingstag.</p>';
  $$('[data-row-category]').forEach(select => select.onchange = () => {
    const exercise = day.exercises[+select.dataset.rowCategory]; const replacement = EXERCISES.find(item => categoryForExercise(item.name) === select.value);
    if (replacement) { reprogramExercise(exercise, replacement.name, select.value); markWeekEdited(); save(); renderDayExerciseRows(); renderPlanEditor(); }
  });
  $$('[data-row-exercise]').forEach(select => select.onchange = () => {
    const exercise = day.exercises[+select.dataset.rowExercise]; reprogramExercise(exercise, select.value, exercise.category); markWeekEdited(); save(); renderDayExerciseRows(); renderPlanEditor();
  });
  $$('[data-row-field]').forEach(input => input.onchange = () => {
    const exercise = day.exercises[+input.dataset.rowIndex]; const plan = selectedPlan(); const week = plan.currentWeek || 1; const field = input.dataset.rowField;
    if (field === 'sets') { exercise.sets = Number(input.value); exercise.weekSets ||= Array(plan.cycleWeeks || 4).fill(exercise.sets); exercise.weekSets[week - 1] = Number(input.value); }
    else if (field === 'reps') { exercise.reps = input.value; exercise.weekReps = Array(plan.cycleWeeks || 4).fill(input.value); if (exercise.lift) exercise.weekWeights = Array.from({ length: plan.cycleWeeks || 4 }, (_, index) => calcLoad(plan.maxes?.[exercise.lift], exercise.reps, exercise.weekRpes?.[index] || cycleRpe(index + 1), exercise.category.endsWith('Var') ? .9 : 1)); }
    else if (field === 'rpe') { exercise.weekRpes ||= Array.from({ length: plan.cycleWeeks || 4 }, (_, index) => cycleRpe(index + 1)); exercise.weekRpes[week - 1] = Number(input.value); exercise.rpe = Number(input.value); if (exercise.lift) setDayWeight(exercise, week, calcLoad(plan.maxes?.[exercise.lift], exercise.reps, Number(input.value), exercise.category.endsWith('Var') ? .9 : 1)); }
    else if (field === 'weight') setDayWeight(exercise, week, input.value);
    markWeekEdited(plan); save(); renderDayExerciseRows(); renderPlanEditor();
  });
  $$('[data-delete-exercise]').forEach(button => button.onclick = () => { day.exercises.splice(+button.dataset.deleteExercise, 1); markWeekEdited(); save(); renderDayExerciseRows(); renderPlanEditor(); });
}
function addExerciseToDay() {
  const plan = selectedPlan(); const day = plan.days[editingDayIndex]; const category = 'back'; const first = EXERCISES.find(item => categoryForExercise(item.name) === category); const cycleWeeks = plan.cycleWeeks || 4; const sets = plan.phase === 'hypertrophy' ? (plan.level === 'beginner' ? 2 : 3) : (plan.level === 'advanced' ? 3 : 2); const reps = plan.phase === 'hypertrophy' ? '8–15' : '6–12'; const targets = phaseRpeTargets(plan.phase, plan.level).slice(0, cycleWeeks);
  day.exercises.push({ exercise: first.name, category, sets, reps, weekReps: Array(cycleWeeks).fill(reps), rpe: targets[0], weekSets: buildWeekSets(sets, 3, cycleWeeks), weekRpes: targets, weekWeights: Array(cycleWeeks).fill(''), actualWeights: Array(cycleWeeks).fill(''), actualRpes: Array(cycleWeeks).fill(''), note: '', done: false, isMain: false, lift: null });
  markWeekEdited(plan); save(); renderDayExerciseRows(); renderPlanEditor();
}
function saveDayMetadata() {
  const day = selectedPlan().days[editingDayIndex]; day.name = $('#dayNameInput').value.trim() || `Tag ${String(editingDayIndex + 1).padStart(2, '0')}`; day.weekDay = Number($('#dayWeekday').value); markWeekEdited();
  $('#dayEditorTitle').textContent = day.name; save(); renderPlanEditor();
}
function deletePlan() {
  const profile = user(); const plan = selectedPlan(); if (!plan || !confirm(`Plan „${plan.name}“ löschen?`)) return;
  profile.plans = profile.plans.filter(item => item.id !== plan.id); if (profile.activePlanId === plan.id) profile.activePlanId = profile.plans[0]?.id || null;
  editingPlanId = null; save(); renderDashboard();
}
function updateOneRmPreview() {
  const data = new FormData($('#planForm'));
  const rows = ['squat','bench','deadlift'].map(lift => { const value = data.get(`${lift}Triple`); return value && Number(value) > 0 ? `${liftName(lift)} ${value} kg → ${estimateOneRmFrom3x3(value)} kg` : null; }).filter(Boolean);
  $('#oneRmPreview').textContent = rows.length ? `Geschätztes 1RM (RPE-8-Annahme): ${rows.join(' · ')}` : 'Geschätztes 1RM wird hier angezeigt. Letzter Satz ungefähr RPE 8.';
}
function updateTemplatePreview() {
  const data = new FormData($('#planForm'));
  $('#templatePreview').textContent = `Vorlage: ${data.get('frequency')} Tage · ${liftName(data.get('focus'))}-Spezialisierung · ${phaseName(data.get('phase'))} · ${levelName(data.get('level'))}. 8 Wochen, meist 4–5 Übungen je Einheit; Erfahrungslevel steuert Volumen und Ziel-RPE.`;
}
function createPlan(event) {
  event.preventDefault(); const form = new FormData(event.target); const frequency = Number(form.get('frequency')); const level = form.get('level'); const startDay = Number(form.get('startDay')); const focus = form.get('focus'); const phase = form.get('phase');
  const cycleWeeks = 8;
  const triples = { squat: Number(form.get('squatTriple')), bench: Number(form.get('benchTriple')), deadlift: Number(form.get('deadliftTriple')) };
  const maxes = { squat: estimateOneRmFrom3x3(triples.squat), bench: estimateOneRmFrom3x3(triples.bench), deadlift: estimateOneRmFrom3x3(triples.deadlift) };
  if (Object.values(triples).some(value => !Number.isFinite(value) || value <= 0)) return;
  const schedule = templateSchedule(frequency, focus);
  const liftMeta = {
    squat: { main: ['Wettkampfkniebeuge', 'squatMain'], variation: ['Pause Squat', 'squatVar'], accessories: ['quads', 'hamstrings', 'core', 'back'] },
    bench: { main: ['Wettkampfbankdrücken', 'benchMain'], variation: ['Pause Bankdrücken', 'benchVar'], accessories: ['back', 'triceps', 'shoulders', 'chest'] },
    deadlift: { main: ['Wettkampfkreuzheben', 'deadliftMain'], variation: ['Pause Kreuzheben', 'deadliftVar'], accessories: ['back', 'hamstrings', 'core', 'quads'] }
  };
  const weekRpes = phaseRpeTargets(phase, level);
  const slotsByLift = Object.fromEntries(['squat','bench','deadlift'].map(lift => [lift, []]));
  schedule.forEach((slots, dayIndex) => slots.forEach((slot, slotIndex) => slotsByLift[slot.lift].push({ ...slot, dayIndex, slotIndex })));
  const mainSetTargets = Object.fromEntries(['squat','bench','deadlift'].map(lift => [lift, weeklyMainSetTarget(phase, level, lift, focus)]));
  const setAllocation = {};
  Object.entries(slotsByLift).forEach(([lift, slots]) => {
    const maximum = phase === 'hypertrophy' ? 6 : 5;
    setAllocation[lift] = allocateLiftSets(slots, mainSetTargets[lift], maximum);
  });
  const accessoryCursor = { back: 0, triceps: 0, shoulders: 0, quads: 0, hamstrings: 0, core: 0 };
  const accessorySets = phase === 'hypertrophy' ? { beginner: 2, intermediate: 3, advanced: 3 }[level] : { beginner: 2, intermediate: 2, advanced: 3 }[level];
  const accessoryRpes = weekRpes.map((rpe, index) => index === 3 || index === 7 ? 6 : Math.max(6, rpe - 1));
  const days = schedule.map((slots, dayIndex) => {
    const exercises = slots.map(slot => {
      const meta = liftMeta[slot.lift]; const [exerciseName, category] = slot.variation ? meta.variation : meta.main;
      const allocationIndex = slotsByLift[slot.lift].findIndex(item => item.dayIndex === dayIndex && item.slotIndex === slots.indexOf(slot));
      const sets = setAllocation[slot.lift][allocationIndex] || 3;
      const reps = phase === 'hypertrophy' ? (slot.variation ? 8 : level === 'advanced' ? 5 : 6) : (slot.variation ? 5 : level === 'advanced' ? 3 : 4);
      const prescribedRpes = weekRpes.map(value => Math.max(6, value - (slot.variation ? .5 : 0)));
      const weekSets = buildWeekSets(sets, phase === 'hypertrophy' ? 6 : 5, cycleWeeks);
      const weekWeights = prescribedRpes.map(rpe => calcLoad(maxes[slot.lift], reps, rpe, slot.variation ? .9 : 1));
      return { exercise: exerciseName, category, sets, reps, weekReps: Array(cycleWeeks).fill(reps), rpe: prescribedRpes[0], weekSets, weekRpes: prescribedRpes, weight: weekWeights[0], weekWeights, actualWeights: Array(cycleWeeks).fill(''), actualRpes: Array(cycleWeeks).fill(''), note: '', done: false, isMain: true, lift: slot.lift };
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
      const candidates = EXERCISES.filter(item => categoryForExercise(item.name) === category);
      if (!candidates.length) return;
      const candidate = candidates[accessoryCursor[category]++ % candidates.length];
      const reps = phase === 'hypertrophy' ? '8–15' : '6–12';
      const weekSets = buildWeekSets(accessorySets, 3, cycleWeeks);
      exercises.push({ exercise: candidate.name, category, sets: accessorySets, reps, weekReps: Array(cycleWeeks).fill(reps), weekSets, weekRpes: accessoryRpes, rpe: accessoryRpes[0], weight: '', weekWeights: Array(cycleWeeks).fill(''), actualWeights: Array(cycleWeeks).fill(''), actualRpes: Array(cycleWeeks).fill(''), note: '', done: false, isMain: false, lift: null });
    });
    const focusLabel = slots.map(slot => liftName(slot.lift)).join(' + ');
    return { name: `Tag ${String(dayIndex + 1).padStart(2, '0')} · ${focusLabel}`, weekDay: (startDay + Math.floor(dayIndex * 7 / frequency)) % 7, exercises };
  });
  const actualWeeklyTargets = Object.fromEntries(Object.entries(slotsByLift).map(([lift, slots]) => [lift, setAllocation[lift].reduce((sum, value) => sum + value, 0)]));
  const templateId = `${frequency}d-${focus}-${phase}-${level}-v1`;
  const plan = { id: globalThis.crypto?.randomUUID?.() || `plan-${Date.now()}`, templateId, templateName: `${frequency} Tage · ${liftName(focus)}-Spezialisierung · ${phaseName(phase)} · ${levelName(level)}`, name: String(form.get('planName')).trim(), level, frequency, startDay, focus, phase, triples, maxes, setCaps: actualWeeklyTargets, weeklySetTargets: actualWeeklyTargets, currentWeek: 1, cycleWeeks, editedWeeks: [], days };
  const profile = user(); profile.plans ||= []; profile.plans.unshift(plan); profile.activePlanId = plan.id; editingPlanId = plan.id;
  save(); renderDashboard();
}
function openWorkout(index) {
  activeDay = index; editingWorkoutExercise = null; const plan = activePlan(); const day = plan.days[index]; $('#workoutTitle').textContent = day.name;
  $('#workoutKicker').textContent = `WOCHE ${plan.currentWeek || 1} · ${dayName(day.weekDay).toUpperCase()}`; drawWorkout(); show('workoutView');
}
function openSatisfaction(dayIndex) {
  pendingWorkoutDay = dayIndex;
  $('#satisfactionSlider').value = 3;
  updateSatisfactionLabel();
  $('#satisfactionModal').classList.remove('hidden');
}
let pendingWorkoutDay = null;
function updateSatisfactionLabel() {
  const value = Number($('#satisfactionSlider').value);
  const labels = { 1: 'Sehr schlecht', 2: 'Eher schlecht', 3: 'Okay', 4: 'Gut', 5: 'Sehr gut' };
  $('#satisfactionOutput').value = value;
  $('#satisfactionLabel').textContent = labels[value];
}
function drawWorkout() {
  const plan = activePlan(); const day = plan.days[activeDay]; const week = plan.currentWeek || 1;
  const headers = '<div class="training-table-header"><span>ÜBUNG</span><span>WDH.</span><span>RPE</span><span>GEWICHT</span><span></span></div>';
  const rows = day.exercises.map((exercise, index) => {
    const sets = exercise.weekSets?.[week - 1] || exercise.sets;
    const reps = exercise.weekReps?.[week - 1] || exercise.reps;
    const targetRpe = exercise.weekRpes?.[week - 1] || exercise.rpe || cycleRpe(week);
    const actualRpe = exercise.actualRpes?.[week - 1] || '';
    const plannedWeight = exercise.weekWeights?.[week - 1] ?? exercise.weight ?? '';
    const actualWeight = exercise.actualWeights?.[week - 1] ?? '';
    const editing = editingWorkoutExercise === index;
    return `<article class="training-row ${editing ? 'is-editing' : ''}">
      <div class="training-row-main"><div class="training-exercise"><strong>${esc(exercise.exercise)}</strong><small>${esc(CAT_LABEL[exercise.category] || 'Assistenz')} · ${sets} Sätze</small></div>
        <div class="training-cell"><span class="mobile-cell-label">WDH.</span>${esc(reps)}</div>
        <div class="training-cell"><span class="mobile-cell-label">RPE</span><span>${esc(targetRpe)}${actualRpe ? `<small class="actual-value">Ist ${esc(actualRpe)}</small>` : '<small>Ziel</small>'}</span></div>
        <div class="training-cell"><span class="mobile-cell-label">GEWICHT</span><span>${plannedWeight ? `${esc(plannedWeight)} kg` : '—'}${actualWeight ? `<small class="actual-value">Ist ${esc(actualWeight)} kg</small>` : '<small>Plan</small>'}</span></div>
        <button class="edit-mini training-edit-button" data-edit-workout-exercise="${index}" aria-label="${editing ? 'Schließen' : 'RPE und Gewicht bearbeiten'}" title="RPE und geschafftes Gewicht bearbeiten">${editing ? '×' : '✎'}</button>
      </div>
      ${editing ? `<div class="training-row-editor"><label>Geschafft (kg)<input data-workout-actual="weight" data-index="${index}" type="number" min="0" step="0.5" value="${esc(actualWeight)}" placeholder="Gewicht eintragen"></label><label>RPE geschafft<input data-workout-actual="rpe" data-index="${index}" type="number" min="5" max="10" step="0.5" value="${esc(actualRpe || targetRpe)}"></label><button class="button primary" data-save-workout-exercise="${index}" aria-label="Änderungen speichern">✓</button></div>` : ''}
    </article>`;
  }).join('');
  $('#exerciseList').innerHTML = headers + rows;
  $$('[data-edit-workout-exercise]').forEach(button => button.onclick = () => { editingWorkoutExercise = editingWorkoutExercise === Number(button.dataset.editWorkoutExercise) ? null : Number(button.dataset.editWorkoutExercise); drawWorkout(); });
  $$('[data-save-workout-exercise]').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.saveWorkoutExercise); const exercise = day.exercises[index];
    const weightInput = $(`[data-workout-actual="weight"][data-index="${index}"]`); const rpeInput = $(`[data-workout-actual="rpe"][data-index="${index}"]`);
    exercise.actualWeights ||= ['', '', '', '']; exercise.actualRpes ||= ['', '', '', ''];
    exercise.actualWeights[week - 1] = weightInput.value;
    exercise.actualRpes[week - 1] = Number(rpeInput.value);
    editingWorkoutExercise = null; save(); drawWorkout();
  });
}
function finishWorkout() {
  const plan = activePlan(); const dayIndex = pendingWorkoutDay ?? activeDay; const day = plan.days[dayIndex]; if (!day) return;
  const week = plan.currentWeek || 1; const finishedAt = new Date(); user().history ||= [];
  user().history.unshift({ planId: plan.id, planName: plan.name, week, dayIndex, name: day.name, date: finishedAt.toISOString(), done: day.exercises.length, total: day.exercises.length, satisfaction: Number($('#satisfactionSlider').value), loads: day.exercises.map(exercise => {
    const planned = exercise.weekWeights?.[week - 1] || '';
    const plannedRpe = exercise.weekRpes?.[week - 1] || exercise.rpe || cycleRpe(week);
    const reps = exercise.weekReps?.[week - 1] || exercise.reps;
    return { exercise: exercise.exercise, category: exercise.category, lift: exercise.lift || null, reps, plannedRpe, actualRpe: exercise.actualRpes?.[week - 1] || plannedRpe, planned, actual: exercise.actualWeights?.[week - 1] || planned };
  }) });
  day.exercises.forEach(exercise => { exercise.done = false; });
  plan.nextDayIndex = dayIndex + 1;
  if (plan.nextDayIndex >= plan.days.length) {
    plan.nextDayIndex = 0;
      if (week >= (plan.cycleWeeks || 4)) {
      plan.currentWeek = 1;
      plan.days.forEach(trainingDay => trainingDay.exercises.forEach(exercise => { if (exercise.actualWeights) exercise.actualWeights = Array(plan.cycleWeeks || 4).fill(''); if (exercise.actualRpes) exercise.actualRpes = Array(plan.cycleWeeks || 4).fill(''); }));
    } else plan.currentWeek = week + 1;
  }
  pendingWorkoutDay = null; $('#satisfactionModal').classList.add('hidden'); save(); renderDashboard();
}
function openCatalog() {
  const groups = [...new Set(EXERCISES.map(exercise => exercise.group))].sort();
  $('#muscleFilter').innerHTML = '<option value="">Alle Muskelgruppen</option>' + groups.map(group => `<option>${esc(group)}</option>`).join(''); renderCatalog(); show('exerciseView');
}
function renderCatalog() {
  const query = $('#exerciseSearch').value.toLowerCase(); const group = $('#muscleFilter').value;
  const list = EXERCISES.filter(exercise => (!group || exercise.group === group) && (!query || exercise.name.toLowerCase().includes(query) || exercise.group.toLowerCase().includes(query)));
  $('#catalog').innerHTML = list.map(exercise => `<article class="catalog-item"><strong>${esc(exercise.name)}</strong><span>${esc(CAT_LABEL[categoryForExercise(exercise.name)])} · ${esc(exercise.group)} · ${esc(exercise.muscle)}</span></article>`).join('') || '<p class="empty">Keine Übung gefunden.</p>';
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function signIn() {
  if (!window.mmgFirebase?.configured) { $('#authMessage').textContent = 'Firebase ist noch nicht eingerichtet. Prüfe config.js, Google-Anbieter und Firestore.'; return; }
  $('#googleSignIn').disabled = true; try { await window.mmgFirebase.signIn(); } catch (error) { $('#authMessage').textContent = error.message || 'Google-Anmeldung fehlgeschlagen.'; } finally { $('#googleSignIn').disabled = false; }
}
async function handleFirebaseUser(firebaseUser) {
  if (!firebaseUser) { state.current = null; state.users = {}; cacheState(); show('authView'); return; }
  $('#authMessage').textContent = 'Trainingsdaten werden geladen ...'; const fallback = state.users[firebaseUser.uid];
  try {
    const payload = await window.mmgFirebase.loadData(firebaseUser.uid); state.current = firebaseUser.uid;
    state.users = { [firebaseUser.uid]: buildProfile(firebaseUser, payload || {}, fallback) }; cacheState(); $('#syncStatus').textContent = 'SYNCED'; renderDashboard();
  } catch (error) {
    state.current = firebaseUser.uid; state.users = { [firebaseUser.uid]: buildProfile(firebaseUser, {}, fallback) };
    $('#authMessage').textContent = 'Cloud-Daten konnten nicht geladen werden. Prüfe Verbindung und Firestore-Regeln.'; renderDashboard();
  }
}
$('#googleSignIn').onclick = signIn;
$('#logout').onclick = async () => { try { await window.mmgFirebase?.signOut(); } finally { state.current = null; state.users = {}; cacheState(); show('authView'); } };
$('#newPlan').onclick = () => { $('#planForm').reset(); updateOneRmPreview(); updateTemplatePreview(); show('planView'); };
$('#managePlans').onclick = () => { renderPlanManager(); show('planManagerView'); };
$('#planForm').onsubmit = createPlan;
['squat','bench','deadlift'].forEach(lift => { $(`#planForm [name="${lift}Triple"]`).oninput = updateOneRmPreview; });
['frequency','level','focus','phase'].forEach(field => { $(`#planForm [name="${field}"]`).onchange = updateTemplatePreview; });
updateTemplatePreview();
$$('[data-back]').forEach(button => button.onclick = () => goBack(button.dataset.back));
$('#editorPlanName').onchange = () => { const plan = selectedPlan(); plan.name = $('#editorPlanName').value.trim() || plan.name; save(); renderPlanEditor(); };
$('#deletePlan').onclick = deletePlan;
$('#dayNameInput').onchange = saveDayMetadata; $('#dayWeekday').onchange = saveDayMetadata; $('#addExercise').onclick = addExerciseToDay;
$('#finishWorkout').onclick = () => openSatisfaction(activeDay);
$('#confirmWorkout').onclick = finishWorkout;
$('#cancelWorkout').onclick = () => { pendingWorkoutDay = null; $('#satisfactionModal').classList.add('hidden'); };
$('#satisfactionSlider').oninput = updateSatisfactionLabel;
$('#catalogLink').onclick = openCatalog; $('#exerciseSearch').oninput = renderCatalog; $('#muscleFilter').onchange = renderCatalog;
document.addEventListener('mmg-firebase-ready', () => {
  if (!window.mmgFirebase?.configured) { $('#authMessage').textContent = 'Firebase einrichten: config.js, Google-Anbieter und Firestore-Regeln.'; return; }
  window.mmgFirebase.watchAuth(handleFirebaseUser);
});
show('authView');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
