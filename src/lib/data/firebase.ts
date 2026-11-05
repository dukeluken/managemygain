import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

// Öffentliche Client-Konfiguration (keine Admin-Schlüssel).
const config = {
	apiKey: 'AIzaSyA_9pmCsaYM6am5-OAwToEgd4MNuuT7R54',
	authDomain: 'managemygain.firebaseapp.com',
	projectId: 'managemygain',
	appId: '1:648495203216:web:66bfb2151acf11bb052915'
};

export const app = initializeApp(config);
export const auth = getAuth(app);

// Offline-Cache von Firestore: Training funktioniert ohne Netz, Änderungen
// werden nachgeladen, sobald wieder Verbindung besteht.
export const db = initializeFirestore(app, {
	ignoreUndefinedProperties: true,
	localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
