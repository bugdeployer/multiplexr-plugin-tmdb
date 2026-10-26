# Multiplexr plugin template

A starter plugin with a UI destination and one app setting. Use it for metadata providers, library tools or other [plugin contributions](https://github.com/bugdeployer/Multiplexr/blob/main/docs/plugins.md).

## Create a plugin

Choose **Use this template** on GitHub, create your repository, and clone it. Requires Node.js 22 or newer.

```sh
npm ci
npm run configure -- --id org.yourname.myplugin --name "My plugin"
npm run check
npm test
npm run build
```

Use a unique namespace you control. Configuration updates the contribution IDs, setting IDs and source namespace together. Edit `plugin/manifest.json` for permissions and contributions; implement handlers in `plugin/plugin.js`.

The starter reads its message from plugin settings and returns a host-rendered text node. It requests UI and settings permissions, with no network or library access.

## Sign and install

Generate a publisher key outside the repository:

```sh
openssl ecparam -name prime256v1 -genkey -noout -out /private/publisher.pem
npm run sign -- --key /private/publisher.pem
```

Install `dist/<plugin-id>-<version>.mpx.json` through **Settings > Plugins & themes** in Multiplexr. Review permissions and enable the plugin. The `.proof.json` file is a build intermediate, not an installable package.

Keep the publisher key for future updates. Never commit it or include service credentials in the source. The template identity must be changed before signing.

## Publish updates

1. Add your PEM publisher key as the repository Actions secret `PLUGIN_SIGNING_KEY`.
2. Set the version in `plugin/manifest.json` and commit your changes.
3. Push a matching tag, such as `v0.1.0`.

The release workflow runs checks and publishes the signed package and `SHA256SUMS`. Local signing also accepts the `PLUGIN_SIGNING_KEY` environment variable instead of `--key`.

## Network providers

Declare `http.request` in the manifest and list exact HTTPS origins in `plugin/network-origins.json`, for example `https://api.example.org`. Add `credentials.use` when requesting host-managed credentials. Configure credentials in Multiplexr; plugin code does not read the secret.

The current host injects Bearer credentials and supports bounded HTTPS GET requests. Confirm that a provider fits that contract before implementing it. Use mock responses in tests rather than live service credentials.

## Files

| Path | Purpose |
| --- | --- |
| `plugin/` | Manifest, handlers and approved network origins |
| `scripts/` | Configuration, build, signing and release tools |
| `test/` | Host interaction, identity, signing and permission tests |
| `types/` | SDK globals for JavaScript type checking |
| `dist/` | Generated artifacts; ignored by Git |

Dependencies are locked to SDK 1.1.0 and TypeScript 5.9.3. Plugin code targets Multiplexr protocol 1, not Node.js. Tests execute only trusted source fixtures; Node's VM is not a production plugin sandbox.

[API reference](https://github.com/bugdeployer/Multiplexr/blob/main/packages/multiplexr_plugin_sdk/API.md) · [SDK source](https://github.com/bugdeployer/Multiplexr/tree/main/packages/multiplexr_plugin_sdk)

## License

GPL-3.0-only. Keep the license when using this template.
