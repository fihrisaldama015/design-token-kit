import { useState } from "react";
import { ChevronUp, ChevronDown, RefreshCw, Pipette } from "lucide-react";
import { cn } from "utils/utils";

// TokenCoverageCard - SWT20-398 whole-page summary shown next to the
// floating checker button while inspecting: how many audited COLOR
// properties on the current screen are semantic (+Theme collection - the
// highest abstraction layer), plain token (a whitelisted var that isn't
// semantic - a primitive or old bridge var), or hardcoded. Clicking any
// number flags every contributing element on the page at once
// (ColorChecker owns the actual flagging - this component only reports the
// click). Matches TRMS's DesignTokenInspector coverage card design
// (dark theme, dot + title, rescan/collapse only - no token-source
// settings gear, since that dual-source mode isn't in scope here).
//
// `scanning` shows a "Scanning..." placeholder instead of the counts - the
// scan runs async and chunked (see scanPageCoverage) precisely so this can
// stay visible and honest about "still working" instead of the page
// appearing to hang while it runs.
export function TokenCoverageCard({
  semantic,
  token,
  unmatched,
  elementsChecked,
  scanning,
  onRescan,
  highlightMode,
  onToggleHighlight,
  onOpenTry,
  tryHasOverrides,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const compliant = semantic + token;
  const total = compliant + unmatched;
  const pct = total > 0 ? Math.round((compliant / total) * 100) : 0;
  const path = typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <div className="rounded-xl border border-white/10 bg-[#16171d] text-[#e4e4e7] shadow-lg w-[280px] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-100">
          <span className="w-[7px] h-[7px] rounded-full bg-primary-default flex-shrink-0" />
          Token Coverage
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Try a colour"
            title="Try a colour - temporary, not saved"
            onClick={onOpenTry}
            className={cn(
              "w-[22px] h-[22px] rounded-md flex items-center justify-center hover:bg-white/10 hover:text-gray-100",
              tryHasOverrides ? "bg-red-500/20 text-red-300" : "bg-white/[0.06] text-gray-400",
            )}
          >
            <Pipette size={12} />
          </button>
          <button
            type="button"
            aria-label="Rescan"
            title="Rescan this screen"
            onClick={onRescan}
            disabled={scanning}
            className="w-[22px] h-[22px] rounded-md bg-white/[0.06] text-gray-400 flex items-center justify-center hover:bg-white/10 hover:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            aria-label={collapsed ? "Expand" : "Collapse"}
            title={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((value) => !value)}
            className="w-[22px] h-[22px] rounded-md bg-white/[0.06] text-gray-400 flex items-center justify-center hover:bg-white/10 hover:text-gray-100"
          >
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="px-3 pb-3">
          {scanning ? (
            <div className="flex items-center justify-center gap-2 py-3 text-[11px] text-gray-400">
              <RefreshCw size={12} className="animate-spin" />
              Scanning page...
            </div>
          ) : (
            <>
              <div className="font-mono text-[10px] text-gray-500 mb-2.5 truncate">{path}</div>
              <div className="h-1.5 rounded-full bg-red-500/25 overflow-hidden mb-2.5">
                <div
                  className="h-full bg-green-500 rounded-full transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => onToggleHighlight("semantic")}
                  className={cn(
                    "flex-1 flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left bg-white/[0.05] hover:bg-white/[0.09]",
                    highlightMode === "semantic" ? "border-green-400 bg-white/10" : "border-transparent",
                  )}
                >
                  <span className="font-mono text-base font-bold leading-none text-green-300">{semantic}</span>
                  <span className="text-[9.5px] font-semibold text-gray-400">✦ Semantic</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleHighlight("token")}
                  className={cn(
                    "flex-1 flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left bg-white/[0.05] hover:bg-white/[0.09]",
                    highlightMode === "token" ? "border-indigo-400 bg-white/10" : "border-transparent",
                  )}
                >
                  <span className="font-mono text-base font-bold leading-none text-indigo-300">{token}</span>
                  <span className="text-[9.5px] font-semibold text-gray-400">✓ Token</span>
                </button>
                <button
                  type="button"
                  onClick={() => onToggleHighlight("unmatched")}
                  className={cn(
                    "flex-1 flex flex-col items-start gap-0.5 rounded-lg border px-2 py-1.5 text-left bg-white/[0.05] hover:bg-white/[0.09]",
                    highlightMode === "unmatched" ? "border-red-400 bg-white/10" : "border-transparent",
                  )}
                >
                  <span className="font-mono text-base font-bold leading-none text-red-300">{unmatched}</span>
                  <span className="text-[9.5px] font-semibold text-gray-400">✕ Not using token</span>
                </button>
              </div>
              <div className="text-[10.5px] text-gray-500 text-center">
                {pct}% token coverage · {elementsChecked} elements checked
              </div>
              <div className="text-[9.5px] text-gray-600 text-center mt-1.5">
                Click a number to flag those elements on the page
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
