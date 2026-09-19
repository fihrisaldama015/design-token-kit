import { createContext, useContext, useState } from "react";

const VISIBILITY_STORAGE_KEY = "imt-color-checker-visible";

function readStoredVisibility() {
  try {
    return localStorage.getItem(VISIBILITY_STORAGE_KEY) === "on";
  } catch {
    // Storage can be disabled (private mode, blocked cookies) - stay hidden.
    return false;
  }
}

const ColorCheckerContext = createContext();

/**
 * ColorCheckerProvider - two independent pieces of state for the SWT20-398
 * design-token compliance checker:
 *   - visible: persisted, controls only whether the floating trigger button
 *     renders at all (Settings > Appearance toggle).
 *   - inspecting: transient, never persisted, flipped by clicking the
 *     floating button itself. Always starts false on a fresh mount.
 */
export const ColorCheckerProvider = ({ children }) => {
  const [visible, setVisibleState] = useState(readStoredVisibility);
  const [inspecting, setInspecting] = useState(false);

  const setVisible = (value) => {
    try {
      localStorage.setItem(VISIBILITY_STORAGE_KEY, value ? "on" : "off");
    } catch {
      // Preference just won't survive a reload - still apply it this session.
    }
    setVisibleState(value);
  };

  return (
    <ColorCheckerContext.Provider
      value={{ visible, setVisible, inspecting, setInspecting }}
    >
      {children}
    </ColorCheckerContext.Provider>
  );
};

function useColorCheckerContext(hookName) {
  const ctx = useContext(ColorCheckerContext);
  if (!ctx) {
    throw new Error(`${hookName} must be used within ColorCheckerProvider`);
  }
  return ctx;
}

export function useColorCheckerVisibility() {
  const ctx = useColorCheckerContext("useColorCheckerVisibility");
  return [ctx.visible, ctx.setVisible];
}

export function useInspectMode() {
  const ctx = useColorCheckerContext("useInspectMode");
  return [ctx.inspecting, ctx.setInspecting];
}
