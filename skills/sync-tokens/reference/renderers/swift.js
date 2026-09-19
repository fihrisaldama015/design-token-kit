/**
 * iOS - a Swift enum of static UIColor(hex:). Only emits Light values for
 * now (a Dark variant would need a real UIColor dynamic-provider, not a
 * static let - out of scope for this prototype, noted for the syncup).
 */
const { toCamel } = require("./json.js");

function renderSwift(resolved) {
  const lines = resolved.map(
    (t) => `    static let ${toCamel(t.path)} = UIColor(hex: "${t.light.replace("#", "")}") // ${t.path}`,
  );
  return ["import UIKit", "", "enum DesignTokenColor {", ...lines, "}", ""].join("\n");
}

module.exports = { renderSwift };
