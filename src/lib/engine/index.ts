// Brücke zwischen Engine und App: alles, was Bildschirme über einen Plan wissen
// müssen, als reine Funktionen (ohne Firebase, ohne DOM).
//
// Zwei Engines erzeugen Programme im selben Format:
//   - powerlifting.js (aus v1): Kniebeuge/Bankdrücken/Kreuzheben, Wettkampf-Logik
//   - splits.ts: Muskelaufbau, allgemeine Kraft, Fitness
// Gewichte rechnet für beide loads.ts aus den Bestwerten.
import * as engine from './powerlifting.js';
import {
	ALL_LIFTS,
	applyLoads,
	applyLoadsToProgram,
	expectedMax,
	loadRef,
	rawLoad,
	setMaxes,
	updateMax
} from './loads.ts';
import { generateSplitProgram, phaseFor } from './splits.ts';
import type {
	Bests,
	Block,
	Experience,
	Feel,
	Goal,
	MainLift,
	Plan,
	PlanRequest,
	Program,
	ProgramDay,
	ProgramExercise,
	Workout
} from '#lib/data/types.ts';

// Die Powerlifting-Engine ist JavaScript ohne Typen; hier die genutzten Signaturen.
const pl = engine as unknown as {
	generatePlan(options: Record<string, unknown>): unknown;
	rpePercent(reps: number, rpe: number): number;
	EXERCISES: { name: string; group: string; category?: string }[];
	categoryInCatalog(name: string): string;
};

export { ALL_LIFTS, loadRef } from './loads.ts';
export { DAYS_FOR_GOAL, splitLabel } from './splits.ts';
export { e1rm } from './loads.ts';

export const LIFT_LABEL: Record<MainLift, string> = {
	squat: 'Kniebeuge',
	bench: 'Bankdrücken',
	deadlift: 'Kreuzheben',
	press: 'Schulterdrücken'
};

export const GOAL_LABEL: Record<Goal, string> = {
	hypertrophy: 'Muskelaufbau',
	strength: 'Kraft',
	powerlifting: 'Powerlifting',
	fitness: 'Fitness'
};

export const BLOCK_LABEL: Record<Block, string> = {
	hypertrophy: 'Aufbaublock',
	strength: 'Kraftblock'
};

export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const WEEKDAY_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
/** Anzeigereihenfolge der Woche: Montag zuerst. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Bei welchen Zielen es Blöcke zur Auswahl gibt. */
export function hasBlocks(goal: Goal): boolean {
	return goal === 'strength' || goal === 'powerlifting';
}

/** Welche Bestwerte für ein Ziel abgefragt werden. */
export function liftsForGoal(goal: Goal): MainLift[] {
	return goal === 'powerlifting' ? ['squat', 'bench', 'deadlift'] : ALL_LIFTS;
}

// ---------- Plan erzeugen ----------

// Für alle außer Powerliftern heißen die Wettkampfübungen einfach nach der Übung.
const PLAIN_NAMES: Record<string, string> = {
	Wettkampfkniebeuge: 'Kniebeuge',
	Wettkampfbankdrücken: 'Bankdrücken',
	Wettkampfkreuzheben: 'Kreuzheben'
};

export function createProgram(req: PlanRequest): Program {
	if (req.goal !== 'powerlifting') return generateSplitProgram(req);
	const block = req.block ?? 'strength';
	// Die Powerlifting-Engine erwartet 3er-Gewichte bei RPE 8; danach setzen wir die
	// Bestwerte exakt und rechnen alle Gewichte mit dem gemeinsamen Lastmodell.
	const triples = Object.fromEntries(
		(['squat', 'bench', 'deadlift'] as const).map((l) => [l, (req.bests[l] ?? 0) * pl.rpePercent(3, 8)])
	);
	const program = pl.generatePlan({
		frequency: req.daysPerWeek,
		level: req.experience,
		focus: req.focus ?? 'squat',
		phase: block,
		cycleWeeks: req.weeks,
		triples,
		name: '',
		deadliftStance: req.deadliftStance ?? 'conventional'
	}) as Program;
	program.engine = 'powerlifting-v2';
	program.goal = 'powerlifting';
	setMaxes(
		program,
		{ squat: req.bests.squat ?? null, bench: req.bests.bench ?? null, deadlift: req.bests.deadlift ?? null },
		0,
		req.experience
	);
	return program;
}

export function planName(req: PlanRequest): string {
	const goal = GOAL_LABEL[req.goal];
	if (hasBlocks(req.goal)) return `${goal} · ${BLOCK_LABEL[req.block ?? 'strength']}`;
	return `${goal} · ${req.daysPerWeek} Tage`;
}

/** Blockart eines Plans (für Anzeige), oder null. */
export function blockOf(plan: Pick<Plan, 'goal' | 'request'>): Block | null {
	if (!hasBlocks(plan.goal)) return plan.goal === 'hypertrophy' ? 'hypertrophy' : null;
	return plan.request?.block ?? 'strength';
}

export function blockDescription(plan: Pick<Plan, 'goal' | 'request'>): string {
	const phase = phaseFor(plan.goal, plan.request?.block);
	if (phase === 'fitness') return 'Moderate Gewichte, saubere Technik, regelmäßig dranbleiben';
	if (phase === 'hypertrophy') return 'Mehr Wiederholungen und Sätze für Muskelmasse';
	return 'Weniger Wiederholungen, schwerere Gewichte';
}

// ---------- Datum und Woche ----------

export function isoDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export function parseIsoDate(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Montag der Woche, in der `date` liegt. */
export function mondayOf(date: Date): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const shift = (d.getDay() + 6) % 7;
	d.setDate(d.getDate() - shift);
	return d;
}

/** 0-basierte Planwoche für ein Datum. Kann negativ oder ≥ Planlänge sein. */
export function weekIndexAt(plan: Pick<Plan, 'startDate'>, date: Date): number {
	const start = parseIsoDate(plan.startDate).getTime();
	const monday = mondayOf(date).getTime();
	return Math.round((monday - start) / (7 * 24 * 3600 * 1000));
}

export function weekCount(program: Program): number {
	return Number(program.cycleWeeks) || program.weekTypes?.length || 1;
}

export function isDeload(program: Program, weekIndex: number): boolean {
	return program.weekTypes?.[weekIndex] === 'deload';
}

// ---------- Vorgaben ----------

export interface Prescription {
	exercise: string;
	lift: MainLift | null;
	isMain: boolean;
	sets: number;
	reps: string;
	rpe: number;
	weight: number | null;
}

function weekValue<T>(list: T[] | undefined, weekIndex: number, fallback: T): T {
	if (!Array.isArray(list) || !list.length) return fallback;
	return list[Math.min(weekIndex, list.length - 1)] ?? fallback;
}

export function prescribe(ex: ProgramExercise, weekIndex: number): Prescription {
	const weight = weekValue(ex.weekWeights, weekIndex, '');
	return {
		exercise: ex.exercise,
		lift: ex.lift,
		isMain: ex.isMain,
		sets: Number(weekValue(ex.weekSets, weekIndex, 3)) || 3,
		reps: String(weekValue(ex.weekReps, weekIndex, '5')),
		rpe: Number(weekValue(ex.weekRpes, weekIndex, 7)) || 7,
		weight: typeof weight === 'number' && weight > 0 ? weight : null
	};
}

export function dayPrescription(program: Program, weekIndex: number, dayIndex: number): Prescription[] {
	const day = program.days[dayIndex];
	return day ? day.exercises.map((ex) => prescribe(ex, weekIndex)) : [];
}

/** RPE lesbar, z. B. 7,5. */
export function rpeLabel(rpe: number): string {
	return String(Math.round(rpe * 2) / 2).replace('.', ',');
}

/** Vorgabe kurz: „4 × 5 · 100 kg · RPE 7,5“. */
export function amountLabel(p: { sets: number; reps: string; weight: number | null; rpe: number }): string {
	return `${p.sets} × ${p.reps}${p.weight ? ` · ${kg(p.weight)} kg` : ''} · RPE ${rpeLabel(p.rpe)}`;
}

/** Lesbarer Titel aus den Hauptübungen des Tages, z. B. „Kniebeuge & Bankdrücken“. */
export function dayTitle(day: ProgramDay): string {
	if (day.title) return day.title;
	const lifts = [...new Set(day.exercises.filter((e) => e.isMain && e.lift).map((e) => e.lift as MainLift))];
	return lifts.length ? lifts.map((l) => LIFT_LABEL[l]).join(' & ') : day.name;
}

/** Die erste Hauptübung im Wettkampfstil (für die große Zahl). */
export function heroOf(list: Prescription[]): Prescription | null {
	return list.find((p) => p.isMain && p.weight) ?? list[0] ?? null;
}

export function estimatedMinutes(list: Prescription[]): number {
	const sets = list.reduce((sum, p) => sum + p.sets, 0);
	return Math.round((sets * 2.6) / 5) * 5;
}

// ---------- Woche und heutiges Training ----------

export type DayStatus = 'done' | 'today' | 'next' | 'planned' | 'missed' | 'rest';

export interface WeekSlot {
	weekDay: number;
	dayIndex: number | null;
	status: DayStatus;
	workout: Workout | null;
}

export function workoutFor(workouts: Workout[], weekIndex: number, dayIndex: number): Workout | null {
	return workouts.find((w) => w.weekIndex === weekIndex && w.dayIndex === dayIndex) ?? null;
}

/**
 * Nächste offene Einheit der Woche. Bewusst nachsichtig: wer Dienstag verpasst,
 * bekommt Dienstags-Training am Mittwoch angeboten statt einer Lücke.
 */
export function nextDayIndex(program: Program, workouts: Workout[], weekIndex: number): number | null {
	const order = program.days
		.map((day, index) => ({ index, pos: WEEK_ORDER.indexOf(day.weekDay) }))
		.sort((a, b) => a.pos - b.pos);
	const open = order.find(({ index }) => !workoutFor(workouts, weekIndex, index)?.finishedAt);
	return open ? open.index : null;
}

export function weekSlots(plan: Plan, workouts: Workout[], weekIndex: number, today: Date): WeekSlot[] {
	const current = weekIndexAt(plan, today);
	const next = weekIndex === current ? nextDayIndex(plan.program, workouts, weekIndex) : null;
	const todayPos = WEEK_ORDER.indexOf(today.getDay());
	// Einheiten vor dem Erstellen des Plans gelten nicht als verpasst.
	const created = plan.createdAt ? isoDate(new Date(plan.createdAt)) : '';
	const start = parseIsoDate(plan.startDate);
	const slots = WEEK_ORDER.map((weekDay, pos) => {
		const dayIndex = plan.program.days.findIndex((d) => d.weekDay === weekDay);
		if (dayIndex < 0) return { weekDay, dayIndex: null, status: 'rest' as DayStatus, workout: null };
		const workout = workoutFor(workouts, weekIndex, dayIndex);
		const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + weekIndex * 7 + pos);
		const beforePlan = isoDate(date) < created;
		let status: DayStatus = 'planned';
		if (workout?.finishedAt) status = 'done';
		else if (
			!beforePlan &&
			(weekIndex < current || (weekIndex === current && pos < todayPos && dayIndex !== next))
		)
			status = 'missed';
		else if (weekIndex === current && pos === todayPos) status = 'today';
		else if (dayIndex === next) status = 'next';
		return { weekDay, dayIndex, status, workout };
	});
	// Steht heute ein Training an, ist das „das Nächste“; sonst leuchten zwei Tage.
	if (slots.some((s) => s.status === 'today')) slots.forEach((s) => s.status === 'next' && (s.status = 'planned'));
	return slots;
}

// ---------- Anstrengung ----------

/**
 * leicht/okay/hart → RPE relativ zur Vorgabe. „okay“ heißt: so wie geplant.
 * Untergrenze 6, weil die Engine niedrigere RPE-Werte als zu ungenau verwirft;
 * sonst würden leichte Sätze in frühen Wochen den Plan nie anheben.
 */
export function feelToRpe(feel: Feel, targetRpe: number): number {
	if (feel === 'leicht') return Math.max(6, targetRpe - 1.5);
	if (feel === 'hart') return Math.min(10, targetRpe + 1.5);
	return targetRpe;
}

/** RPE-Zahl → leicht/okay/hart relativ zur Vorgabe (für Anzeige und Verlauf). */
export function rpeToFeel(rpe: number, targetRpe: number): Feel {
	if (rpe <= targetRpe - 1) return 'leicht';
	if (rpe >= targetRpe + 1) return 'hart';
	return 'okay';
}

// ---------- Nach dem Training ----------

/**
 * Passt das geschätzte 1RM aus den geloggten Sätzen der Grundübungen an und
 * rechnet die folgenden Wochen neu. Fehlt ein Bestwert, wird er hier zum ersten
 * Mal geschätzt. Gibt zurück, ob sich etwas geändert hat.
 */
export function applyWorkout(program: Program, workout: Workout): boolean {
	let changed = false;
	const day = program.days[workout.dayIndex];
	const level = (program.level as Experience) ?? 'intermediate';
	workout.exercises.forEach((logged, i) => {
		const source = day?.exercises[i];
		if (!source || source.exercise !== logged.exercise) return;
		const ref = loadRef(source);
		if (!ref || ref.factor !== 1) return;
		const best = logged.sets
			.filter((s) => s.done && s.weight && s.reps && s.rpe)
			.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
		if (!best) return;
		if (updateMax(program, ref.lift, best.weight!, best.reps!, best.rpe!, workout.weekIndex, level)) {
			applyLoadsToProgram(program, workout.weekIndex + 1, ref.lift);
			changed = true;
		}
	});
	return changed;
}

// ---------- Fortschritt ----------

/** Grundübungen, die im Programm vorkommen (in fester Reihenfolge). */
export function programLifts(program: Program): MainLift[] {
	const used = new Set<MainLift>();
	program.days.forEach((d) => d.exercises.forEach((e) => {
		const ref = loadRef(e);
		if (ref) used.add(ref.lift);
	}));
	return ALL_LIFTS.filter((l) => used.has(l));
}

/** Geschätztes 1RM (1 Wiederholung) für eine Planwoche. */
export function estimatedMax(program: Program, lift: MainLift, weekIndex: number): number | null {
	return expectedMax(program, lift, Math.max(0, weekIndex));
}

export function estimatesAt(program: Program, weekIndex: number): Partial<Record<MainLift, number | null>> {
	return Object.fromEntries(programLifts(program).map((l) => [l, estimatedMax(program, l, weekIndex)]));
}

/** Eigene Bestwerte übernehmen: gelten ab `fromWeek`, Gewichte werden neu berechnet. */
export function applyBests(program: Program, bests: Bests, fromWeek: number) {
	const level = (program.level as Experience) ?? 'intermediate';
	const relevant = Object.fromEntries(
		Object.entries(bests).filter(([l]) => programLifts(program).includes(l as MainLift))
	) as Bests;
	setMaxes(program, relevant, fromWeek, level);
}

export interface ProgressPoint {
	date: string;
	value: number;
}

/** Verlauf je Hauptübung: Startwert des Plans, dann der Stand nach jedem Training. */
export function progressSeries(plan: Plan, workouts: Workout[]): Partial<Record<MainLift, ProgressPoint[]>> {
	const done = workouts
		.filter((w) => w.finishedAt && w.estimates)
		.sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
	return Object.fromEntries(
		programLifts(plan.program).map((lift) => {
			const points: ProgressPoint[] = [];
			const start = plan.startMaxes?.[lift];
			if (typeof start === 'number') points.push({ date: plan.startDate, value: start });
			for (const w of done) {
				const v = w.estimates?.[lift];
				if (typeof v === 'number' && v !== points[points.length - 1]?.value) points.push({ date: w.date, value: v });
			}
			return [lift, points];
		})
	) as Partial<Record<MainLift, ProgressPoint[]>>;
}

// ---------- Plan bearbeiten ----------

export interface CatalogItem {
	name: string;
	group: string;
	category: string;
}

/** Hat die Übung ein aus den Bestwerten berechnetes Gewicht? */
export function hasCalculatedLoad(ex: ProgramExercise): boolean {
	return loadRef(ex) !== null;
}

/** Übungskatalog, mit Alltagsnamen außer bei Powerlifting. */
export function exerciseCatalog(goal: Goal): CatalogItem[] {
	return pl.EXERCISES.map((e) => ({
		name: goal === 'powerlifting' ? e.name : (PLAIN_NAMES[e.name] ?? e.name),
		group: e.group,
		category: e.category ?? pl.categoryInCatalog(e.name)
	}));
}

function fill<T>(list: T[] | undefined, length: number, value: T): T[] {
	const out = Array.isArray(list) ? [...list] : [];
	while (out.length < length) out.push(value);
	return out.slice(0, length);
}

/** Gewichte einer Übung ab einer Woche neu berechnen (eigene Werte bleiben). */
function recompute(program: Program, ex: ProgramExercise, fromWeek: number) {
	applyLoads(program, ex, fromWeek);
}

/** Übung aus dem Katalog als Programm-Übung beschreiben (Bezug zum Bestwert). */
function describe(item: CatalogItem) {
	const ref = loadRef({ exercise: item.name, category: item.category, lift: null });
	return { lift: ref?.lift ?? null, loadFactor: ref ? ref.factor : null };
}

export interface ExercisePatch {
	sets?: number;
	reps?: string;
	/** Ziel-RPE (Anstrengung 1–10). */
	rpe?: number;
	/** Zahl = eigenes Gewicht, null = automatisch aus dem Plan. */
	weight?: number | null;
}

/** Untere Grenze einer Wiederholungsangabe („8“ → 8, „8–12“ → 8). */
function repsLow(reps: string | number): number | null {
	const n = Number.parseInt(String(reps), 10);
	return Number.isFinite(n) ? n : null;
}

/** Wiederholungen um `delta` verschieben, Spannen als Ganzes. */
export function shiftReps(reps: string | number, delta: number): string | number {
	const text = String(reps).trim();
	const range = text.match(/^(\d+)\s*[–-]\s*(\d+)$/);
	if (range) {
		const lo = Number(range[1]) + delta;
		const hi = Number(range[2]) + delta;
		return lo >= 1 ? `${lo}–${hi}` : reps;
	}
	if (/^\d+$/.test(text)) return Math.max(1, Number(text) + delta);
	return reps;
}

/**
 * Sätze, Wiederholungen, RPE oder Gewicht für die Wochen [from, to) ändern.
 *
 * Eine Woche: der Wert gilt genau so.
 * Mehrere Wochen: die Änderung wird als Verschiebung übertragen, damit die Progression
 * (steigende RPE, sinkende Wiederholungen, Entlastungswochen) erhalten bleibt. Ein eigenes
 * Gewicht wird zum Startpunkt der Steigerung statt zu einem festen Wert für alle Wochen.
 */
export function editExercise(
	program: Program,
	dayIndex: number,
	exIndex: number,
	from: number,
	to: number,
	patch: ExercisePatch
) {
	const ex = program.days[dayIndex]?.exercises[exIndex];
	if (!ex) return;
	const weeks = weekCount(program);
	ex.weekSets = fill(ex.weekSets, weeks, ex.weekSets?.[ex.weekSets.length - 1] ?? 3);
	ex.weekReps = fill(ex.weekReps, weeks, ex.weekReps?.[ex.weekReps.length - 1] ?? '8');
	ex.weekRpes = fill(ex.weekRpes, weeks, ex.weekRpes?.[ex.weekRpes.length - 1] ?? 7);
	ex.weekWeights = fill(ex.weekWeights, weeks, '');
	ex.weekWeightOverrides = fill(ex.weekWeightOverrides, weeks, false);
	const start = Math.max(0, from);
	const end = Math.min(weeks, Math.max(to, start + 1));
	const single = end - start === 1;
	const range = Array.from({ length: end - start }, (_, k) => start + k);
	const deload = (i: number) => isDeload(program, i);

	if (patch.sets != null) {
		const target = Math.max(1, Math.min(20, Math.round(patch.sets)));
		const delta = target - (Number(ex.weekSets[start]) || 0);
		for (const i of range) {
			if (single) ex.weekSets[i] = target;
			// Entlastungswochen bekommen nur einen Teil der Änderung.
			else ex.weekSets[i] = Math.max(1, Math.min(20, ex.weekSets[i] + (deload(i) && i !== start ? Math.round(delta * 0.6) : delta)));
		}
	}

	if (patch.reps != null && patch.reps.trim()) {
		const value = patch.reps.trim().slice(0, 12);
		const oldLow = repsLow(ex.weekReps[start]);
		const newLow = repsLow(value);
		const delta = oldLow != null && newLow != null ? newLow - oldLow : null;
		for (const i of range) {
			if (single || delta === null) ex.weekReps[i] = value;
			else if (i === start) ex.weekReps[i] = value;
			else ex.weekReps[i] = shiftReps(ex.weekReps[i], delta);
		}
	}

	if (patch.rpe != null) {
		const target = Math.max(5, Math.min(10, Math.round(patch.rpe * 2) / 2));
		const delta = target - (Number(ex.weekRpes[start]) || target);
		for (const i of range) {
			if (single || i === start) ex.weekRpes[i] = target;
			// Entlastungswochen bleiben leicht.
			else if (!deload(i)) ex.weekRpes[i] = Math.max(5, Math.min(10, ex.weekRpes[i] + delta));
		}
	}

	if (patch.weight !== undefined) {
		const ref = loadRef(ex);
		if (patch.weight === null) {
			for (const i of range) ex.weekWeightOverrides[i] = false;
			if (!single) {
				delete ex.loadScale;
				delete ex.anchor;
			}
		} else if (single) {
			ex.weekWeightOverrides[start] = true;
			ex.weekWeights[start] = Math.max(0, patch.weight);
		} else {
			for (const i of range) ex.weekWeightOverrides[i] = false;
			const weight = Math.max(0, patch.weight);
			// Mit Bestwert: persönlicher Faktor auf die berechneten Gewichte.
			delete ex.loadScale;
			delete ex.anchor;
			const base = ref ? rawLoad(program, ex, start) : null;
			if (ref && base) ex.loadScale = weight / base;
			else ex.anchor = { week: start, weight };
		}
	}

	recompute(program, ex, start);
}

// ---------- Plan anpassen ----------

/**
 * Planlänge ändern. Neue Wochen setzen die Vier-Wochen-Welle fort (Woche 4, 8, …
 * Entlastung) und übernehmen die Vorgaben der entsprechenden Woche davor; die
 * Gewichte steigen über die erwartete Entwicklung des Maximums weiter.
 */
export function setPlanLength(program: Program, weeks: number) {
	const old = weekCount(program);
	const target = Math.max(4, Math.min(52, Math.round(weeks)));
	if (target === old) return;
	const types = fill(program.weekTypes, old, 'regular' as 'regular' | 'deload');
	for (let i = old; i < target; i++) types[i] = i % 4 === 3 ? 'deload' : 'regular';
	program.weekTypes = types.slice(0, target);
	program.cycleWeeks = target;
	program.days.forEach((day) =>
		day.exercises.forEach((ex) => {
			const src = (list: unknown[] | undefined, i: number) => {
				const arr = Array.isArray(list) ? list : [];
				return arr[i - 4 >= 0 ? i - 4 : Math.max(0, arr.length - 1)];
			};
			for (const key of ['weekSets', 'weekReps', 'weekRpes'] as const) {
				const arr = [...((ex[key] as unknown[]) ?? [])].slice(0, target);
				for (let i = arr.length; i < target; i++) arr.push(src(arr, i));
				(ex as Record<string, unknown>)[key] = arr;
			}
			ex.weekWeights = fill(ex.weekWeights, old, '').slice(0, target);
			ex.weekWeightOverrides = fill(ex.weekWeightOverrides, old, false).slice(0, target);
			while (ex.weekWeights.length < target) ex.weekWeights.push('');
			while (ex.weekWeightOverrides.length < target) ex.weekWeightOverrides.push(false);
		})
	);
	if (target > old) program.days.forEach((day) => day.exercises.forEach((ex) => recompute(program, ex, old)));
}

export function renameDay(program: Program, dayIndex: number, title: string) {
	const day = program.days[dayIndex];
	if (!day) return;
	const clean = title.trim().slice(0, 40);
	if (clean) day.title = clean;
	// Leer: ursprünglicher Name (Splits: „Oberkörper A“, Powerlifting: aus den Hauptübungen).
	else if (program.engine === 'splits-v1') day.title = day.name;
	else delete day.title;
}

/** Übung austauschen. Name gilt für den ganzen Plan, Gewichte werden ab `fromWeek` neu berechnet. */
export function swapExercise(program: Program, dayIndex: number, exIndex: number, item: CatalogItem, fromWeek: number) {
	const ex = program.days[dayIndex]?.exercises[exIndex];
	if (!ex) return;
	const { lift, loadFactor } = describe(item);
	ex.exercise = item.name;
	ex.category = item.category;
	ex.lift = lift;
	ex.loadFactor = loadFactor;
	ex.isMain = loadFactor === 1;
	ex.weekWeightOverrides = fill([], weekCount(program), false);
	recompute(program, ex, fromWeek);
}

export function addExercise(program: Program, dayIndex: number, item: CatalogItem, fromWeek: number) {
	const day = program.days[dayIndex];
	if (!day) return;
	const weeks = weekCount(program);
	const { lift, loadFactor } = describe(item);
	// Ziel-RPE wie die übrigen Assistenzübungen des Tages, sonst 7.
	const reference = day.exercises.find((e) => !e.isMain) ?? day.exercises[0];
	const ex: ProgramExercise = {
		exercise: item.name,
		category: item.category,
		lift,
		loadFactor,
		isMain: loadFactor === 1,
		role: loadFactor === 1 ? 'main' : loadFactor ? 'secondary' : 'accessory',
		weekSets: Array(weeks).fill(3),
		weekReps: Array(weeks).fill(lift ? '6' : '8–12'),
		weekRpes: reference?.weekRpes ? [...reference.weekRpes] : Array(weeks).fill(7),
		weekWeights: Array(weeks).fill(''),
		weekWeightOverrides: Array(weeks).fill(false),
		note: ''
	};
	// Entlastungswochen: weniger Sätze wie im restlichen Plan.
	program.weekTypes?.forEach((t, i) => {
		if (t === 'deload') ex.weekSets[i] = 2;
	});
	day.exercises.push(ex);
	recompute(program, ex, fromWeek);
}

export function removeExercise(program: Program, dayIndex: number, exIndex: number) {
	program.days[dayIndex]?.exercises.splice(exIndex, 1);
}

export function moveExercise(program: Program, dayIndex: number, exIndex: number, delta: -1 | 1) {
	const list = program.days[dayIndex]?.exercises;
	const target = exIndex + delta;
	if (!list || target < 0 || target >= list.length) return;
	[list[exIndex], list[target]] = [list[target], list[exIndex]];
}

/** Trainingstag auf einen anderen Wochentag legen; ist der Tag belegt, tauschen beide. */
export function moveDay(program: Program, dayIndex: number, weekDay: number) {
	const day = program.days[dayIndex];
	if (!day) return;
	const other = program.days.find((d, i) => i !== dayIndex && d.weekDay === weekDay);
	if (other) other.weekDay = day.weekDay;
	day.weekDay = weekDay;
}

// ---------- Formatierung ----------

export function kg(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return '–';
	return String(Math.round(value * 100) / 100).replace('.', ',');
}
