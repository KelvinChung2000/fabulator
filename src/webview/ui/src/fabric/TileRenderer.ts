/**
 * TileRenderer.ts
 * 
 * Handles the creation and rendering of fabric tiles including:
 * - Basic tile geometry and styling
 * - Switch matrices with ports
 * - BELs (Basic Elements) with ports
 * - Internal wiring between BELs and ports
 * - Low-LOD substitutes for performance
 */

import { Graphics, Container } from 'pixi.js';
import { FabricGeometry, TileGeometry, Location, WireGeometry } from '../types/geometry';
import { 
    TILE_CONSTANTS,
    SWITCH_MATRIX_CONSTANTS,
    BEL_CONSTANTS,
    PORT_CONSTANTS,
    WIRE_CONSTANTS,
    LOW_LOD_COLORS,
    TILE_COLOR_CONSTANTS,
    INTERACTION_CONSTANTS,
    simpleHash,
    hslToHex
} from './FabricConstants';

export type TileClickCallback = (tileGeometry: TileGeometry, x: number, y: number) => void;
export type SwitchMatrixClickCallback = (smGeometry: any) => void;
export type BelClickCallback = (belGeometry: any) => void;
export type PortClickCallback = (port: any) => void;
export type WireClickCallback = (wireGeometry: WireGeometry) => void;

export class TileRenderer {
    private fabricContainer: Container;
    private currentGeometry: FabricGeometry | null = null;
    private tileContainers: Container[][] = [];

    // Event callbacks
    private onTileClickCallback?: TileClickCallback;
    private onSwitchMatrixClickCallback?: SwitchMatrixClickCallback;
    private onBelClickCallback?: BelClickCallback;
    private onPortClickCallback?: PortClickCallback;
    private onWireClickCallback?: WireClickCallback;

    constructor(fabricContainer: Container) {
        this.fabricContainer = fabricContainer;
    }

    // =============================================================================
    // INITIALIZATION AND BUILDING
    // =============================================================================

    public buildFabric(geometry: FabricGeometry): Container[][] {
        this.currentGeometry = geometry;
        this.clearFabric();
        this.tileContainers = this.initializeTileContainers(geometry);
        
        // Create all tiles
        for (let y = 0; y < geometry.numberOfRows; y++) {
            for (let x = 0; x < geometry.numberOfColumns; x++) {
                const tileName = geometry.tileNames[y][x];
                const tileGeometry = geometry.tileGeomMap[tileName];
                const location = geometry.tileLocations[y][x];
                
                if (tileGeometry && location) {
                    this.createTile(tileGeometry, location, x, y);
                }
            }
        }

        // Build fabric markers
        this.buildMarkers();

        return this.tileContainers;
    }

    private initializeTileContainers(geometry: FabricGeometry): Container[][] {
        const containers: Container[][] = [];
        for (let y = 0; y < geometry.numberOfRows; y++) {
            containers[y] = [];
            for (let x = 0; x < geometry.numberOfColumns; x++) {
                containers[y][x] = new Container();
                this.fabricContainer.addChild(containers[y][x]);
            }
        }
        return containers;
    }

    private clearFabric(): void {
        this.fabricContainer.removeChildren();
        this.tileContainers = [];
    }

    // =============================================================================
    // TILE CREATION
    // =============================================================================

    private createTile(tileGeometry: TileGeometry, location: Location, fabricX: number, fabricY: number): void {
        const tileContainer = this.tileContainers[fabricY][fabricX];
        tileContainer.x = location.x;
        tileContainer.y = location.y;

        // Create main tile rectangle
        const tileRect = this.createTileRectangle(tileGeometry, fabricX, fabricY);
        tileContainer.addChild(tileRect);

        // Create switch matrix if present
        if (tileGeometry.smGeometry) {
            this.createSwitchMatrix(tileGeometry.smGeometry, tileContainer);
            this.createLowLodSubstitute(tileGeometry.smGeometry, tileContainer);
        }

        // Create BELs
        for (const belGeometry of tileGeometry.belGeometryList) {
            this.createBel(belGeometry, tileContainer);
        }

        // Create internal wires (BEL-to-port connections)
        for (const wireGeometry of tileGeometry.wireGeometryList) {
            this.createInternalWire(wireGeometry, tileContainer);
        }

        // Create low-LOD wire substitutes
        this.createLowLodWiresGroup(tileGeometry, tileContainer);
    }

    private createTileRectangle(tileGeometry: TileGeometry, fabricX: number, fabricY: number): Graphics {
        const tileRect = new Graphics();
        
        // Get tile-specific color or use default
        const fillColor = this.getTileColor(tileGeometry.name);
        
        tileRect.rect(0, 0, tileGeometry.width, tileGeometry.height);
        tileRect.fill({ 
            color: fillColor, 
            alpha: TILE_CONSTANTS.DEFAULT_FILL_ALPHA 
        });
        tileRect.stroke({ 
            width: TILE_CONSTANTS.DEFAULT_STROKE_WIDTH, 
            color: TILE_CONSTANTS.DEFAULT_STROKE_COLOR 
        });

        // Make interactive
        tileRect.eventMode = 'static';
        tileRect.cursor = 'pointer';
        tileRect.on('click', () => this.onTileClick(tileGeometry, fabricX, fabricY));

        // Mark for LOD system
        (tileRect as any).userData = { type: 'tile', tileName: tileGeometry.name };

        return tileRect;
    }

    // =============================================================================
    // SWITCH MATRIX CREATION
    // =============================================================================

    private createSwitchMatrix(smGeometry: any, tileContainer: Container): void {
        const smContainer = new Container();
        smContainer.x = smGeometry.relX;
        smContainer.y = smGeometry.relY;

        // Create switch matrix rectangle
        const smRect = new Graphics();
        smRect.rect(0, 0, smGeometry.width, smGeometry.height);
        smRect.fill({ 
            color: SWITCH_MATRIX_CONSTANTS.FILL_COLOR, 
            alpha: SWITCH_MATRIX_CONSTANTS.FILL_ALPHA 
        });
        smRect.stroke({ 
            width: SWITCH_MATRIX_CONSTANTS.STROKE_WIDTH, 
            color: SWITCH_MATRIX_CONSTANTS.STROKE_COLOR 
        });

        // Make interactive
        smRect.eventMode = 'static';
        smRect.cursor = 'pointer';
        smRect.on('click', () => this.onSwitchMatrixClick(smGeometry));

        smContainer.addChild(smRect);

        // Create ports
        if (smGeometry.portGeometryList) {
            for (const port of smGeometry.portGeometryList) {
                this.createSwitchMatrixPort(port, smContainer, smGeometry, 'regular');
            }
        }

        if (smGeometry.jumpPortGeometryList) {
            for (const jumpPort of smGeometry.jumpPortGeometryList) {
                this.createSwitchMatrixPort(jumpPort, smContainer, smGeometry, 'jump');
            }
        }

        // Mark for LOD system
        (smContainer as any).userData = { type: 'switchMatrix', smGeometry };

        tileContainer.addChild(smContainer);
    }

    private createSwitchMatrixPort(port: any, smContainer: Container, smGeometry: any, portType: 'regular' | 'jump'): void {
        const portGraphics = new Graphics();
        portGraphics.circle(port.relX, port.relY, PORT_CONSTANTS.RADIUS);
        portGraphics.fill({ 
            color: PORT_CONSTANTS.FILL_COLOR, 
            alpha: PORT_CONSTANTS.ALPHA 
        });
        portGraphics.stroke({ 
            width: PORT_CONSTANTS.STROKE_WIDTH, 
            color: PORT_CONSTANTS.STROKE_COLOR 
        });

        // Make interactive
        portGraphics.eventMode = 'static';
        portGraphics.cursor = 'pointer';
        portGraphics.on('click', () => this.onSwitchMatrixPortClick(port, portType));

        // Mark for LOD system
        (portGraphics as any).userData = { 
            type: 'port', 
            portType: portType,
            port: port,
            parent: smGeometry 
        };

        smContainer.addChild(portGraphics);
    }

    // =============================================================================
    // BEL CREATION
    // =============================================================================

    private createBel(belGeometry: any, tileContainer: Container): void {
        const belContainer = new Container();
        belContainer.x = belGeometry.relX;
        belContainer.y = belGeometry.relY;

        // Create BEL rectangle
        const belRect = new Graphics();
        belRect.rect(0, 0, belGeometry.width, belGeometry.height);
        belRect.fill({ 
            color: this.getBelColor(belGeometry), 
            alpha: BEL_CONSTANTS.FILL_ALPHA 
        });
        belRect.stroke({ 
            width: BEL_CONSTANTS.STROKE_WIDTH, 
            color: BEL_CONSTANTS.STROKE_COLOR,
            alpha: BEL_CONSTANTS.STROKE_ALPHA 
        });

        // Make interactive
        belRect.eventMode = 'static';
        belRect.cursor = 'pointer';
        belRect.on('click', () => this.onBelClick(belGeometry));

        belContainer.addChild(belRect);

        // Create BEL ports
        if (belGeometry.portGeometryList) {
            for (const port of belGeometry.portGeometryList) {
                this.createPort(port, belContainer, belGeometry);
            }
        }

        // Mark for LOD system
        (belContainer as any).userData = { type: 'bel', belGeometry };

        tileContainer.addChild(belContainer);
    }

    private getBelColor(belGeometry: any): number {
        // Generate color based on BEL name/type
        const hash = simpleHash(belGeometry.name || 'BEL');
        const hue = (hash * TILE_COLOR_CONSTANTS.HUE_MULTIPLIER) % TILE_COLOR_CONSTANTS.HUE_MODULO;
        return hslToHex(hue, TILE_COLOR_CONSTANTS.SATURATION, TILE_COLOR_CONSTANTS.LIGHTNESS);
    }

    private createPort(port: any, parentContainer: Container, parent: any): void {
        const portGraphics = new Graphics();
        portGraphics.circle(port.relX, port.relY, PORT_CONSTANTS.RADIUS);
        portGraphics.fill({ 
            color: PORT_CONSTANTS.FILL_COLOR, 
            alpha: PORT_CONSTANTS.ALPHA 
        });
        portGraphics.stroke({ 
            width: PORT_CONSTANTS.STROKE_WIDTH, 
            color: PORT_CONSTANTS.STROKE_COLOR 
        });

        // Make interactive
        portGraphics.eventMode = 'static';
        portGraphics.cursor = 'pointer';
        portGraphics.on('click', () => this.onPortClick(port));

        // Mark for LOD system
        (portGraphics as any).userData = { 
            type: 'port', 
            port: port, 
            parent: parent 
        };

        parentContainer.addChild(portGraphics);
    }

    // =============================================================================
    // WIRE CREATION
    // =============================================================================

    private createInternalWire(wireGeometry: WireGeometry, tileContainer: Container): void {
        if (!wireGeometry.path || wireGeometry.path.length < 2) return;

        const wireGraphics = new Graphics();
        
        // Draw wire path
        for (let i = wireGeometry.path.length - 1; i >= 1; i--) {
            const start = wireGeometry.path[i];
            const end = wireGeometry.path[i - 1];
            
            wireGraphics.moveTo(start.x, start.y);
            wireGraphics.lineTo(end.x, end.y);
        }
        
        wireGraphics.stroke({ 
            width: WIRE_CONSTANTS.DEFAULT_WIDTH, 
            color: WIRE_CONSTANTS.DEFAULT_COLOR,
            alpha: WIRE_CONSTANTS.DEFAULT_ALPHA 
        });

        // Make interactive
        wireGraphics.eventMode = 'static';
        wireGraphics.cursor = 'pointer';
        wireGraphics.on('click', () => this.onInternalWireClick(wireGeometry));

        // Mark for LOD system
        (wireGraphics as any).userData = { type: 'internalWire', wireName: wireGeometry.name };

        tileContainer.addChild(wireGraphics);
    }

    // =============================================================================
    // LOW-LOD SUBSTITUTES
    // =============================================================================

    private createLowLodSubstitute(smGeometry: any, tileContainer: Container): void {
        const lowLodRect = new Graphics();
        lowLodRect.roundRect(
            smGeometry.relX, 
            smGeometry.relY, 
            smGeometry.width, 
            smGeometry.height,
            SWITCH_MATRIX_CONSTANTS.CORNER_RADIUS
        );
        lowLodRect.fill({ color: SWITCH_MATRIX_CONSTANTS.LOW_LOD_FILL_COLOR });
        lowLodRect.stroke({ 
            width: SWITCH_MATRIX_CONSTANTS.STROKE_WIDTH, 
            color: SWITCH_MATRIX_CONSTANTS.LOW_LOD_STROKE_COLOR 
        });

        lowLodRect.visible = false; // Initially hidden, controlled by LOD system

        // Mark for LOD system
        (lowLodRect as any).userData = { type: 'lowLodSubstitute' };

        tileContainer.addChild(lowLodRect);
    }

    private createLowLodWiresGroup(tileGeometry: TileGeometry, tileContainer: Container): void {
        const lowLodWiresContainer = new Container();

        // Create low-LOD wire rectangles
        for (const lowLodWire of tileGeometry.lowLodWiresGeoms) {
            const wireRect = new Graphics();
            wireRect.rect(lowLodWire.relX, lowLodWire.relY, lowLodWire.width, lowLodWire.height);
            wireRect.fill({ color: LOW_LOD_COLORS.WIRES_FILL });
            wireRect.stroke({ 
                width: LOW_LOD_COLORS.STROKE_WIDTH, 
                color: LOW_LOD_COLORS.WIRES_STROKE 
            });
            lowLodWiresContainer.addChild(wireRect);
        }

        // Create low-LOD overlay rectangles
        for (const lowLodOverlay of tileGeometry.lowLodOverlays) {
            const overlayRect = new Graphics();
            overlayRect.rect(lowLodOverlay.relX, lowLodOverlay.relY, lowLodOverlay.width, lowLodOverlay.height);
            overlayRect.fill({ color: LOW_LOD_COLORS.OVERLAY_FILL });
            overlayRect.stroke({ 
                width: LOW_LOD_COLORS.STROKE_WIDTH, 
                color: LOW_LOD_COLORS.OVERLAY_STROKE 
            });
            lowLodWiresContainer.addChild(overlayRect);
        }

        lowLodWiresContainer.visible = false; // Initially hidden, controlled by LOD system

        // Mark for LOD system
        (lowLodWiresContainer as any).userData = { type: 'lowLodWires' };

        tileContainer.addChild(lowLodWiresContainer);
    }

    // =============================================================================
    // FABRIC MARKERS
    // =============================================================================

    private buildMarkers(): void {
        if (!this.currentGeometry) return;

        const markerContainer = new Container();
        
        // Create corner markers for fabric boundaries
        const corners = [
            { x: 0, y: 0 }, // Top-left
            { x: this.currentGeometry.width, y: 0 }, // Top-right
            { x: 0, y: this.currentGeometry.height }, // Bottom-left
            { x: this.currentGeometry.width, y: this.currentGeometry.height } // Bottom-right
        ];

        for (const corner of corners) {
            const marker = new Graphics();
            marker.rect(
                corner.x - TILE_CONSTANTS.MARKER_SIZE / 2, 
                corner.y - TILE_CONSTANTS.MARKER_SIZE / 2,
                TILE_CONSTANTS.MARKER_SIZE, 
                TILE_CONSTANTS.MARKER_SIZE
            );
            marker.fill({ color: TILE_CONSTANTS.MARKER_COLOR });
            markerContainer.addChild(marker);
        }

        this.fabricContainer.addChild(markerContainer);
    }

    // =============================================================================
    // COLOR UTILITIES
    // =============================================================================

    private getTileColor(tileName: string): number {
        // Generate consistent color based on tile name
        const hash = simpleHash(tileName);
        const hue = (hash * TILE_COLOR_CONSTANTS.HUE_MULTIPLIER) % TILE_COLOR_CONSTANTS.HUE_MODULO;
        return hslToHex(hue, TILE_COLOR_CONSTANTS.SATURATION, TILE_COLOR_CONSTANTS.LIGHTNESS);
    }

    // =============================================================================
    // EVENT CALLBACKS
    // =============================================================================

    public setTileClickCallback(callback: TileClickCallback): void {
        this.onTileClickCallback = callback;
    }

    public setSwitchMatrixClickCallback(callback: SwitchMatrixClickCallback): void {
        this.onSwitchMatrixClickCallback = callback;
    }

    public setBelClickCallback(callback: BelClickCallback): void {
        this.onBelClickCallback = callback;
    }

    public setPortClickCallback(callback: PortClickCallback): void {
        this.onPortClickCallback = callback;
    }

    public setWireClickCallback(callback: WireClickCallback): void {
        this.onWireClickCallback = callback;
    }

    private onTileClick(tileGeometry: TileGeometry, x: number, y: number): void {
        this.onTileClickCallback?.(tileGeometry, x, y);
    }

    private onSwitchMatrixClick(smGeometry: any): void {
        this.onSwitchMatrixClickCallback?.(smGeometry);
    }

    private onBelClick(belGeometry: any): void {
        this.onBelClickCallback?.(belGeometry);
    }

    private onPortClick(port: any): void {
        this.onPortClickCallback?.(port);
    }

    private onSwitchMatrixPortClick(port: any, portType: 'regular' | 'jump'): void {
        this.onPortClickCallback?.(port);
    }

    private onInternalWireClick(wireGeometry: WireGeometry): void {
        this.onWireClickCallback?.(wireGeometry);
    }

    // =============================================================================
    // GETTERS
    // =============================================================================

    public getTileContainers(): Container[][] {
        return this.tileContainers;
    }

    public getCurrentGeometry(): FabricGeometry | null {
        return this.currentGeometry;
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
        this.clearFabric();
        this.currentGeometry = null;
        this.tileContainers = [];
    }
}