/**
 * Shared scene configuration constants.
 *
 * Centralises breakpoints, animation timings, and interaction parameters
 * that define the overall feel of the Three.js scene.
 */

// ─── Layout breakpoints ─────────────────────────────────────────
export const MOBILE_BREAKPOINT = 768;

// ─── Intro / transition durations (ms) ──────────────────────────
export const INTRO_DURATION = 2800;
export const MOBILE_INTRO_DURATION = 2000;
export const TRANSITION_DURATION = 1000;
export const DESKTOP_TO_SHELF_TRANSITION_DURATION = 1800;

// ─── Desktop interaction ─────────────────────────────────────────
export const HOVER_SCALE = 1.05;
export const HOVER_LERP = 0.16;
export const CLICK_COOLDOWN_MS = 420;

// ─── Desktop idle camera float ──────────────────────────────────
export const IDLE_AMPLITUDE = 0.03;
export const IDLE_SPEED = 0.0005;

// ─── Interaction raycasting ─────────────────────────────────────
export const CLICK_DISTANCE_THRESHOLD = 10;

// ─── Shadow mapping ─────────────────────────────────────────────
export const SHADOW_MAP_SIZE_HIGH = 1024;
export const SHADOW_MAP_SIZE_LOW = 512;
export const SHADOW_BIAS = -0.0002;
