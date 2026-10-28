// Extends app.json. WEB_SINGLE=1 turns off route code-splitting so the web build is one bundle
// (used by scripts/build-web-single.mjs to make a single, self-contained HTML file).
module.exports = ({ config }) =>
  process.env.WEB_SINGLE
    ? {
        ...config,
        plugins: config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: { web: false } }] : p)),
      }
    : config;
