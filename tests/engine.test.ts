import { describe, expect, test } from 'vitest';
import type { Plan, PlanRequest, Workout } from '../src/lib/data/types';
import {
	applyWorkout,
	createProgram,
	dayPrescription,
	dayTitle,
	feelToRpe,
	isoDate,
	mondayOf,
	nextDayIndex,
	weekCount,
	weekIndexAt,
	weekSlots
} from '../src/lib/engine';

const req: PlanRequest = {
	goal: 'powerlifting',
	block: 'strength',
	daysPerWeek: 4,
	experience: 'intermediate',
	focus: 'squat',
	deadliftStance: 'conventional',
	bests: { squat: 165, bench: 118, deadlift: 210 }
};

function makePlan(start = '2026-11-02'): Plan {
	return {
		id: 'p1',
		ownerId: 'u1',
		authorId: 'u1',
		source: 'generator',
		name: 'Test',
		goal: 'strength',
		startDate: start,
		status: 'active',
		request: req,
		engine: 'powerlifting-v2',
		program: createProgram(req),
		createdAt: '',
		updatedAt: ''
	};
}

function finished(plan: Plan, weekIndex: number, dayIndex: number, feel: 'okay' | 'leicht' = 'okay'): Workout {
	const list = dayPrescription(plan.program, weekIndex, dayIndex);
	return {
		id: `w${weekIndex}d${dayIndex}`,
		ownerId: 'u1',
		planId: plan.id,
		weekIndex,
		dayIndex,
		dayName: '',
		date: '',
		startedAt: '',
		finishedAt: '2026-11-03T18:00:00Z',
		exercises: list.map((p) => ({
			exercise: p.exercise,
			lift: p.lift,
			isMain: p.isMain,
			target: { sets: p.sets, reps: p.reps, rpe: p.rpe, weight: p.weight },
			sets: Array.from({ length: p.sets }, () => ({
				weight: p.weight,
				reps: Number.parseInt(p.reps, 10),
				feel,
				rpe: feelToRpe(feel, p.rpe),
				done: true
			}))
		}))
	};
}

describe('Datum und Woche', () => {
	test('Montag der Woche', () => {
		expect(isoDate(mondayOf(new Date(2026, 10, 5)))).toBe('2026-11-02'); // Donnerstag
		expect(isoDate(mondayOf(new Date(2026, 10, 8)))).toBe('2026-11-02'); // Sonntag
		expect(isoDate(mondayOf(new Date(2026, 10, 9)))).toBe('2026-11-09'); // Montag
	});

	test('Planwoche aus Startdatum', () => {
		const plan = makePlan('2026-11-02');
		expect(weekIndexAt(plan, new Date(2026, 10, 2))).toBe(0);
		expect(weekIndexAt(plan, new Date(2026, 10, 8))).toBe(0);
		expect(weekIndexAt(plan, new Date(2026, 10, 9))).toBe(1);
		expect(weekIndexAt(plan, new Date(2026, 9, 30))).toBe(-1);
		// Über die Zeitumstellung (25.10.2026) hinweg stabil
		expect(weekIndexAt(makePlan('2026-10-19'), new Date(2026, 9, 26))).toBe(1);
	});
});

describe('Programm und Vorgaben', () => {
	test('erzeugt Programm mit Gewichten für die Hauptübungen', () => {
		const plan = makePlan();
		expect(weekCount(plan.program)).toBeGreaterThan(4);
		expect(plan.program.days).toHaveLength(4);
		const list = dayPrescription(plan.program, 0, 0);
		const main = list.find((p) => p.isMain);
		expect(main?.weight).toBeGreaterThan(50);
		expect(list.every((p) => p.sets >= 1)).toBe(true);
	});

	test('Wettkampfnamen nur bei Powerlifting', () => {
		const names = (r: PlanRequest) =>
			createProgram(r).days.flatMap((d) => d.exercises.map((e) => e.exercise));
		const strength = { ...req, goal: 'strength' as const };
		expect(names(strength).some((n) => n.startsWith('Wettkampf'))).toBe(false);
		expect(names(strength)).toContain('Kniebeuge');
		expect(names(req)).toContain('Wettkampfkniebeuge');
	});

	test('Tagestitel aus Hauptübungen', () => {
		const plan = makePlan();
		expect(dayTitle(plan.program.days[0])).toMatch(/Kniebeuge|Bankdrücken|Kreuzheben/);
	});

	test('Anstrengung relativ zur Vorgabe', () => {
		expect(feelToRpe('okay', 7.5)).toBe(7.5);
		expect(feelToRpe('leicht', 8)).toBe(6.5);
		expect(feelToRpe('leicht', 7)).toBe(6);
		expect(feelToRpe('hart', 9)).toBe(10);
	});
});

describe('Woche', () => {
	test('nächste offene Einheit überspringt erledigte', () => {
		const plan = makePlan();
		const first = nextDayIndex(plan.program, [], 0)!;
		const done = finished(plan, 0, first);
		const second = nextDayIndex(plan.program, [done], 0);
		expect(second).not.toBe(first);
		expect(second).not.toBeNull();
	});

	test('Status der Wochentage', () => {
		const plan = makePlan('2026-11-02');
		const first = nextDayIndex(plan.program, [], 0)!;
		const slots = weekSlots(plan, [finished(plan, 0, first)], 0, new Date(2026, 10, 5));
		expect(slots).toHaveLength(7);
		expect(slots.filter((s) => s.dayIndex != null)).toHaveLength(4);
		expect(slots.filter((s) => s.status === 'done')).toHaveLength(1);
		expect(slots.some((s) => s.status === 'today' || s.status === 'next')).toBe(true);
	});
});

describe('Autoregulation', () => {
	test('leichte Sätze heben folgende Wochen, aktuelle Woche bleibt', () => {
		const plan = makePlan();
		const dayIndex = plan.program.days.findIndex((d) => d.exercises.some((e) => e.category === 'squatMain'));
		const before = structuredClone(plan.program);
		const changed = applyWorkout(plan.program, finished(plan, 0, dayIndex, 'leicht'));
		expect(changed).toBe(true);
		const idx = plan.program.days[dayIndex].exercises.findIndex((e) => e.category === 'squatMain');
		const old = before.days[dayIndex].exercises[idx].weekWeights as number[];
		const now = plan.program.days[dayIndex].exercises[idx].weekWeights as number[];
		expect(now[0]).toBe(old[0]);
		expect(now[1]).toBeGreaterThanOrEqual(old[1]);
		expect(now.some((w, i) => w > old[i])).toBe(true);
	});

	test('wie geplant ändert kaum etwas', () => {
		const plan = makePlan();
		const before = JSON.stringify(plan.program.maxes);
		applyWorkout(plan.program, finished(plan, 0, 0, 'okay'));
		const after = plan.program.maxes as Record<string, number>;
		const old = JSON.parse(before) as Record<string, number>;
		for (const l of Object.keys(old)) expect(Math.abs(after[l] - old[l]) / old[l]).toBeLessThan(0.03);
	});
});
