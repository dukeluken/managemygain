// Brücke zwischen Engine und App: alles, was Bildschirme über einen Plan wissen
// müssen, als reine Funktionen (ohne Firebase, ohne DOM).
import * as engine from './powerlifting.js';
// Die Engine ist (noch) JavaScript ohne Typen; hier die genutzten Signaturen.
const pl = engine as unknown as {
	generatePlan(options: Record<string, unknown>): unknown;
	updateMaxFromSet(program: Program, lift: MainLift, weight: number, reps: number, rpe: number, weekIndex: number): boolean;
	applyPlannedLoadsToPlan(program: Program, fromWeek: number, lift?: MainLift | null): void;
	applyPlannedLoads(program: Program, exercise: ProgramExercise, fromWeek: number): void;
	expectedMax(program: Program, lift: MainLift, weekIndex: number): number | null;
	EXERCISES: { name: string; group: string; category?: string }[];
	categoryInCatalog(name: string): string;
};
import type {
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

export const LIFT_LABEL: Record<MainLift, string> = {
	squat: 'Kniebeuge',
	bench: 'Bankdrücken',
	deadlift: 'Kreuzheben'
};

export const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const WEEKDAY_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
/** Anzeigereihenfolge der Woche: Montag zuerst. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ---------- Plan erzeugen ----------

// Für alle außer Powerliftern heißen die Wettkampfübungen einfach nach der Übung.
const PLAIN_NAMES: Record<string, string> = {
	Wettkampfkniebeuge: 'Kniebeuge',
	Wettkampfbankdrücken: 'Bankdrücken',
	Wettkampfkreuzheben: 'Kreuzheben'
};

export function createProgram(req: PlanRequest): Program {
	const program = generate(req);
	if (req.goal !== 'powerlifting') {
		program.days.forEach((day) =>
			day.exercises.forEach((ex) => {
				ex.exercise = PLAIN_NAMES[ex.exercise] ?? ex.exercise;
			})
		);
	}
	return program;
}

function generate(req: PlanRequest): Program {
	const phase = req.goal === 'hypertrophy' ? 'hypertrophy' : 'strength';
	return pl.generatePlan({
		frequency: req.daysPerWeek,
		level: req.experience,
		focus: req.focus,
		phase,
		cycleWeeks: req.weeks,
		triples: req.working3RM,
		name: '',
		deadliftStance: req.deadliftStance
	}) as Program;
}

export function planName(req: PlanRequest): string {
	const goal = { powerlifting: 'Powerlifting', strength: 'Kraft', hypertrophy: 'Muskelaufbau' }[req.goal];
	return `${goal} · ${req.daysPerWeek} Tage`;
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

/** Lesbarer Titel aus den Hauptübungen des Tages, z. B. „Kniebeuge & Bankdrücken“. */
export function dayTitle(day: ProgramDay): string {
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
	return WEEK_ORDER.map((weekDay, pos) => {
		const dayIndex = plan.program.days.findIndex((d) => d.weekDay === weekDay);
		if (dayIndex < 0) return { weekDay, dayIndex: null, status: 'rest' as DayStatus, workout: null };
		const workout = workoutFor(workouts, weekIndex, dayIndex);
		let status: DayStatus = 'planned';
		if (workout?.finishedAt) status = 'done';
		else if (weekIndex < current || (weekIndex === current && pos < todayPos && dayIndex !== next)) status = 'missed';
		else if (weekIndex === current && pos === todayPos) status = 'today';
		else if (dayIndex === next) status = 'next';
		return { weekDay, dayIndex, status, workout };
	});
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

// ---------- Nach dem Training ----------

/**
 * Passt das geschätzte 1RM aus den geloggten Sätzen der Wettkampfübungen an und
 * rechnet die folgenden Wochen neu. Gibt zurück, ob sich etwas geändert hat.
 */
export function applyWorkout(program: Program, workout: Workout): boolean {
	let changed = false;
	const day = program.days[workout.dayIndex];
	workout.exercises.forEach((logged, i) => {
		const source = day?.exercises[i];
		if (!logged.lift || !source || !String(source.category).endsWith('Main')) return;
		const best = logged.sets
			.filter((s) => s.done && s.weight && s.reps && s.rpe)
			.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
		if (!best) return;
		if (pl.updateMaxFromSet(program, logged.lift, best.weight!, best.reps!, best.rpe!, workout.weekIndex)) {
			pl.applyPlannedLoadsToPlan(program, workout.weekIndex + 1, logged.lift);
			changed = true;
		}
	});
	return changed;
}

// ---------- Fortschritt ----------

export const LIFTS: MainLift[] = ['squat', 'bench', 'deadlift'];

/** Geschätztes 1RM (1 Wiederholung) für eine Planwoche. */
export function estimatedMax(program: Program, lift: MainLift, weekIndex: number): number | null {
	return pl.expectedMax(program, lift, Math.max(0, weekIndex));
}

export function estimatesAt(program: Program, weekIndex: number): Record<MainLift, number | null> {
	return Object.fromEntries(LIFTS.map((l) => [l, estimatedMax(program, l, weekIndex)])) as Record<
		MainLift,
		number | null
	>;
}

export interface ProgressPoint {
	date: string;
	value: number;
}

/** Verlauf je Hauptübung: Startwert des Plans, dann der Stand nach jedem Training. */
export function progressSeries(plan: Plan, workouts: Workout[]): Record<MainLift, ProgressPoint[]> {
	const done = workouts
		.filter((w) => w.finishedAt && w.estimates)
		.sort((a, b) => String(a.finishedAt).localeCompare(String(b.finishedAt)));
	return Object.fromEntries(
		LIFTS.map((lift) => {
			const points: ProgressPoint[] = [];
			const start = plan.startMaxes?.[lift];
			if (typeof start === 'number') points.push({ date: plan.startDate, value: start });
			for (const w of done) {
				const v = w.estimates?.[lift];
				if (typeof v === 'number' && v !== points[points.length - 1]?.value) points.push({ date: w.date, value: v });
			}
			return [lift, points];
		})
	) as Record<MainLift, ProgressPoint[]>;
}

// ---------- Plan bearbeiten ----------

export interface CatalogItem {
	name: string;
	group: string;
	category: string;
}

const LIFT_OF_CATEGORY: Record<string, MainLift> = {
	squatMain: 'squat',
	squatVar: 'squat',
	benchMain: 'bench',
	benchVar: 'bench',
	deadliftMain: 'deadlift',
	deadliftVar: 'deadlift'
};

export function liftOfCategory(category: string): MainLift | null {
	return LIFT_OF_CATEGORY[category] ?? null;
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
	const weeks = weekCount(program);
	ex.weekWeights = fill(ex.weekWeights, weeks, '');
	ex.weekWeightOverrides = fill(ex.weekWeightOverrides, weeks, false);
	if (liftOfCategory(ex.category)) {
		pl.applyPlannedLoads(program, ex, fromWeek);
	} else {
		for (let i = Math.max(0, fromWeek); i < weeks; i++) if (!ex.weekWeightOverrides[i]) ex.weekWeights[i] = '';
	}
}

export interface ExercisePatch {
	sets?: number;
	reps?: string;
	/** Zahl = eigenes Gewicht, null = automatisch aus dem Plan. */
	weight?: number | null;
}

/** Sätze, Wiederholungen oder Gewicht für die Wochen [from, to) ändern. */
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
	ex.weekWeights = fill(ex.weekWeights, weeks, '');
	ex.weekWeightOverrides = fill(ex.weekWeightOverrides, weeks, false);
	const end = Math.min(weeks, to);
	for (let i = Math.max(0, from); i < end; i++) {
		if (patch.sets != null) ex.weekSets[i] = Math.max(1, Math.min(20, Math.round(patch.sets)));
		if (patch.reps != null && patch.reps.trim()) ex.weekReps[i] = patch.reps.trim().slice(0, 12);
		if (patch.weight !== undefined) {
			ex.weekWeightOverrides[i] = patch.weight !== null;
			if (patch.weight !== null) ex.weekWeights[i] = Math.max(0, patch.weight);
		}
	}
	// Wiederholungen bestimmen bei Hauptübungen das Gewicht: neu berechnen.
	if (patch.reps != null || patch.weight === null) recompute(program, ex, from);
}

/** Übung austauschen. Name gilt für den ganzen Plan, Gewichte werden ab `fromWeek` neu berechnet. */
export function swapExercise(program: Program, dayIndex: number, exIndex: number, item: CatalogItem, fromWeek: number) {
	const ex = program.days[dayIndex]?.exercises[exIndex];
	if (!ex) return;
	ex.exercise = item.name;
	ex.category = item.category;
	ex.lift = liftOfCategory(item.category);
	ex.isMain = ex.lift !== null;
	ex.weekWeightOverrides = fill([], weekCount(program), false);
	recompute(program, ex, fromWeek);
}

export function addExercise(program: Program, dayIndex: number, item: CatalogItem, fromWeek: number) {
	const day = program.days[dayIndex];
	if (!day) return;
	const weeks = weekCount(program);
	const lift = liftOfCategory(item.category);
	// Ziel-RPE wie die übrigen Assistenzübungen des Tages, sonst 7.
	const reference = day.exercises.find((e) => !e.isMain) ?? day.exercises[0];
	const ex: ProgramExercise = {
		exercise: item.name,
		category: item.category,
		lift,
		isMain: lift !== null,
		weekSets: Array(weeks).fill(3),
		weekReps: Array(weeks).fill(lift ? '5' : '8–12'),
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
