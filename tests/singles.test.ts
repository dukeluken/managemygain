import { describe, expect, test } from 'vitest';
import type { PlanRequest, Program, Workout } from '../src/lib/data/types';
import {
	amountLabel,
	applyWorkout,
	backoffFromSingle,
	createProgram,
	dayPrescription,
	estimatedMax,
	prescribe,
	setPlanLength,
	setTopSingle,
	weekCount
} from '../src/lib/engine';

const bests = { squat: 160, bench: 110, deadlift: 200, press: 65 };
const req = (extra: Partial<PlanRequest> = {}): PlanRequest => ({
	goal: 'strength',
	block: 'strength',
	daysPerWeek: 4,
	experience: 'intermediate',
	bests,
	...extra
});
const withSingle = (p: Program) => p.days.flatMap((d) => d.exercises).filter((e) => e.weekTopSingle?.some((r) => r != null));

describe('Top-Single + Back-offs', () => {
	test('Kraftblock: Singles für Kniebeuge, Bank, Kreuzheben am schweren Tag, zweite Hälfte, ohne Entlastung', () => {
		const p = createProgram(req({ weeks: 12 }));
		const ex = withSingle(p);
		expect(ex.map((e) => e.exercise).sort()).toEqual(['Bankdrücken', 'Kniebeuge', 'Kreuzheben']);
		for (const e of ex) {
			e.weekTopSingle!.forEach((r, i) => {
				if (i < 6 || p.weekTypes[i] === 'deload') expect(r).toBeNull();
				else {
					expect(r).toBeGreaterThanOrEqual(7.5);
					expect(r).toBeLessThanOrEqual(9);
				}
			});
			expect(e.role).not.toBe('volume');
		}
	});

	test('Aufbaublock, Muskelaufbau und Fitness: keine Singles', () => {
		expect(withSingle(createProgram(req({ block: 'hypertrophy' })))).toHaveLength(0);
		expect(withSingle(createProgram(req({ goal: 'hypertrophy' })))).toHaveLength(0);
		expect(withSingle(createProgram(req({ goal: 'fitness', daysPerWeek: 3 })))).toHaveLength(0);
	});

	test('Powerlifting-Kraftblock: Singles am ersten Tag der jeweiligen Übung', () => {
		const p = createProgram(req({ goal: 'powerlifting', focus: 'squat', weeks: 12 }));
		expect(withSingle(p).map((e) => e.exercise).sort()).toEqual(['Wettkampfbankdrücken', 'Wettkampfkniebeuge', 'Wettkampfkreuzheben']);
	});

	test('Single schwerer als die Back-offs, Anzeige mit beidem', () => {
		const p = createProgram(req({ weeks: 12 }));
		const ex = withSingle(p).find((e) => e.exercise === 'Kniebeuge')!;
		const week = ex.weekTopSingle!.findIndex((r) => r != null);
		const rx = prescribe(ex, week);
		expect(rx.topSingle!.weight).toBeGreaterThan(rx.weight!);
		// RPE 8 Single ≈ 92 % des Maximums
		expect(rx.topSingle!.weight! / estimatedMax(p, 'squat', week)!).toBeGreaterThan(0.85);
		expect(amountLabel(rx)).toMatch(/^Single .* \+ \d × /);
	});

	test('Back-offs folgen der Tagesform, höchstens ±10 %', () => {
		expect(backoffFromSingle(140, { weight: 150, rpe: 8 }, { weight: 150, rpe: 8 })).toBe(140);
		expect(backoffFromSingle(140, { weight: 150, rpe: 8 }, { weight: 155, rpe: 8 })).toBeGreaterThan(140);
		expect(backoffFromSingle(140, { weight: 150, rpe: 8 }, { weight: 150, rpe: 9.5 })).toBeLessThan(140);
		expect(backoffFromSingle(140, { weight: 150, rpe: 8 }, { weight: 250, rpe: 8 })).toBe(155); // gedeckelt
	});

	test('Single ein- und ausschalten im Editor, Entlastung bleibt frei', () => {
		const p = createProgram(req({ block: 'hypertrophy', weeks: 8 }));
		const dayIndex = 1;
		const exIndex = p.days[1].exercises.findIndex((e) => e.exercise === 'Kniebeuge');
		setTopSingle(p, dayIndex, exIndex, 0, weekCount(p), true);
		const ex = p.days[1].exercises[exIndex];
		expect(ex.weekTopSingle![0]).toBe(8);
		expect(ex.weekTopSingle![3]).toBeNull();
		expect(typeof ex.weekSingleWeights![0]).toBe('number');
		setTopSingle(p, dayIndex, exIndex, 0, weekCount(p), false);
		expect(p.days[1].exercises[exIndex].weekTopSingle).toBeUndefined();
	});

	test('Länge ändern überträgt Singles, nie in Entlastungswochen', () => {
		const p = createProgram(req({ weeks: 12 }));
		setPlanLength(p, 10, 0);
		for (const e of withSingle(p)) e.weekTopSingle!.forEach((r, i) => p.weekTypes[i] === 'deload' && expect(r).toBeNull());
		expect(withSingle(p).length).toBe(3);
	});
});

describe('Autoregulation nutzt das Single', () => {
	test('Bestwert aus dem Satz mit dem höchsten geschätzten Maximum', () => {
		const p = createProgram(req({ weeks: 12 }));
		const dayIndex = p.days.findIndex((d) => d.exercises.some((e) => e.exercise === 'Kniebeuge' && e.weekTopSingle));
		const week = 6;
		const list = dayPrescription(p, week, dayIndex);
		const before = estimatedMax(p, 'squat', week)!;
		const w = {
			weekIndex: week,
			dayIndex,
			exercises: list.map((x) => ({
				exercise: x.exercise,
				lift: x.lift,
				isMain: x.isMain,
				target: { sets: x.sets, reps: x.reps, rpe: x.rpe, weight: x.weight },
				sets:
					x.exercise === 'Kniebeuge'
						? [
								// leichtes Single (RPE 7) → höheres Maximum; Back-offs schwer bewertet
								{ kind: 'single', weight: x.topSingle!.weight, reps: 1, rpe: 7, feel: 'leicht', done: true },
								{ kind: 'backoff', weight: x.weight, reps: Number(x.reps), rpe: 9, feel: 'hart', done: true }
							]
						: []
			}))
		} as unknown as Workout;
		applyWorkout(p, w);
		expect(estimatedMax(p, 'squat', week)!).toBeGreaterThan(before);
	});
});

describe('Gewichtsentwicklung im Plan', () => {
	test('geplant je Woche, Entlastung leichter, Ziel in der letzten Belastungswoche, geschafft aus dem Training', async () => {
		const { liftTrajectories } = await import('../src/lib/engine');
		const program = createProgram(req({ weeks: 12 }));
		const plan = { program, startDate: '2026-11-02' } as never;
		const ex = program.days[1].exercises.find((e) => e.exercise === 'Kniebeuge')!;
		const workouts = [
			{
				weekIndex: 0,
				finishedAt: 'x',
				exercises: [{ exercise: 'Kniebeuge', sets: [{ weight: 117.5, reps: 5, done: true }] }]
			}
		] as unknown as Workout[];
		const squat = liftTrajectories(plan, workouts).find((t) => t.lift === 'squat')!;
		expect(squat.weeks).toHaveLength(12);
		expect(squat.weeks[0].actual).toBe(117.5);
		expect(squat.weeks[3].planned!).toBeLessThan(squat.weeks[2].planned!);
		expect(squat.goal!.week).toBe(10);
		expect(squat.goal!.weight).toBeGreaterThan(squat.weeks[0].planned!);
		expect(squat.goalSingle).toBeGreaterThan(squat.goal!.weight);
		expect(ex).toBeTruthy();
	});
});
