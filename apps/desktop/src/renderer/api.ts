import type { CrocApi } from "@croc-classroom/shared";

declare global {
  interface Window {
    croc?: CrocApi;
  }
}

export async function loadApi(): Promise<{
  api: CrocApi | null;
  demo: boolean;
}> {
  if (window.croc) return { api: window.croc, demo: false };
  // A production build never silently substitutes simulated transfers for real IPC.
  if (import.meta.env.DEV || import.meta.env.VITE_DEMO === "true") {
    const { createMockCrocApi } = await import("@croc-classroom/shared/mocks");
    const params = new URLSearchParams(window.location.search);
    const role = params.get("role");
    const outcome = params.get("outcome");
    return {
      api: createMockCrocApi({
        transferOutcome: outcome === 'failed' || outcome === 'timeout' ? outcome : 'succeeded',
        loggedInAs:
          role === "login"
            ? undefined
            : role === "student"
              ? "student"
              : "lecturer",
      }),
      demo: true,
    };
  }
  return { api: null, demo: false };
}
