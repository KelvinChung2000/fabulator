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
        if (Math.abs(this.currentLOD - zoomLevel) < LOD_UPDATE_THRESHOLD) return;
        
        this.currentLOD = zoomLevel;
        this.lastLODUpdate = currentTime;
        
        // Apply culling first (determines what's visible)
        this.applyCulling();
        
        // Then apply LOD (determines detail level of visible objects)
        this.applyLevelOfDetail();
        
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
        if (!this.currentGeometry || !this.tileContainers.length) return;

        const zoom = this.viewport.scale.x;
        const viewportBounds = this.viewport.getVisibleBounds();
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
                if (!tileContainer) continue;

                const tileName = this.currentGeometry.tileNames[y][x];
                const tileGeometry = this.currentGeometry.tileGeomMap[tileName];
                if (!tileGeometry) continue;

                const tileLocation = this.currentGeometry.tileLocations[y][x];
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
        if (!this.tileContainers.length) return;

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
        
        // Enhanced LOD system with switch matrix wire support:
        // - LOW: Only show basic tile structure, hide all details
        // - MEDIUM: Show low-LOD substitutes, hide switch matrix details, show simplified wires
        // - HIGH: Show all details including switch matrix internal wires
        
        // Get precise zoom for smooth blending transitions
        const zoomLevel = this.viewport.scale.x;
        
        console.log(`🔍 LOD Debug: zoom=${zoomLevel.toFixed(3)}, lod=${lod}, container children=${tileContainer.children.length}`);
        
        switch (lod) {
            case LodLevel.MEDIUM:
                // Medium LOD - transition from low-LOD to high-detail with smooth blending
                for (const child of tileContainer.children) {
                    if (!child.userData) continue;
                    
                    const childType = child.userData.type;
                    switch (childType) {
                        case 'lowLodSubstitute':
                            // TEMPORARY: Force hide low-LOD substitutes to see switch matrix wires clearly
                            child.visible = false;
                            break;
                        case 'switchMatrix':
                            child.visible = true;   // Show switch matrix container
                            child.alpha = 1.0;     // Full opacity for switch matrix
                            this.applySwitchMatrixLOD(child as Container, lod);
                            break;
                        case 'internalWire':
                            child.visible = false;  // Hide individual wire lines at medium LOD
                            break;
                        case 'lowLodWires':
                            // TEMPORARY: Force hide low-LOD wire rectangles to see switch matrix wires clearly
                            child.visible = false;
                            break;
                        // Leave other elements unchanged (tile, bel, port)
                    }
                }
                break;
                
            case LodLevel.HIGH:
                // High LOD - show all details, hide substitutes
                for (const child of tileContainer.children) {
                    if (!child.userData) continue;
                    
                    const childType = child.userData.type;
                    switch (childType) {
                        case 'switchMatrix':
                            child.visible = true;   // Show detailed switch matrix
                            child.alpha = 1.0;     // Full opacity at high LOD
                            this.applySwitchMatrixLOD(child as Container, lod);
                            break;
                        case 'lowLodSubstitute':
                            child.visible = false;  // Completely hide low-LOD substitute
                            break;
                        case 'internalWire':
                            child.visible = true;   // Show individual wire lines
                            child.alpha = 1.0;
                            break;
                        case 'lowLodWires':
                            child.visible = false;  // Completely hide low-LOD wire rectangles
                            break;
                        // Leave other elements unchanged (tile, bel, port)
                    }
                }
                break;
                
            case LodLevel.LOW:
            default:
                // Low LOD - show low-LOD substitutes, minimal switch matrix detail
                for (const child of tileContainer.children) {
                    if (!child.userData) continue;
                    
                    const childType = child.userData.type;
                    switch (childType) {
                        case 'lowLodSubstitute':
                            child.visible = true;
                            child.alpha = 1.0;  // Full opacity at low LOD
                            break;
                        case 'switchMatrix':
                            child.visible = true;   // Keep switch matrix visible but simplified
                            child.alpha = 1.0;
                            this.applySwitchMatrixLOD(child as Container, lod);
                            break;
                        case 'internalWire':
                            child.visible = false;  // Hide individual wires
                            break;
                        case 'lowLodWires':
                            child.visible = true;   // Show low-LOD wire rectangles
                            child.alpha = 0.4;     // More transparent to reduce visual clutter
                            break;
                    }
                }
                break;
        }
    }

    private applySwitchMatrixLOD(switchMatrixContainer: Container, lod: LodLevel): void {
        // Apply LOD to switch matrix internal elements with smooth alpha blending
        const zoomLevel = this.viewport.scale.x;
        
        for (const child of switchMatrixContainer.children) {
            if (!child.userData) continue;
            
            const childType = child.userData.type;
            if (childType === 'switchMatrixWire') {
                switch (lod) {
                    case LodLevel.HIGH:
                        // High detail - full visibility and opacity
                        child.visible = true;
                        child.alpha = 1.0;
                        break;
                        
                    case LodLevel.MEDIUM:
                        // Medium detail - full visibility with good opacity
                        child.visible = true;
                        child.alpha = 1.0; // TEMPORARY: Full opacity for debugging
                        break;
                        
                    case LodLevel.LOW:
                    default:
                        // TEMPORARY: Force visible for debugging
                        child.visible = true;
                        child.alpha = 1.0;
                        break;
                }
            }
        }
    }

    // =============================================================================
    // WIRE MANAGEMENT
    // =============================================================================

    private updateWireThickness(zoomLevel: number): void {
        // Calculate wire thickness scaling for better visibility at different zoom levels
        const tileWireThickness = Math.max(WIRE_CONSTANTS.DEFAULT_WIDTH, WIRE_CONSTANTS.DEFAULT_WIDTH / zoomLevel);
        const switchMatrixWireThickness = Math.max(
            SWITCH_MATRIX_WIRE_CONSTANTS.MIN_WIDTH, 
            Math.min(
                SWITCH_MATRIX_WIRE_CONSTANTS.MAX_WIDTH,
                SWITCH_MATRIX_WIRE_CONSTANTS.DEFAULT_WIDTH * SWITCH_MATRIX_WIRE_CONSTANTS.LOD_THICKNESS_MULTIPLIER / zoomLevel
            )
        );
        
        // Use callback to update wire thickness through TileRenderer
        if (this.wireThicknessUpdateCallback) {
            this.wireThicknessUpdateCallback(tileWireThickness, switchMatrixWireThickness);
        }
        
        if (DEBUG_CONSTANTS.LOG_LOD_CHANGES) {
            console.log(`Wire thickness updated - Tile: ${tileWireThickness.toFixed(2)}, SM: ${switchMatrixWireThickness.toFixed(2)} (zoom: ${zoomLevel.toFixed(2)})`);
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
        if (!this.tileContainers.length) return 0;
        
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