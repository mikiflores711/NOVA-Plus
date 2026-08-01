(() => {
  const cfg = window.WMP_CONFIG || {};
  const API = 'https://api.themoviedb.org/3';
  const key = cfg.tmdbApiKey || '';
  const language = cfg.language || 'es-MX';
  async function get(path, params = {}) {
    const url = new URL(API + path);
    url.searchParams.set('api_key', key);
    url.searchParams.set('language', language);
    Object.entries(params).forEach(([k,v]) => v !== '' && v != null && url.searchParams.set(k, v));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`TMDB ${response.status}`);
    return response.json();
  }
  const pickLogo = images => {
    const logos = images?.logos || [];
    return logos.find(x => x.iso_639_1 === 'es') || logos.find(x => x.iso_639_1 === 'en') || logos[0] || null;
  };
  window.TMDB = {
    get,
    image(path, size = 'original') { return path ? `${cfg.imageBase || 'https://image.tmdb.org/t/p/'}${size}${path}` : ''; },
    pickLogo,
    async movie(id) {
      return Promise.all([
        get(`/movie/${id}`),
        get(`/movie/${id}/credits`),
        get(`/movie/${id}/images`, { include_image_language: 'es,en,null' })
      ]).then(([details,credits,images]) => ({details,credits,images}));
    },
    async tv(id) {
      return Promise.all([
        get(`/tv/${id}`),
        get(`/tv/${id}/credits`),
        get(`/tv/${id}/images`, { include_image_language: 'es,en,null' })
      ]).then(([details,credits,images]) => ({details,credits,images}));
    },
    season(id, number) { return get(`/tv/${id}/season/${number}`); }
  };
})();
