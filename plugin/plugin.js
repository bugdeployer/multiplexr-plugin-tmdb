const PLUGIN_ID = 'com.bugdeployer.tmdb';
/** @param {unknown} value @returns {Record<string, unknown>} */
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppShell.PluginError('invalid_response');
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {unknown} value @param {number} maximum */
function text(value, maximum = 512) { return typeof value === 'string' ? value.trim().slice(0, maximum) : ''; }
/** @param {import('multiplexr_plugin_sdk').Request} request */
function multiplexrEntry(request) {
  return AppShell.definePlugin({
    'metadata.search': AppShell.contribution('metadata.provider', (params, host) => {
      if (!['movie', 'television'].includes(params.kind)) throw new AppShell.PluginError('unsupported_capability');
      const page = params.cursor == null ? 1 : Number(params.cursor);
      if (!Number.isInteger(page) || page < 1 || page > 500) throw new AppShell.PluginError('invalid_request');
      const type = params.kind === 'television' ? 'tv' : 'movie';
      const language = /^[a-z]{2}-[A-Z]{2}$/.test(params.language ?? '') ? params.language : 'en-US';
      const url = 'https://api.themoviedb.org/3/search/' + type + '?query=' + encodeURIComponent(params.query) +
        '&page=' + page + '&language=' + language + '&include_adult=false';
      const response = object(AppShell.httpJson(host, url, true));
      if (!Array.isArray(response.results)) throw new AppShell.PluginError('invalid_response');
      const seen = new Set();
      const items = response.results.slice(0, 20).flatMap(raw => {
        const item = object(raw), title = text(item.title ?? item.name);
        if (!Number.isSafeInteger(item.id) || Number(item.id) <= 0 || !title || seen.has(item.id)) return [];
        seen.add(item.id);
        /** @type {import('multiplexr_plugin_sdk').MetadataFields} */
        const fields = { identifier: 'tmdb:' + type + ':' + item.id };
        const description = text(item.overview, 1000), date = text(item.release_date ?? item.first_air_date, 10);
        const originalLanguage = text(item.original_language, 20);
        if (description) fields.description = description;
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { fields.publicationDate = date; fields.year = Number(date.slice(0, 4)); }
        if (originalLanguage) fields.language = originalLanguage;
        return [{ id: AppShell.namespacedId(PLUGIN_ID, type + '.' + item.id), title, fields }];
      });
      const total = Number(response.total_pages);
      return AppShell.page(items, Number.isInteger(total) && page < Math.min(total, 500) ? String(page + 1) : null);
    }, PLUGIN_ID),
  })(request);
}
