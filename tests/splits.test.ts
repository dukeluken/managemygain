import { describe, expect, test } from 'vitest';
import type { Experience, Goal, PlanRequest, Program, Workout } from '../src/lib/data/types';
import {
	DAYS_FOR_GOAL,
	applyBests,
	applyWorkout,
	createProgram,
	dayPrescription,
	estimatedMax,
	planName,
	programLifts
} from '../src/lib/engine';

const bests = { squat: 140, bench: 100, deadlift: 180, press: 60 };
const req = (goal: Goal, days: number, experience: Experience = 'intermediate', extra: Partial<PlanRequest> = {}): PlanRequest => ({
	goal,
	daysPerWeek: days as PlanRequest['daysPerWeek'],
	experience,
	bests,
	...extra
});

/** Sätze pro Woche je Muskelgruppe (grob über die Kategorie). */
function weeklySets(program: Program, week: number) {
	const sets: Record<string, number> = {};
	program.days.forEach((d, di) =>
		dayPrescription(program, week, di).forEach((p, i) => {
			const cat = d.exercises[i].category;
			sets[cat] = (sets[cat] ?? 0) + p.sets;
		})
	);
	return sets;
}

describe('alle Ziele und Tage erzeugen sinnvolle Pläne', () => {
	for (const goal of ['hypertrophy', 'strength', 'fitness', 'powerlifting'] as Goal[]) {
		for (const days of DAYS_FOR_GOAL[goal]) {
			for (const level of ['beginner', 'intermediate', 'advanced'] as Experience[]) {
				test(`${goal} · ${days} Tage · ${level}`, () => {
					const program = createProgram(req(goal, days, level, goal === 'powerlifting' ? { focus: 'bench' } : {}));
					expect(program.days).toHaveLength(days);
					// verschiedene Wochentage
					expect(new Set(program.days.map((d) => d.weekDay)).size).toBe(days);
					for (const [di, day] of program.days.entries()) {
						expect(day.exercises.length).toBeGreaterThanOrEqual(4);
						expect(day.exercises.length).toBeLessThanOrEqual(6);
						for (let w = 0; w < program.cycleWeeks; w++) {
							for (const p of dayPrescription(program, w, di)) {
								expect(p.rpe).toBeLessThanOrEqual(9);
								expect(p.sets).toBeGreaterThanOrEqual(1);
								if (p.weight != null) expect(p.weight).toBeGreaterThan(0);
							}
						}
					}
					// Entlastung: weniger Sätze als in der Woche davor
					const total = (w: number) => Object.values(weeklySets(program, w)).reduce((a, b) => a + b, 0);
					expect(total(3)).toBeLessThan(total(2));
				});
			}
		}
	}
});

describe('Splits passen zum Ziel', () => {
	test('Muskelaufbau 4 Tage = Ober/Unter, 6 Tage = Push/Pull/Beine', () => {
		expect(createProgram(req('hypertrophy', 4)).days.map((d) => d.title)).toEqual([
			'Oberkörper A',
			'Unterkörper A',
			'Oberkörper B',
			'Unterkörper B'
		]);
		const ppl = createProgram(req('hypertrophy', 6)).days.map((d) => d.title ?? '');
		expect(ppl.filter((t) => t.startsWith('Push'))).toHaveLength(2);
		expect(ppl.filter((t) => t.startsWith('Pull'))).toHaveLength(2);
		expect(ppl.filter((t) => t.startsWith('Beine'))).toHaveLength(2);
	});

	test('Muskelaufbau: genug Volumen für Brust, Rücken und Beine', () => {
		const sets = weeklySets(createProgram(req('hypertrophy', 4)), 0);
		const chest = (sets.benchMain ?? 0) + (sets.chest ?? 0);
		expect(chest).toBeGreaterThanOrEqual(8);
		expect(sets.back ?? 0).toBeGreaterThanOrEqual(10);
		expect((sets.squatMain ?? 0) + (sets.quads ?? 0)).toBeGreaterThanOrEqual(8);
	});

	test('Kraft: wenige Wiederholungen bei den Grundübungen, Muskelaufbau mehr', () => {
		const repsOf = (goal: Goal) => {
			const p = createProgram(req(goal, 4));
			return dayPrescription(p, 0, 1).find((x) => x.exercise === 'Kniebeuge')!.reps;
		};
		expect(Number(repsOf('strength'))).toBeLessThanOrEqual(5);
		expect(Number(repsOf('hypertrophy'))).toBeGreaterThanOrEqual(8);
	});

	test('Kraft hat Aufbau- und Kraftblock mit unterschiedlichen Wiederholungen', () => {
		const sq = (block: 'hypertrophy' | 'strength') =>
			Number(dayPrescription(createProgram(req('strength', 4, 'intermediate', { block })), 0, 1)[0].reps);
		expect(sq('hypertrophy')).toBeGreaterThan(sq('strength'));
		expect(planName(req('strength', 4, 'intermediate', { block: 'strength' }))).toBe('Kraft · Kraftblock');
		expect(planName(req('powerlifting', 4, 'intermediate', { block: 'hypertrophy' }))).toBe('Powerlifting · Aufbaublock');
	});

	test('Kraft enthält alle vier Grundübungen, Powerlifting kein Schulterdrücken', () => {
		expect(programLifts(createProgram(req('strength', 4)))).toEqual(['squat', 'bench', 'deadlift', 'press']);
		expect(programLifts(createProgram(req('powerlifting', 4, 'intermediate', { focus: 'squat' })))).not.toContain('press');
	});
});

describe('eigene Bestwerte', () => {
	test('Gewichte folgen genau den Bestwerten', () => {
		const program = createProgram(req('strength', 4));
		expect(estimatedMax(program, 'squat', 0)).toBe(140);
		expect(estimatedMax(program, 'press', 0)).toBe(60);
		// 5 Wdh. bei RPE 7 ≈ 76 % des Maximums
		const squat = dayPrescription(program, 0, 1).find((p) => p.exercise === 'Kniebeuge')!;
		expect(squat.weight).toBeGreaterThan(140 * 0.7);
		expect(squat.weight).toBeLessThan(140 * 0.85);
	});

	test('Powerlifting übernimmt die Bestwerte exakt', () => {
		const program = createProgram(req('powerlifting', 4, 'intermediate', { focus: 'squat' }));
		expect(estimatedMax(program, 'squat', 0)).toBe(140);
		expect(estimatedMax(program, 'deadlift', 0)).toBe(180);
	});

	test('Bestwert ändern rechnet nur ab der aktuellen Woche neu', () => {
		const program = createProgram(req('strength', 4));
		const ex = () => program.days[1].exercises.find((e) => e.exercise === 'Kniebeuge')!;
		const before = [...ex().weekWeights];
		applyBests(program, { squat: 160 }, 4);
		expect(ex().weekWeights[2]).toBe(before[2]);
		expect(ex().weekWeights[5] as number).toBeGreaterThan(before[5] as number);
		expect(estimatedMax(program, 'squat', 4)).toBe(160);
	});

	test('ohne Bestwert kein Gewicht, das erste Training liefert den Wert', () => {
		const program = createProgram({ ...req('strength', 4), bests: { bench: 100 } });
		const dayIndex = 1;
		const squat = dayPrescription(program, 0, dayIndex).find((p) => p.exercise === 'Kniebeuge')!;
		expect(squat.weight).toBeNull();
		const workout = {
			weekIndex: 0,
			dayIndex,
			exercises: program.days[dayIndex].exercises.map((e) => ({
				exercise: e.exercise,
				lift: e.lift,
				isMain: e.isMain,
				target: { sets: 1, reps: '5', rpe: 7, weight: null },
				sets: e.exercise === 'Kniebeuge' ? [{ weight: 100, reps: 5, feel: 'okay', rpe: 8, done: true }] : []
			}))
		} as unknown as Workout;
		expect(applyWorkout(program, workout)).toBe(true);
		expect(estimatedMax(program, 'squat', 0)).toBeGreaterThan(110);
		expect(dayPrescription(program, 1, dayIndex).find((p) => p.exercise === 'Kniebeuge')!.weight).toBeGreaterThan(70);
	});
});
