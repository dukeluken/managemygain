// Datenmodell v2.
//
// Firestore-Pfade:
//   profiles/{uid}                      Profil
//   profiles/{uid}/plans/{planId}       Pläne des Nutzers (auch später vom Coach erstellte)
//   profiles/{uid}/workouts/{workoutId} Absolvierte Trainings
//
// Vorbereitet für später:
//   - Coach: Rolle 'coach' in roles, Pläne mit authorId ≠ ownerId und source 'coach',
//     Freigabe über coachId am Profil (Regeln prüfen dann diese Verbindung).
//   - KI: füllt dasselbe PlanRequest aus wie heute das Formular, source 'ai'.

export type Role = 'trainee' | 'coach';
export type ThemePref = 'dark' | 'light' | 'system';

export interface Profile {
	uid: string;
	displayName: string;
	roles: Role[];
	activePlanId: string | null;
	/** Später: Coach, dem der Trainee folgt. */
	coachId: string | null;
	/** Anstrengung als leicht/okay/hart (einfach) oder als RPE-Zahl (für Erfahrene). */
	effortScale: 'simple' | 'rpe';
	/** Eigene Bestwerte (1 Wiederholung, kg). Grundlage für alle Gewichte im Plan. */
	bests?: Bests;
	bestsUpdatedAt?: string;
	createdAt: string;
	updatedAt: string;
}

/** Ziel bzw. Sportart. */
export type Goal = 'hypertrophy' | 'strength' | 'powerlifting' | 'fitness';
/** Art des Blocks: Aufbau (Hypertrophie, mehr Wiederholungen) oder Kraft (schwerer). */
export type Block = 'hypertrophy' | 'strength';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
/** Grundübungen mit Bestwert. press = Schulterdrücken (stehend, Langhantel). */
export type MainLift = 'squat' | 'bench' | 'deadlift' | 'press';
export type Bests = Partial<Record<MainLift, number | null>>;

/** Eingabe für die Planerzeugung. Heute aus dem Formular, später aus dem KI-Gespräch. */
export interface PlanRequest {
	goal: Goal;
	/** Nur bei Kraft und Powerlifting wählbar; Muskelaufbau ist immer Hypertrophie. */
	block?: Block;
	daysPerWeek: 2 | 3 | 4 | 5 | 6;
	experience: Experience;
	/** Bestwerte (1 Wdh., kg). Fehlende werden aus dem ersten Training geschätzt. */
	bests: Bests;
	/** Nur Powerlifting: Schwerpunkt und Kreuzheben-Stil. */
	focus?: Exclude<MainLift, 'press'>;
	deadliftStance?: 'conventional' | 'sumo';
	weeks?: number;
}

export type PlanSource = 'generator' | 'manual' | 'coach' | 'ai';

/** Eine Übung im Programm, mit Vorgaben pro Woche (Index = Woche − 1). */
export interface ProgramExercise {
	exercise: string;
	category: string;
	lift: MainLift | null;
	isMain: boolean;
	weekSets: number[];
	weekReps: (string | number)[];
	weekRpes: number[];
	weekWeights: (number | '')[];
	weekWeightOverrides: boolean[];
	note: string;
	/** Anteil am Bestwert der Grundübung (1 = Grundübung). null = kein vorgegebenes Gewicht. */
	loadFactor?: number | null;
	/** Rolle im Tag: Grundübung, Volumen der Grundübung, Ergänzung, Isolation. */
	role?: 'main' | 'volume' | 'secondary' | 'accessory';
	/** Persönlicher Faktor auf berechnete Gewichte (aus einem eigenen Gewicht über mehrere Wochen). */
	loadScale?: number;
	/** Eigenes Startgewicht ohne Bestwert-Bezug; die folgenden Wochen steigern sich davon. */
	anchor?: { week: number; weight: number };
	[key: string]: unknown;
}

export interface ProgramDay {
	name: string;
	/** Anzeigename, z. B. „Oberkörper A“. Fehlt bei Powerlifting-Plänen (dort aus den Hauptübungen). */
	title?: string;
	/** 0 = Sonntag … 6 = Samstag */
	weekDay: number;
	exercises: ProgramExercise[];
}

/** Das erzeugte Programm. */
export interface Program {
	cycleWeeks: number;
	weekTypes: ('regular' | 'deload')[];
	days: ProgramDay[];
	/** Bestwert-Grundlage je Grundübung und Woche, ab der sie gilt. */
	maxes: Partial<Record<MainLift, number | ''>>;
	maxAnchor?: Partial<Record<MainLift, number>>;
	/** Erwartete Steigerung des 1RM pro Woche in kg. */
	weeklyProgression?: Partial<Record<MainLift, number>>;
	/** Kleinster Gewichtssprung in kg. */
	rounding?: number;
	[key: string]: unknown;
}

export interface Plan {
	id: string;
	ownerId: string;
	authorId: string;
	source: PlanSource;
	name: string;
	goal: Goal;
	/** Montag der ersten Woche, ISO-Datum (YYYY-MM-DD). */
	startDate: string;
	status: 'active' | 'archived';
	request: PlanRequest | null;
	engine: 'powerlifting-v2' | 'splits-v1';
	program: Program;
	/** Geschätzte Bestwerte beim Erstellen, Ausgangspunkt für den Fortschritt. */
	startMaxes?: Partial<Record<MainLift, number | null>>;
	createdAt: string;
	updatedAt: string;
}

export type Feel = 'leicht' | 'okay' | 'hart';

export interface LoggedSet {
	weight: number | null;
	reps: number | null;
	feel: Feel | null;
	rpe: number | null;
	done: boolean;
}

export interface LoggedExercise {
	exercise: string;
	lift: MainLift | null;
	isMain: boolean;
	target: { sets: number; reps: string; rpe: number; weight: number | null; hint?: string };
	sets: LoggedSet[];
}

export interface Workout {
	id: string;
	ownerId: string;
	planId: string;
	/** 0-basiert */
	weekIndex: number;
	dayIndex: number;
	dayName: string;
	date: string;
	startedAt: string;
	finishedAt: string | null;
	exercises: LoggedExercise[];
	/** Geschätzte Bestwerte nach dem Training (für den Fortschrittsverlauf). */
	estimates?: Partial<Record<MainLift, number | null>>;
}
