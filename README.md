# TMDB metadata for Multiplexr

Searches movies and TV using TMDB. Returns title, synopsis, original language, release date, year and TMDB identity.

In **Manage > Permissions**, allow the collection and network destination. In **Manage > Credentials**, select `https://api.themoviedb.org` and paste your **API Read Access Token**, not the v3 API key. Enable the plugin, then choose TMDB in Find metadata.

Uses the [TMDB API](https://developer.themoviedb.org/docs/authentication-application). This product uses the TMDB API but is not endorsed or certified by TMDB.

## Install

Requires the patched Multiplexr plugin host (0.5.1 or newer). Download the signed `.mpx.json` from Releases and install it through **Settings > Plugins & themes**. Review access before enabling. The 0.1.0 release was a starter and has no metadata handler.

## Development

Node.js 22 or newer.

```sh
npm ci
npm run check
npm test
npm run build
```

Tests use the bundled plugin entrypoint with host fixtures, not service credentials. To sign, run `npm run sign -- --key /private/publisher.pem`. Keep the publisher key outside the repository. The release workflow uses the `PLUGIN_SIGNING_KEY` Actions secret.

[Plugin SDK](https://github.com/bugdeployer/Multiplexr/tree/main/packages/multiplexr_plugin_sdk) · GPL-3.0-only.
