const MAX_FAILED_ATTEMPTS = parseInt(process.env.LOGIN_MAX_ATTEMPTS || "5", 10);
const LOCKOUT_MS = parseInt(process.env.LOGIN_LOCKOUT_MS || `${15 * 60 * 1000}`, 10);
const ATTEMPT_WINDOW_MS = parseInt(process.env.LOGIN_ATTEMPT_WINDOW_MS || `${15 * 60 * 1000}`, 10);

const attempts = new Map();

const keyFor = (identifier, ip) => `${String(identifier || "").toLowerCase()}::${ip || "unknown"}`;

const now = () => Date.now();

const getState = (key) => {
  const current = attempts.get(key);
  if (!current) return { failed: 0, firstFailedAt: null, lockedUntil: null };

  if (current.lockedUntil && current.lockedUntil < now()) {
    attempts.delete(key);
    return { failed: 0, firstFailedAt: null, lockedUntil: null };
  }

  if (current.firstFailedAt && current.firstFailedAt + ATTEMPT_WINDOW_MS < now()) {
    attempts.delete(key);
    return { failed: 0, firstFailedAt: null, lockedUntil: null };
  }

  return current;
};

export const checkLockout = (identifier, ip) => {
  const key = keyFor(identifier, ip);
  const state = getState(key);

  if (state.lockedUntil && state.lockedUntil > now()) {
    const retryAfterSec = Math.ceil((state.lockedUntil - now()) / 1000);
    return { locked: true, retryAfterSec };
  }

  return { locked: false, retryAfterSec: 0 };
};

export const registerFailedAttempt = (identifier, ip) => {
  const key = keyFor(identifier, ip);
  const state = getState(key);
  const nextFailed = (state.failed || 0) + 1;

  const updated = {
    failed: nextFailed,
    firstFailedAt: state.firstFailedAt || now(),
    lockedUntil: null,
  };

  if (nextFailed >= MAX_FAILED_ATTEMPTS) {
    updated.lockedUntil = now() + LOCKOUT_MS;
  }

  attempts.set(key, updated);
  return updated;
};

export const clearFailedAttempts = (identifier, ip) => {
  attempts.delete(keyFor(identifier, ip));
};
