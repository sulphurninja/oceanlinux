export const JUST_LOGGED_IN_KEY = "justLoggedIn";
export const LOGIN_POPUP_SHOWN_KEY = "loginPopupShownInSession";
export const POST_LOGIN_SPLASH_DONE_KEY = "postLoginSplashDone";
export const POST_LOGIN_SPLASH_EVENT = "oceanlinux:post-login-splash-complete";
export const LOGIN_POPUP_COMPLETE_EVENT = "oceanlinux:login-popup-complete";

export const POST_LOGIN_SPLASH_MS = 1800;
export const POST_LOGIN_LOADING_HTML_CLASS = "oceanlinux-post-login-loading";

export function isPostLoginSplashPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(JUST_LOGGED_IN_KEY) === "1" &&
      sessionStorage.getItem(POST_LOGIN_SPLASH_DONE_KEY) !== "1"
    );
  } catch {
    return false;
  }
}

/** Hide dashboard chrome instantly (before React paints) while post-login splash runs. */
export function setPostLoginLoadingScreen(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add(POST_LOGIN_LOADING_HTML_CLASS);
}

export function clearPostLoginLoadingScreen(): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove(POST_LOGIN_LOADING_HTML_CLASS);
}