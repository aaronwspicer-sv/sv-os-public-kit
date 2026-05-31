/* Runs before React hydrates — sets data-theme on <html> so first paint
   matches user preference. Static, no user input ever interpolated here. */
(function () {
  try {
    var t = localStorage.getItem('spicer_theme') || 'dark';
    var r = (t === 'system')
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : t;
    document.documentElement.setAttribute('data-theme', r);
  } catch (e) {}
})();
