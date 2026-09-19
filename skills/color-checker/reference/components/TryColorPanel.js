import { useMemo, useState } from "react";
import { ArrowLeft, Undo2 } from "lucide-react";
import { cn } from "utils/utils";
import { listColorTokens, tokenTier } from "utils/colorCheckerEngine";

const LIST_LIMIT = 80;

// TryColorPanel - SWT20-398 "try a colour" tool: lists every live color
// token (see listColorTokens) with a native color-swatch input next to it.
// Picking a color overrides that token's CSS custom property live, on this
// tab only (ColorChecker's applyOverride/resetOverride do the actual DOM
// write) - the fastest way to answer "which part of the UI is NOT using
// this token yet", since anything still hardcoded won't move when the
// token's color changes underneath it. Matches TRMS's DesignTokenInspector
// "Try a Colour" panel: same swatch-name-hex row shape, per-row undo, a
// reset-all footer, nothing ever persisted.
//
// `tokenUsage` (from the last coverage scan - see ColorChecker's rescan())
// is a { [varName]: count } of how many color properties on THIS page
// currently resolve to that token. Sort order: semantic tier first, then
// brand, then base palette (tokenTier - unchanged from before), and WITHIN
// each tier, most-used-on-this-page first - so "semantic (used)" floats to
// the very top, unused semantic tokens sit below it, then brand, then base.
export function TryColorPanel({ overrides, tokenUsage = {}, resetNonce = 0, onPick, onReset, onResetAll, onBack }) {
  const [search, setSearch] = useState("");
  const allTokens = useMemo(() => {
    const list = listColorTokens();
    return [...list].sort((a, b) => {
      const tierDiff = tokenTier(a.name) - tokenTier(b.name);
      if (tierDiff !== 0) return tierDiff;
      const usageDiff = (tokenUsage[b.name] || 0) - (tokenUsage[a.name] || 0);
      if (usageDiff !== 0) return usageDiff;
      return a.name.localeCompare(b.name);
    });
  }, [tokenUsage]);

  const q = search.trim().toLowerCase();
  const hits = q ? allTokens.filter((t) => t.name.toLowerCase().includes(q)) : allTokens;
  const shown = hits.slice(0, LIST_LIMIT);
  const overriddenCount = Object.keys(overrides).length;

  return (
    <div className="rounded-xl border border-white/10 bg-[#16171d] text-[#e4e4e7] shadow-lg w-[280px] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-100">
          <span className="w-[7px] h-[7px] rounded-full bg-primary-default flex-shrink-0" />
          Try a Colour
        </div>
        <button
          type="button"
          aria-label="Back"
          title="Back"
          onClick={onBack}
          className="w-[22px] h-[22px] rounded-md bg-white/[0.06] text-gray-400 flex items-center justify-center hover:bg-white/10 hover:text-gray-100"
        >
          <ArrowLeft size={12} />
        </button>
      </div>

      <div className="px-3 pb-3">
        {allTokens.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-gray-400 leading-relaxed">
            No color tokens are live right now. Turn on <span className="text-gray-200 font-semibold">Design Tokens</span>{" "}
            in Settings → Appearance first.
          </div>
        ) : (
          <>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter tokens, e.g. primary"
              className="w-full mb-2 px-2 py-1.5 text-[11px] rounded-md border border-white/[0.14] bg-white/[0.05] text-[#e4e4e7] placeholder:text-gray-500 focus:outline-none focus:border-primary-default"
            />

            <div className="max-h-60 overflow-y-auto -mx-1 px-1">
              {shown.length === 0 ? (
                <div className="py-3.5 text-center text-[11px] text-gray-400">
                  No color token matches &ldquo;{search}&rdquo;
                </div>
              ) : (
                shown.map((token) => {
                  const isOverridden = Object.prototype.hasOwnProperty.call(overrides, token.name);
                  const hex = overrides[token.name] ?? token.hex;
                  const usage = tokenUsage[token.name] || 0;
                  return (
                    <div
                      key={token.name}
                      className={cn(
                        "flex items-center gap-2 px-1 py-[3px] rounded-md",
                        isOverridden ? "bg-red-500/[0.14]" : "hover:bg-white/[0.06]",
                      )}
                    >
                      <input
                        // Keyed on resetNonce, NOT on hex/value: some
                        // browsers don't repaint a native color-swatch
                        // input's swatch on a plain programmatic `value`
                        // change (e.g. after "Reset all" restores the
                        // original hex) - forcing a remount fixes that. But
                        // keying on the live value itself breaks dragging
                        // inside the browser's own color picker popup: every
                        // "input" event while dragging changes the value,
                        // which would remount the element mid-drag and close
                        // the popup out from under the user. resetNonce only
                        // changes on an explicit reset action, never on a
                        // live pick, so normal picking never remounts.
                        key={resetNonce}
                        type="color"
                        value={hex}
                        title="Pick a color"
                        onChange={(event) => onPick(token.name, event.target.value)}
                        className="w-5 h-5 flex-shrink-0 p-0 rounded border border-white/20 bg-transparent cursor-pointer [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm"
                      />
                      <span
                        className="flex-1 min-w-0 text-[10.5px] text-gray-300 whitespace-nowrap overflow-hidden text-ellipsis"
                        title={token.name}
                      >
                        {token.name.replace(/^--/, "")}
                      </span>
                      {usage > 0 && (
                        <span
                          className="flex-shrink-0 text-[9px] font-bold text-indigo-300 bg-indigo-500/15 rounded-full px-1.5 py-px tabular-nums"
                          title={`Used by ${usage} color propert${usage === 1 ? "y" : "ies"} on this page`}
                        >
                          {usage}
                        </span>
                      )}
                      <span className="flex-shrink-0 text-[10px] text-gray-400 font-mono tabular-nums">{hex}</span>
                      {isOverridden ? (
                        <button
                          type="button"
                          aria-label="Restore original"
                          title="Restore original"
                          onClick={() => onReset(token.name)}
                          className="flex-shrink-0 w-[18px] h-[18px] rounded bg-white/[0.14] text-gray-100 flex items-center justify-center hover:bg-white/[0.26]"
                        >
                          <Undo2 size={11} />
                        </button>
                      ) : (
                        <span className="flex-shrink-0 w-[18px]" />
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {hits.length > LIST_LIMIT && (
              <div className="mt-1.5 text-[10px] text-gray-400">
                Showing {LIST_LIMIT} of {hits.length} - refine the filter to see the rest
              </div>
            )}

            <div className="flex items-center justify-between gap-2 mt-2 text-[10.5px] text-gray-400">
              <span>
                {overriddenCount > 0
                  ? `${overriddenCount} token${overriddenCount === 1 ? "" : "s"} overridden`
                  : `${allTokens.length} color tokens`}
              </span>
              {overriddenCount > 0 && (
                <button
                  type="button"
                  onClick={onResetAll}
                  className="px-2 py-[3px] rounded-md border border-white/[0.18] bg-white/[0.06] text-[#e4e4e7] text-[10px] hover:bg-white/[0.14]"
                >
                  Reset all
                </button>
              )}
            </div>
            <div className="mt-1.5 text-[9.5px] text-gray-500 text-center">
              Changes apply live to this tab only and vanish on reload.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
