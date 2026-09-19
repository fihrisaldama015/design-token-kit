/**
 * Android - a colors.xml resource file. Light values only, same caveat as
 * swift.js: a real dark theme would need values/night/colors.xml, not one
 * flat file - noted for the syncup, not solved by this prototype.
 */
function slugToResourceName(slug) {
  return slug.replace(/-/g, "_");
}

function renderAndroidXml(resolved) {
  const lines = resolved.map(
    (t) => `    <color name="${slugToResourceName(t.slug)}">${t.light}</color> <!-- ${t.path} -->`,
  );
  return ['<?xml version="1.0" encoding="utf-8"?>', "<resources>", ...lines, "</resources>", ""].join(
    "\n",
  );
}

module.exports = { renderAndroidXml };
