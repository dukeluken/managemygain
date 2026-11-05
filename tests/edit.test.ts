import { describe, expect, test } from 'vitest';
import type { Plan, PlanRequest, Program, Workout } from '../src/lib/data/types';
import {
	addExercise,
	createProgram,
	editExercise,
	estimatesAt,
	exerciseCatalog,
	moveDay,
	moveExercise,
	prescribe,
	progressSeries,
	removeExercise,
	swapExercise,
	weekCount
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

function mainSlot(program: Program, category = 'squatMain') {
	const dayIndex = program.days.findIndex((d) => d.exercises.some((e) => e.category === category));
	const exIndex = program.days[dayIndex].exercises.findIndex((e) => e.category === category);
	return { dayIndex, exIndex, ex: () => program.days[dayIndex].exercises[exIndex] };
}

describe('Übung bearbeiten', () => {
	test('Sätze nur für eine Woche', () => {
		const program = createProgram(req);
		const { dayIndex, exIndex, ex } = mainSlot(program);
		const before = [...ex().weekSets];
		editExercise(program, dayIndex, exIndex, 2, 3, { sets: 7 });
		expect(ex().weekSets[2]).toBe(7);
		expect(ex().weekSets[1]).toBe(before[1]);
		expect(ex().weekSets[3]).toBe(before[3]);
	});

	test('Wiederholungen ab einer Woche ändern das berechnete Gewicht', () => {
		const program = createProgram(req);
		const { dayIndex, exIndex, ex } = mainSlot(program);
		const w1 = ex().weekWeights[1] as number;
		const w4 = ex().weekWeights[4] as number;
		editExercise(program, dayIndex, exIndex, 4, weekCount(program), { reps: '8' });
		expect(ex().weekReps[4]).toBe('8');
		expect(ex().weekWeights[1]).toBe(w1); // davor unverändert
		expect(ex().weekWeights[4] as number).toBeLessThan(w4); // mehr Wdh. → weniger Gewicht
	});

	test('eigenes Gewicht bleibt bei Neuberechnung, „automatisch“ setzt zurück', () => {
		const program = createProgram(req);
		const { dayIndex, exIndex, ex } = mainSlot(program);
		const auto = ex().weekWeights[3];
		editExercise(program, dayIndex, exIndex, 3, 4, { weight: 111 });
		expect(ex().weekWeights[3]).toBe(111);
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { reps: '3' });
		expect(ex().weekWeights[3]).toBe(111);
		editExercise(program, dayIndex, exIndex, 3, 4, { weight: null });
		expect(ex().weekWeightOverrides[3]).toBe(false);
		expect(ex().weekWeights[3]).not.toBe(111);
		expect(typeof auto).toBe('number');
	});

	test('Gewicht für Assistenzübung setzen und wieder leeren', () => {
		const program = createProgram(req);
		const dayIndex = 0;
		const exIndex = program.days[0].exercises.findIndex((e) => !e.lift);
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { weight: 30 });
		expect(prescribe(program.days[0].exercises[exIndex], 5).weight).toBe(30);
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { weight: null });
		expect(prescribe(program.days[0].exercises[exIndex], 5).weight).toBeNull();
	});
});

describe('Übungen tauschen, hinzufügen, entfernen', () => {
	test('Hauptübung gegen Assistenz tauschen entfernt berechnete Gewichte', () => {
		const program = createProgram(req);
		const { dayIndex, exIndex, ex } = mainSlot(program);
		const item = exerciseCatalog('strength').find((c) => c.name === 'Beinpresse')!;
		swapExercise(program, dayIndex, exIndex, item, 0);
		expect(ex().exercise).toBe('Beinpresse');
		expect(ex().lift).toBeNull();
		expect(ex().weekWeights.every((w) => w === '')).toBe(true);
	});

	test('Variante hinzufügen bekommt berechnete Gewichte', () => {
		const program = createProgram(req);
		const item = exerciseCatalog('strength').find((c) => c.category === 'benchVar')!;
		const n = program.days[0].exercises.length;
		addExercise(program, 0, item, 0);
		const added = program.days[0].exercises[n];
		expect(added.lift).toBe('bench');
		expect(added.weekWeights[0]).toBeGreaterThan(40);
		expect(added.weekWeights).toHaveLength(weekCount(program));
	});

	test('eigene Übung ohne Katalog', () => {
		const program = createProgram(req);
		addExercise(program, 1, { name: 'Sandsack tragen', group: 'Eigene', category: 'custom' }, 0);
		const last = program.days[1].exercises.at(-1)!;
		expect(last.exercise).toBe('Sandsack tragen');
		expect(prescribe(last, 0).weight).toBeNull();
	});

	test('verschieben und entfernen', () => {
		const program = createProgram(req);
		const names = program.days[0].exercises.map((e) => e.exercise);
		moveExercise(program, 0, 1, -1);
		expect(program.days[0].exercises[0].exercise).toBe(names[1]);
		moveExercise(program, 0, 0, -1); // erste nach oben: keine Änderung
		expect(program.days[0].exercises[0].exercise).toBe(names[1]);
		removeExercise(program, 0, 0);
		expect(program.days[0].exercises).toHaveLength(names.length - 1);
	});

	test('Katalog ohne Wettkampfnamen außer bei Powerlifting', () => {
		expect(exerciseCatalog('strength').some((c) => c.name.startsWith('Wettkampf'))).toBe(false);
		expect(exerciseCatalog('powerlifting').some((c) => c.name === 'Wettkampfkniebeuge')).toBe(true);
	});
});

describe('Wochentage', () => {
	test('auf freien Tag verschieben', () => {
		const program = createProgram(req);
		const used = new Set(program.days.map((d) => d.weekDay));
		const free = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d))!;
		moveDay(program, 0, free);
		expect(program.days[0].weekDay).toBe(free);
	});

	test('auf belegten Tag tauscht beide', () => {
		const program = createProgram(req);
		const a = program.days[0].weekDay;
		const b = program.days[1].weekDay;
		moveDay(program, 0, b);
		expect(program.days[0].weekDay).toBe(b);
		expect(program.days[1].weekDay).toBe(a);
	});
});

describe('Fortschritt', () => {
	test('Verlauf aus Startwert und Trainings, ohne Doppelungen', () => {
		const program = createProgram(req);
		const startMaxes = estimatesAt(program, 0);
		const plan = { startDate: '2026-11-02', startMaxes, program } as Plan;
		const w = (date: string, squat: number): Workout =>
			({ finishedAt: `${date}T18:00:00Z`, date, estimates: { squat, bench: startMaxes.bench, deadlift: startMaxes.deadlift } }) as Workout;
		const s = progressSeries(plan, [w('2026-11-05', 172), w('2026-11-03', 168), w('2026-11-06', 172)]);
		expect(s.squat!.map((p) => p.value)).toEqual([startMaxes.squat, 168, 172]);
		expect(s.bench).toHaveLength(1);
	});
});
