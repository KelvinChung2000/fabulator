/**
 * FabricRenderer.ts - Refactored Main Renderer
 * 
 * Main orchestrator for fabric visualization. This class coordinates between:
 * - ViewportManager: Handles viewport controls and events
 * - ViewportCullingLODManager: Manages culling and level of detail
 * - TileRenderer: Creates and renders fabric tiles
 * - DesignRenderer: Handles design overlay rendering
 * 
 * This refactored version provides better separation of concerns and maintainability.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { FabricGeometry, TileGeometry, WireGeometry } from '../types/geometry';
import { DesignData, DiscreteLocation, ConnectedPorts } from '../types/design';

// Import all the new modular components
import { ViewportManager, ViewportChangeCallback } from './ViewportManager';
import { ViewportCullingLODManager } from './ViewportCullingLODManager';
import { TileRenderer } from './TileRenderer';
import { DesignRenderer } from './DesignRenderer';

// Import constants
import { 
    VIEWPORT_INITIAL_UPDATE_DELAY_MS,
    DEBUG_CONSTANTS 
} from './FabricConstants';

export class FabricRenderer {
    private app: Application;
    
    // Main containers
    private fabricContainer: Container;
    private designContainer: Container;
    
    // Modular managers
    private viewportManager: ViewportManager;
    private cullingLODManager: ViewportCullingLODManager;
    private tileRenderer: TileRenderer;
    private designRenderer: DesignRenderer;
    
    // State tracking
    private currentGeometry: FabricGeometry | null = null;
    private currentDesign: DesignData | null = null;
    private tileContainers: Container[][] = [];

    constructor(app: Application) {
        this.app = app;
        
        // Initialize managers
        this.viewportManager = new ViewportManager(app);
        this.cullingLODManager = new ViewportCullingLODManager(this.viewportManager.getViewport());
        
        // Create main containers within viewport
        this.fabricContainer = new Container();
        this.designContainer = new Container();
        this.viewportManager.getViewport().addChild(this.fabricContainer);
        this.viewportManager.getViewport().addChild(this.designContainer);
        
        // Initialize renderers
        this.tileRenderer = new TileRenderer(this.fabricContainer);
        this.designRenderer = new DesignRenderer(this.designContainer);
        
        // Set up viewport change callback to update LOD and culling
        this.viewportManager.setViewportChangeCallback((bounds, zoom) => {
            this.cullingLODManager.updateLOD();
            this.onViewportChangeCallback?.(bounds, zoom);
        });
        
        // Set up tile renderer callbacks
        this.setupTileRendererCallbacks();
        this.setupDesignRendererCallbacks();
    }

    // =============================================================================
    // CALLBACK SETUP
    // =============================================================================

    private setupTileRendererCallbacks(): void {
        this.tileRenderer.setTileClickCallback((tileGeometry, x, y) => {
            this.onTileClick(tileGeometry, x, y);
        });

        this.tileRenderer.setSwitchMatrixClickCallback((smGeometry) => {
            this.onSwitchMatrixClick(smGeometry);
        });

        this.tileRenderer.setBelClickCallback((belGeometry) => {
            this.onBelClick(belGeometry);
        });

        this.tileRenderer.setPortClickCallback((port) => {
            this.onPortClick(port);
        });

        this.tileRenderer.setWireClickCallback((wireGeometry) => {
            this.onInternalWireClick(wireGeometry);
        });
    }

    private setupDesignRendererCallbacks(): void {
        this.designRenderer.setDesignConnectionClickCallback((ports, location) => {
            this.onDesignConnectionClick(ports, location);
        });
    }

    // =============================================================================
    // FABRIC LOADING
    // =============================================================================

    public loadFabric(geometry: FabricGeometry): void {
        console.log(`🏗️  Loading fabric: ${geometry.name}`);
        
        this.currentGeometry = geometry;
        this.clearFabric();
        
        // Build fabric using TileRenderer
        this.tileContainers = this.tileRenderer.buildFabric(geometry);
        
        // Initialize culling and LOD system
        this.cullingLODManager.initializeForGeometry(geometry, this.tileContainers);
        this.designRenderer.initializeForGeometry(geometry, this.tileContainers);
        
        // Center the fabric in viewport
        this.centerFabric();
        
        // Ensure culling and LOD are properly initialized
        setTimeout(() => {
            this.cullingLODManager.updateLOD();
            this.viewportManager.forceViewportUpdate();
        }, VIEWPORT_INITIAL_UPDATE_DELAY_MS);
        
        console.log(`✅ Fabric loaded successfully: ${geometry.numberOfRows}x${geometry.numberOfColumns} tiles`);
    }

    public loadDesign(designData: DesignData): void {
        console.log(`🎯 Loading design: ${designData.filePath}`);
        
        this.currentDesign = designData;
        this.clearDesign();
        
        if (this.currentGeometry) {
            console.log('✅ Building design overlay');
            this.designRenderer.buildDesignOverlay(designData);
        } else {
            console.warn('⚠️  No geometry loaded - cannot display design overlay');
        }
        
        console.log(`✅ Design loaded: ${designData.statistics.totalNets} nets, ${designData.statistics.totalConnections} connections`);
    }

    // =============================================================================
    // CLEARING AND CLEANUP
    // =============================================================================

    private clearFabric(): void {
        this.tileRenderer.destroy();
        this.tileContainers = [];
    }

    public clearDesign(): void {
        this.designRenderer.clearDesign();
        this.currentDesign = null;
    }

    private centerFabric(): void {
        if (!this.currentGeometry) return;
        
        const bounds = {
            x: 0,
            y: 0,
            width: this.currentGeometry.width,
            height: this.currentGeometry.height
        };
        
        this.viewportManager.centerOnBounds(bounds);
    }

    // =============================================================================
    // VIEWPORT CONTROLS (Delegated to ViewportManager)
    // =============================================================================

    public zoomIn(): void {
        this.viewportManager.zoomIn();
    }

    public zoomOut(): void {
        this.viewportManager.zoomOut();
    }

    public zoomToFit(): void {
        this.viewportManager.zoomToFit();
    }

    public zoomReset(): void {
        this.viewportManager.zoomReset();
    }

    public getZoomLevel(): number {
        return this.viewportManager.getZoomLevel();
    }

    public panTo(x: number, y: number): void {
        this.viewportManager.panTo(x, y);
    }

    public getViewportBounds(): { x: number, y: number, width: number, height: number } {
        return this.viewportManager.getViewportBounds();
    }

    // =============================================================================
    // LOD AND CULLING CONTROLS (Delegated to ViewportCullingLODManager)
    // =============================================================================

    public updateLOD(): void {
        this.cullingLODManager.updateLOD();
    }

    public forceViewportUpdate(): void {
        this.viewportManager.forceViewportUpdate();
        this.cullingLODManager.updateLOD();
    }

    public forceCullingUpdate(): void {
        this.cullingLODManager.forceCullingUpdate();
    }

    public disableCulling(): void {
        this.cullingLODManager.disableCulling();
    }

    // =============================================================================
    // WIRE HIGHLIGHTING (Delegated to ViewportCullingLODManager)
    // =============================================================================

    public highlightWire(wire: Graphics, color: number): void {
        this.cullingLODManager.highlightWire(wire, color);
    }

    public unHighlightWire(wire: Graphics): void {
        this.cullingLODManager.unHighlightWire(wire);
    }

    // =============================================================================
    // NET MANAGEMENT (Delegated to DesignRenderer)
    // =============================================================================

    public highlightNet(netName: string): void {
        this.designRenderer.highlightNet(netName);
    }

    public unHighlightAllNets(): void {
        this.designRenderer.unHighlightAllNets();
    }

    // =============================================================================
    // EVENT CALLBACKS AND EXTERNAL INTERFACE
    // =============================================================================

    private onViewportChangeCallback?: ViewportChangeCallback;

    public setViewportChangeCallback(callback: ViewportChangeCallback): void {
        this.onViewportChangeCallback = callback;
    }

    // Tile interaction callbacks
    private onTileClick(tileGeometry: TileGeometry, x: number, y: number): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ Tile clicked: ${tileGeometry.name} at (${x}, ${y})`);
        }
        // Could emit events or call external callbacks here
    }

    private onSwitchMatrixClick(smGeometry: any): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ Switch Matrix clicked:`, smGeometry);
        }
        // Could emit events or call external callbacks here
    }

    private onBelClick(belGeometry: any): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ BEL clicked:`, belGeometry);
        }
        // Could emit events or call external callbacks here
    }

    private onPortClick(port: any): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ Port clicked:`, port);
        }
        // Could emit events or call external callbacks here
    }

    private onInternalWireClick(wireGeometry: WireGeometry): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ Internal wire clicked:`, wireGeometry.name);
        }
        // Could emit events or call external callbacks here
    }

    private onDesignConnectionClick(ports: ConnectedPorts, location: DiscreteLocation): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ Design connection clicked: ${ports.portA} ↔ ${ports.portB} at X${location.x}Y${location.y}`);
        }
        // Could emit events or call external callbacks here
    }

    // =============================================================================
    // STATISTICS AND DEBUG INFO
    // =============================================================================

    public getStatistics(): any {
        return {
            geometry: this.currentGeometry ? {
                name: this.currentGeometry.name,
                dimensions: `${this.currentGeometry.numberOfRows}×${this.currentGeometry.numberOfColumns}`,
                tileCount: this.currentGeometry.numberOfRows * this.currentGeometry.numberOfColumns
            } : null,
            
            design: this.designRenderer.getDesignStatistics(),
            
            rendering: {
                currentLOD: this.cullingLODManager.getCurrentLOD(),
                lodLevel: this.cullingLODManager.getCurrentLODLevel(),
                visibleTiles: this.cullingLODManager.getVisibleTileCount(),
                culledObjects: this.cullingLODManager.getCulledObjectsCount(),
                zoomLevel: this.viewportManager.getZoomLevel()
            }
        };
    }

    // =============================================================================
    // GETTERS
    // =============================================================================

    public getCurrentGeometry(): FabricGeometry | null {
        return this.currentGeometry;
    }

    public getCurrentDesign(): DesignData | null {
        return this.currentDesign;
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
        console.log('🧹 Destroying FabricRenderer and all managers');
        
        // Destroy all managers
        this.viewportManager.destroy();
        this.cullingLODManager.destroy();
        this.tileRenderer.destroy();
        this.designRenderer.destroy();
        
        // Clear state
        this.currentGeometry = null;
        this.currentDesign = null;
        this.tileContainers = [];
        this.onViewportChangeCallback = undefined;
        
        console.log('✅ FabricRenderer destroyed successfully');
    }
}