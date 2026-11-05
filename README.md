# managemygain

Trainingsplan-App für Kraftsport: Plan erstellen, Woche für Woche trainieren, Fortschritt sehen.

Version 2 ist ein Neuaufbau mit SvelteKit. Die alte Vanilla-JS-App liegt in `legacy/` (Tag `v1`).

## Entwicklung

```sh
npm install
npm run dev          # http://localhost:5173
npm test             # Engine- und Adapter-Tests (Vitest)
npm run check        # Typprüfung
npm run build        # statische App nach build/
```

**Demo-Modus** (nur `npm run dev`, ohne Anmeldung, Daten nur im Speicher):

- `/?demo` mit Beispielplan in Woche 3
- `/?demo=leer` ohne Plan, zum Testen der Einstiegsfragen
- `&theme=light` für den hellen Modus

Beenden über Profil → Abmelden.

## Aufbau

```
src/
  app.css                 Design-System (Farben, Schrift, Glas)
  lib/engine/
    powerlifting.js       Planerzeugung und Lastmodell (aus v1 übernommen)
    index.ts              Brücke zur App: Wochen, Vorgaben, Anstrengung, Autoregulation
  lib/data/
    types.ts              Datenmodell (Profil, Plan, Training), vorbereitet für Coach und KI
    firebase.ts           Firebase mit Offline-Cache
    repo.ts               alle Firestore-Zugriffe
    session.svelte.ts     globaler Zustand und Aktionen
  lib/ui/                 Leiste, Icons, Hintergrundlicht, Anmeldung
  routes/                 Heute, Plan, Training, Einstiegsfragen, Community, Profil
legacy/                   v1-App, Referenz für die spätere Datenübernahme
```

Interne Importe nutzen `#lib/...` mit Dateiendung (SvelteKit 3).

## Daten

Firestore-Pfade: `profiles/{uid}`, `profiles/{uid}/plans/{planId}`, `profiles/{uid}/workouts/{workoutId}`.
Die v1-Daten unter `users/{uid}` bleiben unverändert, bis die Übernahme gebaut ist.

## Deploy

```sh
npm run build
firebase deploy --only hosting,firestore:rules
```

Achtung: Ein Hosting-Deploy von diesem Branch ersetzt die v1-App für alle Nutzer.
