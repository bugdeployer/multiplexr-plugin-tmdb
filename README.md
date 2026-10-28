# TMDB metadata for Multiplexr

Searches movies and TV using TMDB. Returns title, synopsis, director, genres, release year, poster and backdrop artwork.

In **Manage > Permissions**, allow the collection and network destination. In **Manage > Credentials**, select `https://api.themoviedb.org` and paste your **API Read Access Token**, not the v3 API key. Enable the plugin, then choose TMDB in Find metadata.

Uses the [TMDB API](https://developer.themoviedb.org/docs/authentication-application). This product uses the TMDB API but is not endorsed or certified by TMDB.

## Install

Requires the patched Multiplexr plugin host (0.5.1 or newer). In **Settings > Plugins > Browse**, find TMDB and choose Install or Update. File import is also available. Review access before enabling. The 0.1.0 release was a starter and has no metadata handler.

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


The 0.3.0 preview adds movie and TV poster handles and an artwork provider.
It needs the 0.5.2 app preview (SDK 1.3). Review the added artwork and catalog
permissions and approve `https://image.tmdb.org` when importing the update.
The API token is sent only to `https://api.themoviedb.org`; image downloads
are public and do not receive it. Posters are fetched at w342 size for review.
