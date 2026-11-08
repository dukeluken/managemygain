// Lastmodell für alle Pläne: geplantes Gewicht = erwartetes 1RM der Woche
// × RPE-Tabelle(Wdh., Ziel-RPE) × Faktor der Übung, gerundet.
// Das 1RM kommt aus den Bestwerten, die der Nutzer einträgt, und wird nach
// jedem Training aus den geloggten Sätzen nachgeführt.
import * as engine from './powerlifting.js';
import type { Experience, MainLift, Program, ProgramExercise } from '#lib/data/types.ts';

const pl = engine as unknown as {
	rpePercent(reps: number | string, rpe: number): number;
	e1rmFromSet(weight: number, reps: number, rpe: number): number | null;
	roundTo(value: number, step: number): number;
};

export const ALL_LIFTS: MainLift[] = ['squat', 'bench', 'deadlift', 'press'];

/** Erwartete 1RM-Steigerung pro Woche, konservativ nach Trainingsstand. */
export const WEEKLY_GROWTH: Record<Experience, number> = { beginner: 0.005, intermediate: 0.0025, advanced: 0.001 };

/**
 * Übungen, deren Gewicht sich aus einem Bestwert ableitet, mit Faktor relativ zur
 * Grundübung. Werte sind grobe Praxiswerte; die Autoregulation korrigiert über die
 * Grundübung. Alles, was hier fehlt, bekommt kein vorgegebenes Gewicht.
 */
export const LOAD_REFS: Record<string, { lift: MainLift; factor: number }> = {
	Kniebeuge: { lift: 'squat', factor: 1 },
	Wettkampfkniebeuge: { lift: 'squat', factor: 1 },
	'High-Bar Kniebeuge': { lift: 'squat', factor: 0.95 },
	'Pause Squat': { lift: 'squat', factor: 0.9 },
	'Safety-Bar Squat': { lift: 'squat', factor: 0.9 },
	'Pin Squat': { lift: 'squat', factor: 0.85 },
	'Tempo Squat (3-0-0)': { lift: 'squat', factor: 0.8 },
	Frontkniebeuge: { lift: 'squat', factor: 0.8 },
	Bankdrücken: { lift: 'bench', factor: 1 },
	Wettkampfbankdrücken: { lift: 'bench', factor: 1 },
	'Bankdrücken lange Pause (3 s)': { lift: 'bench', factor: 0.9 },
	'Spoto Press': { lift: 'bench', factor: 0.9 },
	'Larsen Press': { lift: 'bench', factor: 0.9 },
	'Board Press': { lift: 'bench', factor: 0.95 },
	'Floor Press': { lift: 'bench', factor: 0.9 },
	'Enges Bankdrücken': { lift: 'bench', factor: 0.88 },
	Schrägbankdrücken: { lift: 'bench', factor: 0.8 },
	Kreuzheben: { lift: 'deadlift', factor: 1 },
	Wettkampfkreuzheben: { lift: 'deadlift', factor: 1 },
	'Konventionelles Kreuzheben': { lift: 'deadlift', factor: 0.95 },
	'Sumo Kreuzheben': { lift: 'deadlift', factor: 0.95 },
	'Pause Kreuzheben': { lift: 'deadlift', factor: 0.85 },
	'Defizit-Kreuzheben': { lift: 'deadlift', factor: 0.9 },
	'Block Pull': { lift: 'deadlift', factor: 1 },
	'Rumänisches Kreuzheben': { lift: 'deadlift', factor: 0.7 },
	Schulterdrücken: { lift: 'press', factor: 1 }
};

const PL_LIFT: Record<string, MainLift> = {
	squatMain: 'squat',
	squatVar: 'squat',
	benchMain: 'bench',
	benchVar: 'bench',
	deadliftMain: 'deadlift',
	deadliftVar: 'deadlift'
};

/** Bezug einer Übung auf einen Bestwert, oder null (kein vorgegebenes Gewicht). */
export function loadRef(ex: Pick<ProgramExercise, 'exercise' | 'category' | 'lift'> & { loadFactor?: number | null }) {
	if (ex.loadFactor === null) return null;
	if (typeof ex.loadFactor === 'number' && ex.lift) return { lift: ex.lift, factor: ex.loadFactor };
	// Pläne der Powerlifting-Engine: Wettkampfübung 1, Varianten 0,9 (wie dort berechnet).
	const plLift = PL_LIFT[ex.category];
	if (plLift) return { lift: plLift, factor: ex.category.endsWith('Main') ? 1 : 0.9 };
	return LOAD_REFS[ex.exercise] ?? null;
}

/** Wiederholungszahl für die Lastberechnung: bei Spannen wie „6–8“ die untere Grenze. */
export function repsForLoad(reps: string | number): number | null {
	const n = Number.parseInt(String(reps), 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export function e1rm(weight: number, reps: number, rpe = 10): number | null {
	return pl.e1rmFromSet(weight, reps, rpe);
}

export function round(value: number, step = 2.5): number {
	return pl.roundTo(value, step);
}

export function expectedMax(program: Program, lift: MainLift, weekIndex: number): number | null {
	const max = Number(program.maxes?.[lift]);
	if (!(max > 0)) return null;
	const anchor = Number(program.maxAnchor?.[lift]) || 0;
	const growth = Math.max(0, Number(program.weeklyProgression?.[lift]) || 0);
	return max + growth * Math.max(0, weekIndex - anchor);
}

/** Anteil am Maximum für die Vorgabe einer Woche (Wdh. + Ziel-RPE), oder null. */
function weekPercent(ex: ProgramExercise, weekIndex: number): number | null {
	const reps = repsForLoad(ex.weekReps?.[weekIndex] ?? '');
	const rpe = Number(ex.weekRpes?.[weekIndex]) || 7;
	return reps ? pl.rpePercent(reps, rpe) : null;
}

/** Eigenes Startgewicht einer Übung ohne Bestwert-Bezug, ab dem die Progression läuft. */
export interface LoadAnchor {
	week: number;
	weight: number;
}

/**
 * Ungerundetes Gewicht einer Woche ohne den persönlichen Faktor:
 * - mit Bestwert: erwartetes 1RM × RPE-Tabelle × Faktor der Übung
 * - mit eigenem Startgewicht (anchor): Startgewicht × Verhältnis der RPE-Tabelle
 *   zur Startwoche × erwartete Wochensteigerung. So steigen auch Assistenzübungen
 *   mit der Welle und werden in Entlastungswochen leichter.
 */
export function rawLoad(program: Program, ex: ProgramExercise, weekIndex: number): number | null {
	const ref = loadRef(ex);
	const max = ref ? expectedMax(program, ref.lift, weekIndex) : null;
	const p = weekPercent(ex, weekIndex);
	if (ref && max && p) return max * p * ref.factor;
	const anchor = ex.anchor as LoadAnchor | undefined;
	if (anchor && weekIndex >= anchor.week) {
		const p0 = weekPercent(ex, anchor.week);
		if (!p || !p0) return null;
		// Assistenzübungen steigern sich prozentual schneller als das Maximum der Grundübungen.
		const growth = 2 * (WEEKLY_GROWTH[(program.level as Experience) ?? 'intermediate'] ?? WEEKLY_GROWTH.intermediate);
		return anchor.weight * (p / p0) * (1 + growth * (weekIndex - anchor.week));
	}
	return null;
}

export function plannedLoad(program: Program, ex: ProgramExercise, weekIndex: number): number | null {
	const raw = rawLoad(program, ex, weekIndex);
	if (raw == null) return null;
	const anchor = ex.anchor as LoadAnchor | undefined;
	const fromMax = loadRef(ex) && expectedMax(program, loadRef(ex)!.lift, weekIndex);
	if (fromMax) return round(raw * (Number(ex.loadScale) || 1), Number(program.rounding) || 2.5);
	// Eigenes Startgewicht: in der Startwoche exakt, danach fein gerundet (kleine Hanteln).
	if (anchor && weekIndex === anchor.week) return anchor.weight;
	return round(raw, raw < 20 ? 1 : 1.25);
}

/** Gewichte einer Übung ab `fromWeek` neu berechnen; eigene Werte bleiben. */
export function applyLoads(program: Program, ex: ProgramExercise, fromWeek = 0) {
	const weeks = Number(program.cycleWeeks) || program.weekTypes?.length || 1;
	const fit = <T>(list: T[] | undefined, value: T) => {
		const out = Array.isArray(list) ? [...list] : [];
		while (out.length < weeks) out.push(value);
		return out.slice(0, weeks);
	};
	ex.weekWeights = fit(ex.weekWeights, '' as number | '');
	ex.weekWeightOverrides = fit(ex.weekWeightOverrides, false);
	for (let i = Math.max(0, fromWeek); i < weeks; i++) {
		if (ex.weekWeightOverrides[i]) continue;
		const load = plannedLoad(program, ex, i);
		ex.weekWeights[i] = load ?? '';
	}
}

export function applyLoadsToProgram(program: Program, fromWeek = 0, lift: MainLift | null = null) {
	program.days.forEach((day) =>
		day.exercises.forEach((ex) => {
			if (!lift || loadRef(ex)?.lift === lift) applyLoads(program, ex, fromWeek);
		})
	);
}

/** Bestwerte als Grundlage setzen (ab `fromWeek`) und Gewichte neu berechnen. */
export function setMaxes(
	program: Program,
	bests: Partial<Record<MainLift, number | null>>,
	fromWeek: number,
	level: Experience
) {
	const maxes = { ...(program.maxes ?? {}) } as Record<MainLift, number | ''>;
	const anchor = { ...(program.maxAnchor ?? {}) } as Record<MainLift, number>;
	const growth = { ...(program.weeklyProgression ?? {}) } as Record<MainLift, number>;
	for (const lift of ALL_LIFTS) {
		if (!(lift in bests)) continue;
		const value = bests[lift];
		maxes[lift] = typeof value === 'number' && value > 0 ? value : '';
		anchor[lift] = Math.max(0, fromWeek);
		growth[lift] = typeof value === 'number' ? Math.round(value * WEEKLY_GROWTH[level] * 4) / 4 : 0;
	}
	program.maxes = maxes;
	program.maxAnchor = anchor;
	program.weeklyProgression = growth;
	applyLoadsToProgram(program, Math.max(0, fromWeek));
}

/**
 * Autoregulation: geloggter Satz → neue 1RM-Schätzung. Nur bei RPE 6–10 und ≤ 10 Wdh.
 * Änderung je Update auf ±5 % begrenzt und zur Hälfte gemittelt. Gibt es noch keinen
 * Wert (Bestwert nicht eingetragen), wird die Schätzung direkt übernommen.
 */
export function updateMax(
	program: Program,
	lift: MainLift,
	weight: number,
	reps: number,
	rpe: number,
	weekIndex: number,
	level: Experience = 'intermediate'
): boolean {
	if (!(rpe >= 6 && rpe <= 10) || !(reps >= 1 && reps <= 10) || !(weight > 0)) return false;
	const estimate = e1rm(weight, reps, rpe);
	if (!estimate) return false;
	const current = expectedMax(program, lift, weekIndex);
	const next = current
		? Math.round(((current + Math.min(current * 1.05, Math.max(current * 0.95, estimate))) / 2) * 10) / 10
		: Math.round(estimate * 10) / 10;
	program.maxes = { ...(program.maxes ?? {}), [lift]: next } as Program['maxes'];
	program.maxAnchor = { ...(program.maxAnchor ?? {}), [lift]: weekIndex } as Program['maxAnchor'];
	if (!current) {
		program.weeklyProgression = {
			...(program.weeklyProgression ?? {}),
			[lift]: Math.round(next * WEEKLY_GROWTH[level] * 4) / 4
		} as Program['weeklyProgression'];
	}
	return true;
}
