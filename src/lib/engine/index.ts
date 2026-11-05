// Brücke zwischen Engine und App: alles, was Bildschirme über einen Plan wissen
// müssen, als reine Funktionen (ohne Firebase, ohne DOM).
import * as engine from './powerlifting.js';
// Die Engine ist (noch) JavaScript ohne Typen; hier die genutzten Signaturen.
const pl = engine as unknown as {
	generatePlan(options: Record<string, unknown>): unknown;
	updateMaxFromSet(program: Program, lift: MainLift, weight: number, reps: number, rpe: number, weekIndex: number): boolean;
	applyPlannedLoadsToPlan(program: Program, fromWeek: number, lift?: MainLift | null): void;
};
import type {
	Feel,
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

// ---------- Formatierung ----------

export function kg(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return '–';
	return String(Math.round(value * 100) / 100).replace('.', ',');
}
