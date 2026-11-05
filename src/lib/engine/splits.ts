// Split-Engine für Muskelaufbau, allgemeine Kraft und Fitness.
//
// Aufbau je Ziel und Trainingstagen:
//   Muskelaufbau: 2–3 Tage Ganzkörper, 4 Ober/Unter, 5 Ober/Unter + Push/Pull/Beine, 6 Push/Pull/Beine ×2
//   Kraft:        2–3 Tage Ganzkörper, 4–5 Ober/Unter (schwerer Tag + Volumentag je Grundübung)
//   Fitness:      2–3 Tage Ganzkörper, 4 Ober/Unter, moderat und maschinenfreundlich
// Jeder Muskel wird dadurch etwa zweimal pro Woche trainiert (Schoenfeld et al. 2016/2019).
// Vier-Wochen-Wellen: Ziel-RPE steigt, Woche 4 ist Entlastung mit ~60 % der Sätze.
// Gewichte nur für Übungen mit Bezug zu einem Bestwert (siehe loads.ts).
import type { Block, Experience, Goal, PlanRequest, Program, ProgramDay, ProgramExercise } from '#lib/data/types.ts';
import { ALL_LIFTS, LOAD_REFS, setMaxes } from './loads.ts';

type Pattern =
	| 'squat'
	| 'hinge'
	| 'hpress'
	| 'vpress'
	| 'hpull'
	| 'vpull'
	| 'lunge'
	| 'quadIso'
	| 'hamIso'
	| 'glute'
	| 'chestIso'
	| 'sideDelt'
	| 'rearDelt'
	| 'biceps'
	| 'triceps'
	| 'calves'
	| 'core';
type Role = 'main' | 'volume' | 'secondary' | 'accessory';
/** [Bewegungsmuster, Rolle, Übungsvariante] */
type Slot = [Pattern, Role, number];
type Phase = 'hypertrophy' | 'strength' | 'fitness';

const POOL: Record<Pattern, [name: string, category: string][]> = {
	squat: [
		['Kniebeuge', 'squatMain'],
		['Frontkniebeuge', 'squatVar'],
		['Hack Squat', 'quads'],
		['Beinpresse', 'quads']
	],
	hinge: [
		['Kreuzheben', 'deadliftMain'],
		['Rumänisches Kreuzheben', 'hamstrings']
	],
	hpress: [
		['Bankdrücken', 'benchMain'],
		['Schrägbankdrücken', 'chest'],
		['Kurzhantel-Bankdrücken', 'chest']
	],
	vpress: [
		['Schulterdrücken', 'shoulders'],
		['Kurzhantel-Schulterdrücken', 'shoulders']
	],
	hpull: [
		['Langhantelrudern', 'back'],
		['Brustgestütztes Rudern', 'back'],
		['Kabelrudern', 'back']
	],
	vpull: [
		['Latzug', 'back'],
		['Klimmzüge', 'back']
	],
	lunge: [
		['Bulgarian Split Squat', 'quads'],
		['Ausfallschritte', 'quads']
	],
	quadIso: [['Beinstrecker', 'quads']],
	hamIso: [
		['Beinbeuger sitzend', 'hamstrings'],
		['Beinbeuger liegend', 'hamstrings']
	],
	glute: [['Hip Thrust', 'hamstrings']],
	chestIso: [
		['Kabel-Flys', 'chest'],
		['Butterfly', 'chest']
	],
	sideDelt: [['Seitheben', 'shoulders']],
	rearDelt: [
		['Face Pulls', 'back'],
		['Reverse Flys', 'shoulders']
	],
	biceps: [
		['Bizepscurls', 'biceps'],
		['Hammercurls', 'biceps']
	],
	triceps: [
		['Trizepsdrücken am Kabel', 'triceps'],
		['Überkopf-Trizepsstrecken', 'triceps'],
		['Skull Crusher', 'triceps']
	],
	calves: [['Wadenheben', 'calves']],
	core: [
		['Cable Crunch', 'core'],
		['Bauchrolle', 'core'],
		['Pallof Press', 'core']
	]
};

interface DayTemplate {
	title: string;
	slots: Slot[];
}

const T = {
	// Ganzkörper
	gkA: {
		title: 'Ganzkörper A',
		slots: [['squat', 'main', 0], ['hpress', 'main', 0], ['hpull', 'secondary', 0], ['hamIso', 'accessory', 0], ['sideDelt', 'accessory', 0], ['core', 'accessory', 0]]
	},
	gkB: {
		title: 'Ganzkörper B',
		slots: [['hinge', 'main', 0], ['vpress', 'main', 0], ['vpull', 'secondary', 0], ['lunge', 'secondary', 0], ['biceps', 'accessory', 0], ['triceps', 'accessory', 0]]
	},
	gkB_h: {
		title: 'Ganzkörper B',
		slots: [['hinge', 'main', 1], ['vpress', 'main', 0], ['vpull', 'secondary', 0], ['lunge', 'secondary', 0], ['biceps', 'accessory', 0], ['triceps', 'accessory', 0]]
	},
	gkC: {
		title: 'Ganzkörper C',
		slots: [['squat', 'secondary', 1], ['hpress', 'secondary', 1], ['hpull', 'secondary', 1], ['glute', 'accessory', 0], ['rearDelt', 'accessory', 0], ['calves', 'accessory', 0]]
	},
	gkC_s: {
		title: 'Ganzkörper C',
		slots: [['squat', 'volume', 0], ['hpress', 'volume', 0], ['hpull', 'secondary', 1], ['vpull', 'secondary', 1], ['core', 'accessory', 1]]
	},
	// Ober-/Unterkörper
	okA: {
		title: 'Oberkörper A',
		slots: [['hpress', 'main', 0], ['hpull', 'secondary', 0], ['vpress', 'secondary', 1], ['vpull', 'secondary', 0], ['triceps', 'accessory', 0], ['biceps', 'accessory', 0]]
	},
	ukA: {
		title: 'Unterkörper A',
		slots: [['squat', 'main', 0], ['hinge', 'secondary', 1], ['lunge', 'secondary', 0], ['hamIso', 'accessory', 0], ['calves', 'accessory', 0], ['core', 'accessory', 0]]
	},
	okB_h: {
		title: 'Oberkörper B',
		slots: [['hpress', 'secondary', 1], ['vpull', 'secondary', 1], ['hpull', 'secondary', 2], ['chestIso', 'accessory', 0], ['sideDelt', 'accessory', 0], ['rearDelt', 'accessory', 0]]
	},
	ukB_h: {
		title: 'Unterkörper B',
		slots: [['hinge', 'main', 1], ['squat', 'secondary', 3], ['quadIso', 'accessory', 0], ['hamIso', 'accessory', 1], ['glute', 'accessory', 0], ['core', 'accessory', 1]]
	},
	okB_s: {
		title: 'Oberkörper B',
		slots: [['vpress', 'main', 0], ['hpress', 'volume', 0], ['hpull', 'secondary', 1], ['vpull', 'secondary', 1], ['triceps', 'accessory', 1], ['rearDelt', 'accessory', 0]]
	},
	ukB_s: {
		title: 'Unterkörper B',
		slots: [['hinge', 'main', 0], ['squat', 'volume', 0], ['lunge', 'secondary', 1], ['hamIso', 'accessory', 0], ['core', 'accessory', 1]]
	},
	// Push / Pull / Beine
	push: {
		title: 'Push · Brust, Schultern, Trizeps',
		slots: [['hpress', 'main', 0], ['vpress', 'secondary', 0], ['hpress', 'secondary', 1], ['chestIso', 'accessory', 0], ['sideDelt', 'accessory', 0], ['triceps', 'accessory', 0]]
	},
	pull: {
		title: 'Pull · Rücken, Bizeps',
		slots: [['vpull', 'secondary', 0], ['hpull', 'secondary', 0], ['hpull', 'secondary', 2], ['rearDelt', 'accessory', 0], ['biceps', 'accessory', 0], ['biceps', 'accessory', 1]]
	},
	legs: {
		title: 'Beine',
		slots: [['squat', 'main', 0], ['hinge', 'secondary', 1], ['lunge', 'secondary', 0], ['quadIso', 'accessory', 0], ['hamIso', 'accessory', 0], ['calves', 'accessory', 0]]
	},
	push2: {
		title: 'Push · Schultern, Brust, Trizeps',
		slots: [['vpress', 'main', 0], ['hpress', 'secondary', 2], ['chestIso', 'accessory', 1], ['sideDelt', 'accessory', 0], ['triceps', 'accessory', 1], ['triceps', 'accessory', 2]]
	},
	pull2: {
		title: 'Pull · Rücken, Bizeps',
		slots: [['vpull', 'secondary', 1], ['hpull', 'secondary', 1], ['rearDelt', 'accessory', 1], ['biceps', 'accessory', 1], ['core', 'accessory', 0]]
	},
	legs2: {
		title: 'Beine · hintere Kette',
		slots: [['hinge', 'main', 1], ['squat', 'secondary', 1], ['lunge', 'secondary', 1], ['hamIso', 'accessory', 1], ['glute', 'accessory', 0], ['calves', 'accessory', 0]]
	},
	// Fitness: weniger Übungen, mehr Maschinen und Kurzhanteln
	fA: {
		title: 'Ganzkörper A',
		slots: [['squat', 'main', 0], ['hpress', 'secondary', 2], ['vpull', 'secondary', 0], ['hamIso', 'accessory', 0], ['core', 'accessory', 0]]
	},
	fB: {
		title: 'Ganzkörper B',
		slots: [['hinge', 'secondary', 1], ['vpress', 'secondary', 1], ['hpull', 'secondary', 2], ['lunge', 'secondary', 1], ['core', 'accessory', 2]]
	},
	fC: {
		title: 'Ganzkörper C',
		slots: [['squat', 'secondary', 3], ['hpress', 'main', 0], ['hpull', 'secondary', 1], ['glute', 'accessory', 0], ['biceps', 'accessory', 0], ['triceps', 'accessory', 0]]
	}
} satisfies Record<string, { title: string; slots: Slot[] }>;

const SPLITS: Record<Exclude<Goal, 'powerlifting'>, Partial<Record<number, DayTemplate[]>>> = {
	hypertrophy: {
		2: [T.gkA, T.gkB_h],
		3: [T.gkA, T.gkB_h, T.gkC],
		4: [T.okA, T.ukA, T.okB_h, T.ukB_h],
		5: [T.okA, T.ukA, T.push, T.pull, T.legs],
		6: [T.push, T.pull, T.legs, T.push2, T.pull2, T.legs2]
	},
	strength: {
		2: [T.gkA, T.gkB],
		3: [T.gkA, T.gkB, T.gkC_s],
		4: [T.okA, T.ukA, T.okB_s, T.ukB_s],
		5: [T.okA, T.ukA, T.okB_s, T.ukB_s, T.gkC]
	},
	fitness: {
		2: [T.fA, T.fB],
		3: [T.fA, T.fB, T.fC],
		4: [T.okA, T.ukA, T.okB_h, T.ukB_h]
	}
};

/** Erlaubte Trainingstage je Ziel. */
export const DAYS_FOR_GOAL: Record<Goal, number[]> = {
	hypertrophy: [2, 3, 4, 5, 6],
	strength: [2, 3, 4, 5],
	powerlifting: [2, 3, 4, 5],
	fitness: [2, 3, 4]
};

/** Wochentage (0 = So) je Anzahl Trainingstage, mit Pausen dazwischen. */
const WEEKDAYS: Record<number, number[]> = {
	2: [1, 4],
	3: [1, 3, 5],
	4: [1, 2, 4, 5],
	5: [1, 2, 3, 5, 6],
	6: [1, 2, 3, 4, 5, 6]
};

// ---------- Vorgaben ----------

interface Rx {
	sets: Record<Experience, number>;
	reps: (wave: number) => string | number;
	/** Ziel-RPE für Woche 1–4 der Welle (Woche 4 = Entlastung). */
	rpe: [number, number, number, number];
	/** Obergrenze, bis zu der spätere Wellen die RPE anheben. */
	cap: number;
}

const HIGH_REP_PATTERNS: Pattern[] = ['sideDelt', 'calves', 'core', 'rearDelt'];

function rxFor(phase: Phase, role: Role, pattern: Pattern): Rx {
	const isoReps = HIGH_REP_PATTERNS.includes(pattern);
	if (phase === 'hypertrophy') {
		if (role === 'main')
			return { sets: { beginner: 3, intermediate: 3, advanced: 4 }, reps: (w) => Math.max(6, 8 - w), rpe: [7, 7.5, 8, 6], cap: 8.5 };
		if (role === 'volume')
			return { sets: { beginner: 3, intermediate: 3, advanced: 3 }, reps: (w) => Math.max(8, 11 - w), rpe: [6.5, 7, 7.5, 6], cap: 8 };
		if (role === 'secondary')
			return { sets: { beginner: 3, intermediate: 3, advanced: 4 }, reps: () => '8–12', rpe: [7.5, 8, 8.5, 6], cap: 9 };
		return { sets: { beginner: 2, intermediate: 3, advanced: 3 }, reps: () => (isoReps ? '12–20' : '10–15'), rpe: [8, 8.5, 9, 6.5], cap: 9 };
	}
	if (phase === 'strength') {
		if (role === 'main')
			return { sets: { beginner: 3, intermediate: 4, advanced: 5 }, reps: (w) => Math.max(3, 5 - w), rpe: [7, 7.5, 8, 6], cap: 9 };
		if (role === 'volume')
			return { sets: { beginner: 3, intermediate: 3, advanced: 3 }, reps: (w) => Math.max(5, 8 - w), rpe: [6.5, 7, 7, 6], cap: 7.5 };
		if (role === 'secondary')
			return { sets: { beginner: 3, intermediate: 3, advanced: 3 }, reps: () => '6–8', rpe: [7, 7.5, 8, 6], cap: 8.5 };
		return { sets: { beginner: 2, intermediate: 2, advanced: 3 }, reps: () => (isoReps ? '10–15' : '8–12'), rpe: [7.5, 8, 8.5, 6], cap: 9 };
	}
	// Fitness
	if (role === 'main' || role === 'volume')
		return { sets: { beginner: 3, intermediate: 3, advanced: 3 }, reps: (w) => Math.max(8, 10 - w), rpe: [6, 6.5, 7, 6], cap: 7.5 };
	if (role === 'secondary')
		return { sets: { beginner: 2, intermediate: 3, advanced: 3 }, reps: () => '10–12', rpe: [6.5, 7, 7.5, 6], cap: 8 };
	return { sets: { beginner: 2, intermediate: 2, advanced: 3 }, reps: () => (isoReps ? '15–20' : '12–15'), rpe: [7, 7.5, 8, 6], cap: 8.5 };
}

export function cycleWeeksFor(goal: Goal, level: Experience): number {
	if (goal === 'fitness' || level === 'beginner') return 8;
	return 12;
}

export function phaseFor(goal: Goal, block?: Block): Phase {
	if (goal === 'fitness') return 'fitness';
	if (goal === 'hypertrophy') return 'hypertrophy';
	return block ?? 'strength';
}

function buildExercise(slot: Slot, phase: Phase, level: Experience, weeks: number): ProgramExercise {
	const [pattern, role, variant] = slot;
	const options = POOL[pattern];
	const [name, category] = options[variant % options.length];
	const ref = LOAD_REFS[name] ?? null;
	const rx = rxFor(phase, role, pattern);
	const weekSets: number[] = [];
	const weekReps: (string | number)[] = [];
	const weekRpes: number[] = [];
	for (let i = 0; i < weeks; i++) {
		const wave = Math.floor(i / 4);
		const inWave = i % 4;
		const deload = inWave === 3;
		const sets = rx.sets[level];
		weekSets.push(deload ? Math.max(1, Math.round(sets * 0.6)) : sets);
		weekReps.push(rx.reps(wave));
		weekRpes.push(deload ? rx.rpe[3] : Math.min(rx.cap, rx.rpe[inWave] + 0.5 * wave));
	}
	return {
		exercise: name,
		category,
		lift: ref?.lift ?? null,
		isMain: role === 'main' || role === 'volume',
		role,
		loadFactor: ref ? ref.factor : null,
		weekSets,
		weekReps,
		weekRpes,
		weekWeights: Array(weeks).fill(''),
		weekWeightOverrides: Array(weeks).fill(false),
		note: ''
	};
}

export function generateSplitProgram(req: PlanRequest): Program {
	const goal = req.goal === 'powerlifting' ? 'strength' : req.goal;
	const options = SPLITS[goal];
	const allowed = DAYS_FOR_GOAL[goal];
	const days = allowed.includes(req.daysPerWeek) ? req.daysPerWeek : allowed[allowed.length - 1];
	const templates = options[days] ?? options[3]!;
	const phase = phaseFor(goal, req.block);
	const weeks = req.weeks ?? cycleWeeksFor(goal, req.experience);
	const weekdays = WEEKDAYS[templates.length];

	const programDays: ProgramDay[] = templates.map((tpl, i) => ({
		name: tpl.title,
		title: tpl.title,
		weekDay: weekdays[i],
		exercises: tpl.slots.map((slot) => buildExercise(slot, phase, req.experience, weeks))
	}));

	const program: Program = {
		engine: 'splits-v1',
		goal,
		phase,
		level: req.experience,
		cycleWeeks: weeks,
		weekTypes: Array.from({ length: weeks }, (_, i) => (i % 4 === 3 ? 'deload' : 'regular')),
		days: programDays,
		maxes: {},
		maxAnchor: {},
		weeklyProgression: {},
		rounding: 2.5
	};
	const bests = Object.fromEntries(ALL_LIFTS.map((l) => [l, req.bests[l] ?? null]));
	setMaxes(program, bests, 0, req.experience);
	return program;
}

/** Kurzbeschreibung des Splits für die Auswahl der Trainingstage. */
export function splitLabel(goal: Goal, days: number): string {
	if (goal === 'powerlifting') return days <= 3 ? 'Kniebeuge, Bank, Kreuzheben verteilt' : 'Ein Schwerpunkt pro Tag';
	const g = goal === 'hypertrophy' ? 'hypertrophy' : goal;
	const map: Record<string, Record<number, string>> = {
		hypertrophy: { 2: 'Ganzkörper', 3: 'Ganzkörper', 4: 'Oberkörper / Unterkörper', 5: 'Ober / Unter + Push / Pull / Beine', 6: 'Push / Pull / Beine ×2' },
		strength: { 2: 'Ganzkörper', 3: 'Ganzkörper', 4: 'Oberkörper / Unterkörper', 5: 'Ober / Unter + Ganzkörper' },
		fitness: { 2: 'Ganzkörper', 3: 'Ganzkörper', 4: 'Oberkörper / Unterkörper' }
	};
	return map[g]?.[days] ?? '';
}
