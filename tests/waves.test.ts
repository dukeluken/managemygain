import { describe, expect, test } from 'vitest';
import type { PlanRequest, Program } from '../src/lib/data/types';
import { createProgram, editExercise, previewLength, setPlanLength, waveLengths, weekCount } from '../src/lib/engine';
import { layoutWithPrefix } from '../src/lib/engine/waves';

const deloadWeeks = (p: Program) => p.weekTypes.map((t, i) => (t === 'deload' ? i + 1 : 0)).filter(Boolean);
const req = (extra: Partial<PlanRequest> = {}): PlanRequest => ({
	goal: 'strength',
	block: 'strength',
	daysPerWeek: 4,
	experience: 'intermediate',
	bests: { squat: 140, bench: 100, deadlift: 180, press: 60 },
	...extra
});

describe('Wellenlängen', () => {
	test('Fortgeschritten: Wellen um 4 Wochen, letzte Woche Entlastung', () => {
		expect(waveLengths(6)).toEqual([6]);
		expect(waveLengths(7)).toEqual([4, 3]);
		expect(waveLengths(8)).toEqual([4, 4]);
		expect(waveLengths(10)).toEqual([5, 5]);
		expect(waveLengths(12)).toEqual([4, 4, 4]);
		expect(waveLengths(14)).toEqual([5, 5, 4]);
		expect(waveLengths(16)).toEqual([4, 4, 4, 4]);
	});

	test('Einsteiger: längere Wellen', () => {
		expect(waveLengths(12, 'beginner')).toEqual([6, 6]);
		expect(waveLengths(18, 'beginner')).toEqual([6, 6, 6]);
		expect(waveLengths(8, 'beginner')).toEqual([4, 4]);
	});

	test('jede Länge von 4 bis 52: Wellen 4–6 Wochen, Summe stimmt', () => {
		for (const level of ['beginner', 'intermediate', 'advanced'] as const) {
			for (let w = 4; w <= 52; w++) {
				const l = waveLengths(w, level);
				expect(l.reduce((a, b) => a + b, 0)).toBe(w);
				l.forEach((x) => expect(x).toBeGreaterThanOrEqual(w === 7 ? 3 : 4));
				l.forEach((x) => expect(x).toBeLessThanOrEqual(6));
			}
		}
	});

	test('feste Wochen bleiben, laufende Welle wird nicht zu früh beendet', () => {
		const types = ['regular', 'regular', 'regular', 'deload', 'regular', 'regular'] as const;
		// 6 Wochen fest (Welle 1 + zwei Wochen der zweiten Welle), Ziel 10 Wochen
		const l = layoutWithPrefix([...types, 'regular', 'deload'], 6, 10, 'intermediate');
		expect(l[0]).toBe(4);
		expect(l.reduce((a, b) => a + b, 0)).toBe(10);
		expect(l[1]).toBeGreaterThanOrEqual(3);
	});
});

describe('Pläne mit verteilten Entlastungen', () => {
	test('10 Wochen: Entlastung in 5 und 10', () => {
		const p = createProgram(req({ weeks: 10 }));
		expect(weekCount(p)).toBe(10);
		expect(deloadWeeks(p)).toEqual([5, 10]);
	});

	test('längere Wellen strecken die Steigerung, ohne die Spitze zu erhöhen', () => {
		const four = createProgram(req({ weeks: 8 }));
		const five = createProgram(req({ weeks: 10 }));
		const rpes = (p: Program) => p.days[1].exercises.find((e) => e.exercise === 'Kniebeuge')!.weekRpes;
		const peak4 = Math.max(...rpes(four).slice(0, 3));
		const peak5 = Math.max(...rpes(five).slice(0, 4));
		expect(peak5).toBe(peak4);
		// innerhalb der Welle nie fallend
		const r5 = rpes(five).slice(0, 4);
		r5.slice(1).forEach((x, i) => expect(x).toBeGreaterThanOrEqual(r5[i]));
	});

	test('Powerlifting endet ebenfalls mit Entlastung', () => {
		for (const weeks of [9, 10, 13]) {
			const p = createProgram(req({ goal: 'powerlifting', focus: 'squat', weeks }));
			expect(weekCount(p)).toBe(weeks);
			expect(p.weekTypes.at(-1)).toBe('deload');
		}
	});
});

describe('Länge ändern verteilt neu', () => {
	test('12 → 10 Wochen ohne Training: 5 + 5', () => {
		const p = createProgram(req({ weeks: 12 }));
		setPlanLength(p, 10, 0);
		expect(deloadWeeks(p)).toEqual([5, 10]);
		p.days.forEach((d) => d.exercises.forEach((e) => expect(e.weekSets).toHaveLength(10)));
		expect(p.days[1].exercises[0].weekWeights.every((w) => typeof w === 'number' && w > 0)).toBe(true);
	});

	test('trainierte Wochen bleiben unverändert', () => {
		const p = createProgram(req({ weeks: 12 }));
		const before = JSON.stringify(p.days.map((d) => d.exercises.map((e) => [e.weekSets.slice(0, 6), e.weekWeights.slice(0, 6)])));
		setPlanLength(p, 14, 6);
		const after = JSON.stringify(p.days.map((d) => d.exercises.map((e) => [e.weekSets.slice(0, 6), e.weekWeights.slice(0, 6)])));
		expect(after).toBe(before);
		expect(p.weekTypes[3]).toBe('deload');
		expect(p.weekTypes.at(-1)).toBe('deload');
	});

	test('eigene Änderungen werden übertragen', () => {
		const p = createProgram(req({ weeks: 12 }));
		editExercise(p, 0, 1, 0, weekCount(p), { sets: 5 });
		const marked = p.days[0].exercises[1];
		setPlanLength(p, 10, 0);
		const regularWeeks = p.weekTypes.map((t, i) => (t === 'regular' ? i : -1)).filter((i) => i >= 0);
		regularWeeks.forEach((i) => expect(marked.weekSets[i]).toBeGreaterThanOrEqual(5));
	});

	test('Vorschau entspricht dem Ergebnis', () => {
		const p = createProgram(req({ weeks: 12 }));
		const preview = previewLength(p, 14, 0);
		setPlanLength(p, 14, 0);
		expect(p.weekTypes).toEqual(preview);
	});
});
