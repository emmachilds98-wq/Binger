// Deployment-wide defaults.
export const CONFIG = {
  // Optional. A TMDB key here turns films and TV on for everyone who opens
  // this deployment without them pasting their own in Settings. Leave it
  // empty if the repository is public: anything here is visible to anyone.
  tmdbKey: '',
  // Optional. The Firebase project's web config, for sync between people and
  // devices (docs/FIREBASE.md). Unlike the TMDB key this isn't a secret:
  // anyone can see it in the page, and the security rules (firestore.rules)
  // decide who can read what. With it here, nobody has to paste it.
  // The owner's project, "binger" (binger-5cee3).
  firebase: {
    apiKey: 'AIzaSyBRfDd9tazgdV1nmlYUld7Es3w1RTo19Tc',
    authDomain: 'binger-5cee3.firebaseapp.com',
    projectId: 'binger-5cee3',
    storageBucket: 'binger-5cee3.firebasestorage.app',
    messagingSenderId: '640583447200',
    appId: '1:640583447200:web:9c7391f589cee672618fc5',
  },
};
