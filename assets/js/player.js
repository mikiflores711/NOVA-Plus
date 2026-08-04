(() => {
  const overlay = document.querySelector('#playerOverlay');
  const player = document.querySelector('#sharedPlayer');
  const close = document.querySelector('#closePlayer');
  const title = document.querySelector('#playerTitle');
  if (!overlay || !player) return;

  let hideTimer = null;
  const chrome = [close, title];
  const setHidden = value => chrome.forEach(node => node?.classList.toggle('controls-hidden', value));
  const showChrome = () => {
    setHidden(false);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!player.paused) setHidden(true);
    }, 2600);
  };

  const isMobile = () => matchMedia('(max-width: 900px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  async function lockLandscape() {
    if (!isMobile()) return;
    try {
      if (screen.orientation?.lock) await screen.orientation.lock('landscape');
    } catch (_) {}
  }
  function unlockOrientation() {
    try { screen.orientation?.unlock?.(); } catch (_) {}
  }

  async function closePlayer() {
    clearTimeout(hideTimer);
    try { player.pause(); } catch (_) {}
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('player-open');
    setHidden(false);
    unlockOrientation();
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch (_) {}
  }

  window.openWmpPlayer = async options => {
    if (!options?.src) return;
    try { await window.NOVA_ADS?.playPreroll?.(); } catch (error) { console.warn('Pre-roll:', error); }
    title.textContent = options.title || '';
    player.setAttribute('title', options.title || '');
    player.setAttribute('src', options.src);
    options.poster ? player.setAttribute('poster', options.poster) : player.removeAttribute('poster');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('player-open');
    showChrome();

    try {
      if (isMobile() && overlay.requestFullscreen && !document.fullscreenElement) {
        await overlay.requestFullscreen();
      }
    } catch (_) {}
    await lockLandscape();

    try { await player.play(); } catch (_) {}
  };

  close.onclick = closePlayer;
  overlay.addEventListener('mousemove', showChrome, { passive: true });
  overlay.addEventListener('touchstart', showChrome, { passive: true });
  overlay.addEventListener('click', showChrome);
  player.addEventListener('play', showChrome);
  player.addEventListener('pause', () => setHidden(false));
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && overlay.classList.contains('open') && isMobile()) closePlayer();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay.classList.contains('open')) closePlayer();
  });
})();
