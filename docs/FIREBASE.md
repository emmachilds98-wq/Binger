# Setting up Firebase sync

Binger syncs each person's library (watchlist, diary, ratings, settings)
across phones and computers through the owner's own free Firebase project.
Each person signs in with their own account; one person starts a
**household** and invites the others with a code or link. Inside the app this
is **Settings → People and sync**.

The code is done, unit-tested against a stand-in for Firebase
(`tests/sync.test.js`), and **the whole [live check](#live-check) passes
against the real Firebase JS SDK and this repo's `firestore.rules`, on the
local Firebase emulators** (`npm run e2e:sync`, also in CI). What's left is
the owner's project itself: the console steps below and its web config.

## 1. In the Firebase console (the owner, once, about 10 minutes)

The project already exists: **binger** (project id `binger-5cee3`), and
its web config is in `js/config.js`.

**All five steps are done** (the owner, 2026-10-31), and the
[live check on the real project](#on-the-real-project) passed the same day.
Google sign-in is switched on but can't be tested by a script (it needs a real
Google account): try it once on the live site.

1. **Add a web app.** ⚙ Project settings → General → Your apps → `</>` (Web).
   Nickname "Binger". No Firebase Hosting needed (the app is on GitHub Pages).
   Copy the `firebaseConfig = { … }` block it shows you.
2. **Sign-in methods.** Build → Authentication → Get started → Sign-in method:
   switch on **Google** (pick a support email) and **Email/Password**.
3. **Allow the site's address.** Authentication → Settings → Authorised
   domains → Add domain → `emmachilds98-wq.github.io`.
   (`localhost` is there already, for `npm run serve`.)
4. **Database.** Build → Firestore Database → Create database → Production
   mode → a location near you (e.g. `eur3` or `europe-west2`).
5. **Security rules.** Firestore Database → Rules → replace everything with
   the contents of [`firestore.rules`](../firestore.rules) → Publish.
   These let only household members read a household, and let someone with
   an invite code add only themselves.
   (Or from a terminal in this repo: `npx firebase-tools@15.34.2 login`, then
   `npx firebase-tools@15.34.2 deploy --only firestore:rules --project binger-5cee3`;
   `firebase.json` already points at `firestore.rules`.)

## 2. Put the config in the app

Either:

- **For everyone (recommended):** put the config in `js/config.js` as
  `firebase: { apiKey: '…', authDomain: '…', projectId: 'binger', storageBucket: '…', messagingSenderId: '…', appId: '…' }`,
  open a PR, merge. A Firebase web config is **not a secret** (it's in every
  Firebase web page; the rules above are what protect the data), so unlike
  the TMDB key it's fine in a public repo.
- **Or per device:** Settings → People and sync → paste the config → Connect.

### Is the API key in `js/config.js` a leak?

No. A Firebase **web** config, `apiKey` included, identifies the project; it
isn't a password. Every Firebase website sends it to every visitor's browser,
so keeping it out of the repo wouldn't hide it: the live site has to serve
it. What protects the data is `firestore.rules` (checked: strangers can't read
or write anything) and the authorised domains. GitHub's secret scanner may
still flag it, because it looks like any Google API key: close that alert as
"used in tests / false positive" or "won't fix".

Optional hardening, so the key only works from Binger: Google Cloud console →
project `binger-5cee3` → APIs & Services → Credentials → the "Browser key
(auto created by Firebase)" →
- **Application restrictions:** Websites: `https://emmachilds98-wq.github.io/*`,
  `https://binger-5cee3.firebaseapp.com/*` (Google sign-in runs through it) and
  `http://localhost/*`.
- **API restrictions:** Identity Toolkit API, Token Service API, Cloud
  Firestore API.

Then try signing in on the live site; if it fails, the message names the
cause. Real secrets (the TMDB key) never go in the repo: a test fails if
anything shaped like a TMDB key or token is committed anywhere.

## 3. Use it

1. Emma opens Binger for the first time: the welcome asks her name and signs
   her in (Google, or email → **Create account**). There's no way past
   without signing in. A household is made for her straight away.
2. Settings → People and sync → **Share invite link**, and send it to Dave.
3. Dave opens the link on his phone: the welcome opens with the invite code
   filled in → he signs in (his own Google account or email) → "Which one is
   you?" → picks **Dave** (or "Someone new" if Emma hasn't added him on her
   device). Without the link, he can type the code on the welcome instead.
4. Both libraries sync from then on. The TMDB key is shared through the
   household, so Dave gets films and TV without his own key.

On another device of your own, just sign in with the same account: Binger
finds your household and asks "Which one is you?" once.

On a shared computer, add both people (People and sync → Add a person) and
"Who's watching?" asks each time Binger opens. On a phone only one of you
uses, switch that off.

## How it's stored

```
users/{uid}                       { household: code }
households/{code}                 { members: [uid…], owner, profiles: [{ id, name, colour }], tmdbKey }
households/{code}/profiles/{id}   { state: <library JSON>, updatedAt, by }
```

- One document per person's library (Firestore allows 1 MiB a document,
  which is a few thousand titles; Binger warns before that).
- Merging is `mergeStates` in `js/state/library.js`: per title, the newest
  change wins; a delete beats older copies (tombstones in `state.removed`,
  kept 180 days); newer settings win; the TMDB key never goes into a
  person's library document.
- The code: `js/sync/firebase.js` (the only file that touches Firebase; the
  SDK loads from Google's CDN only when sync is used), `js/sync/sync.js`
  (household, merge, push and live updates), `js/state/profiles.js` and
  `js/state/device.js` (people on this device), `js/ui/people.js` (screens).

## Live check

### On the emulators (no Firebase project needed)

`scripts/e2e-sync.mjs` does everything below, plus a second device for Emma
and eight probes of the security rules as a stranger, with the real Firebase
JS SDK against the local Auth and Firestore emulators. It needs Java 11+.

```bash
npx -y firebase-tools@15.34.2 emulators:exec --project demo-binger --only auth,firestore "npm run e2e:sync"
```

(Or `npm run emulators` in one terminal and `npm run e2e:sync` in another.)
CI runs it on every push. Run it whenever `js/sync/`, `js/state/profiles.js`,
`js/ui/people.js` or `firestore.rules` change. The emulator hook is the
`emulators` key in a config (`js/sync/firebase.js`); a pasted config never
has one.

First run (2026-10-31) found and fixed two bugs: typing in the sign-in form
while Firebase was loading lost what you'd typed, and signing in on a second
device added a nameless person to the household instead of asking who you are.

### On the real project

**Passed on 2026-10-31** against `binger-5cee3`, run by a script from
`localhost` with throwaway email accounts that were deleted afterwards: email
sign-up; a household created (so the rules allow it) and synced; an invite
link joined, with "Which one is you?"; the second device lists both people and
gets the first one's watchlist; a save on it reached the first device live in
about 4 s; a signed-in stranger can't read the household, a library or
`users/{uid}`, while a member can (so the published rules are this repo's,
not deny-all). Clean-up can't delete a household under the rules, so one
empty `households/qwcban3dsbcv` (no members, unreadable) was left; delete it in
the console if you like.

To repeat it by hand, on two browsers (or a normal and a private window):

1. Browser A: sign in, start a household, add a title to the watchlist.
2. Browser B: open the invite link, sign in as someone else, join, pick a person.
3. Check: B shows A's person in "Who's watching?"; switching to them on B
   shows A's watchlist; a change on either appears on the other within a few seconds.
4. Firestore console: `households/{code}` has both uids in `members`.
5. Try joining with a wrong code: "No household with that code."

If anything fails, the message in People and sync names the cause
(`authMessage` in `js/sync/firebase.js`). The usual ones are an unlisted
domain (step 1.3) or rules not published (step 1.5).
