const PLUGIN_ID = 'com.bugdeployer.tmdb';
/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppShell.PluginError('invalid_response');
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {unknown} value @param {number} maximum */
function text(value, maximum = 512) { return typeof value === 'string' ? value.trim().slice(0, maximum) : ''; }
/** @param {unknown} value */
function imageName(value) { const path = text(value, 100); return /^\/[A-Za-z0-9_-]{1,35}\.jpg$/.test(path) ? path.slice(1, -4) : ''; }
/** @param {import('multiplexr_plugin_sdk').Request} request */
function multiplexrEntry(request) {
  return AppShell.definePlugin({
    'metadata.search': AppShell.contribution('metadata.provider', (params, host) => {
      if (!['movie', 'television'].includes(params.kind)) throw new AppShell.PluginError('unsupported_capability');
      const page = params.cursor == null ? 1 : Number(params.cursor);
      if (!Number.isInteger(page) || page < 1 || page > 2000) throw new AppShell.PluginError('invalid_request');
      const type = params.kind === 'television' ? 'tv' : 'movie';
      const language = /^[a-z]{2}-[A-Z]{2}$/.test(params.language ?? '') ? params.language : 'en-US';
      const apiPage = Math.floor((page - 1) / 4) + 1;
      const offset = ((page - 1) % 4) * 5;
      const url = 'https://api.themoviedb.org/3/search/' + type + '?query=' + encodeURIComponent(params.query) +
        '&page=' + apiPage + '&language=' + language + '&include_adult=false';
      const response = object(AppShell.httpJson(host, url, true));
      if (!Array.isArray(response.results)) throw new AppShell.PluginError('invalid_response');
      const seen = new Set();
      const items = response.results.slice(offset, offset + 5).flatMap(raw => {
        const item = object(raw), title = text(item.title ?? item.name);
        if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || !title || seen.has(item.id)) return [];
        seen.add(item.id);
        const details = object(AppShell.httpJson(host, 'https://api.themoviedb.org/3/' + type + '/' + item.id + '?language=' + language + '&append_to_response=credits', true));
        /** @type {import('multiplexr_plugin_sdk').MetadataFields} */
        const fields = { identifier: 'tmdb:' + type + ':' + item.id };
        const description = text(item.overview, 1000), date = text(item.release_date ?? item.first_air_date, 10);
        const originalLanguage = text(item.original_language, 20);
        if (description) fields.description = description;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { fields.publicationDate = date; fields.year = Number(date.slice(0, 4)); }
        if (originalLanguage) fields.language = originalLanguage;
        if (Array.isArray(details.genres)) fields.genres = details.genres.map(raw => text(object(raw).name, 80)).filter(Boolean).slice(0, 20);
        const credits = details.credits && typeof details.credits === 'object' ? object(details.credits) : {};
        if (Array.isArray(credits.crew)) {
          const directors = [...new Set(credits.crew.filter(raw => object(raw).job === 'Director').map(raw => text(object(raw).name, 120)).filter(Boolean))];
          if (directors.length) fields.director = directors.join(', ').slice(0, 512);
        }
        const poster = imageName(details.poster_path ?? item.poster_path);
        const backdrop = imageName(details.backdrop_path ?? item.backdrop_path);
        const artwork = poster || backdrop ? AppShell.namespacedId(PLUGIN_ID, 'images.' + (poster || '_') + '.' + (backdrop || '_')) : undefined;
        return [{ id: AppShell.namespacedId(PLUGIN_ID, type + '.' + item.id), title, fields, ...(artwork ? {artwork} : {}) }];
      });
      const total = Number(response.total_pages);
      return AppShell.page(items, Number.isInteger(total) && (offset + 5 < response.results.length || apiPage < Math.min(total, 500)) ? String(page + 1) : null);
    }, PLUGIN_ID),
    'artwork.search': AppShell.contribution('artwork.provider', (params, host) => {
      let handle = params.artwork;
      if (!handle) {
        const title = host.call('catalog.title', {handle: params.title});
        const type = title.kind === 'television' ? 'tv' : 'movie';
        const response = object(AppShell.httpJson(host, 'https://api.themoviedb.org/3/search/' + type + '?query=' + encodeURIComponent(title.title) + '&include_adult=false', true));
        const first = Array.isArray(response.results) ? object(response.results[0] ?? {}) : {};
        const poster = imageName(first.poster_path), backdrop = imageName(first.backdrop_path);
        if (poster || backdrop) handle = AppShell.namespacedId(PLUGIN_ID, 'images.' + (poster || '_') + '.' + (backdrop || '_'));
      }
      if (!handle) return AppShell.page([]);
      const legacy = PLUGIN_ID + ':poster.';
      const prefix = PLUGIN_ID + ':images.';
      let poster = '', backdrop = '';
      if (handle.startsWith(legacy) && /^[A-Za-z0-9_-]{1,60}$/.test(handle.slice(legacy.length))) poster = handle.slice(legacy.length);
      else if (handle.startsWith(prefix) && /^[A-Za-z0-9_-]{1,60}\.[A-Za-z0-9_-]{1,60}$/.test(handle.slice(prefix.length))) [poster, backdrop] = handle.slice(prefix.length).split('.');
      else throw new AppShell.PluginError('invalid_request');
      return AppShell.page([
        ...(poster && poster !== '_' && params.roles.includes('poster') ? [{id: AppShell.namespacedId(PLUGIN_ID, 'poster'), role: /** @type {const} */ ('poster'), attribution: 'TMDB', url: 'https://image.tmdb.org/t/p/w342/' + poster + '.jpg'}] : []),
        ...(backdrop && backdrop !== '_' && params.roles.includes('backdrop') ? [{id: AppShell.namespacedId(PLUGIN_ID, 'backdrop'), role: /** @type {const} */ ('backdrop'), attribution: 'TMDB', url: 'https://image.tmdb.org/t/p/w780/' + backdrop + '.jpg'}] : []),
      ]);
    }, PLUGIN_ID),
  })(request);
}
