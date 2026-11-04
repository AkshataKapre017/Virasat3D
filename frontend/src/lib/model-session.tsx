"use client";

/**
 * One active heritage location and one model mode at a time.
 *
 * The session is intentionally tiny: it records *which site* the viewer belongs to, the selected
 * mode, and the reconstruction job the user is following. Every mutation carries the site it was
 * made for, so a late response from a previous site cannot change the new site's viewer. Switching
 * sites (or stopping the local viewer) advances an epoch; async callbacks compare epochs and drop
 * themselves when they are stale.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";

export type ModelModeId = "procedural" | "detailed" | "wireframe";

export const MODEL_MODE_OPTIONS: ReadonlyArray<{ id: ModelModeId; label: string; hint: string }> = [
  {
    id: "procedural",
    label: "Procedural Typology Model",
    hint: "Approximate reconstruction from the site's typology and dimensions.",
  },
  {
    id: "detailed",
    label: "Detailed 3D Model",
    hint: "A model reconstructed from contributor photographs, when one has been built.",
  },
  {
    id: "wireframe",
    label: "Wireframe Model",
    hint: "The actual mesh geometry drawn as edges.",
  },
];

interface ModelSessionState {
  siteId: number | null;
  siteSlug: string | null;
  /** Bumped whenever the active location or local viewing session changes. */
  epoch: number;
  mode: ModelModeId;
  /** The reconstruction job this viewer is following, if any. */
  jobId: number | null;
  loading: boolean;
  /** Local viewer stop: hides the model without cancelling a server job. */
  stopped: boolean;
}

const INITIAL: ModelSessionState = {
  siteId: null,
  siteSlug: null,
  epoch: 0,
  mode: "procedural",
  jobId: null,
  loading: false,
  stopped: false,
};

type Action =
  | { type: "enter"; siteId: number; siteSlug: string }
  | { type: "leave"; siteId: number }
  | { type: "mode"; siteId: number; mode: ModelModeId }
  | { type: "job"; siteSlug: string; jobId: number | null }
  | { type: "loading"; siteSlug: string; loading: boolean }
  | { type: "stopViewing" }
  | { type: "resumeViewing" };

function reducer(state: ModelSessionState, action: Action): ModelSessionState {
  switch (action.type) {
    case "enter":
      if (state.siteId === action.siteId && state.siteSlug === action.siteSlug) return state;
      return { ...INITIAL, siteId: action.siteId, siteSlug: action.siteSlug, epoch: state.epoch + 1 };
    case "leave":
      if (state.siteId !== action.siteId) return state;
      return { ...INITIAL, epoch: state.epoch + 1 };
    case "mode":
      return state.siteId === action.siteId && state.mode !== action.mode
        ? { ...state, mode: action.mode }
        : state;
    case "job":
      return state.siteSlug === action.siteSlug && state.jobId !== action.jobId
        ? { ...state, jobId: action.jobId }
        : state;
    case "loading":
      return state.siteSlug === action.siteSlug && state.loading !== action.loading
        ? { ...state, loading: action.loading }
        : state;
    case "stopViewing":
      return { ...state, stopped: true, loading: false, epoch: state.epoch + 1 };
    case "resumeViewing":
      return { ...state, stopped: false, epoch: state.epoch + 1 };
    default:
      return state;
  }
}

interface ModelSessionApi extends ModelSessionState {
  enterSite: (siteId: number, siteSlug: string) => void;
  leaveSite: (siteId: number) => void;
  selectMode: (siteId: number, mode: ModelModeId) => void;
  setJob: (siteSlug: string, jobId: number | null) => void;
  setLoading: (siteSlug: string, loading: boolean) => void;
  stopViewing: () => void;
  resumeViewing: () => void;
  /** True when `slug`/`epoch` no longer describe the active viewer session. */
  isStale: (siteSlug: string, epoch: number) => boolean;
}

const ModelSessionContext = createContext<ModelSessionApi | null>(null);

export function ModelSessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);

  const enterSite = useCallback((siteId: number, siteSlug: string) => {
    dispatch({ type: "enter", siteId, siteSlug });
  }, []);
  const leaveSite = useCallback((siteId: number) => dispatch({ type: "leave", siteId }), []);
  const selectMode = useCallback(
    (siteId: number, mode: ModelModeId) => dispatch({ type: "mode", siteId, mode }),
    [],
  );
  const setJob = useCallback(
    (siteSlug: string, jobId: number | null) => dispatch({ type: "job", siteSlug, jobId }),
    [],
  );
  const setLoading = useCallback(
    (siteSlug: string, loading: boolean) => dispatch({ type: "loading", siteSlug, loading }),
    [],
  );
  const stopViewing = useCallback(() => dispatch({ type: "stopViewing" }), []);
  const resumeViewing = useCallback(() => dispatch({ type: "resumeViewing" }), []);
  const isStale = useCallback(
    (siteSlug: string, epoch: number) => state.siteSlug !== siteSlug || state.epoch !== epoch,
    [state.siteSlug, state.epoch],
  );

  const value = useMemo<ModelSessionApi>(
    () => ({
      ...state,
      enterSite,
      leaveSite,
      selectMode,
      setJob,
      setLoading,
      stopViewing,
      resumeViewing,
      isStale,
    }),
    [state, enterSite, leaveSite, selectMode, setJob, setLoading, stopViewing, resumeViewing, isStale],
  );

  return <ModelSessionContext.Provider value={value}>{children}</ModelSessionContext.Provider>;
}

export function useModelSession(): ModelSessionApi {
  const session = useContext(ModelSessionContext);
  if (!session) throw new Error("useModelSession must be used inside <Providers>");
  return session;
}

/** Bind the session to the site currently rendered, resetting it when the location changes. */
export function useSiteModelSession(siteId: number, siteSlug: string): ModelSessionApi {
  const session = useModelSession();
  const { enterSite, leaveSite } = session;
  useEffect(() => {
    enterSite(siteId, siteSlug);
    return () => leaveSite(siteId);
  }, [enterSite, leaveSite, siteId, siteSlug]);
  return session;
}
