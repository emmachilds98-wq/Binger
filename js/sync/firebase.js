// The only file that talks to Firebase. Loads the SDK from Google's CDN on
// first use (no build step, and nothing is downloaded for people who don't
// sync), then offers a small API: sign in and out, and read, write and watch
// documents by path, e.g. ['households', id].

export const FIREBASE_VERSION = '10.14.1';
const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export async function connectFirebase(config) {
  const [appMod, authMod, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const { emulators, ...web } = config;
  const app = appMod.getApps().find((a) => a.name === 'binger') || appMod.initializeApp(web, 'binger');
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);
  // For tests only (`npm run e2e:sync`): the local Firebase emulators stand
  // in for the real project. A pasted config never has this key.
  if (emulators) {
    authMod.connectAuthEmulator(auth, emulators.auth, { disableWarnings: true });
    const [host, port] = emulators.firestore.split(':');
    fs.connectFirestoreEmulator(db, host, Number(port));
  }
  const ref = (path) => fs.doc(db, ...path);
  // Finish a sign-in that had to go via a redirect (popups blocked).
  authMod.getRedirectResult(auth).catch(() => {});

  return {
    onUser(cb) {
      return authMod.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null));
    },
    async signInGoogle() {
      const provider = new authMod.GoogleAuthProvider();
      try {
        await authMod.signInWithPopup(auth, provider);
      } catch (err) {
        if (/popup-blocked|operation-not-supported|popup-closed-by-browser/.test(err.code || '')) return authMod.signInWithRedirect(auth, provider);
        throw err;
      }
      return null;
    },
    signInEmail: (email, password) => authMod.signInWithEmailAndPassword(auth, email, password),
    createAccount: (email, password) => authMod.createUserWithEmailAndPassword(auth, email, password),
    signOut: () => authMod.signOut(auth),
    async get(path) {
      const snap = await fs.getDoc(ref(path));
      return snap.exists() ? snap.data() : null;
    },
    set: (path, data) => fs.setDoc(ref(path), data),
    update: (path, data) => fs.updateDoc(ref(path), data),
    remove: (path) => fs.deleteDoc(ref(path)),
    watch(path, cb, onError = () => {}) {
      return fs.onSnapshot(ref(path), (snap) => {
        if (!snap.metadata.hasPendingWrites) cb(snap.exists() ? snap.data() : null);
      }, onError);
    },
    addMember: (uid) => fs.arrayUnion(uid),
    now: () => fs.serverTimestamp(),
  };
}

// Plain-English messages for the errors people actually hit.
export function authMessage(err) {
  const code = (err && err.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return 'That email and password don’t match an account. Check them, or create an account.';
  if (/email-already-in-use/.test(code)) return 'There’s already an account with that email. Sign in instead.';
  if (/weak-password/.test(code)) return 'Use a password of at least 6 characters.';
  if (/invalid-email/.test(code)) return 'That doesn’t look like an email address.';
  if (/unauthorized-domain/.test(code)) return 'Firebase doesn’t allow sign-in from this address yet. Add it under Authentication → Settings → Authorised domains.';
  if (/operation-not-allowed/.test(code)) return 'That sign-in method is switched off in Firebase (Authentication → Sign-in method).';
  if (/configuration-not-found/.test(code)) return 'Sign-in isn’t set up in Firebase yet (Authentication → Get started, then switch on Google and Email).';
  if (/permission-denied/.test(code)) return 'Firebase refused: check the security rules are published (docs/FIREBASE.md).';
  if (/network|unavailable/.test(code)) return 'Couldn’t reach Firebase. Check your connection.';
  if (/popup-closed-by-user|cancelled-popup/.test(code)) return 'Sign-in was cancelled.';
  return `Something went wrong${code ? ` (${code})` : ''}.`;
}
