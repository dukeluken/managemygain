const EXERCISES = [
  ['Wettkampfkniebeuge','Kniebeuge','Kniebeuge'],['Pause Squat','Kniebeuge','Kniebeuge'],['Frontkniebeuge','Kniebeuge','Quadrizeps'],['High-Bar Kniebeuge','Kniebeuge','Quadrizeps'],['Safety-Bar Squat','Kniebeuge','Quadrizeps'],['Beinpresse','Quadrizeps','Quadrizeps'],['Bulgarian Split Squat','Quadrizeps','Quadrizeps'],['Beinstrecker','Quadrizeps','Quadrizeps'],['Rumänisches Kreuzheben','hintere Kette','Hamstrings/Gluteus'],['Beinbeuger liegend','hintere Kette','Hamstrings'],['Beinbeuger sitzend','hintere Kette','Hamstrings'],['Hip Thrust','hintere Kette','Gluteus'],['Good Morning','hintere Kette','Rückenstrecker'],['Wettkampfbankdrücken','Brust','Brust'],['Pause Bankdrücken','Brust','Brust'],['Schrägbankdrücken','Brust','Brust/Schulter'],['Kurzhantel-Bankdrücken','Brust','Brust'],['Kabel-Flys','Brust','Brust'],['Enges Bankdrücken','Trizeps','Trizeps'],['Trizepsdrücken am Kabel','Trizeps','Trizeps'],['Skull Crusher','Trizeps','Trizeps'],['Überkopf-Trizepsstrecken','Trizeps','Trizeps'],['Langhantelrudern','Rücken','oberer Rücken'],['Brustgestütztes Rudern','Rücken','oberer Rücken'],['Latzug','Rücken','Latissimus'],['Klimmzüge','Rücken','Latissimus'],['Face Pulls','Rücken','hintere Schulter'],['Wettkampfkreuzheben','Kreuzheben','hintere Kette'],['Pause Kreuzheben','Kreuzheben','hintere Kette'],['Block Pull','Kreuzheben','hintere Kette'],['Defizit-Kreuzheben','Kreuzheben','hintere Kette'],['Sumo Kreuzheben','Kreuzheben','hintere Kette'],['Seitheben','Schultern','seitliche Schulter'],['Schulterdrücken','Schultern','Schulter'],['Bauchrolle','Core','Bauch'],['Cable Crunch','Core','Bauch'],['Pallof Press','Core','Core'],['Wadenheben','Waden','Wade']
].map(([name, group, muscle]) => ({ name, group, muscle }));
const TRAINING_CATS = [['squatMain','Main Lift · Squat'],['squatVar','Squat-Assistenz'],['benchMain','Main Lift · Bench'],['benchVar','Bench-Assistenz'],['deadliftMain','Main Lift · Deadlift'],['deadliftVar','Deadlift-Assistenz'],['back','Assistenz · Rücken'],['chest','Assistenz · Brust'],['triceps','Assistenz · Trizeps'],['shoulders','Assistenz · Schultern'],['quads','Assistenz · Quadrizeps'],['hamstrings','Assistenz · hintere Kette'],['core','Assistenz · Core'],['calves','Assistenz · Waden']];
const CAT_LABEL = Object.fromEntries(TRAINING_CATS);
const TRASH_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const WEEKDAYS = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const KEY = 'mmg-firebase-state-v1';
let state = load();
let editingPlanId = null;
let editingDayIndex = 0;
let activeDay = 0;
let editingWorkoutExercise = null;
let authLoadUid = null;
let authLoadPromise = null;
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, current: null }; } catch { return { users: {}, current: null }; } }
function cacheState() { localStorage.setItem(KEY, JSON.stringify(state)); }
function user() { return state.users[state.current]; }
function getExerciseCatalog() { return user()?.exerciseCatalog || EXERCISES; }
function activePlan() { const profile = user(); return profile?.plans?.find(plan => plan.id === profile.activePlanId) || profile?.plans?.[0] || null; }
function selectedPlan() { return user()?.plans?.find(plan => plan.id === editingPlanId) || activePlan(); }
function save() {
  cacheState();
  if (!state.current || !user() || !window.mmgFirebase?.configured) return;
  $('#syncStatus').textContent = 'SYNC';
  const profile = user();
  window.mmgFirebase.saveData(state.current, { plans: profile.plans || [], activePlanId: profile.activePlanId || null, plan: activePlan() || null, history: profile.history || [], triples: profile.triples || {}, bodyWeight: profile.bodyWeight ?? '', exerciseCatalog: profile.exerciseCatalog || [] })
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
  const planTriples=plans.find(plan=>plan.id===activePlanId)?.triples || plans[0]?.triples || {};
  const profileTriples={...planTriples,...(fallback?.triples||{}),...(payload?.triples||{})};
  const defaultCatalog = EXERCISES.map((exercise, index) => ({ ...exercise, id: `builtin-${index + 1}` }));
  const exerciseCatalog = (payload?.exerciseCatalog || fallback?.exerciseCatalog || defaultCatalog).map((exercise, index) => ({ ...exercise, id: exercise.id || `exercise-${index + 1}` }));
  return { displayName: firebaseUser.displayName || fallback?.displayName || 'Athlet', email: firebaseUser.email || fallback?.email || '', plans, activePlanId, history: payload?.history || fallback?.history || [], triples: profileTriples, bodyWeight: payload?.bodyWeight ?? fallback?.bodyWeight ?? '', exerciseCatalog };
}
function show(id) {
  ['authView','dashboard','trainingPage','historyPage','planManagerView','settingsView','planView','planEditorView','dayEditorView','workoutView','exerciseView'].forEach(view => $('#' + view).classList.toggle('hidden', view !== id));
  $('#userBadge').classList.toggle('hidden', !state.current); $('#logout').classList.toggle('hidden', !state.current); $('#catalogLink').classList.toggle('hidden', !state.current);
  const nav = $('#bottomNav');
  nav.classList.toggle('hidden', !state.current || id === 'authView');
  const activePage = ({ workoutView:'trainingPage', planView:'planManagerView', planEditorView:'planManagerView', dayEditorView:'planManagerView', exerciseView:'settingsView' })[id] || id;
  $$('[data-page]').forEach(button => button.classList.toggle('active', button.dataset.page === activePage));
}
function goBack(target) {
  const destination = target || 'dashboard';
  if (destination === 'planEditorView') renderPlanEditor();
  else if (destination === 'dashboard') renderDashboard();
  else if (destination === 'trainingPage') renderTrainingPage();
  else if (destination === 'historyPage') renderHistory();
  else if (destination === 'planManagerView') renderPlanManager();
  else if (destination === 'settingsView') renderSettingsValues();
  show(destination);
}
function dayName(day) { return WEEKDAYS[Number(day)] || 'Tag auswählen'; }
function liftName(lift) { return ({ squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' })[lift] || lift || 'Assistenz'; }
function phaseName(phase) { return phase === 'hypertrophy' ? 'Hypertrophie' : 'Kraft'; }
function levelName(level) { return ({ beginner: 'Einsteiger', intermediate: 'Fortgeschritten', advanced: 'Erfahren' })[level] || 'Fortgeschritten'; }
function categoryForExercise(name) {
  const catalogExercise = getExerciseCatalog().find(item => item.name === name);
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
function catLift(category) { return ({ squatMain: 'squat', squatVar: 'squat', benchMain: 'bench', benchVar: 'bench', deadliftMain: 'deadlift', deadliftVar: 'deadlift' })[category] || null; }
function roundedWeight(value) { return value ? Math.round(value / 2.5) * 2.5 : ''; }
function parseKg(value) { const parsed=Number(String(value??'').replace(',','.'));return Number.isFinite(parsed)?parsed:NaN; }
function estimateOneRmFrom3x3(weight) { return Math.round(Number(weight) * (1 + 5 / 30) * 10) / 10; }
function cycleRpe(week) { return [6.5, 7, 8, 6][week - 1] || 7; }
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
function dayFocus(day) { return liftName(day.exercises.find(exercise => exercise.lift)?.lift); }
function setDayWeight(exercise, week, value) { const weeks=Number(selectedPlan()?.cycleWeeks)||4;exercise.weekWeights ||= [];while(exercise.weekWeights.length<weeks)exercise.weekWeights.push('');exercise.weekWeights[week - 1] = value; exercise.weight = exercise.weekWeights[0] || ''; }
function reprogramExercise(exercise, name, category) {
  const plan = selectedPlan(); const week = plan.currentWeek || 1; const cycleWeeks = plan.cycleWeeks || 4; const lift = catLift(category); const isMain = Boolean(lift); const variation = category.endsWith('Var'); const phase = plan.phase;
  const sets = isMain ? (phase === 'hypertrophy' ? (plan.level === 'beginner' ? 3 : 4) : (plan.level === 'advanced' ? 4 : 3)) : (phase === 'hypertrophy' ? (plan.level === 'beginner' ? 2 : 3) : 2);
  const reps = isMain ? (phase === 'hypertrophy' ? (variation ? 8 : plan.level === 'advanced' ? 5 : 6) : (variation ? 5 : plan.level === 'advanced' ? 3 : 4)) : (phase === 'hypertrophy' ? '8–15' : '6–12');
  const targets = phaseRpeTargets(phase, plan.level, cycleWeeks);
  const weekRpes = targets.map((value, index) => isMain ? Math.max(6, value - (variation ? .5 : 0)) : (index % 4 === 3 ? 6 : Math.max(6, value - 1)));
  exercise.exercise = name; exercise.category = category; exercise.isMain = isMain; exercise.lift = lift; exercise.sets = sets; exercise.reps = reps;
  exercise.weekReps = Array(cycleWeeks).fill(reps); exercise.weekSets = buildWeekSets(sets, isMain ? (phase === 'hypertrophy' ? 6 : 5) : 3, cycleWeeks); exercise.weekRpes = weekRpes;
  exercise.weekWeights = Array.from({ length: cycleWeeks }, (_, index) => lift ? calcLoad(plan.maxes?.[lift], reps, weekRpes[index], variation ? .9 : 1) : '');
  exercise.actualWeights = Array(cycleWeeks).fill(''); exercise.actualRpes = Array(cycleWeeks).fill(''); exercise.done = false; exercise.rpe = exercise.weekRpes[week - 1]; exercise.weight = exercise.weekWeights[week - 1]; exercise.note ||= '';
}
function getStartLoad(plan, lift) { const main = plan.days.flatMap(day => day.exercises).find(exercise => exercise.lift === lift); return main?.weekWeights?.[0] || ''; }
function progressionLabel(plan) {
  const reps = plan.phase === 'hypertrophy' ? (plan.level === 'advanced' ? 5 : 6) : (plan.level === 'advanced' ? 3 : 4);
  const cycleWeeks = plan.cycleWeeks || 4; const targets = phaseRpeTargets(plan.phase, plan.level, cycleWeeks); const endIndex = Math.max(0, cycleWeeks - 2);
  const one = 1 - (reps + 10 - targets[0]) / 30; const end = 1 - (reps + 10 - targets[endIndex]) / 30;
  return `+${Math.round((end / one - 1) * 100)}% bis W${endIndex + 1}`;
}function nextTrainingIndex(plan) { return plan?.days?.length ? (Number(plan.nextDayIndex || 0) % plan.days.length) : -1; }
function trainingCompletion(plan, week, dayIndex) { return (user().history || []).some(entry => entry.planId === plan.id && Number(entry.week) === Number(week) && Number(entry.dayIndex) === Number(dayIndex)); }
function renderSessionCard(plan, dayIndex, compact = false) {
  if (!plan || dayIndex < 0) return '<p class="empty">Erstelle oder aktiviere einen Trainingsplan, um hier deine Einheit zu sehen.</p>';
  const week = Number(plan.currentWeek || 1), day = plan.days[dayIndex];
  const content = day.exercises.map(exercise => {
    const sets=exercise.weekSets?.[week-1] || exercise.sets, reps=exercise.weekReps?.[week-1] || exercise.reps;
    const weight=exercise.weekWeights?.[week-1], rpe=exercise.weekRpes?.[week-1] || exercise.rpe;
    return `<div class="next-exercise-row"><strong>${esc(exercise.exercise)}</strong><span>${sets} × ${esc(reps)}${weight ? ` · ${esc(weight)} kg` : ''}${rpe ? ` · RPE ${esc(rpe)}` : ''}</span></div>`;
  }).join('');
  return `<article class="next-session-card ${compact?'compact-session':''}"><div class="next-session-head"><div><div class="eyebrow">W${week}-D${dayIndex+1} · ${esc(dayName(day.weekDay).toUpperCase())}</div><h4>${esc(day.name)}</h4><p>${esc(dayFocus(day))} · ${day.exercises.length} Übungen</p></div><button class="complete-session-button" data-complete-session="${dayIndex}" aria-label="Training abschließen">✓</button></div><div class="next-session-exercises">${content}</div><button class="button ghost next-session-open" data-open-session="${dayIndex}">Training öffnen</button></article>`;
}
function bindSessionCards() {
  $$('[data-open-session]').forEach(button => button.onclick = () => openWorkout(Number(button.dataset.openSession)));
  $$('[data-complete-session]').forEach(button => button.onclick = () => openSatisfaction(Number(button.dataset.completeSession)));
}
function renderPersonalStats() {
  const profile=user(), triples=profile.triples || {};
  const metrics=[['squat','Squat'],['bench','Bench'],['deadlift','Deadlift']].map(([key,label])=>{const triple=Number(triples[key]);const oneRm=triple>0?estimateOneRmFrom3x3(triple):null;return `<article class="personal-stat"><span>${label}</span><strong>${oneRm?`${esc(oneRm)} kg`:'—'}</strong><small>3×3 · ${triple>0?`${esc(triple)} kg`:'Kein Wert'}</small></article>`;});
  metrics.push(`<article class="personal-stat bodyweight-stat"><span>Körpergewicht</span><strong>${Number(profile.bodyWeight)>0?`${esc(profile.bodyWeight)} kg`:'—'}</strong><small>Aktueller Wert</small></article>`);
  $('#personalStats').innerHTML=metrics.join('');
}
function renderSettingsValues() {
  const profile=user(), triples=profile.triples || {};
  const values=[['squat','Squat 3×3'],['bench','Bench 3×3'],['deadlift','Deadlift 3×3'],['bodyWeight','Körpergewicht']];
  $('#settingsValues').innerHTML=values.map(([key,label])=>{const value=key==='bodyWeight'?profile.bodyWeight:triples[key];return `<button class="settings-value-row" data-edit-value="${key}"><span>${label}</span><strong>${Number(value)>0?`${esc(value)} kg`:'Wert eingeben'}</strong><span class="settings-edit-icon">✎</span></button>`;}).join('');
  $$('[data-edit-value]').forEach(button=>button.onclick=()=>openNumericKeypad(button.dataset.editValue));
}
let keypadTarget=null, keypadValue='', keypadFresh=false, keypadOnConfirm=null;
function showNumericKeypad(title,value,onConfirm) {
  keypadTarget='weight';keypadValue=String(value??'').replace('.',',');keypadFresh=true;keypadOnConfirm=onConfirm;
  $('#keypadTitle').textContent=title;$('#keypadDisplay').textContent=keypadValue||'0';$('#numericKeypad').classList.remove('hidden');
}
function openNumericKeypad(target) {
  const profile=user(),initial=target==='bodyWeight'?profile.bodyWeight:profile.triples?.[target];
  const title=({squat:'Squat 3×3',bench:'Bench 3×3',deadlift:'Deadlift 3×3',bodyWeight:'Körpergewicht'})[target];
  showNumericKeypad(title,initial,value=>{if(target==='bodyWeight')profile.bodyWeight=value;else{profile.triples||={};profile.triples[target]=value;}save();renderSettingsValues();renderPersonalStats();});
}
function openWeightKeypad(value,onConfirm,title='Gewicht (kg)') { showNumericKeypad(title,value,onConfirm); }
function updateKeypad(key) {
  if(key==='backspace'){keypadValue=keypadFresh?'':keypadValue.slice(0,-1);keypadFresh=false;}
  else if(key===','){if(keypadFresh){keypadValue='0,';keypadFresh=false;}else if(!keypadValue.includes(','))keypadValue=keypadValue?`${keypadValue},`:'0,';}
  else if(/^\d$/.test(key)){keypadValue=keypadFresh?key:`${keypadValue==='0'?'':keypadValue}${key}`;keypadFresh=false;}
  $('#keypadDisplay').textContent=keypadValue||'0';
}
function stepKeypad(amount) {
  const current=Number(keypadValue.replace(',','.'))||0;keypadValue=String(Math.max(0,Math.round((current+Number(amount))*100)/100)).replace('.',',');keypadFresh=false;$('#keypadDisplay').textContent=keypadValue;
}
function confirmKeypad() {
  const value=Number(keypadValue.replace(',','.'));if(!keypadTarget||!Number.isFinite(value)||value<=0)return;
  const callback=keypadOnConfirm;$('#numericKeypad').classList.add('hidden');keypadTarget=null;keypadOnConfirm=null;callback?.(value);
}
function renderDashboard() {
  if (!state.current) { show('authView'); return; }
  show('dashboard'); const profile=user(); $('#userBadge').textContent=profile.email || profile.displayName || '';
  $('#hello').textContent=`Hey, ${(profile.displayName||'Athlet').split(' ')[0]}.`; renderPersonalStats();
  const plan=activePlan();
  if(!plan){$('#activePlanSection').classList.add('hidden');$('#todaySessionCard').innerHTML='<p class="empty">Noch kein aktiver Plan. Erstelle unten unter „Pläne“ deinen ersten Plan.</p>';$('#upcomingSessions').innerHTML='';return;}
  const current=nextTrainingIndex(plan);$('#activePlanSection').classList.remove('hidden');$('#activePlanTitle').textContent=plan.name;$('#activePlanMeta').textContent=`${plan.frequency} Tage/Woche · Fokus ${liftName(plan.focus)} · ${phaseName(plan.phase)} · ${plan.cycleWeeks} Wochen`;
  $('#todaySessionCard').innerHTML=renderSessionCard(plan,current);bindSessionCards();
  const upcoming=Array.from({length:Math.min(3,Math.max(0,plan.days.length-1))},(_,offset)=>(current+offset+1)%plan.days.length);
  $('#upcomingSessions').innerHTML=upcoming.length?upcoming.map(index=>{const day=plan.days[index],main=day.exercises.find(ex=>ex.lift&&ex.category===`${ex.lift}Main`)||day.exercises.find(ex=>ex.isMain),week=(plan.currentWeek||1)-1;const sets=main?.weekSets?.[week]||main?.sets,reps=main?.weekReps?.[week]||main?.reps,weight=main?.weekWeights?.[week],rpe=main?.weekRpes?.[week]||main?.rpe;return `<button class="upcoming-row" data-upcoming="${index}"><span>W${plan.currentWeek}-D${index+1}</span><strong>${esc(day.name)}</strong><small>${esc(dayName(day.weekDay))} · ${main?`${sets} × ${esc(reps)}${weight?` · ${esc(weight)} kg`:''} · RPE ${esc(rpe||'—')}`:`${day.exercises.length} Übungen`}</small></button>`;}).join(''):'<p class="empty">Für diese Woche sind keine weiteren Einheiten geplant.</p>';
  $$('[data-upcoming]').forEach(button=>button.onclick=()=>openWorkout(Number(button.dataset.upcoming)));
  $('#progressGraphs').innerHTML=['squat','bench','deadlift'].map(lift=>renderLiftGraph(plan,lift)).join('');
}
function renderTrainingPage() {
  const plan=activePlan();
  if(!plan){$('#trainingPlanTitle').textContent='Kein aktiver Plan';$('#trainingPlanMeta').textContent='Aktiviere einen deiner Pläne, um deine Trainingswochen zu sehen.';$('#trainingSchedule').innerHTML='';return;}
  $('#trainingPlanTitle').textContent=plan.name;$('#trainingPlanMeta').textContent=`${plan.frequency} Tage/Woche · ${phaseName(plan.phase)} · ${plan.cycleWeeks} Wochen`;
  const current=nextTrainingIndex(plan);
  const weeks=Array.from({length:plan.cycleWeeks},(_,wi)=>`<details class="schedule-week"><summary>Woche ${wi+1}${wi+1===Number(plan.currentWeek||1)?' · Aktuell':''}</summary><div class="schedule-days">${plan.days.map((day,di)=>{const done=trainingCompletion(plan,wi+1,di);const active=wi+1===Number(plan.currentWeek||1)&&di===current;return `<article class="schedule-day ${done?'is-complete':''} ${active?'is-current':''}"><div class="schedule-day-title"><span>W${wi+1}-D${di+1} · ${esc(dayName(day.weekDay))}</span>${done?'<strong>✓ Abgeschlossen</strong>':active?'<strong>Als Nächstes</strong>':''}</div><h3>${esc(day.name)}</h3><ul>${day.exercises.map(ex=>`<li>${esc(ex.exercise)} <span>${ex.weekSets?.[wi]||ex.sets} × ${esc(ex.weekReps?.[wi]||ex.reps)} · ${ex.weekWeights?.[wi]?`${esc(ex.weekWeights[wi])} kg · `:''}RPE ${esc(ex.weekRpes?.[wi]||ex.rpe||'—')}</span></li>`).join('')}</ul>${active?`<button class="button primary full" data-open-session="${di}">Training öffnen</button>`:''}</article>`;}).join('')}</div></details>`).join('');
  $('#trainingSchedule').innerHTML=`<div class="schedule-current"><div class="eyebrow">ALS NÄCHSTES</div>${renderSessionCard(plan,current)}</div>${weeks}`;bindSessionCards();
}
function renderPlanManager() {
  const plans=user().plans||[];
  $('#planManagerList').innerHTML=plans.length?plans.map(plan=>{const selected=plan.id===user().activePlanId;return `<article class="manager-plan-card ${selected?'is-active':''}"><div><strong>${esc(plan.name)}${selected?' <span class="active-badge">AKTIV</span>':''}</strong><span>${plan.frequency} Tage · ${plan.cycleWeeks} Wochen · ${phaseName(plan.phase)} · Fokus ${liftName(plan.focus)} · ${levelName(plan.level)}</span></div><div class="manager-plan-actions"><button class="icon-button ${selected?'selected-plan-action':''}" data-activate-plan="${esc(plan.id)}" aria-label="Plan aktivieren" title="Plan aktivieren">ϟ</button><button class="icon-button" data-edit-plan="${esc(plan.id)}" aria-label="Plan bearbeiten" title="Plan bearbeiten">✎</button><button class="icon-button trash-button" data-delete-plan="${esc(plan.id)}" aria-label="Plan löschen" title="Plan löschen">${TRASH_ICON}</button></div></article>`;}).join(''):'<p class="empty">Noch keine Pläne angelegt.</p>';
  $$('[data-activate-plan]').forEach(button=>button.onclick=()=>{user().activePlanId=button.dataset.activatePlan;save();renderPlanManager();});
  $$('[data-edit-plan]').forEach(button=>button.onclick=()=>openPlanEditor(button.dataset.editPlan));
  $$('[data-delete-plan]').forEach(button=>button.onclick=()=>deletePlanById(button.dataset.deletePlan));
}function plannedLiftWeights(plan, lift) {
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
  const plan=activePlan();
  const history=plan?(user().history||[]).filter(item=>item.planId?item.planId===plan.id:item.planName?item.planName===plan.name:plan.days.some(day=>day.name===item.name)):[];
  $('#historyList').innerHTML = history.length ? history.map(item => {
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
  $('#editorLiftProgress').innerHTML=renderEditorLiftProgress(plan);
  $$('[data-edit-day]').forEach(button => button.onclick = () => openDayEditor(+button.dataset.editDay));
}
function renderEditorLiftProgress(plan) {
  const weeks=Number(plan.cycleWeeks)||4;
  return ['squat','bench','deadlift'].map(lift=>{
    const movements=plan.days.flatMap(day=>day.exercises).filter(ex=>ex.lift===lift&&ex.category===`${lift}Main`);
    if(!movements.length)return `<article class="lift-progression-card"><strong>${liftName(lift)}</strong><p class="micro">Keine Hauptübung im Plan.</p></article>`;
    const loads=Array.from({length:weeks},(_,wi)=>{const values=movements.map(ex=>Number(ex.weekWeights?.[wi])).filter(value=>Number.isFinite(value)&&value>0);return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;});
    const first=loads.find(value=>value!==null),peak=Math.max(...loads.filter(value=>value!==null),1),peakWeek=loads.lastIndexOf(peak),delta=first!==undefined?peak-first:0;
    const rows=Array.from({length:weeks},(_,wi)=>{const exposures=movements.map(ex=>{const reps=ex.weekReps?.[wi]||ex.reps,sets=ex.weekSets?.[wi]||ex.sets,weight=ex.weekWeights?.[wi];return `${sets}×${esc(reps)} · ${weight?`${esc(weight)} kg`:'—'}`;}).join(' / ');const load=loads[wi]||0;return `<div class="lift-progression-week"><span>W${wi+1}</span><i><b style="width:${load?Math.max(6,Math.round(load/max*100)):0}%"></b></i><small>${exposures}</small></div>`;}).join('');
    return `<article class="lift-progression-card"><header><strong>${liftName(lift)}</strong><span>${first!==undefined?`${delta>=0?'+':''}${Math.round(delta*10)/10} kg bis W${peakWeek+1}`:'Keine Lastwerte'}</span></header><div class="lift-progression-weeks">${rows}</div></article>`;
  }).join('');
}
function openDayEditor(index) {
  editingDayIndex = index; const day = selectedPlan().days[index];
  $('#dayEditorTitle').textContent = day.name; $('#dayNameInput').value = day.name;
  $('#dayWeekday').innerHTML = WEEKDAYS.map((name, value) => `<option value="${value}" ${Number(day.weekDay) === value ? 'selected' : ''}>${name}</option>`).join('');
  renderDayExerciseRows(); show('dayEditorView');
}
function makeExerciseRow(exercise, index) {
  const options = getExerciseCatalog().filter(item => categoryForExercise(item.name) === exercise.category); const week = selectedPlan().currentWeek || 1;
  return `<article class="plan-exercise-row" data-exercise-row="${index}">
    <div class="plan-exercise-selects"><label>Kategorie<select data-row-category="${index}">${TRAINING_CATS.map(([id, label]) => `<option value="${id}" ${id === exercise.category ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label><label>Übung<select data-row-exercise="${index}">${options.map(item => `<option value="${esc(item.name)}" ${item.name === exercise.exercise ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label></div>
    <div class="plan-exercise-prescription"><label>Sätze<input data-row-field="sets" data-row-index="${index}" type="number" min="1" max="10" value="${exercise.weekSets?.[week - 1] || exercise.sets}"></label><label>Wdh.<input data-row-field="reps" data-row-index="${index}" value="${esc(exercise.reps)}"></label><label>Gewicht (kg)<button type="button" class="weight-field" data-row-weight="${index}">${exercise.weekWeights?.[week - 1]?`${esc(exercise.weekWeights[week - 1])} kg`:'Wert eingeben'}</button></label><label>RPE<input data-row-field="rpe" data-row-index="${index}" type="number" min="5" max="10" step="0.5" value="${exercise.weekRpes?.[week - 1] || exercise.rpe || 7}"></label><button class="icon-button trash-button delete-exercise" data-delete-exercise="${index}" aria-label="Übung löschen" title="Übung löschen">${TRASH_ICON}</button></div>
  </article>`;
}
function renderDayExerciseRows() {
  const day = selectedPlan().days[editingDayIndex]; $('#dayEditorTitle').textContent = day.name;
  $('#dayExerciseRows').innerHTML = day.exercises.map(makeExerciseRow).join('') || '<p class="empty">Noch keine Übungen in diesem Trainingstag.</p>';
  $$('[data-row-category]').forEach(select => select.onchange = () => {
    const exercise = day.exercises[+select.dataset.rowCategory]; const replacement = getExerciseCatalog().find(item => categoryForExercise(item.name) === select.value);
    if (replacement) { reprogramExercise(exercise, replacement.name, select.value); markWeekEdited(); save(); renderDayExerciseRows(); renderPlanEditor(); }
  });
  $$('[data-row-exercise]').forEach(select => select.onchange = () => {
    const exercise = day.exercises[+select.dataset.rowExercise]; reprogramExercise(exercise, select.value, exercise.category); markWeekEdited(); save(); renderDayExerciseRows(); renderPlanEditor();
  });
  $$('[data-row-weight]').forEach(button=>button.onclick=()=>{const index=Number(button.dataset.rowWeight),exercise=day.exercises[index],plan=selectedPlan(),week=plan.currentWeek||1;openWeightKeypad(exercise.weekWeights?.[week-1]??'',value=>{setDayWeight(exercise,week,value);markWeekEdited(plan);save();renderDayExerciseRows();renderPlanEditor();},`${exercise.exercise} · Gewicht (kg)`);});
  $$('[data-row-field]').forEach(input => input.onchange = () => {
    const exercise = day.exercises[+input.dataset.rowIndex]; const plan = selectedPlan(); const week = plan.currentWeek || 1; const field = input.dataset.rowField;
    const cycleWeeks = plan.cycleWeeks || 4;
    if (field === 'sets') { exercise.sets = Number(input.value); exercise.weekSets ||= Array(cycleWeeks).fill(exercise.sets); exercise.weekSets[week - 1] = Number(input.value); }
    else if (field === 'reps') { exercise.reps = input.value; exercise.weekReps = Array(cycleWeeks).fill(input.value); if (exercise.lift) exercise.weekWeights = Array.from({ length: cycleWeeks }, (_, index) => calcLoad(plan.maxes?.[exercise.lift], exercise.reps, exercise.weekRpes?.[index] || cycleRpe(index + 1), exercise.category.endsWith('Var') ? .9 : 1)); }
    else if (field === 'rpe') { exercise.weekRpes ||= Array.from({ length: cycleWeeks }, (_, index) => cycleRpe(index + 1)); exercise.weekRpes[week - 1] = Number(input.value); exercise.rpe = Number(input.value); if (exercise.lift) setDayWeight(exercise, week, calcLoad(plan.maxes?.[exercise.lift], exercise.reps, Number(input.value), exercise.category.endsWith('Var') ? .9 : 1)); }
    else if (field === 'weight') setDayWeight(exercise, week, parseKg(input.value));
    markWeekEdited(plan); save(); renderDayExerciseRows(); renderPlanEditor();
  });
  $$('[data-delete-exercise]').forEach(button => button.onclick = () => { day.exercises.splice(+button.dataset.deleteExercise, 1); markWeekEdited(); save(); renderDayExerciseRows(); renderPlanEditor(); });
}
function addExerciseToDay() {
  const plan = selectedPlan(); const day = plan.days[editingDayIndex]; const category = 'back'; const first = getExerciseCatalog().find(item => categoryForExercise(item.name) === category); const cycleWeeks = plan.cycleWeeks || 4; const sets = plan.phase === 'hypertrophy' ? (plan.level === 'beginner' ? 2 : 3) : (plan.level === 'advanced' ? 3 : 2); const reps = plan.phase === 'hypertrophy' ? '8–15' : '6–12'; const targets = phaseRpeTargets(plan.phase, plan.level, cycleWeeks);
  day.exercises.push({ exercise: first.name, category, sets, reps, weekReps: Array(cycleWeeks).fill(reps), rpe: Math.max(6, targets[0] - 1), weekSets: buildWeekSets(sets, 3, cycleWeeks), weekRpes: targets.map((value, index) => index % 4 === 3 ? 6 : Math.max(6, value - 1)), weekWeights: Array(cycleWeeks).fill(''), actualWeights: Array(cycleWeeks).fill(''), actualRpes: Array(cycleWeeks).fill(''), note: '', done: false, isMain: false, lift: null });
  markWeekEdited(plan); save(); renderDayExerciseRows(); renderPlanEditor();
}
function saveDayMetadata() {
  const day = selectedPlan().days[editingDayIndex]; day.name = $('#dayNameInput').value.trim() || `Tag ${String(editingDayIndex + 1).padStart(2, '0')}`; day.weekDay = Number($('#dayWeekday').value); markWeekEdited();
  $('#dayEditorTitle').textContent = day.name; save(); renderPlanEditor();
}
function deletePlanById(planId) {
  const profile=user(),plan=profile.plans?.find(item=>item.id===planId);if(!plan)return;
  const linkedHistory=(profile.history||[]).filter(entry=>entry.planId===plan.id||(!entry.planId&&(entry.planName===plan.name||(!entry.planName&&plan.days.some(day=>day.name===entry.name))))).length;
  if(!confirm(`Plan „${plan.name}“ und ${linkedHistory} zugehörige Historieneinträge löschen?`))return;
  profile.plans=profile.plans.filter(item=>item.id!==plan.id);
  profile.history=(profile.history||[]).filter(entry=>entry.planId?entry.planId!==plan.id:entry.planName?entry.planName!==plan.name:!plan.days.some(day=>day.name===entry.name));
  if(profile.activePlanId===plan.id)profile.activePlanId=profile.plans[0]?.id||null;
  editingPlanId=null;save();renderPlanManager();show('planManagerView');
}
function deletePlan() { const plan=selectedPlan();if(plan)deletePlanById(plan.id); }
function updateOneRmPreview() {
  const data = new FormData($('#planForm'));
  const rows = ['squat','bench','deadlift'].map(lift => { const value = data.get(`${lift}Triple`),weight=parseKg(value); return value && weight > 0 ? `${liftName(lift)} ${value} kg → ${estimateOneRmFrom3x3(weight)} kg` : null; }).filter(Boolean);
  $('#oneRmPreview').textContent = rows.length ? `Geschätztes 1RM (RPE-8-Annahme): ${rows.join(' · ')}` : 'Geschätztes 1RM wird hier angezeigt. Letzter Satz ungefähr RPE 8.';
}
function updateTemplatePreview() {
  const data = new FormData($('#planForm'));
  const selectedWeeks = data.get('cycleWeeks');
  const weeks = selectedWeeks && selectedWeeks !== 'auto' ? Number(selectedWeeks) : templateCycleWeeks(Number(data.get('frequency')), data.get('level'));
  $('#templatePreview').textContent = `Vorlage: ${data.get('frequency')} Tage · ${liftName(data.get('focus'))}-Spezialisierung · ${phaseName(data.get('phase'))} · ${levelName(data.get('level'))} · ${weeks} Wochen. Je Einheit vier bis fünf Übungen; Level und Wochenfrequenz steuern Dauer, Verteilung und Belastung.`;
}
function createPlan(event) {
  event.preventDefault(); $('#planMessage').textContent = '';
  if (!state.current || !user()) { $('#planMessage').textContent = 'Bitte melde dich zuerst mit deinem Google-Konto an.'; return; }
  const form = new FormData(event.currentTarget || event.target); const frequency = Number(form.get('frequency')); const level = form.get('level'); const startDay = 1; const focus = form.get('focus'); const phase = form.get('phase'); const cycleWeeks = form.get('cycleWeeks') && form.get('cycleWeeks') !== 'auto' ? Number(form.get('cycleWeeks')) : templateCycleWeeks(frequency, level);
  const triples = { squat: parseKg(form.get('squatTriple')), bench: parseKg(form.get('benchTriple')), deadlift: parseKg(form.get('deadliftTriple')) };
  const maxes = { squat: estimateOneRmFrom3x3(triples.squat), bench: estimateOneRmFrom3x3(triples.bench), deadlift: estimateOneRmFrom3x3(triples.deadlift) };
  if (!String(form.get('planName') || '').trim()) { $('#planMessage').textContent = 'Bitte gib deinem Plan einen Namen.'; return; }
  if (Object.values(triples).some(value => !Number.isFinite(value) || value <= 0)) { $('#planMessage').textContent = 'Bitte gib für Squat, Bench und Deadlift jeweils ein 3×3-Arbeitsgewicht über 0 kg ein.'; return; }
  const schedule = templateSchedule(frequency, focus);
  const liftMeta = {
    squat: { main: ['Wettkampfkniebeuge', 'squatMain'], variation: ['Pause Squat', 'squatVar'], accessories: ['quads', 'hamstrings', 'core', 'back'] },
    bench: { main: ['Wettkampfbankdrücken', 'benchMain'], variation: ['Pause Bankdrücken', 'benchVar'], accessories: ['back', 'triceps', 'shoulders', 'chest'] },
    deadlift: { main: ['Wettkampfkreuzheben', 'deadliftMain'], variation: ['Pause Kreuzheben', 'deadliftVar'], accessories: ['back', 'hamstrings', 'core', 'quads'] }
  };
  const weekRpes = phaseRpeTargets(phase, level, cycleWeeks);
  const slotsByLift = Object.fromEntries(['squat','bench','deadlift'].map(lift => [lift, []]));
  schedule.forEach((slots, dayIndex) => slots.forEach((slot, slotIndex) => slotsByLift[slot.lift].push({ ...slot, dayIndex, slotIndex })));
  const mainSetTargets = Object.fromEntries(['squat','bench','deadlift'].map(lift => [lift, weeklyMainSetTarget(phase, level, lift, focus)]));
  const setAllocation = {};
  Object.entries(slotsByLift).forEach(([lift, slots]) => {
    const maximum = phase === 'hypertrophy' ? 6 : 5;
    setAllocation[lift] = allocateLiftSets(slots, mainSetTargets[lift], maximum);
  });
  const accessoryCursor = { back: 0, chest: 0, triceps: 0, shoulders: 0, quads: 0, hamstrings: 0, core: 0 };
  const accessorySets = phase === 'hypertrophy' ? { beginner: 2, intermediate: 3, advanced: 3 }[level] : { beginner: 2, intermediate: 2, advanced: 3 }[level];
  const accessoryRpes = weekRpes.map((rpe, index) => index % 4 === 3 ? 6 : Math.max(6, rpe - 1));
  const days = schedule.map((slots, dayIndex) => {
    const exercises = slots.map(slot => {
      const meta = liftMeta[slot.lift]; const [defaultExerciseName, category] = slot.variation ? meta.variation : meta.main;
      const exerciseName = getExerciseCatalog().find(item => categoryForExercise(item.name) === category)?.name || defaultExerciseName;
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
      const candidates = getExerciseCatalog().filter(item => categoryForExercise(item.name) === category);
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
      ${editing ? `<div class="training-row-editor"><label>Geschafft (kg)<input class="weight-field" data-workout-actual="weight" data-index="${index}" type="text" inputmode="none" readonly value="${esc(actualWeight)}" placeholder="Gewicht eintragen"></label><label>RPE geschafft<input data-workout-actual="rpe" data-index="${index}" type="number" min="5" max="10" step="0.5" value="${esc(actualRpe || targetRpe)}"></label><button class="button primary" data-save-workout-exercise="${index}" aria-label="Änderungen speichern">✓</button></div>` : ''}
    </article>`;
  }).join('');
  $('#exerciseList').innerHTML = headers + rows;
  $$('[data-edit-workout-exercise]').forEach(button => button.onclick = () => { editingWorkoutExercise = editingWorkoutExercise === Number(button.dataset.editWorkoutExercise) ? null : Number(button.dataset.editWorkoutExercise); drawWorkout(); });
  $$('[data-workout-actual="weight"]').forEach(input=>input.onclick=()=>openWeightKeypad(input.value,value=>{input.value=String(value).replace('.',',');},`${day.exercises[Number(input.dataset.index)].exercise} · Geschafft (kg)`));
  $$('[data-save-workout-exercise]').forEach(button => button.onclick = () => {
    const index = Number(button.dataset.saveWorkoutExercise); const exercise = day.exercises[index];
    const weightInput = $(`[data-workout-actual="weight"][data-index="${index}"]`); const rpeInput = $(`[data-workout-actual="rpe"][data-index="${index}"]`);
    exercise.actualWeights ||= ['', '', '', '']; exercise.actualRpes ||= ['', '', '', ''];
    exercise.actualWeights[week - 1] = parseKg(weightInput.value);
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
function renderCatalog() {
  const query = $('#exerciseSearch').value.toLowerCase(); const group = $('#muscleFilter').value;
  const list = getExerciseCatalog().filter(exercise => (!group || exercise.group === group) && (!query || exercise.name.toLowerCase().includes(query) || exercise.group.toLowerCase().includes(query) || exercise.muscle.toLowerCase().includes(query)));
  $('#catalog').innerHTML = list.map(exercise => `<article class="catalog-item"><div><strong>${esc(exercise.name)}</strong><span>${esc(CAT_LABEL[categoryForExercise(exercise.name)] || 'Assistenz')} · ${esc(exercise.group)} · ${esc(exercise.muscle)}</span></div><div class="catalog-actions"><button type="button" class="button ghost" data-edit-catalog="${esc(exercise.id)}" aria-label="${esc(exercise.name)} bearbeiten" title="Bearbeiten">✎</button><button type="button" class="icon-button trash-button" data-delete-catalog="${esc(exercise.id)}" aria-label="${esc(exercise.name)} löschen" title="Löschen">${TRASH_ICON}</button></div></article>`).join('') || '<p class="empty">Keine Übung gefunden.</p>';
  $$('[data-edit-catalog]').forEach(button => button.onclick = () => openCatalogEditor(button.dataset.editCatalog));
  $$('[data-delete-catalog]').forEach(button => button.onclick = () => deleteCatalogExercise(button.dataset.deleteCatalog));
}
function openCatalog() {
  const catalog = getExerciseCatalog();
  const groups = [...new Set(catalog.map(exercise => exercise.group))].sort();
  $('#muscleFilter').innerHTML = '<option value="">Alle Muskelgruppen</option>' + groups.map(group => `<option>${esc(group)}</option>`).join('');
  $('#exerciseSearch').value = ''; renderCatalog(); show('exerciseView');
}
function openCatalogEditor(id = '') {
  const form = $('#catalogEditorForm'); const exercise = getExerciseCatalog().find(item => item.id === id);
  form.reset(); form.elements.id.value = exercise?.id || '';
  form.elements.name.value = exercise?.name || '';
  const catalog = getExerciseCatalog();
  const groups = [...new Set(catalog.map(item => item.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  const muscles = [...new Set(catalog.map(item => item.muscle).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
  if (exercise?.group && !groups.includes(exercise.group)) groups.push(exercise.group);
  if (exercise?.muscle && !muscles.includes(exercise.muscle)) muscles.push(exercise.muscle);
  form.elements.group.innerHTML = groups.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  form.elements.muscle.innerHTML = muscles.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
  form.elements.group.value = exercise?.group || groups[0] || '';
  form.elements.muscle.value = exercise?.muscle || muscles[0] || '';
  form.elements.category.innerHTML = TRAINING_CATS.map(([key, label]) => `<option value="${key}" ${key === (exercise ? categoryForExercise(exercise.name) : 'back') ? 'selected' : ''}>${esc(label)}</option>`).join('');
  $('#catalogEditorTitle').textContent = exercise ? 'Übung bearbeiten' : 'Übung hinzufügen';
  $('#catalogEditorModal').classList.remove('hidden'); form.elements.name.focus();
}
function deleteCatalogExercise(id) {
  const catalog = getExerciseCatalog(); const exercise = catalog.find(item => item.id === id);
  if (!exercise || !confirm(`„${exercise.name}“ aus deinem Übungskatalog löschen?`)) return;
  user().exerciseCatalog = catalog.filter(item => item.id !== id); save(); openCatalog();
}
function saveCatalogExercise(event) {
  event.preventDefault();
  const form = event.currentTarget; const values = new FormData(form); const catalog = [...getExerciseCatalog()];
  const id = String(values.get('id') || globalThis.crypto?.randomUUID?.() || `exercise-${Date.now()}`);
  const name = String(values.get('name') || '').trim();
  if (catalog.some(item => item.id !== id && item.name.toLowerCase() === name.toLowerCase())) { alert('Eine Übung mit diesem Namen ist bereits vorhanden.'); return; }
  const exercise = { id, name, category: String(values.get('category')), group: String(values.get('group')).trim(), muscle: String(values.get('muscle')).trim() };
  const index = catalog.findIndex(item => item.id === id);
  if (index >= 0) catalog[index] = exercise; else catalog.push(exercise);
  user().exerciseCatalog = catalog; save(); $('#catalogEditorModal').classList.add('hidden'); openCatalog();
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
async function signIn() {
  if (!window.mmgFirebase?.configured) { $('#authMessage').textContent = 'Firebase ist noch nicht eingerichtet. Prüfe config.js, Google-Anbieter und Firestore.'; return; }
  $('#googleSignIn').disabled = true; $('#authMessage').textContent = 'Google-Anmeldung wird geöffnet …';
  try {
    const credential = await window.mmgFirebase.signIn();
    if (credential?.user) await handleFirebaseUser(credential.user);
  }
  catch (error) {
    console.error('Google sign-in failed', error);
    $('#authMessage').textContent = error.code === 'auth/unauthorized-domain'
      ? `Diese Website ist in Firebase nicht als autorisierte Domain eingetragen${location.hostname ? ` (${location.hostname})` : ''}.`
      : error.code === 'auth/popup-blocked'
      ? 'Chrome hat das Anmeldefenster blockiert. Erlaube Pop-ups für diese Website und versuche es erneut.'
      : error.code === 'auth/popup-closed-by-user'
        ? 'Das Google-Anmeldefenster wurde geschlossen, bevor die Anmeldung abgeschlossen war.'
        : `Google-Anmeldung fehlgeschlagen${error.code ? ` (${error.code})` : ''}: ${error.message || 'Bitte erneut versuchen.'}`;
  }
  finally { $('#googleSignIn').disabled = false; }
}
async function handleFirebaseUser(firebaseUser) {
  if (!firebaseUser) {
    // Ignore a stale signed-out notification if Firebase has already accepted the popup result.
    if (window.mmgFirebase?.currentUser?.()) return;
    authLoadUid = null; authLoadPromise = null; state.current = null; state.users = {}; cacheState(); show('authView'); return;
  }
  const uid = firebaseUser.uid;
  if (authLoadUid === uid && authLoadPromise) return authLoadPromise;
  authLoadUid = uid; state.current = uid;
  const fallback = state.users[uid];
  state.users = { [uid]: buildProfile(firebaseUser, {}, fallback) };
  cacheState();
  $('#syncStatus').textContent = 'SYNC';
  renderDashboard();
  authLoadPromise = (async () => {
    try {
      const payload = await window.mmgFirebase.loadData(uid);
      if (state.current !== uid) return;
      state.users = { [uid]: buildProfile(firebaseUser, payload || {}, fallback) }; cacheState(); $('#syncStatus').textContent = 'SYNCED'; renderDashboard();
    } catch (error) {
      console.error('Loading Firestore profile failed', error);
      if (state.current === uid) $('#syncStatus').textContent = 'OFFLINE';
    }
  })();
  try { await authLoadPromise; }
  finally { if (authLoadUid === uid) { authLoadUid = null; authLoadPromise = null; } }
}
$('#googleSignIn').onclick = signIn;
$('#logout').onclick = async () => { try { await window.mmgFirebase?.signOut(); } finally { state.current = null; state.users = {}; cacheState(); show('authView'); } };
$('#newPlanCircle').onclick = () => {
  $('#planForm').reset();$('#planMessage').textContent='';
  const defaults=user()?.triples || {};
  ['squat','bench','deadlift'].forEach(lift=>{const input=$(`#planForm [name="${lift}Triple"]`);input.value=String(defaults[lift]||activePlan()?.triples?.[lift]||'').replace('.',',');});
  updateOneRmPreview();updateTemplatePreview();show('planView');
};
$('#planForm').onsubmit = event => {
  try { createPlan(event); }
  catch (error) {
    console.error('Plan creation failed', error);
    $('#planMessage').textContent = `Der Plan konnte nicht erstellt werden: ${error.message || 'Bitte prüfe deine Eingaben.'}`;
  }
};
$('#planForm').addEventListener('invalid', () => { $('#planMessage').textContent = 'Bitte fülle alle Pflichtfelder aus und prüfe die drei 3×3-Gewichte.'; }, true);
$$('[data-generator-weight]').forEach(input=>input.onclick=()=>openWeightKeypad(input.value,value=>{input.value=String(value).replace('.',',');updateOneRmPreview();},`${liftName(input.dataset.generatorWeight)} 3×3 (kg)`));
['frequency','level','focus','phase','cycleWeeks'].forEach(field => { $(`#planForm [name="${field}"]`).onchange = updateTemplatePreview; });
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
$('#openCatalogFromSettings').onclick = openCatalog;
$('#addCatalogExercise').onclick = () => openCatalogEditor();
$('#catalogEditorForm').onsubmit = saveCatalogExercise;
$('#cancelCatalogEdit').onclick = () => $('#catalogEditorModal').classList.add('hidden');
$('#catalogEditorModal').onclick = event => { if (event.target === $('#catalogEditorModal')) $('#catalogEditorModal').classList.add('hidden'); };
$$('[data-page]').forEach(button => button.onclick = () => {
  const page = button.dataset.page;
  if (page === 'dashboard') renderDashboard();
  else if (page === 'trainingPage') renderTrainingPage();
  else if (page === 'historyPage') renderHistory();
  else if (page === 'planManagerView') renderPlanManager();
  else if (page === 'settingsView') renderSettingsValues();
  show(page);
});
$$('[data-key]').forEach(button=>button.onclick=()=>updateKeypad(button.dataset.key));
$$('[data-weight-step]').forEach(button=>button.onclick=()=>stepKeypad(button.dataset.weightStep));
$('#keypadConfirm').onclick=confirmKeypad;
$('#keypadCancel').onclick=()=>{$('#numericKeypad').classList.add('hidden');keypadTarget=null;keypadOnConfirm=null;};
$('#settingsLogout').onclick = () => $('#logout').click();
document.addEventListener('mmg-firebase-ready', () => {
  if (!window.mmgFirebase?.configured) { $('#authMessage').textContent = 'Firebase einrichten: config.js, Google-Anbieter und Firestore-Regeln.'; return; }
  window.mmgFirebase.watchAuth(handleFirebaseUser);
  window.mmgFirebase.completeRedirectSignIn?.().then(result => {
    if (result?.user) return handleFirebaseUser(result.user);
  }).catch(error => {
    console.error('Firebase redirect result failed', error);
    $('#authMessage').textContent = `Firebase konnte die Anmeldung nicht abschließen${error.code ? ` (${error.code})` : ''}: ${error.message || 'Bitte erneut anmelden.'}`;
  });
});
show('authView');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
