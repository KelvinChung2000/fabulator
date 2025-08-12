/**
 * ViewportCullingLODManager.ts
 * 
 * Manages viewport culling and Level of Detail (LOD) rendering optimizations.
 * This module handles:
 * - Viewport frustum culling to hide objects outside the view
 * - Dynamic Level of Detail based on zoom levels
 * - Performance optimization through selective rendering
 */

import { Container, Graphics } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { 
    LodLevel, 
    getLodLevel, 
    getLodTransitionFactors,
    getCullingBufferMultiplier,
    LOD_UPDATE_THRESHOLD,
    LOD_UPDATE_THROTTLE_MS,
    DEFAULT_LOD_LEVEL,
    DEBUG_CONSTANTS,
    WIRE_CONSTANTS,
    SWITCH_MATRIX_WIRE_CONSTANTS
} from './FabricConstants';
import { FabricGeometry, TileGeometry } from '../types/geometry';

export type WireThicknessUpdateCallback = (tileThickness: number, switchMatrixThickness: number) => void;

export class ViewportCullingLODManager {
    private viewport: Viewport;
    private tileContainers: Container[][] = [];
    private currentLOD: number = DEFAULT_LOD_LEVEL;
    private culledObjects: Set<Container> = new Set();
    private currentGeometry: FabricGeometry | null = null;
    
    // LOD throttling (matching JavaFX 40ms throttle)
    private lastLODUpdate: number = 0;

    // Wire management for LOD
    private highlightedWires: Set<Graphics> = new Set();
    private wireThicknessUpdateCallback?: WireThicknessUpdateCallback;
    // Smoothing state
    private lastTileWireThickness: number | null = null;
    private lastSMWireThickness: number | null = null;
    private readonly THICKNESS_LERP = 0.25; // smoothing factor per LOD update

    constructor(viewport: Viewport) {
        this.viewport = viewport;
    }

    public setWireThicknessUpdateCallback(callback: WireThicknessUpdateCallback): void {
        this.wireThicknessUpdateCallback = callback;
    }

    // =============================================================================
    // INITIALIZATION
    // =============================================================================

    public initializeForGeometry(geometry: FabricGeometry, tileContainers: Container[][]): void {
        this.currentGeometry = geometry;
        this.tileContainers = tileContainers;
        this.culledObjects.clear();
        this.currentLOD = DEFAULT_LOD_LEVEL;
        this.lastLODUpdate = 0; // Reset throttle timer
    }

    // =============================================================================
    // MAIN UPDATE METHODS
    // =============================================================================

    public updateLOD(): void {
        const currentTime = Date.now();
        
        // Throttle LOD updates to match JavaFX implementation (40ms)
        if (currentTime - this.lastLODUpdate < LOD_UPDATE_THROTTLE_MS) {
            return;
        }
        
        const zoomLevel = this.viewport.scale.x;
        
        if (DEBUG_CONSTANTS.LOG_LOD_CHANGES) {
            console.log(`🔍 LOD Update - Zoom: ${zoomLevel.toFixed(3)}, Current LOD: ${this.currentLOD.toFixed(3)}`);
        }
        
        // Avoid unnecessary updates
    if (Math.abs(this.currentLOD - zoomLevel) < LOD_UPDATE_THRESHOLD) { return; }
        
        this.currentLOD = zoomLevel;
        this.lastLODUpdate = currentTime;
        
        // Apply culling first (determines what's visible)
        this.applyCulling();
        
        // Then apply LOD (determines detail level of visible objects)
        this.applyLevelOfDetail();
    this.applyCrossTileWireLOD();
        
        // Update wire thickness based on zoom
        this.updateWireThickness(zoomLevel);
    }

    public forceCullingUpdate(): void {
        if (DEBUG_CONSTANTS.LOG_CULLING_STATS) {
            console.log('Force culling update called');
        }
        this.applyCulling();
        this.applyLevelOfDetail();
    }

    // =============================================================================
    // CULLING IMPLEMENTATION
    // =============================================================================

    private applyCulling(): void {
    if (!this.currentGeometry || !this.tileContainers.length) { return; }

    const zoom = this.viewport.scale.x;
    const viewportBounds = this.viewport.getVisibleBounds();
    const geom: any = this.currentGeometry as FabricGeometry; // non-null asserted above, cast to any for flexible indexing
        const bufferMultiplier = getCullingBufferMultiplier(zoom);
        
        // Calculate buffered viewport bounds for smoother culling
        const buffer = {
            x: viewportBounds.width * bufferMultiplier,
            y: viewportBounds.height * bufferMultiplier
        };
        
        const bufferedBounds = {
            x: viewportBounds.x - buffer.x,
            y: viewportBounds.y - buffer.y,
            width: viewportBounds.width + 2 * buffer.x,
            height: viewportBounds.height + 2 * buffer.y
        };

        let visibleCount = 0;
        let culledCount = 0;

        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (!tileContainer) { continue; }

                const tileName = geom.tileNames[y][x];
                const tileGeomMap: any = geom.tileGeomMap as any;
                if (!tileGeomMap) { continue; }
                const tileGeometry = tileGeomMap[tileName];
                if (!tileGeometry) { continue; }

                const tileLocation = geom.tileLocations[y][x];
                if (!tileLocation) { continue; }
                const tileBounds = {
                    x: tileLocation.x,
                    y: tileLocation.y,
                    width: tileGeometry.width,
                    height: tileGeometry.height
                };

                const isVisible = this.boundsIntersect(tileBounds, bufferedBounds);
                tileContainer.visible = isVisible;

                if (isVisible) {
                    visibleCount++;
                    this.culledObjects.delete(tileContainer);
                } else {
                    culledCount++;
                    this.culledObjects.add(tileContainer);
                }
            }
        }

        if (DEBUG_CONSTANTS.LOG_CULLING_STATS) {
            console.log(`🎯 Culling Stats - Visible: ${visibleCount}, Culled: ${culledCount}, Buffer: ${bufferMultiplier.toFixed(2)}x`);
        }
    }

    private boundsIntersect(tileBounds: any, viewportBounds: any): boolean {
        return !(tileBounds.x + tileBounds.width < viewportBounds.x ||
                 viewportBounds.x + viewportBounds.width < tileBounds.x ||
                 tileBounds.y + tileBounds.height < viewportBounds.y ||
                 viewportBounds.y + viewportBounds.height < tileBounds.y);
    }

    public disableCulling(): void {
        if (DEBUG_CONSTANTS.LOG_CULLING_STATS) {
            console.log('Disabling all culling - making all tiles visible');
        }
        
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (tileContainer) {
                    tileContainer.visible = true;
                }
            }
        }
        this.culledObjects.clear();
    }

    // =============================================================================
    // LEVEL OF DETAIL IMPLEMENTATION
    // =============================================================================

    private applyLevelOfDetail(): void {
    if (!this.tileContainers.length) { return; }

        const zoom = this.viewport.scale.x;
        
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (tileContainer && tileContainer.visible) {
                    this.applyTileLOD(tileContainer, zoom);
                }
            }
        }
    }

    private applyTileLOD(tileContainer: Container, zoom: number): void {
        const lod = getLodLevel(zoom);
        const factors = getLodTransitionFactors(zoom);
        const showMedium = lod >= LodLevel.MEDIUM;
        const showHigh = lod >= LodLevel.HIGH;
        const showUltra = lod >= LodLevel.ULTRA;

        for (const child of tileContainer.children) {
            const anyChild: any = child as any;
            const userData = anyChild.userData;
            if (!userData) { continue; }
            const type = userData.type;
            let targetAlpha = child.alpha;
            let ensureVisible = false;
            switch (type) {
                case 'lowLodSubstitute': {
                    targetAlpha = 1 - factors.lowToMedium; // fade out
                    ensureVisible = targetAlpha > 0.02;
                    break; }
                case 'lowLodWires': {
                    targetAlpha = 0.4 * (1 - factors.lowToMedium);
                    ensureVisible = targetAlpha > 0.02;
                    break; }
                case 'internalWireBatch':
                case 'internalWire': {
                    // Start very faint at MEDIUM and grow
                    if (showMedium) {
                        const mediumPhase = factors.lowToMedium; // 0..1
                        let base = 0.15 + 0.35 * mediumPhase; // up to 0.5 entering MEDIUM
                        if (showHigh) {
                            base = 0.5 + 0.3 * factors.mediumToHigh; // up to 0.8 entering HIGH
                        }
                        if (showUltra) {
                            base = 0.8 + 0.2 * factors.highToUltra; // up to 1.0 at ULTRA
                        }
                        targetAlpha = base;
                        ensureVisible = true;
                    } else {
                        targetAlpha = 0;
                    }
                    break; }
                case 'switchMatrix': {
                    child.visible = true; // always keep container
                    this.applySwitchMatrixLOD(child as Container, lod, factors);
                    continue; }
                default: {
                    continue; }
            }
            this.applyAlphaSmoothing(child, targetAlpha, ensureVisible);
        }

    // Handle cross-tile wires if a layer is appended inside tileContainer (unlikely) – main layer handled globally.
    }

    private applySwitchMatrixLOD(switchMatrixContainer: Container, lod: LodLevel, factors: { lowToMedium: number; mediumToHigh: number; highToUltra: number; }): void {
        const showMedium = lod >= LodLevel.MEDIUM;
        const showHigh = lod >= LodLevel.HIGH;
        const showUltra = lod >= LodLevel.ULTRA;

        // If the switch matrix nearly fills the screen, force-show wires
        const vp = this.viewport.getVisibleBounds();
        const b = switchMatrixContainer.getBounds();
        const areaRatio = (b.width * b.height) / Math.max(1, (vp.width * vp.height));
        const occupiesScreen = areaRatio >= 0.2; // 20%+ of screen

        for (const child of switchMatrixContainer.children) {
            const anyChild: any = child as any;
            const userData = anyChild.userData;
            if (!userData) { continue; }
            const type = userData.type;
            if (type === 'port') {
                const targetAlpha = showHigh ? Math.pow(factors.mediumToHigh, 0.8) : 0;
                this.applyAlphaSmoothing(child, targetAlpha, targetAlpha > 0.02);
            } else if (type === 'switchMatrixWire') {
                // Start revealing wires at HIGH, fully visible by ULTRA
                let targetAlpha = 0;
                if (DEBUG_CONSTANTS.FORCE_SHOW_SM_WIRES || occupiesScreen) {
                    targetAlpha = 1.0;
                } else if (showHigh && !showUltra) {
                    // Make them quite visible already at HIGH
                    targetAlpha = 0.75 + 0.25 * Math.pow(factors.mediumToHigh, 1.0);
                } else if (showUltra) {
                    // Continue to 1.0 over HIGH→ULTRA transition
                    targetAlpha = 0.7 + 0.3 * Math.pow(factors.highToUltra, 1.2);
                } else {
                    targetAlpha = 0;
                }
                this.applyAlphaSmoothing(child, targetAlpha, targetAlpha > 0.02);
            }
        }
    }

    // Extend applyLevelOfDetail effect to a top-level cross-tile layer if present
    private applyCrossTileWireLOD(root?: Container): void {
        const zoom = this.viewport.scale.x;
        const lod = getLodLevel(zoom);
        const factors = getLodTransitionFactors(zoom);
        const showHigh = lod >= LodLevel.HIGH;
        const showUltra = lod >= LodLevel.ULTRA;
        const container = root || (this.viewport.children.find(c => (c as any).userData?.type === 'crossTileLayer') as Container | undefined);
        if (!container) { return; }
        for (const g of container.children) {
            const anyChild: any = g as any;
            if (anyChild.userData?.type === 'crossTileWire') {
                let target = 0;
                if (showHigh && !showUltra) { target = 0.75 + 0.25 * factors.mediumToHigh; }
                else if (showUltra) { target = 0.9 + 0.1 * factors.highToUltra; }
                this.applyAlphaSmoothing(anyChild, target, target > 0.02);
            }
        }
    }

    private applyAlphaSmoothing(displayObject: any, targetAlpha: number, ensureVisible: boolean): void {
        const prev = displayObject.userData?.lodAnimatedAlpha ?? displayObject.alpha ?? 0;
        const lerpFactor = 0.25; // smoothing constant
        const next = prev + (targetAlpha - prev) * lerpFactor;
        displayObject.alpha = next;
        if (ensureVisible) { displayObject.visible = true; }
        if (next <= 0.01 && !ensureVisible) { displayObject.visible = false; }
        if (displayObject.userData) { displayObject.userData.lodAnimatedAlpha = next; }
    }

    // =============================================================================
    // WIRE MANAGEMENT
    // =============================================================================

    private updateWireThickness(zoomLevel: number): void {
        // Perceptual scaling: thickness grows slightly when zooming in, not exploding when zooming out
        const baseTile = WIRE_CONSTANTS.DEFAULT_WIDTH;
        const baseSM = SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_WIDTH;
        const tileTarget = baseTile * Math.pow(zoomLevel, 0.15); // gentle growth
    const smTarget = baseSM * Math.pow(zoomLevel, 0.3);
        const clamp = (v: number, min: number, max: number) => v < min ? min : (v > max ? max : v);
        const tileClamped = clamp(tileTarget, WIRE_CONSTANTS.DEFAULT_WIDTH * 0.6, WIRE_CONSTANTS.DEFAULT_WIDTH * 3);
        const smClamped = clamp(smTarget, SWITCH_MATRIX_WIRE_CONSTANTS.MIN_WIDTH, SWITCH_MATRIX_WIRE_CONSTANTS.MAX_WIDTH);

        // Lerp from last thickness for smoothness
    if (this.lastTileWireThickness === null) { this.lastTileWireThickness = tileClamped; }
    if (this.lastSMWireThickness === null) { this.lastSMWireThickness = smClamped; }
        const lerp = (prev: number, target: number, f: number) => prev + (target - prev) * f;
        this.lastTileWireThickness = lerp(this.lastTileWireThickness, tileClamped, this.THICKNESS_LERP);
        this.lastSMWireThickness = lerp(this.lastSMWireThickness, smClamped, this.THICKNESS_LERP);

        if (this.wireThicknessUpdateCallback) {
            this.wireThicknessUpdateCallback(this.lastTileWireThickness, this.lastSMWireThickness);
        }

        if (DEBUG_CONSTANTS.LOG_LOD_CHANGES) {
            console.log(`Wire thickness target tile=${tileClamped.toFixed(2)} sm=${smClamped.toFixed(2)} current tile=${this.lastTileWireThickness.toFixed(2)} sm=${this.lastSMWireThickness.toFixed(2)} zoom=${zoomLevel.toFixed(2)}`);
        }
    }


    public highlightWire(wire: Graphics, color: number): void {
        this.highlightedWires.add(wire);
        wire.tint = color;
    }

    public unHighlightWire(wire: Graphics): void {
        this.highlightedWires.delete(wire);
        wire.tint = WIRE_CONSTANTS.DEFAULT_COLOR;
    }

    // =============================================================================
    // GETTERS AND UTILITIES
    // =============================================================================

    public getCurrentLOD(): number {
        return this.currentLOD;
    }

    public getCurrentLODLevel(): LodLevel {
        return getLodLevel(this.currentLOD);
    }

    public getCulledObjectsCount(): number {
        return this.culledObjects.size;
    }

    public getVisibleTileCount(): number {
    if (!this.tileContainers.length) { return 0; }
        
        let visibleCount = 0;
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (tileContainer && tileContainer.visible) {
                    visibleCount++;
                }
            }
        }
        return visibleCount;
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
        this.culledObjects.clear();
        this.highlightedWires.clear();
        this.tileContainers = [];
        this.currentGeometry = null;
        this.currentLOD = DEFAULT_LOD_LEVEL;
        this.lastLODUpdate = 0;
    }
}