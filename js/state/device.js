// What belongs to this device rather than to a person: who uses it, the TMDB
// key, the Firebase config and which household it's signed in to. Kept apart
// from the libraries so switching person never loses them.

import { normaliseProfiles } from './profiles.js';

export const DEVICE_KEY = 'binger:device';

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

export function loadDevice(storage = globalThis.localStorage) {
  let raw = null;
  try { raw = JSON.parse((storage && storage.getItem(DEVICE_KEY)) || 'null'); } catch { raw = null; }
  const d = isObj(raw) ? raw : {};
  return {
    profiles: normaliseProfiles(d.profiles),
    tmdbKey: typeof d.tmdbKey === 'string' ? d.tmdbKey : '',
    firebase: isObj(d.firebase) ? d.firebase : null,
    household: typeof d.household === 'string' ? d.household : null,
    // The welcome ("What should we call you?") has been shown on this device.
    welcomed: d.welcomed === true,
  };
}

export function saveDevice(device, storage = globalThis.localStorage) {
  try { storage.setItem(DEVICE_KEY, JSON.stringify(device)); return true; } catch { return false; }
}
