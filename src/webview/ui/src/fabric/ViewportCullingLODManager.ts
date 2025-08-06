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
    WIRE_CONSTANTS
} from './FabricConstants';
import { FabricGeometry, TileGeometry } from '../types/geometry';

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

    constructor(viewport: Viewport) {
        this.viewport = viewport;
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
        
        // Match JavaFX implementation exactly:
        // - MEDIUM: shows low-LOD substitutes, hides switch matrix, shows low-LOD wires, hides individual wires
        // - HIGH: shows switch matrix, hides low-LOD substitutes, hides low-LOD wires, shows individual wires  
        // - LOW: does nothing (leaves everything as-is)
        
        switch (lod) {
            case LodLevel.MEDIUM:
                // JavaFX MEDIUM case logic
                for (const child of tileContainer.children) {
                    if (!child.userData) continue;
                    
                    const childType = child.userData.type;
                    switch (childType) {
                        case 'lowLodSubstitute':
                            child.visible = true;   // Show low-LOD substitute
                            break;
                        case 'switchMatrix':
                            child.visible = false;  // Hide detailed switch matrix
                            break;
                        case 'internalWire':
                            child.visible = false;  // Hide individual wire lines (Line nodes in JavaFX)
                            break;
                        case 'lowLodWires':
                            child.visible = true;   // Show low-LOD wire rectangles
                            break;
                        // Leave other elements unchanged (tile, bel, port)
                    }
                }
                break;
                
            case LodLevel.HIGH:
                // JavaFX HIGH case logic
                for (const child of tileContainer.children) {
                    if (!child.userData) continue;
                    
                    const childType = child.userData.type;
                    switch (childType) {
                        case 'switchMatrix':
                            child.visible = true;   // Show detailed switch matrix
                            break;
                        case 'lowLodSubstitute':
                            child.visible = false;  // Hide low-LOD substitute
                            break;
                        case 'internalWire':
                            child.visible = true;   // Show individual wire lines
                            break;
                        case 'lowLodWires':
                            child.visible = false;  // Hide low-LOD wire rectangles
                            break;
                        // Leave other elements unchanged (tile, bel, port)
                    }
                }
                break;
                
            case LodLevel.LOW:
            default:
                // JavaFX LOW case (default) - do nothing, leave everything as-is
                // This prevents the "white block" issue by not forcing visibility changes at very low zoom
                break;
        }
    }

    // =============================================================================
    // WIRE MANAGEMENT
    // =============================================================================

    private updateWireThickness(zoomLevel: number): void {
        // Calculate wire thickness based on zoom level
        // At low zoom, wires should be thicker to remain visible
        const baseThickness = WIRE_CONSTANTS.DEFAULT_WIDTH;
        const scaledThickness = Math.max(baseThickness, baseThickness / zoomLevel);
        
        // Update wire thickness would happen here if we tracked individual wires
        // For now, this is a placeholder for future wire thickness scaling
        if (DEBUG_CONSTANTS.LOG_LOD_CHANGES) {
            console.log(`Wire thickness scaled to: ${scaledThickness.toFixed(2)} (zoom: ${zoomLevel.toFixed(2)})`);
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