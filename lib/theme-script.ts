export const THEME_KEY = "p27.theme";

/**
 * Runs in <head> before the first paint (app/layout.tsx). writeJSON stores the value as JSON ("\"dark\""),
 * so it is parsed the same way. "auto" leaves data-theme unset: the CSS then follows prefers-color-scheme.
 * Kept tiny and dependency-free on purpose.
 */
export const THEME_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem("${THEME_KEY}")||"null");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

