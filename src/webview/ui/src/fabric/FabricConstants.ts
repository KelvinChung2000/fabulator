/**
 * FabricConstants.ts
 * 
 * Centralized configuration file for all magic numbers, constants, and configuration
 * values used throughout the fabric rendering system.
 */

// =============================================================================
// LEVEL OF DETAIL (LOD) CONSTANTS
// =============================================================================

/** Level of Detail thresholds matching JavaFX implementation */
export enum LodLevel {
    LOW = 0.15,      // Ultra-low / coarse view (tile + low-LOD blocks only)
    MEDIUM = 0.5,    // Show batched internal tile wires (no ports or SM internals)
    HIGH = 1.7,      // Show ports (BEL + SM) and begin to reveal SM internal wires
    ULTRA = 2.3      // Fully zoomed in: SM internal wires fully visible
}

/** LOD update threshold to avoid unnecessary recalculations */
export const LOD_UPDATE_THRESHOLD = 0.01;

/** LOD update throttle interval in milliseconds (matching JavaFX 40ms) */
export const LOD_UPDATE_THROTTLE_MS = 40;

/** Default LOD level when no zoom is applied */
export const DEFAULT_LOD_LEVEL = 1;

// =============================================================================
// VIEWPORT CONSTANTS
// =============================================================================

/** Default viewport world dimensions */
export const VIEWPORT_WORLD_WIDTH = 10000;
export const VIEWPORT_WORLD_HEIGHT = 10000;

/** Viewport update timing */
export const VIEWPORT_UPDATE_THROTTLE_MS = 16; // ~60fps
export const VIEWPORT_INITIAL_UPDATE_DELAY_MS = 100;
export const ZOOM_ANIMATION_DELAY_MS = 16;
export const CENTER_ANIMATION_DELAY_MS = 50;

/** Zoom control constants */
export const ZOOM_IN_FACTOR = 0.25;
export const ZOOM_OUT_FACTOR = -0.2;
export const ZOOM_RESET_LEVEL = 1;

// =============================================================================
// CULLING CONSTANTS
// =============================================================================

/** Dynamic buffer multipliers for viewport culling based on zoom level */
export const CULLING_BUFFER_MULTIPLIERS = {
    VERY_LOW_ZOOM_THRESHOLD: 0.3,
    MEDIUM_ZOOM_THRESHOLD: 1.0,
    VERY_LOW_ZOOM_BUFFER: 0.5,    // 50% buffer at very low zoom
    MEDIUM_ZOOM_BUFFER: 0.75,     // 75% buffer at medium zoom  
    HIGH_ZOOM_BUFFER: 1.0         // 100% buffer at high zoom
};

// =============================================================================
// RENDERING CONSTANTS
// =============================================================================

/** Wire rendering constants */
export const WIRE_CONSTANTS = {
    DEFAULT_COLOR: 0xFFFFFF,      // White color matching JavaFX Color.WHITE
    DEFAULT_WIDTH: 0.2,           // Default wire width
    DEFAULT_ALPHA: 0.9,           // Wire transparency
    DESIGN_COLOR: 0xFF0000,       // Red color for design routing wires
    DESIGN_ALPHA: 1.0             // Design wire opacity
};

/** Port rendering constants */
export const PORT_CONSTANTS = {
    RADIUS: 1.5,                  // Port circle radius
    FILL_COLOR: 0x2E8B57,         // SeaGreen, a more subtle green
    STROKE_COLOR: 0xFFFFFF,       // White stroke for ports
    STROKE_WIDTH: 0.5,            // Port stroke width
    ALPHA: 0.9                    // Port transparency
};

/** BEL rendering constants */
export const BEL_CONSTANTS = {
    STROKE_COLOR: 0xAAAAAA,       // Lighter gray stroke for BELs
    STROKE_WIDTH: 0.75,           // BEL stroke width
    FILL_ALPHA: 0.2,              // BEL fill transparency
    STROKE_ALPHA: 0.9             // BEL stroke transparency
};

/** Switch Matrix rendering constants */
export const SWITCH_MATRIX_CONSTANTS = {
    STROKE_COLOR: 0xFFFFFF,       // White stroke
    STROKE_WIDTH: 0.75,           // Switch matrix stroke width
    FILL_COLOR: 0x1A1A1A,         // Slightly lighter black fill
    FILL_ALPHA: 0.85,             // Fill transparency
    CORNER_RADIUS: 4,             // Rounded corner radius
    LOW_LOD_FILL_COLOR: 0x1A1A1A, // Low LOD fill color
    LOW_LOD_STROKE_COLOR: 0xFFFFFF // Low LOD stroke color
};

/** Switch Matrix Wire rendering constants */
export const SWITCH_MATRIX_WIRE_CONSTANTS = {
    DEFAULT_COLOR: 0x87CEEB,      // SkyBlue, a softer blue
    DEFAULT_WIDTH: 1.2,           // Slightly thicker for better visibility with curves
    DEFAULT_ALPHA: 0.85,          // Slightly transparent for better blending
    HIGHLIGHTED_COLOR: 0xFF8C00,  // DarkOrange for highlighted wires
    HIGHLIGHTED_WIDTH: 1.8,       // Thicker when highlighted
    MIN_WIDTH: 0.6,               // Minimum wire width at low zoom
    MAX_WIDTH: 2.0,               // Maximum wire width at high zoom
    LOD_THICKNESS_MULTIPLIER: 1.5 // Wire thickness scaling factor for LOD
};

// Simplified rendering mode: draw SM connections as straight, faint gray lines
export const RENDER_MODES = {
    SIMPLIFIED_SM_DIRECT: false
};

export const SM_DIRECT_WIRE_STYLE = {
    COLOR: 0xB0B0B0, // faint gray
    ALPHA: 0.35,
    WIDTH: 0.8
};

/** Low LOD wire substitute colors (matching JavaFX) */
export const LOW_LOD_COLORS = {
    WIRES_FILL: 0x323232,         // rgb(50, 50, 50)
    WIRES_STROKE: 0x323232,       // rgb(50, 50, 50)
    OVERLAY_FILL: 0x5A5A5A,       // rgb(90, 90, 90)
    OVERLAY_STROKE: 0x5A5A5A,     // rgb(90, 90, 90)
    STROKE_WIDTH: 2
};

/** Tile rendering constants */
export const TILE_CONSTANTS = {
    DEFAULT_STROKE_COLOR: 0xD3D3D3, // Light gray (Color.LIGHTGRAY)
    DEFAULT_STROKE_WIDTH: 0.1,
    DEFAULT_FILL_ALPHA: 0.2,
    DEFAULT_FILL_COLOR: 0x000000,   // Black default fill
    MARKER_SIZE: 4,                 // Size of fabric boundary markers
    MARKER_COLOR: 0xFF0000          // Red markers
};

// =============================================================================
// INTERACTION CONSTANTS
// =============================================================================

/** Click and hover interaction settings */
export const INTERACTION_CONSTANTS = {
    HOVER_ALPHA: 0.7,             // Alpha when hovering over elements
    SELECTED_STROKE_WIDTH: 2,     // Stroke width when selected
    SELECTED_STROKE_COLOR: 0x00FFFF, // Cyan color for selection
    CLICK_TOLERANCE: 5            // Pixel tolerance for click detection
};

// =============================================================================
// COLOR GENERATION CONSTANTS
// =============================================================================

/** Tile color generation settings */
export const TILE_COLOR_CONSTANTS = {
    HUE_MULTIPLIER: 137.508,      // Golden angle approximation for color distribution
    HUE_MODULO: 360,              // Hue range (degrees)
    SATURATION: 70,               // Color saturation percentage
    LIGHTNESS: 50,                // Color lightness percentage
    HUE_OFFSET_STEP: 30           // Step size for hue offset
};

// =============================================================================
// PERFORMANCE CONSTANTS
// =============================================================================

/** Performance and optimization settings */
export const PERFORMANCE_CONSTANTS = {
    MAX_VISIBLE_TILES: 1000,      // Maximum tiles to render simultaneously
    BATCH_SIZE: 50,               // Number of tiles to process per batch
    RENDER_THROTTLE_MS: 16,       // Minimum time between render updates
    MEMORY_CLEANUP_INTERVAL_MS: 5000, // Memory cleanup interval
    HASH_MULTIPLIER: 31           // Simple hash function multiplier
};

// =============================================================================
// DEBUG CONSTANTS
// =============================================================================

/** Debug and development settings */
export const DEBUG_CONSTANTS = {
    LOG_VIEWPORT_EVENTS: false,   // Enable viewport event logging
    LOG_LOD_CHANGES: false,       // Enable LOD change logging
    LOG_CULLING_STATS: false,     // Enable culling statistics logging
    SHOW_PERFORMANCE_STATS: false, // Show performance metrics
    HIGHLIGHT_CULLED_OBJECTS: false, // Visual debug for culled objects
    FORCE_SHOW_SM_WIRES: true     // Debug: force show switch-matrix wires regardless of zoom
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Get LOD level based on zoom level
 */
export function getLodLevel(zoomLevel: number): LodLevel {
    if (zoomLevel < LodLevel.LOW) {
        return LodLevel.LOW;
    } else if (zoomLevel < LodLevel.MEDIUM) {
        return LodLevel.MEDIUM;
    } else if (zoomLevel < LodLevel.HIGH) {
        return LodLevel.HIGH;
    } else {
        return LodLevel.ULTRA;
    }
}

/**
 * Compute smooth 0..1 factors for transitions between levels for blending.
 * Each factor indicates progress within the interval [thresholdStart, thresholdEnd].
 */
export function getLodTransitionFactors(zoomLevel: number): {
    lowToMedium: number;   // between LOW and MEDIUM
    mediumToHigh: number;  // between MEDIUM and HIGH
    highToUltra: number;   // between HIGH and ULTRA
} {
    const clamp01 = (v: number) => v < 0 ? 0 : (v > 1 ? 1 : v);
    return {
        lowToMedium: clamp01((zoomLevel - LodLevel.LOW) / (LodLevel.MEDIUM - LodLevel.LOW)),
        mediumToHigh: clamp01((zoomLevel - LodLevel.MEDIUM) / (LodLevel.HIGH - LodLevel.MEDIUM)),
        highToUltra: clamp01((zoomLevel - LodLevel.HIGH) / (LodLevel.ULTRA - LodLevel.HIGH))
    };
}

/** Optional hysteresis percentage (e.g. 8%) for future stabilization */
export const LOD_HYSTERESIS_PCT = 0.08;

/** Structured thresholds reference */
export const LOD_THRESHOLDS = {
    LOW_TO_MEDIUM: LodLevel.LOW,
    MEDIUM_TO_HIGH: LodLevel.MEDIUM,
    HIGH_TO_ULTRA: LodLevel.HIGH
};

/**
 * Get appropriate culling buffer multiplier based on zoom level
 */
export function getCullingBufferMultiplier(zoom: number): number {
    const { VERY_LOW_ZOOM_THRESHOLD, MEDIUM_ZOOM_THRESHOLD, VERY_LOW_ZOOM_BUFFER, MEDIUM_ZOOM_BUFFER, HIGH_ZOOM_BUFFER } = CULLING_BUFFER_MULTIPLIERS;
    
    if (zoom < VERY_LOW_ZOOM_THRESHOLD) {
        return VERY_LOW_ZOOM_BUFFER;
    } else if (zoom < MEDIUM_ZOOM_THRESHOLD) {
        return MEDIUM_ZOOM_BUFFER;
    } else {
        return HIGH_ZOOM_BUFFER;
    }
}

/**
 * Simple hash function for string-to-number conversion
 */
export function simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Convert HSL to RGB hex color
 */
export function hslToHex(h: number, s: number, l: number): number {
    h /= 360;
    s /= 100;
    l /= 100;

    const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) { t += 1; }
        if (t > 1) { t -= 1; }
        if (t < 1/6) { return p + (q - p) * 6 * t; }
        if (t < 1/2) { return q; }
        if (t < 2/3) { return p + (q - p) * (2/3 - t) * 6; }
        return p;
    };

    let r, g, b;
    if (s === 0) {
        r = g = b = l; // achromatic
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    const toHex = (c: number): string => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };

    return parseInt(toHex(r) + toHex(g) + toHex(b), 16);
}