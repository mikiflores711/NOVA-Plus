(async () => {
  const id = new URLSearchParams(location.search).get('id');
  const apiBase = String(window.WMP_CONFIG?.reportApiUrl || '').replace(/\/$/, '');
  let runtimeContent = [];
  try {
    const response = await fetch(apiBase + '/api/content', { cache: 'no-store' });
    const result = await response.json();
    if (response.ok && result.ok && Array.isArray(result.items)) runtimeContent = result.items;
  } catch (error) { console.warn('No se pudo cargar el catálogo de Cloudflare.', error); }
  const item = runtimeContent.find(entry => entry.id === id) || (window.WMP_CONTENT || []).find(entry => entry.id === id);
  if (!item) {
    document.body.innerHTML = '<main class="shell"><h1>Contenido no encontrado</h1><a href="index.html">Volver</a></main>';
    return;
  }

  document.title = item.title;
  const $ = selector => document.querySelector(selector);
  const bg = $('#heroBg');
  const logo = $('#titleLogo');
  const fallback = $('#fallbackTitle');
  const meta = $('#meta');
  const overview = $('#overview');
  const credits = $('#credits');
  const cast = $('#cast');
  let details;
  let people = [];
  let poster = item.backdrop;
  const episodeVideo = episode => typeof episode === 'string' ? episode : (episode?.video || episode?.url || '');

  bg.style.backgroundImage = `url('${item.backdrop}')`;
  fallback.textContent = item.title;
  overview.textContent = item.description || '';

  const favKey = 'wmp_favorites_v3';
  const favBtns = [...document.querySelectorAll('[data-detail-favorite]')];
  const favBtn = item.type === 'movie' ? favBtns[0] : favBtns[1];
  if (item.type === 'movie') $('#seriesFavorite').classList.add('hidden');
  const favorites = () => {
    try { return new Set(JSON.parse(localStorage.getItem(favKey) || '[]')); }
    catch { return new Set(); }
  };
  function syncFavorite() {
    const active = favorites().has(item.id);
    favBtn.classList.toggle('active', active);
    favBtn.querySelector('span').textContent = active ? 'En favoritos' : 'Mi lista';
  }
  favBtn.onclick = () => {
    const set = favorites();
    set.has(item.id) ? set.delete(item.id) : set.add(item.id);
    localStorage.setItem(favKey, JSON.stringify([...set]));
    syncFavorite();
  };
  syncFavorite();

  try {
    const data = item.type === 'movie' ? await TMDB.movie(item.tmdbId) : await TMDB.tv(item.tmdbId);
    details = data.details;
    people = (data.credits.cast || []).slice(0, 12);
    poster = TMDB.image(details.backdrop_path || details.poster_path, 'original') || poster;
    bg.style.backgroundImage = `url('${poster}')`;
    const selectedLogo = TMDB.pickLogo(data.images);
    if (selectedLogo) {
      logo.src = TMDB.image(selectedLogo.file_path, 'w500');
      logo.classList.remove('hidden');
      fallback.classList.add('hidden');
    }
    overview.textContent = details.overview || item.description || 'Sin descripción disponible.';
    if (item.type === 'movie') {
      meta.innerHTML = `<span>${(details.release_date || String(item.year)).slice(0, 4)}</span><span>${details.runtime || ''} min</span><span>${(details.genres || []).map(g => g.name).join(' · ') || item.genre}</span>`;
      credits.innerHTML = `<strong>Elenco:</strong> ${people.slice(0, 5).map(person => person.name).join(', ')}`;
    } else {
      meta.innerHTML = `<span>${(details.first_air_date || String(item.year)).slice(0, 4)}</span><span>${details.number_of_seasons || Object.keys(item.seasons || {}).length} temporadas</span><span>${(details.genres || []).map(g => g.name).join(' · ') || item.genre}</span>`;
      credits.innerHTML = `<strong>Elenco:</strong> ${people.slice(0, 5).map(person => person.name).join(', ')}<br><strong>Creadores:</strong> ${(details.created_by || []).map(person => person.name).join(', ') || 'No disponible'}`;
    }
  } catch (_) {
    meta.innerHTML = `<span>${item.year}</span><span>${item.genre}</span>`;
  }

  cast.innerHTML = people.map(person => `<article class="cast-card"><img src="${TMDB.image(person.profile_path, 'w300') || ''}" alt="${person.name}"><div class="cast-copy"><strong>${person.name}</strong><small>${person.character || ''}</small></div></article>`).join('');

  const reportDialog = $('#reportDialog');
  const reportContext = $('#reportContext');
  const reportStatus = $('#reportStatus');
  const reportComment = $('#reportComment');
  let reportTarget = null;

  function openReport(target) {
    reportTarget = target;
    reportContext.textContent = target.kind === 'serie'
      ? `${target.contentTitle} · Temporada ${target.season} · Episodio ${target.episode}${target.episodeTitle ? ` · ${target.episodeTitle}` : ''}`
      : target.contentTitle;
    reportStatus.textContent = '';
    reportComment.value = '';
    reportDialog.classList.add('open');
    reportDialog.setAttribute('aria-hidden', 'false');
    document.body.classList.add('dialog-open');
  }
  function closeReport() {
    reportDialog.classList.remove('open');
    reportDialog.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('dialog-open');
  }
  $('#closeReport').onclick = closeReport;
  reportDialog.onclick = event => { if (event.target === reportDialog) closeReport(); };

  async function sendReport(problem) {
    if (!reportTarget) return;
    const api = String(window.WMP_CONFIG?.reportApiUrl || '').replace(/\/$/, '');
    if (!api) throw new Error('Falta configurar reportApiUrl.');
    const payload = {
      tipo: reportTarget.kind,
      titulo: reportTarget.contentTitle,
      contenidoId: reportTarget.contentId,
      anio: item.year || '',
      temporada: reportTarget.season || '',
      episodio: reportTarget.episode || '',
      tituloEpisodio: reportTarget.episodeTitle || '',
      servidor: reportTarget.server || 'Servidor principal',
      video: reportTarget.src || '',
      problema: problem,
      comentario: reportComment.value.trim().slice(0, 500),
      pagina: location.href,
      userAgent: navigator.userAgent
    };
    const response = await fetch(`${api}/api/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    let result = {};
    try { result = await response.json(); } catch (_) {}
    if (!response.ok || result.ok === false) throw new Error(result.error || 'No se pudo enviar el reporte.');
    return result;
  }

  $('#reportOptions').querySelectorAll('button').forEach(button => {
    button.onclick = async () => {
      reportStatus.textContent = 'Enviando reporte…';
      button.disabled = true;
      try {
        const result = await sendReport(button.textContent.trim());
        reportStatus.textContent = result.grouped
          ? `Reporte enviado. Ya fue reportado ${result.cantidad} veces.`
          : 'Reporte enviado correctamente.';
        setTimeout(closeReport, 1300);
      } catch (error) {
        reportStatus.textContent = error.message || 'No se pudo enviar el reporte.';
      } finally {
        button.disabled = false;
      }
    };
  });


  async function resolveManagedMedia(media) {
    const api = String(window.WMP_CONFIG?.reportApiUrl || '').replace(/\/$/, '');
    if (!api || !media?.contentId) return media;
    const query = new URLSearchParams({
      contentId: media.contentId,
      season: media.season || '',
      episode: media.episode || '',
      server: media.server || 'Servidor principal'
    });
    try {
      const response = await fetch(`${api}/api/resolve?${query.toString()}`, { method: 'GET' });
      const result = await response.json();
      if (response.ok && result.ok && result.found && /^https?:\/\//i.test(result.url || '')) {
        return { ...media, originalSrc: media.src, src: result.url, managed: true };
      }
    } catch (error) {
      console.warn('No se pudo consultar el enlace administrado:', error);
    }
    return media;
  }

  async function playResolved(media) {
    const resolved = await resolveManagedMedia(media);
    openWmpPlayer(resolved);
  }

  if (item.type === 'movie') {
    $('#movieActions').classList.remove('hidden');
    const movieMedia = { src: item.video, poster, title: item.title, contentTitle: item.title, contentId: item.id, kind: 'película', server: 'Servidor principal' };
    $('#watchMovie').onclick = () => playResolved(movieMedia);
    $('#reportMovie').onclick = () => openReport(movieMedia);
  } else {
    $('#episodesSection').classList.remove('hidden');
    const select = $('#seasonSelect');
    Object.keys(item.seasons || {}).forEach(number => select.add(new Option(`Temporada ${number}`, number)));

    async function renderSeason(number) {
      const rail = $('#episodeGrid');
      rail.innerHTML = '<div>Cargando episodios…</div>';
      let episodes = [];
      try { episodes = (await TMDB.season(item.tmdbId, number)).episodes || []; } catch (_) {}
      const links = item.seasons[number] || [];
      rail.innerHTML = links.map((entry, index) => {
        const stored = typeof entry === 'string' ? {} : (entry || {});
        const episode = episodes[index] || { episode_number: stored.episode || index + 1, name: stored.title || `Episodio ${index + 1}`, overview: stored.overview || '', runtime: stored.runtime || '' };
        const numberEpisode = Number(stored.episode || episode.episode_number || index + 1);
        const displayTitle = stored.title || episode.name || `Episodio ${numberEpisode}`;
        const displayOverview = stored.overview || episode.overview || 'Sin descripción disponible.';
        const displayRuntime = stored.runtime || episode.runtime || '';
        const still = stored.still || TMDB.image(episode.still_path, 'w780') || poster;
        const src = episodeVideo(entry);
        const safeTitle = String(displayTitle).replace(/"/g, '&quot;');
        return `<article class="episode-card" data-src="${src}" data-title="${item.title} T${number} E${numberEpisode}: ${safeTitle}" data-episode-title="${safeTitle}" data-poster="${still}" data-episode="${numberEpisode}"><div class="episode-still"><img src="${still}" alt="${safeTitle}"><button type="button" class="episode-play" aria-label="Reproducir episodio ${numberEpisode}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></button><button type="button" class="episode-report" aria-label="Reportar episodio ${numberEpisode}" title="Reportar contenido caído"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 17h.01"></path></svg></button><span class="duration">${displayRuntime ? `${displayRuntime} min` : ''}</span></div><div class="episode-copy"><h3>${numberEpisode}. ${displayTitle}</h3><p>${displayOverview}</p></div></article>`;
      }).join('');

      rail.querySelectorAll('.episode-card').forEach(card => {
        const media = {
          src: card.dataset.src,
          poster: card.dataset.poster,
          title: card.dataset.title,
          contentTitle: item.title,
          contentId: item.id,
          kind: 'serie',
          season: Number(number),
          episode: Number(card.dataset.episode),
          episodeTitle: card.dataset.episodeTitle,
          server: 'Servidor principal'
        };
        card.querySelector('.episode-play').onclick = () => playResolved(media);
        card.querySelector('.episode-report').onclick = event => {
          event.stopPropagation();
          openReport(media);
        };
      });
      rail.scrollLeft = 0;
    }

    select.onchange = () => renderSeason(select.value);
    $('#prevEpisodes').onclick = () => $('#episodeGrid').scrollBy({ left: -$('#episodeGrid').clientWidth * .86, behavior: 'smooth' });
    $('#nextEpisodes').onclick = () => $('#episodeGrid').scrollBy({ left: $('#episodeGrid').clientWidth * .86, behavior: 'smooth' });
    renderSeason(Object.keys(item.seasons)[0]);
  }
})();
