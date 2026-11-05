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
	createdAt: string;
	updatedAt: string;
}

export type Goal = 'powerlifting' | 'strength' | 'hypertrophy';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type MainLift = 'squat' | 'bench' | 'deadlift';

/** Eingabe für die Planerzeugung. Heute aus dem Formular, später aus dem KI-Gespräch. */
export interface PlanRequest {
	goal: Goal;
	daysPerWeek: 2 | 3 | 4 | 5;
	experience: Experience;
	focus: MainLift;
	/** Arbeitsgewicht für 3 saubere Wiederholungen je Hauptübung in kg. */
	working3RM: Record<MainLift, number>;
	deadliftStance: 'conventional' | 'sumo';
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
	[key: string]: unknown;
}

export interface ProgramDay {
	name: string;
	/** 0 = Sonntag … 6 = Samstag */
	weekDay: number;
	exercises: ProgramExercise[];
}

/** Das von der Engine erzeugte Programm (Format der Powerlifting-Engine). */
export interface Program {
	cycleWeeks: number;
	weekTypes: ('regular' | 'deload')[];
	days: ProgramDay[];
	maxes: Record<MainLift, number | ''>;
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
	engine: 'powerlifting-v2';
	program: Program;
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
	target: { sets: number; reps: string; rpe: number; weight: number | null };
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
}
