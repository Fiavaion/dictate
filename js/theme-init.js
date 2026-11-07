// Apply the saved theme before first paint (light is default) to avoid a flash.
// Loaded as a classic, render-blocking script in <head>; kept out of index.html for the CSP.
(function () {
  try {
    if (localStorage.getItem('dictate_theme') === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) { /* storage unavailable: keep the light default */ }
})();
