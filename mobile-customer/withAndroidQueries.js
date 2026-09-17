const { withAndroidManifest } = require('@expo/config-plugins');

const withAndroidQueries = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    if (!androidManifest.manifest.queries) {
      androidManifest.manifest.queries = [];
    }
    
    let queries = androidManifest.manifest.queries[0];
    if (!queries) {
      queries = { intent: [] };
      androidManifest.manifest.queries.push(queries);
    }
    if (!queries.intent) {
      queries.intent = [];
    }
    
    const schemes = ['upi', 'paytm', 'tez', 'phonepe', 'gpay'];
    for (const scheme of schemes) {
      queries.intent.push({
        action: { $: { 'android:name': 'android.intent.action.VIEW' } },
        data: { $: { 'android:scheme': scheme } }
      });
    }
    
    return config;
  });
};

module.exports = withAndroidQueries;
