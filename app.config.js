// Extends app.json.
// WEB_SINGLE=1 turns off route code-splitting so the web build is one bundle
// (used by scripts/build-web-single.mjs to make a single, self-contained HTML file).
// WEB_BASE=/path serves the web build from a sub-folder of a site (used by scripts/build-web-hosted.mjs).
module.exports = ({ config }) => {
  let c = config;
  if (process.env.WEB_SINGLE) {
    c = { ...c, plugins: c.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: { web: false } }] : p)) };
  }
  if (process.env.WEB_BASE) c = { ...c, experiments: { ...c.experiments, baseUrl: process.env.WEB_BASE } };
  return c;
};
