function nonNegativeSeconds(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const uxConfig = {
  routeTransitionLoaderDelaySeconds: nonNegativeSeconds(
    import.meta.env.VITE_ROUTE_TRANSITION_LOADER_DELAY_SECONDS as string | undefined,
    0.5,
  ),
  inlineLoadingIndicatorDelaySeconds: 0,
  // Hide brief event-stream reconnects; longer fallbacks remain informative and action-free.
  streamRecoveryNoticeDelaySeconds: 2,
} as const;
