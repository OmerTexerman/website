import { brandTheme } from "../config";

/** Central color palette for the Three.js scene. */

// ─── Theme colors ────────────────────────────────────────────────
export const ACCENT = brandTheme.accent;
export const DARK = brandTheme.dark;
export const CREAM = brandTheme.cream;

// ─── Shared material colors ──────────────────────────────────────
export const METAL = "#8a8a8a";
export const SILVER_METAL = "#c0c0c0";
export const DARK_METAL = "#2a2a2a";
export const DARK_CHARCOAL = "#1a1a1a";
export const VERY_DARK_GRAY = "#222222";
export const MEDIUM_GRAY = "#4a4a4a";
export const DARK_GRAY = "#3a3a3a";
export const ALMOST_BLACK = "#171717";
export const GROUND_DARK = "#252525";
export const SCREEN_BLUE = "#4a7aaa";
export const SCREEN_GLOW = "#5a8aba";
export const LAPTOP_SCREEN_GLOW = "#6a9fcc";

// ─── Warm / organic colors ──────────────────────────────────────
export const WARM_GLOW = "#ffcc88";
export const NOTEBOOK_RED = "#9a3230";
export const TRACE_GOLD = "#8a7a2a";

// ─── Wood & material tones ──────────────────────────────────────
export const WOOD = "#5c3a1e";
export const DARK_WOOD = "#3a2210";
export const SHELF_WOOD = "#5c422a";
export const CORK = "#c4a46c";
export const CERAMIC = "#e8e0d4";
export const PCB_GREEN = "#1a472a";

// ─── Shell / room colors ────────────────────────────────────────
export const SHELL_WALL = "#3d3530";
export const SHELL_RETURN = "#302a24";
export const SHELL_SHADOW = "#1c1815";

// ─── Photo frame colors ─────────────────────────────────────────
export const PHOTO_WARM = "#d4c5a9";
export const PHOTO_ROSE = "#d4b8b8";
export const PHOTO_BLUE = "#b8c4d4";

// ─── Dictionary colors ──────────────────────────────────────────
export const DICTIONARY_LEATHER = "#4a3228";
export const DICTIONARY_SPINE = "#3d2820";
export const DICTIONARY_GOLD = "#c9a94e";
export const DICTIONARY_PAGES = "#e8e0d0";

// ─── Page tones ─────────────────────────────────────────────────
export const PAGE_LEFT = "#e7e0d4";
export const PAGE_RIGHT = "#ece5da";
export const PAGE_LIGHT = "#f5efe6";
export const PAGE_MID = "#efe8dc";
export const PAGE_DARK = "#e8e1d4";
export const SPINE_TEXT = "#ffffff";

// ─── Lighting colors ────────────────────────────────────────────
export const LIGHT_HEMI_SKY = "#e8e4e0";
export const LIGHT_HEMI_GROUND = "#5f5042";
export const LIGHT_AMBIENT = "#a8a29a";
export const LIGHT_CEILING_KEY = "#ffe6c7";
export const LIGHT_SHELF_SIDE_FILL = "#f0d0b6";
export const LIGHT_ROOM_FILL = "#ffe8cc";
export const LIGHT_FRONT_FILL = "#e0d8d0";
export const LIGHT_SHELF_KEY = "#ffe9cc";
export const LIGHT_NOTEBOOK_ACCENT = "#d66d55";
export const LIGHT_BOTTOM_FILL = "#f4d7bb";

// ─── Book spine colors ───────────────────────────────────────────
/** Full palette — shelf-wall uses the first 4, book-stack uses all 5 */
export const BOOK_COLORS = ["#3a5f85", "#854a4a", "#4a704a", "#6e5c45", "#5a4a7a"] as const;
