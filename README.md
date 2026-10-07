# MANAGE MY GAIN

Eine installierbare Web-App für Kraftdreikampf mit Google-Anmeldung, privaten Trainingsdaten pro Konto, Planvorlagen, Trainingslog und Quick-Edit für Vorgabe und tatsächlich gehobenes Gewicht.

## Funktionen

- Browser-Website und installierbare PWA auf iOS/Android.
- Anmeldung mit Google über Firebase Authentication.
- Mehrere benannte Trainingspläne und Historie in Cloud Firestore. Regeln begrenzen jeden Datensatz auf die angemeldete UID.
- Plan-Generator mit 72 kombinierten Vorlagen: 2–5 Trainingstage × Squat/Bench/Deadlift-Spezialisierung × Hypertrophie/Kraft × drei Erfahrungsstufen.
- 3×3-Arbeitsgewichte als Basis eines geschätzten 1RM. Die Schätzung nimmt an, dass der letzte Satz ungefähr RPE 8 erreicht; angegebene Maxima und Startlasten sind Schätzwerte.
- Achtwöchiger Trainingsblock mit meist vier bis fünf Übungen je Einheit: Erfahrungsstufe steuert Hauptlift-Satzvolumen und RPE-Verlauf. Die Sätze steigen in den Aufbauwochen schrittweise; Woche 4 und 8 sind Deloads.
- Übungskategorien; Kategorie- und Übungswechsel berechnen die Vorgaben neu. Trainingspläne lassen sich tageweise mit Stift-Icon bearbeiten, inklusive Tag, Übungszeilen, Hinzufügen und Entfernen. Im Training gibt es getrennte Felder für geplantes und tatsächlich gehobenes Gewicht.

## Firebase einrichten — kostenloser Einstieg

1. Erstelle in der [Firebase Console](https://console.firebase.google.com/) ein Projekt im **Spark-Tarif** und registriere eine Web-App.
2. Kopiere die Web-Konfiguration aus **Projekteinstellungen → Deine Apps** nach `config.js`. Diese Client-Konfiguration ist für eine Web-App sichtbar und enthält keine Admin-Schlüssel.
3. Aktiviere **Authentication → Sign-in method → Google**. Ergänze bei **Authorized domains** `localhost` und `127.0.0.1` für den lokalen Test; die Firebase-Hosting-Domain kommt nach dem Hosting-Setup dazu.
4. Erstelle unter **Firestore Database** eine Datenbank im Produktionsmodus.
5. Installiere die Firebase CLI (`npm install -g firebase-tools`), melde dich an (`firebase login`) und verknüpfe dieses lokale Projekt (`firebase use --add`).
6. Veröffentliche Hosting und die Eigentümer-Regeln: `firebase deploy --only hosting,firestore:rules`.
7. Öffne die angezeigte `*.web.app`-Adresse. Über die HTTPS-Seite lässt sich die App auf dem Handy zum Startbildschirm hinzufügen bzw. installieren.

Hosting hat im No-Cost-Kontingent derzeit 10 GB gespeicherte Hosting-Dateien und 10 GB Datentransfer pro Monat. Firestore enthält ein kostenloses Kontingent für eine Datenbank (1 GiB und tägliche Lese-/Schreiblimits). Bei Überschreitung können Dienste im Spark-Tarif pausieren; es wird nicht automatisch auf einen kostenpflichtigen Tarif umgestellt. [Hosting-Kontingente](https://firebase.google.com/docs/hosting/usage-quotas-pricing), [Firestore-Kontingente](https://firebase.google.com/docs/firestore/pricing).

## Privatsphäre

Lege das GitHub-Repository auf **Private**. Firestore speichert die Daten unter `users/{Firebase-UID}`; [firestore.rules](firestore.rules) lässt Lesen und Schreiben nur durch das zugehörige Google-Konto zu. `firebase.json` schließt den früheren Apps-Script-Ordner und diese README vom Website-Upload aus. Die Firebase-Client-Konfiguration und die ausgelieferten HTML-/JavaScript-Dateien sind im Browser sichtbar; das ist für eine statische Website normal und macht das Repository nicht öffentlich.

Die frühere Apps-Script-Web-App wird von dieser Version nicht mehr benutzt. Falls du sie bereitgestellt hast, entferne oder deaktiviere sie unter **Apps Script → Bereitstellen → Bereitstellungen verwalten**, damit sie nicht weiter öffentlich auf dein Sheet zugreifen kann. Bisherige Sheet-Daten werden nicht automatisch nach Firestore kopiert.

## Lokal entwickeln

Öffne `index.html` über VS Code Live Server. Für Google-Login muss `config.js` eine Firebase-Konfiguration enthalten und der lokale Host bei Firebase als autorisierte Domain eingetragen sein. Firestore-Regeln lokal testen kannst du mit der Firebase Local Emulator Suite.

## Trainingsprogramm

Die Vorlagen sind editierbare Startpunkte, keine individuell validierten oder offiziell „approved“ Coaching-Pläne. Die 3×3-Eingabe schätzt das 1RM mit einer einfachen Wiederholungs-/RIR-Heuristik; sie ersetzt keine gemessene Maximalleistung. Die Volumenwerte sind konservative Programmier-Leitplanken, keine universellen Optima. Details, Quellenlage und die Designentscheidungen stehen in [TRAINING_TEMPLATES_RESEARCH.md](TRAINING_TEMPLATES_RESEARCH.md).
