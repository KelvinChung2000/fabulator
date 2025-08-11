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
        
        // Set up wire thickness update callback for LOD manager
        this.cullingLODManager.setWireThicknessUpdateCallback((tileThickness, smThickness) => {
            this.tileRenderer.updateWireThickness(tileThickness, smThickness);
        });
        
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
        console.log(`🚨🚨🚨 LOAD FABRIC CALLED 🚨🚨🚨`);
        console.log(`🏗️  Loading fabric: ${geometry.name}`);
        console.log(`    Geometry object:`, geometry);
        
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

    public panToImmediate(x: number, y: number): void {
        this.viewportManager.panToImmediate(x, y);
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
    // WIRE HIGHLIGHTING AND THICKNESS (Delegated to ViewportCullingLODManager)
    // =============================================================================

    public highlightWire(wire: Graphics, color: number): void {
        this.cullingLODManager.highlightWire(wire, color);
    }

    public unHighlightWire(wire: Graphics): void {
        this.cullingLODManager.unHighlightWire(wire);
    }

    public updateWireThickness(tileWireThickness: number, switchMatrixWireThickness: number): void {
        this.tileRenderer.updateWireThickness(tileWireThickness, switchMatrixWireThickness);
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
    // ELEMENT HIGHLIGHTING
    // =============================================================================

    public highlightElement(elementData: any): void {
        this.clearAllHighlights();
        
        switch (elementData.type) {
            case 'tile':
                this.highlightTile(elementData);
                break;
            case 'bel':
                this.highlightBel(elementData);
                break;
            case 'switchMatrix':
                this.highlightSwitchMatrix(elementData);
                break;
            case 'port':
                this.highlightPort(elementData);
                break;
            case 'wire':
                this.highlightWireElement(elementData);
                break;
            case 'net':
                this.highlightNet(elementData.name);
                break;
            default:
                console.log(`Highlighting not implemented for type: ${elementData.type}`);
        }
    }

    public clearAllHighlights(): void {
        this.tileRenderer.clearAllHighlights();
        this.unHighlightAllNets();
    }

    private highlightTile(elementData: any): void {
        if (!this.currentGeometry || !elementData.position) return;
        
        const { tileLocations, tileGeomMap, tileNames } = this.currentGeometry;
        const tileLocation = tileLocations[elementData.position.y][elementData.position.x];
        const tileName = tileNames[elementData.position.y][elementData.position.x];
        
        if (tileLocation && tileName) {
            const tileGeometry = tileGeomMap[tileName];
            if (tileGeometry) {
                // Pan to tile center
                const centerX = tileLocation.x + tileGeometry.width / 2;
                const centerY = tileLocation.y + tileGeometry.height / 2;
                this.panTo(centerX, centerY);
                
                // Highlight the tile
                this.tileRenderer.highlightTileByPosition(elementData.position.x, elementData.position.y);
                
                console.log(`Highlighted and panned to tile ${tileName} at (${centerX}, ${centerY})`);
            }
        }
    }

    private highlightBel(elementData: any): void {
        if (!elementData.tilePosition) return;
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the specific BEL
        this.tileRenderer.highlightBelInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y, 
            elementData.name
        );
        
        console.log(`Highlighted BEL ${elementData.name} in tile at (${elementData.tilePosition.x}, ${elementData.tilePosition.y})`);
    }

    private highlightSwitchMatrix(elementData: any): void {
        if (!elementData.tilePosition) return;
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the switch matrix
        this.tileRenderer.highlightSwitchMatrixInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y
        );
        
        console.log(`Highlighted switch matrix in tile at (${elementData.tilePosition.x}, ${elementData.tilePosition.y})`);
    }

    private highlightPort(elementData: any): void {
        if (!elementData.tilePosition) return;
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the specific port
        this.tileRenderer.highlightPortInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y, 
            elementData.name,
            elementData.parentName // BEL or switch matrix name
        );
        
        console.log(`Highlighted port ${elementData.name} in ${elementData.parentName} at tile (${elementData.tilePosition.x}, ${elementData.tilePosition.y})`);
    }

    private highlightWireElement(elementData: any): void {
        if (!elementData.tilePosition) return;
        
        // First highlight the containing tile
        this.highlightTile({ type: 'tile', position: elementData.tilePosition });
        
        // Then highlight the specific wire
        this.tileRenderer.highlightWireInTile(
            elementData.tilePosition.x, 
            elementData.tilePosition.y, 
            elementData.name
        );
        
        console.log(`Highlighted wire ${elementData.name} in tile at (${elementData.tilePosition.x}, ${elementData.tilePosition.y})`);
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