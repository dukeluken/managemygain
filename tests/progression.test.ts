import { describe, expect, test } from 'vitest';
import type { LoggedExercise, LoggedSet, PlanRequest, Program, Workout } from '../src/lib/data/types';
import { createProgram, doubleProgression, lastPerformance, nextIncrement, repRange } from '../src/lib/engine';

const set = (weight: number, reps: number, rpe: number | null = 8): LoggedSet => ({ weight, reps, rpe, feel: 'okay', done: true });
const logged = (sets: LoggedSet[], exercise = 'Latzug'): LoggedExercise => ({
	exercise,
	lift: null,
	isMain: false,
	target: { sets: sets.length, reps: '8–12', rpe: 8, weight: null },
	sets
});

describe('doppelte Progression', () => {
	test('Spanne erkennen', () => {
		expect(repRange('8–12')).toEqual([8, 12]);
		expect(repRange('10-15')).toEqual([10, 15]);
		expect(repRange('5')).toBeNull();
	});

	test('noch nicht oben: gleiches Gewicht, je eine Wiederholung mehr', () => {
		const step = doubleProgression([8, 12], 3, 8, logged([set(50, 10), set(50, 9), set(50, 9)]))!;
		expect(step.increase).toBe(false);
		expect(step.weight).toBe(50);
		expect(step.reps).toEqual([11, 10, 10]);
	});

	test('nie über das obere Ende hinaus', () => {
		const step = doubleProgression([8, 12], 3, 8, logged([set(50, 12), set(50, 12), set(50, 11)]))!;
		expect(step.increase).toBe(false);
		expect(step.reps).toEqual([12, 12, 12]);
	});

	test('alle Sätze oben: mehr Gewicht, zurück ans untere Ende', () => {
		const step = doubleProgression([8, 12], 3, 8, logged([set(50, 12), set(50, 12), set(50, 12)]))!;
		expect(step.increase).toBe(true);
		expect(step.weight).toBe(52.5);
		expect(step.reps).toEqual([8, 8, 8]);
		expect(step.hint).toContain('geschafft');
	});

	test('oben, aber viel zu hart: erst noch nicht steigern', () => {
		const step = doubleProgression([8, 12], 3, 8, logged([set(50, 12, 10), set(50, 12, 10), set(50, 12, 10)]))!;
		expect(step.increase).toBe(false);
	});

	test('Gewichtssprung passt zur Größenordnung', () => {
		expect(nextIncrement(10)).toBe(1);
		expect(nextIncrement(30)).toBe(1.25);
		expect(nextIncrement(60)).toBe(2.5);
		expect(nextIncrement(120)).toBe(5);
	});

	test('letzte Ausführung: neuestes abgeschlossenes Training, nicht das laufende', () => {
		const w = (id: string, finishedAt: string | null, weight: number) =>
			({ id, finishedAt, exercises: [logged([set(weight, 10)])] }) as unknown as Workout;
		const list = [w('a', '2026-11-01T10:00:00Z', 40), w('b', '2026-11-05T10:00:00Z', 45), w('c', null, 99)];
		expect(lastPerformance(list, 'Latzug')!.sets[0].weight).toBe(45);
		expect(lastPerformance(list, 'Latzug', 'b')!.sets[0].weight).toBe(40);
		expect(lastPerformance(list, 'Klimmzüge')).toBeNull();
	});
});

describe('Aufbaublock: Sätze steigen über die Welle', () => {
	const bests = { squat: 140, bench: 100, deadlift: 180, press: 60 };
	const sets = (program: Program, name: string) =>
		program.days.flatMap((d) => d.exercises).find((e) => e.exercise === name)!.weekSets;

	test('Muskelaufbau: 3 → 3 → 4 → leicht, dann mehr', () => {
		const program = createProgram({ goal: 'hypertrophy', daysPerWeek: 4, experience: 'intermediate', bests } as PlanRequest);
		const s = sets(program, 'Langhantelrudern');
		expect(s.slice(0, 4)).toEqual([3, 3, 4, 2]);
		expect(s.slice(4, 7)).toEqual([3, 4, 4]);
		expect(s.slice(8, 11)).toEqual([4, 4, 5]);
	});

	test('Kraftblock: Arbeitssätze bleiben gleich (Top-Single zählt mit)', () => {
		const program = createProgram({ goal: 'strength', block: 'strength', daysPerWeek: 4, experience: 'intermediate', bests } as PlanRequest);
		const ex = program.days.flatMap((d) => d.exercises).find((e) => e.exercise === 'Kniebeuge')!;
		const work = (i: number) => ex.weekSets[i] + (ex.weekTopSingle?.[i] != null ? 1 : 0);
		expect(new Set([0, 1, 2, 4, 5, 6].map(work)).size).toBe(1);
	});

	test('Powerlifting-Aufbaublock steigert ebenfalls', () => {
		const pl = (block: 'hypertrophy' | 'strength') =>
			createProgram({ goal: 'powerlifting', block, daysPerWeek: 4, experience: 'intermediate', focus: 'squat', bests } as PlanRequest);
		const total = (p: Program, w: number) => p.days.reduce((n, d) => n + d.exercises.reduce((m, e) => m + e.weekSets[w], 0), 0);
		const hyp = pl('hypertrophy');
		expect(total(hyp, 2)).toBeGreaterThan(total(hyp, 0));
		expect(total(hyp, 10)).toBeGreaterThanOrEqual(total(hyp, 2));
		expect(total(hyp, 2)).toBeGreaterThan(total(pl('strength'), 2));
	});
});
