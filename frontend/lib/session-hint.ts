/*
 * The signed-in hint (see useSessionHint in lib/auth.ts): a readable mirror of the httpOnly
 * session cookie, kept by middleware.ts and set/cleared on login/logout. Display only; it never
 * grants access. Plain module (no "use client") so the root layout and middleware can use it.
 */
export const HINT_COOKIE = "lodestar_hint";
export const HINT_MAX_AGE = 60 * 60 * 24 * 7; // = the session cookie's lifetime (JWT_EXPIRE_MINUTES)

/**
 * Before hydration the server can't read the hint, so it renders the signed-out set. This
 * <head> script marks <html> with `hint-in` before the first paint; while the hint is still
 * `null`, signed-out-only UI adds HINT_PENDING_HIDE so a signed-in visitor never sees it flash
 * (the space is kept, so nothing shifts).
 */
export const SESSION_HINT_SCRIPT = `try{if(document.cookie.split("; ").indexOf("${HINT_COOKIE}=1")>-1)document.documentElement.classList.add("hint-in")}catch(e){}`;
export const HINT_PENDING_HIDE = "[.hint-in_&]:invisible";

