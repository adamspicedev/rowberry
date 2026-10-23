import type { PostHogConfig } from "posthog-js";

// Shared by the marketing app and the separately generated documentation.
export const analyticsOptions = {
  defaults: "2025-05-24",
  person_profiles: "never",
  autocapture: false,
  disable_session_recording: true,
  disable_surveys: true,
  capture_pageview: true,
  capture_pageleave: true,
  capture_exceptions: true,
  respect_dnt: true,
} satisfies Partial<PostHogConfig>;
