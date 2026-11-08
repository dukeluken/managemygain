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
	renameDay,
	setPlanLength,
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

	test('Gewicht für Assistenzübung über alle Wochen: Startwert mit Progression, wieder leeren', () => {
		const program = createProgram(req);
		const dayIndex = 0;
		const exIndex = program.days[0].exercises.findIndex((e) => !e.lift);
		const ex = () => program.days[0].exercises[exIndex];
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { weight: 30 });
		const w = (i: number) => prescribe(ex(), i).weight!;
		expect(w(0)).toBe(30);
		expect(w(2)).toBeGreaterThanOrEqual(w(0)); // steigt mit der Welle
		expect(w(3)).toBeLessThanOrEqual(w(2)); // Entlastung nicht schwerer
		expect(w(6)).toBeGreaterThan(w(0)); // zweite Welle höher
		expect(w(10)).toBeGreaterThan(w(6)); // dritte Welle noch höher
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { weight: null });
		expect(prescribe(ex(), 5).weight).toBeNull();
	});

	test('eigenes Gewicht nur für eine Woche bleibt fest', () => {
		const program = createProgram(req);
		const exIndex = program.days[0].exercises.findIndex((e) => !e.lift);
		editExercise(program, 0, exIndex, 2, 3, { weight: 25 });
		expect(prescribe(program.days[0].exercises[exIndex], 2).weight).toBe(25);
		expect(prescribe(program.days[0].exercises[exIndex], 4).weight).toBeNull();
	});
});

describe('Progression bleibt beim Bearbeiten über mehrere Wochen', () => {
	test('Hauptübung: eigenes Startgewicht, danach Steigerung und Entlastung wie geplant', () => {
		const program = createProgram(req);
		const { dayIndex, exIndex, ex } = mainSlot(program);
		const before = (ex().weekWeights as number[]).slice();
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { weight: before[0] + 10 });
		const after = ex().weekWeights as number[];
		expect(after[0]).toBe(before[0] + 10);
		expect(after[2]).toBeGreaterThan(after[0]);
		expect(after[3]).toBeLessThan(after[2]);
		expect(after[6]).toBeGreaterThan(before[6]);
		expect(ex().weekWeightOverrides.every((o) => !o)).toBe(true);
	});

	test('Wiederholungen werden verschoben, nicht überschrieben', () => {
		const program = createProgram({ ...req, goal: 'strength', bests: { squat: 140, bench: 100, deadlift: 180, press: 60 } });
		const dayIndex = 1;
		const exIndex = program.days[1].exercises.findIndex((e) => e.exercise === 'Kniebeuge');
		const ex = () => program.days[1].exercises[exIndex];
		const before = ex().weekReps.map(Number);
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { reps: String(before[0] + 1) });
		const after = ex().weekReps.map(Number);
		after.forEach((r, i) => expect(r).toBe(before[i] + 1));
		expect(new Set(after).size).toBeGreaterThan(1); // Wellen bleiben
	});

	test('Spannen verschieben sich als Ganzes', () => {
		const program = createProgram({ ...req, goal: 'hypertrophy', bests: {} });
		const exIndex = program.days[0].exercises.findIndex((e) => String(e.weekReps[0]).includes('–'));
		editExercise(program, 0, exIndex, 0, weekCount(program), { reps: '6–10' });
		expect(program.days[0].exercises[exIndex].weekReps[5]).toBe('6–10');
	});

	test('RPE: Änderung wird übertragen, Entlastung bleibt leicht', () => {
		const program = createProgram(req);
		const { dayIndex, exIndex, ex } = mainSlot(program);
		const before = ex().weekRpes.slice();
		editExercise(program, dayIndex, exIndex, 0, weekCount(program), { rpe: before[0] + 0.5 });
		expect(ex().weekRpes[1]).toBe(before[1] + 0.5);
		expect(ex().weekRpes[3]).toBe(before[3]);
		// höhere RPE → schwerer
		expect(ex().weekWeights[1] as number).toBeGreaterThanOrEqual(before[1] ? 0 : 0);
	});
});

describe('Plan anpassen', () => {
	test('Plan verlängern setzt Wellen und Entlastung fort, Gewichte steigen weiter', () => {
		const program = createProgram(req);
		const old = weekCount(program);
		setPlanLength(program, old + 4);
		expect(weekCount(program)).toBe(old + 4);
		expect(program.weekTypes[old + 3]).toBe('deload');
		const { ex } = mainSlot(program);
		const w = ex().weekWeights as number[];
		expect(w).toHaveLength(old + 4);
		expect(w[old]).toBeGreaterThanOrEqual(w[old - 4]);
		expect(w.every((x) => typeof x === 'number' && x > 0)).toBe(true);
	});

	test('Plan kürzen', () => {
		const program = createProgram(req);
		setPlanLength(program, 8);
		expect(weekCount(program)).toBe(8);
		program.days.forEach((d) => d.exercises.forEach((e) => expect(e.weekSets).toHaveLength(8)));
	});

	test('Tag umbenennen', () => {
		const program = createProgram(req);
		renameDay(program, 0, '  Beine schwer ');
		expect(program.days[0].title).toBe('Beine schwer');
		renameDay(program, 0, '');
		expect(program.days[0].title).toBeUndefined();
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
