/* Environment indicator for the Quatt release-notes dashboard.
   Detects at load whether the page is served from PRODUCTION or a non-prod
   (staging / preview) deployment, purely from the hostname, and on non-prod
   adds a loud "STAGING" banner + an orange page frame + a warm background tint.
   Production is left completely untouched.

   Read window.QRN_ENV ('prod' | 'staging') anywhere you need the current env. */
(function () {
  // The only hostnames that count as production. Add a custom prod domain here
  // if one is ever configured (e.g. "release-notes.quatt.io").
  var PROD_HOSTS = ["dashboard-ecosystem-release-notes.pages.dev"];

  var host = location.hostname;
  var isProd = PROD_HOSTS.indexOf(host) !== -1;
  var env = isProd ? "prod" : "staging";

  window.QRN_ENV = env;
  // Set early (this script is in <head>) so the staging tint/frame apply before paint.
  document.documentElement.setAttribute("data-env", env);

  if (isProd) return;

  // "STAGING" for the permanent staging branch alias; "PREVIEW" for any other
  // non-prod host (per-commit previews, localhost, etc.).
  var label = host.split(".")[0] === "release-notes-staging" ? "STAGING" : "PREVIEW";

  function addBanner() {
    if (document.querySelector(".env-banner")) return;
    var bar = document.createElement("div");
    bar.className = "env-banner";
    bar.setAttribute("role", "status");
    bar.textContent =
      label + " — review copy, not the published release notes · " + host;
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", addBanner);
  } else {
    addBanner();
  }
})();
