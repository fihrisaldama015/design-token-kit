import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useColorCheckerVisibility, useInspectMode } from "hooks/useColorChecker";
import {
  buildTokenVarWhitelist,
  buildPropertyIndex,
  auditElement,
  scanPageCoverage,
  applyTokenOverride,
  resetTokenOverride,
} from "utils/colorCheckerEngine";
import { CheckerTooltip } from "components/colorChecker/CheckerTooltip";
import { TokenCoverageCard } from "components/colorChecker/TokenCoverageCard";
import { TryColorPanel } from "components/colorChecker/TryColorPanel";

// Same colors as CheckerTooltip's status pills (semantic=green,
// token=indigo, hardcoded/unmatched=red), used for the persistent
// page-wide outline flags Token Coverage's stat buttons toggle.
const FLAG_COLOR = { semantic: "#22c55e", token: "#6366f1", unmatched: "#ef4444" };

// ColorChecker - SWT20-398 floating dev tool. When visible, shows a trigger
// button; clicking it enters "inspect mode" (like a browser element picker):
// hovering highlights the element under the cursor and shows whether its
// color/typography properties are wired to the design-token pipeline or
// hardcoded. Inspecting does not block clicks - the page behaves normally,
// exit via the button again or Escape (matches TRMS's DesignTokenInspector).
export function ColorChecker() {
  const [visible] = useColorCheckerVisibility();
  const [inspecting, setInspecting] = useInspectMode();
  const [hovered, setHovered] = useState(null); // { rect, results, computed, elementInfo }
  const [coverage, setCoverage] = useState(null); // { semantic, token, unmatched, elementsChecked }
  const [scanning, setScanning] = useState(false);
  const [highlightMode, setHighlightMode] = useState(null); // "semantic" | "token" | "unmatched" | null
  const [tryOpen, setTryOpen] = useState(false);
  const [tryOverrides, setTryOverrides] = useState({}); // { [varName]: hex } - "Try a Colour" live overrides
  // Bumped only by an explicit reset (single or "reset all"), never by a
  // live pick - see handleTryReset/handleTryResetAll and TryColorPanel's
  // key={`${token.name}-${resetNonce}`}.
  const [resetNonce, setResetNonce] = useState(0);
  const whitelistRef = useRef(null);
  const propertyIndexRef = useRef(null);
  const flaggedElsRef = useRef({ semantic: [], token: [], unmatched: [] });
  const tooltipRef = useRef(null);
  const lastElementRef = useRef(null);
  const lastCursorRef = useRef({ x: 0, y: 0 });
  // Guards a rescan() that resolves after inspect mode was already turned
  // off (or turned back on again) - without this, a slow scan's result
  // could land after the fact and resurrect state that should stay cleared.
  const activeRef = useRef(false);

  function clearFlagStyles() {
    Object.values(flaggedElsRef.current).forEach((els) => {
      els.forEach((el) => {
        el.style.outline = "";
        el.style.outlineOffset = "";
      });
    });
  }

  function applyFlags(mode) {
    clearFlagStyles();
    flaggedElsRef.current[mode].forEach((el) => {
      el.style.outline = `2px solid ${FLAG_COLOR[mode]}`;
      el.style.outlineOffset = "1px";
    });
  }

  // Runs the page-wide scan (chunked/async - see scanPageCoverage) without
  // blocking anything else: inspect mode and hover auditing are already
  // live by the time this resolves, so a slow scan just shows "Scanning..."
  // in the coverage card instead of freezing the page.
  async function rescan() {
    const whitelist = whitelistRef.current || buildTokenVarWhitelist();
    whitelistRef.current = whitelist;
    const index = propertyIndexRef.current || buildPropertyIndex();
    propertyIndexRef.current = index;
    setScanning(true);
    const result = await scanPageCoverage(whitelist, document.body, index);
    if (!activeRef.current) return; // inspect mode exited mid-scan - discard

    // Distinct elements that contributed to any bucket - an element with
    // e.g. a semantic background AND a hardcoded text color counts once
    // here, not twice, matching TRMS's "N elements checked" footer.
    const elementsChecked = new Set([
      ...result.semanticElements,
      ...result.tokenElements,
      ...result.unmatchedElements,
    ]).size;
    setCoverage({
      semantic: result.semantic,
      token: result.token,
      unmatched: result.unmatched,
      elementsChecked,
      tokenUsage: result.tokenUsage,
    });
    flaggedElsRef.current = {
      semantic: result.semanticElements,
      token: result.tokenElements,
      unmatched: result.unmatchedElements,
    };
    setScanning(false);
    setHighlightMode((mode) => {
      if (mode) applyFlags(mode);
      return mode;
    });
  }

  function handleToggleHighlight(mode) {
    if (highlightMode === mode) {
      clearFlagStyles();
      setHighlightMode(null);
      return;
    }
    applyFlags(mode);
    setHighlightMode(mode);
  }

  // "Try a Colour" - live, un-persisted token overrides (see
  // colorCheckerEngine's applyTokenOverride). Kept independent of the
  // coverage scan: picking a color doesn't need a rescan to be visible,
  // it's an instant CSS custom-property write.
  function handleTryPick(name, hex) {
    applyTokenOverride(name, hex);
    setTryOverrides((prev) => ({ ...prev, [name]: hex }));
  }

  function handleTryReset(name) {
    resetTokenOverride(name);
    setTryOverrides((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setResetNonce((n) => n + 1);
  }

  function handleTryResetAll() {
    Object.keys(tryOverrides).forEach((name) => resetTokenOverride(name));
    setTryOverrides({});
    setResetNonce((n) => n + 1);
  }

  // Crosshair cursor while inspecting, and Escape exits.
  useEffect(() => {
    document.body.style.cursor = inspecting ? "crosshair" : "";
    if (!inspecting) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setInspecting(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [inspecting, setInspecting]);

  // Positions the tooltip next to the CURSOR (not the hovered element),
  // flipping to the opposite side only when the default spot would run off
  // the viewport - mirrors TRMS's DesignTokenInspector positionTooltip()
  // exactly (16px offset from the cursor, 8px viewport margin). Mutates the
  // DOM node directly rather than via React state, since this needs to run
  // on every mousemove without triggering a re-render each time.
  function positionTooltipAt(x, y) {
    const el = tooltipRef.current;
    if (!el) return;

    const pad = 16;
    const edgeMargin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x + pad;
    let top = y + pad;
    const tooltipRect = el.getBoundingClientRect();
    if (left + tooltipRect.width > vw - edgeMargin) left = x - tooltipRect.width - pad;
    if (top + tooltipRect.height > vh - edgeMargin) top = y - tooltipRect.height - pad;

    el.style.left = `${Math.max(edgeMargin, left)}px`;
    el.style.top = `${Math.max(edgeMargin, top)}px`;
  }

  // Track the hovered element and audit it while inspecting - goes live the
  // instant inspect mode turns on, independent of the (slower) page-wide
  // coverage scan below. Also keeps the tooltip following the cursor: the
  // audit only re-runs when the element under the pointer actually changes,
  // but the tooltip repositions on every move so it stays stable next to
  // the cursor instead of jumping to wherever the new element happens to
  // sit (SWT20-398).
  useEffect(() => {
    if (!inspecting) {
      setHovered(null);
      lastElementRef.current = null;
      return undefined;
    }

    whitelistRef.current = buildTokenVarWhitelist();
    propertyIndexRef.current = buildPropertyIndex();

    const handleMouseMove = (event) => {
      lastCursorRef.current = { x: event.clientX, y: event.clientY };

      const el = event.target;
      if (!(el instanceof Element) || el.closest("[data-color-checker-ui]")) {
        return;
      }

      if (el !== lastElementRef.current) {
        lastElementRef.current = el;
        const rect = el.getBoundingClientRect();
        const results = auditElement(el, whitelistRef.current, propertyIndexRef.current);
        // Resolved (computed) typography, alongside the raw-declaration
        // audit above - a var()-based value like var(--font-family-default)
        // isn't human-readable on its own, so the tooltip also shows what
        // it actually resolves to (e.g. "Inter").
        const computedStyle = getComputedStyle(el);
        const computed = {
          fontSize: computedStyle.fontSize,
          fontWeight: computedStyle.fontWeight,
          fontFamily: computedStyle.fontFamily,
        };
        const elementInfo = {
          tag: el.tagName.toLowerCase(),
          classAttr: typeof el.className === "string" ? el.className : "",
        };
        setHovered({ rect, results, computed, elementInfo });
      }

      positionTooltipAt(event.clientX, event.clientY);
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspecting]);

  // Catches the case positionTooltipAt's direct call above can't handle:
  // on the very first hover of a session, the tooltip hasn't mounted yet
  // at the moment handleMouseMove calls it synchronously (setHovered's
  // effect hasn't committed), so tooltipRef.current is still null and it
  // silently no-ops - leaving the tooltip stuck at its off-screen initial
  // position until the next mousemove. Re-applying the last known cursor
  // position after every commit closes that gap.
  useLayoutEffect(() => {
    if (hovered) positionTooltipAt(lastCursorRef.current.x, lastCursorRef.current.y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hovered]);

  // Kicks off the page-wide coverage scan separately from hover tracking,
  // so inspect mode itself never waits on it (SWT20-398 - was blocking the
  // page for 5-10s on click before this split).
  useEffect(() => {
    activeRef.current = inspecting;
    if (!inspecting) {
      setCoverage(null);
      setScanning(false);
      setHighlightMode(null);
      setTryOpen(false);
      clearFlagStyles();
      return undefined;
    }

    rescan();

    return () => {
      activeRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspecting]);

  if (!visible) return null;

  return (
    <div data-color-checker-ui="true">
      {inspecting && hovered && (
        <>
          <div
            className="fixed z-[100010] pointer-events-none border-2 border-primary bg-primary-default/10 transition-[top,left,width,height] duration-100 ease-out"
            style={{
              top: hovered.rect.top,
              left: hovered.rect.left,
              width: hovered.rect.width,
              height: hovered.rect.height,
            }}
          />
          <div
            ref={tooltipRef}
            data-testid="color-checker-tooltip"
            className="fixed z-[100011] pointer-events-none"
            style={{ top: -9999, left: -9999 }}
          >
            <CheckerTooltip results={hovered.results} computed={hovered.computed} elementInfo={hovered.elementInfo} />
          </div>
        </>
      )}

      {inspecting && tryOpen && (
        <div className="fixed bottom-20 right-4 z-[100012]">
          <TryColorPanel
            overrides={tryOverrides}
            tokenUsage={coverage?.tokenUsage ?? {}}
            resetNonce={resetNonce}
            onPick={handleTryPick}
            onReset={handleTryReset}
            onResetAll={handleTryResetAll}
            onBack={() => setTryOpen(false)}
          />
        </div>
      )}

      {inspecting && !tryOpen && (scanning || coverage) && (
        <div className="fixed bottom-20 right-4 z-[100012]">
          <TokenCoverageCard
            semantic={coverage?.semantic ?? 0}
            token={coverage?.token ?? 0}
            unmatched={coverage?.unmatched ?? 0}
            elementsChecked={coverage?.elementsChecked ?? 0}
            scanning={scanning}
            onRescan={rescan}
            highlightMode={highlightMode}
            onToggleHighlight={handleToggleHighlight}
            onOpenTry={() => setTryOpen(true)}
            tryHasOverrides={Object.keys(tryOverrides).length > 0}
          />
        </div>
      )}

      <button
        type="button"
        aria-label="Color Checker"
        title="Click to toggle inspect mode"
        onClick={() => setInspecting((value) => !value)}
        className={`fixed bottom-4 right-4 z-[100012] w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shadow-[0_8px_24px_rgba(3,7,18,0.28),0_2px_6px_rgba(3,7,18,0.2)] transition-all hover:scale-105 ${
          inspecting ? "bg-primary-default ring-[5px] ring-primary/10" : "bg-[#1a1c23]"
        }`}
      >
        <span
          className={`absolute top-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
            inspecting ? "bg-green-500" : "bg-gray-300"
          }`}
        />
        <Search size={22} />
      </button>
    </div>
  );
}
