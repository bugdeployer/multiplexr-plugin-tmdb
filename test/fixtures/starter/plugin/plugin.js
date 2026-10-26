const PLUGIN_ID = "org.example.plugin";

/** @param {import('multiplexr_plugin_sdk').Request} request */
function multiplexrEntry(request) {
  return AppShell.definePlugin({
    'plugin.open': AppShell.contribution('ui.destination', (_params, host) => {
      const setting = host.call('settings.effective', {
        id: AppShell.namespacedId(PLUGIN_ID, 'greeting'),
        lineage: [{ scope: 'app' }],
      });
      if (typeof setting.value !== 'string' || setting.value.length > 200) {
        throw new AppShell.PluginError('invalid_response');
      }
      return { kind: 'text', text: setting.value };
    }, PLUGIN_ID),
  })(request);
}
