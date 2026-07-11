import { onAuth, getProfile, repairProfile, ROOT } from './firebase.js';

// Resolves with { user, profile } for authenticated users.
// Redirects to login/ for unauthenticated visitors.
// If the Firestore profile is missing or has no username (broken signup),
// it is repaired automatically from the Firebase Auth email.
export function requireAuth() {
  return new Promise((resolve, reject) => {
    let done = false;

    // If Firebase auth never fires (CDN failure, IndexedDB blocked on iOS, etc.)
    // redirect to login so the page doesn't hang blank forever.
    const timer = setTimeout(() => {
      if (!done) { done = true; window.location.replace(ROOT + 'login/'); }
    }, 10000);

    const off = onAuth(async user => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      off();
      if (!user) {
        localStorage.removeItem('rl_profile');
        window.location.replace(ROOT + 'login/');
        return;
      }
      if (!user.emailVerified && !user.email?.endsWith('@readinglog.local')) {
        window.location.replace(ROOT + 'login/?unverified=1');
        return;
      }
      try {
        // Serve from localStorage cache for instant resolution on repeat visits
        const cached = localStorage.getItem('rl_profile');
        if (cached) {
          try {
            const p = JSON.parse(cached);
            if (p.uid === user.uid && p.username) {
              resolve({ user, profile: p });
              // Refresh in background — update cache if anything changed
              getProfile(user.uid).then(fresh => {
                if (fresh?.username) localStorage.setItem('rl_profile', JSON.stringify({ uid: user.uid, ...fresh }));
              }).catch(() => {});
              return;
            }
          } catch { /* corrupt cache — fall through to full fetch */ }
        }
        let profile = await getProfile(user.uid);
        if (!profile || !profile.username) profile = await repairProfile(user);
        localStorage.setItem('rl_profile', JSON.stringify({ uid: user.uid, ...profile }));
        resolve({ user, profile });
      } catch (err) {
        reject(err);
      }
    });
  });
}
