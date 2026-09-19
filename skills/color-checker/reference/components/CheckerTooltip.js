import { Check, X, TriangleAlert } from "lucide-react";
import { cn } from "utils/utils";
import { COLOR_PROPERTIES } from "utils/colorCheckerEngine";

// Friendlier row labels than the raw CSS property name, matching TRMS's
// wording ("text"/"background"/"border", "family").
const PROPERTY_LABEL = {
  "background-color": "background",
  color: "text",
  "border-color": "border",
  "font-size": "font size",
  "font-weight": "font weight",
  "line-height": "line height",
  "font-family": "family",
};

// "semantic" is a step above plain "token": the var comes from the
// +Theme collection (the design system's own semantic intent, e.g. "this
// is a danger background"), not just a primitive/bridge var that happens
// to be whitelisted too. Scoped to color properties only for now (see
// colorCheckerEngine's COLOR_PROPERTIES/auditProperty) - typography
// doesn't have a semantic aliasing layer in the Figma export yet.
const STATUS_LABEL = {
  semantic: "Semantic",
  token: "Token",
  hardcoded: "Hardcoded",
};

const STATUS_ICON = {
  semantic: Check,
  token: Check,
  hardcoded: X,
};

const STATUS_CLASS = {
  semantic: "bg-green-500/20 text-green-300",
  token: "bg-indigo-500/20 text-indigo-300",
  hardcoded: "bg-red-500/20 text-red-300",
};

const VALUE_TEXT_CLASS = {
  semantic: "text-green-300",
  token: "text-indigo-300",
  hardcoded: "text-red-300",
};

// Grouped and labeled the same way TRMS's DesignTokenInspector splits its
// tooltip - "Color" (background/text/border) then "Typography" (the
// remaining four) - rather than one flat list of 7 rows.
const GROUPS = [
  { label: "Color", properties: ["background-color", "color", "border-color"] },
  { label: "Typography", properties: ["font-size", "font-weight", "line-height", "font-family"] },
];

// border-color is the one property most elements simply don't have (no
// visible border) - showing a "-" row for it on every hover clutters the
// tooltip, so it's hidden entirely when not applicable. text/background
// always show, since every element has an opinion (even if inherited) on
// those.
const HIDE_WHEN_NO_COLOR = new Set(["border-color"]);

const SUMMARY = {
  matched: { label: "Fully matches design tokens", icon: Check, className: "bg-green-500/15 text-green-300" },
  partial: { label: "Partially matches design tokens", icon: TriangleAlert, className: "bg-yellow-500/15 text-yellow-300" },
  unmatched: { label: "Does not match design tokens", icon: X, className: "bg-red-500/15 text-red-300" },
  neutral: { label: "No color/text to check", icon: X, className: "bg-white/10 text-gray-400" },
};

/**
 * Overall status across every checkable (non "no-color") result. "token"
 * and "semantic" both count as "matches" here - semantic is a strictly
 * better version of matching a token, not a different outcome - only the
 * per-row pill distinguishes which one it actually was.
 */
function summarize(results) {
  const applicable = results.filter((r) => r.status !== "no-color");
  if (applicable.length === 0) return SUMMARY.neutral;
  const isCompliant = (r) => r.status === "token" || r.status === "semantic";
  if (applicable.every(isCompliant)) return SUMMARY.matched;
  return applicable.some(isCompliant) ? SUMMARY.partial : SUMMARY.unmatched;
}

/** First font in a computed font-family stack, quotes stripped - "Inter". */
function primaryFontName(computedFontFamily) {
  if (!computedFontFamily) return null;
  return computedFontFamily.split(",")[0].replace(/["']/g, "").trim();
}

// Spacing (layout identification - useful context, not something this
// tool audits) first, then the color/typography prefixes this tool
// actually checks, in the same order the Color/Typography rows below are
// listed - background, border, text, then typography. A component's OWN
// base classes (e.g. Button's hardcoded "p-3 rounded-md inline-flex ...")
// always come first in the DOM's class list regardless of which variant
// is active, so naively showing "the first couple classes in DOM order"
// (this used to just copy TRMS's slice(0, 2) convention) could surface a
// component's spacing/layout classes in the SAME position as the
// color/typography ones actually being graded, and easily be misread as
// "this is what determines compliance" - e.g. a secondary Button variant
// reading "button.p-3.inline-flex" looking like its real bg-* class was
// never applied. Explicit priority order keeps spacing visible (still
// useful to see at a glance) while making it unambiguous which classes
// the audit below is actually about.
const SPACING_PREFIXES = ["p-", "px-", "py-", "pt-", "pb-", "pl-", "pr-", "m-", "mx-", "my-", "mt-", "mb-", "ml-", "mr-"];
const COLOR_TYPOGRAPHY_PREFIXES = ["bg-", "border-", "text-", "font-", "leading-"];
const CLASS_PRIORITY = [...SPACING_PREFIXES, ...COLOR_TYPOGRAPHY_PREFIXES];
const RELEVANT_CLASS_PREFIX = new RegExp(`^(${CLASS_PRIORITY.join("|")})`);

/**
 * Drops a shorthand class ("p-3", "m-2", etc.) when BOTH of its
 * axis-specific classes ("px" and "py", or "mx" and "my") are also
 * present - at that point the shorthand contributes nothing (both axes it
 * would have set are fully overridden), so showing it alongside them is
 * misleading, not just redundant. If only ONE axis class is present (e.g.
 * "p-3" plus "px-4", no "py"), the shorthand still supplies the other
 * axis's value, so it stays.
 */
function dropFullyOverriddenShorthand(classes) {
  const hasAxisPair = (xPrefix, yPrefix) =>
    classes.some((c) => c.startsWith(xPrefix)) && classes.some((c) => c.startsWith(yPrefix));
  const dropP = hasAxisPair("px-", "py-");
  const dropM = hasAxisPair("mx-", "my-");

  return classes.filter((c) => {
    if (c.startsWith("p-") && dropP) return false;
    if (c.startsWith("m-") && dropM) return false;
    return true;
  });
}

function relevantClasses(classAttr) {
  if (!classAttr) return [];
  const classes = classAttr
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((cls) => !cls.includes(":"))
    .filter((cls) => RELEVANT_CLASS_PREFIX.test(cls));

  return dropFullyOverriddenShorthand(classes)
    .map((cls, index) => ({ cls, index }))
    .sort((a, b) => {
      const rankA = CLASS_PRIORITY.findIndex((p) => a.cls.startsWith(p));
      const rankB = CLASS_PRIORITY.findIndex((p) => b.cls.startsWith(p));
      return rankA !== rankB ? rankA - rankB : a.index - b.index;
    })
    .map(({ cls }) => cls);
}

function PropertyRow({ result, first, computed }) {
  const label = PROPERTY_LABEL[result.property] ?? result.property;
  const computedFamily = result.property === "font-family" ? primaryFontName(computed?.fontFamily) : null;

  return (
    <div className={cn("flex items-start justify-between gap-2 py-2", !first && "border-t border-white/10")}>
      <span className="font-mono text-[10.5px] text-gray-400 flex-shrink-0 pt-0.5">{label}</span>
      <div className="min-w-0 flex-1">
        {result.value && (
          <div className="flex items-start justify-end gap-1">
            {COLOR_PROPERTIES.has(result.property) && (
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/25 flex-shrink-0 mt-0.5"
                style={{ background: result.value }}
              />
            )}
            <span
              className={cn(
                "font-mono text-[10px] leading-snug break-all line-clamp-2 text-right",
                VALUE_TEXT_CLASS[result.status] ?? "text-red-300",
              )}
              title={result.value}
            >
              {result.value}
            </span>
          </div>
        )}
        {computedFamily && (
          <div className="text-[10px] text-gray-400 font-mono mt-0.5 text-right">
            computed: {computedFamily}
          </div>
        )}
      </div>
      {result.status === "no-color" ? (
        <span className="flex-shrink-0 text-gray-500 text-[11px] leading-none pt-0.5">–</span>
      ) : (
        (() => {
          const StatusIcon = STATUS_ICON[result.status];
          return (
            <span
              className={cn(
                "flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold text-[9.5px]",
                STATUS_CLASS[result.status],
              )}
            >
              <StatusIcon size={10} strokeWidth={3} />
              {STATUS_LABEL[result.status]}
            </span>
          );
        })()
      )}
    </div>
  );
}

/** Computed-only "font" summary row (size / weight) - informational, not
 * part of the token audit, so no status pill - just what actually renders. */
function ComputedFontRow({ computed }) {
  if (!computed) return null;
  return (
    <div className="flex items-start justify-between gap-2 py-2">
      <span className="font-mono text-[10.5px] text-gray-400 flex-shrink-0">font</span>
      <span className="font-mono text-[10px] leading-snug text-gray-300 text-right">
        {computed.fontSize} / {computed.fontWeight}
      </span>
    </div>
  );
}

// CheckerTooltip - lists the SWT20-398 audit result for one hovered
// element: an overall "fully/partially/does not match" summary up top
// (mirrors TRMS's DesignTokenInspector, same wording), then the element's
// tag + its spacing and color/typography classes (in that priority order,
// no variants - see relevantClasses), grouped into Color and Typography
// sections like TRMS,
// each row showing a color swatch (for background/text/border) and the
// actual raw value ("var(--color-primary, ...)" or a literal hex/px) in
// full - wrapped up to 2 lines then ellipsized rather than growing
// unbounded - with a token/hardcoded pill.
export function CheckerTooltip({ results, computed, elementInfo }) {
  const summary = summarize(results);
  const SummaryIcon = summary.icon;
  const byProperty = new Map(results.map((r) => [r.property, r]));
  const classes = relevantClasses(elementInfo?.classAttr);

  return (
    <div className="rounded-lg border border-white/10 bg-[#16171d] text-[#e4e4e7] shadow-lg text-xs w-96 px-3 py-2.5">
      <div className={cn("flex items-center gap-1.5 px-2.5 py-2 rounded-md text-[11px] font-bold", summary.className)}>
        <SummaryIcon size={13} strokeWidth={3} />
        {summary.label}
      </div>
      {elementInfo?.tag && (
        <div className="font-mono text-[10.5px] font-bold text-pink-300 mt-2 mb-1 break-words">
          {elementInfo.tag}
          {classes.length > 0 && <span className="text-blue-300 font-medium">.{classes.join(".")}</span>}
        </div>
      )}
      {GROUPS.map((group) => {
        const isTypography = group.label === "Typography";
        const groupResults = group.properties.map((property) => byProperty.get(property)).filter(Boolean);

        // An element with no text of its own (a plain container/card) has
        // no explicit declaration for ANY of the 4 typography properties -
        // showing four "-" rows for that isn't useful, so skip the whole
        // section rather than list them one by one.
        if (isTypography && groupResults.length > 0 && groupResults.every((r) => r.status === "no-color")) {
          return null;
        }

        const rows = groupResults.filter((r) => !(HIDE_WHEN_NO_COLOR.has(r.property) && r.status === "no-color"));
        if (rows.length === 0 && !(isTypography && computed)) return null;
        return (
          <div key={group.label}>
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500 border-b border-white/10 mt-3 pb-1 mb-0.5">
              {group.label}
            </div>
            {isTypography && computed && <ComputedFontRow computed={computed} />}
            {rows.map((result, i) => (
              <PropertyRow
                key={result.property}
                result={result}
                first={i === 0 && !(isTypography && computed)}
                computed={computed}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
