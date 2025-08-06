import { Application, Graphics, Container, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { FabricGeometry, TileGeometry, Location, WireGeometry } from '../types/geometry';
import { DesignData, DesignUtils, DiscreteLocation, ConnectedPorts } from '../types/design';

// Level of Detail system matching Java implementation
enum LodLevel {
    LOW = 0.15,     // for Bels (Rect -> Rects) - show only low-LOD rectangles
    MEDIUM = 0.5,   // for Wires (Rect -> Lines) - show low-LOD substitutes  
    HIGH = 1.7      // for Ports (Line -> Circles) - show all details
}

function getLodLevel(zoomLevel: number): LodLevel {
    if (zoomLevel < LodLevel.LOW) {
        return LodLevel.LOW;
    } else if (zoomLevel < LodLevel.MEDIUM) {
        return LodLevel.MEDIUM;
    } else {
        return LodLevel.HIGH;
    }
}

export class FabricRenderer {
    private app: Application;
    private viewport: Viewport;
    private fabricContainer: Container;
    private designContainer: Container;
    private tileContainers: Container[][] = [];
    private currentGeometry: FabricGeometry | null = null;
    private currentDesign: DesignData | null = null;
    private currentLOD: number = 1;
    private culledObjects: Set<Container> = new Set();
    
    // Wire management (matching Java WireManager)
    private highlightedWires: Set<Graphics> = new Set();
    private readonly DEFAULT_WIRE_COLOR = 0xFFFFFF; // White
    private readonly DEFAULT_WIRE_WIDTH = 0.2;
    
    // Event callbacks
    private onViewportChangeCallback?: (bounds: { x: number, y: number, width: number, height: number }, zoom: number) => void;

    constructor(app: Application) {
        this.app = app;
        
        // Create viewport with pixi-viewport
        this.viewport = new Viewport({
            screenWidth: app.screen.width,
            screenHeight: app.screen.height,
            worldWidth: 10000,
            worldHeight: 10000,
            events: app.renderer.events
        });

        // Enable viewport plugins
        this.viewport
            .drag({ mouseButtons: 'left' })
            .pinch()
            .wheel()
            .decelerate();

        // Create containers within viewport
        this.fabricContainer = new Container();
        this.designContainer = new Container();
        this.viewport.addChild(this.fabricContainer);
        this.viewport.addChild(this.designContainer);
        
        // Add viewport to stage
        this.app.stage.addChild(this.viewport);

        // Set up viewport event listeners
        this.setupViewportEvents();
    }

    private setupViewportEvents(): void {
        // Listen to viewport changes for LOD and culling updates
        this.viewport.on('moved', () => {
            this.updateLOD();
            this.notifyViewportChange();
        });

        this.viewport.on('zoomed', () => {
            this.updateLOD();
            this.notifyViewportChange();
        });

        // Also listen to frame updates to catch any missed viewport changes
        this.viewport.on('frame-end', () => {
            this.updateLOD();
        });

        // Listen to wheel events which might not trigger moved/zoomed
        this.viewport.on('wheel', () => {
            // Debounced update to avoid too many calls
            this.scheduleViewportUpdate();
        });
    }

    private viewportUpdateTimeout: number | null = null;

    private scheduleViewportUpdate(): void {
        if (this.viewportUpdateTimeout) {
            clearTimeout(this.viewportUpdateTimeout);
        }
        this.viewportUpdateTimeout = setTimeout(() => {
            this.updateLOD();
            this.notifyViewportChange();
            this.viewportUpdateTimeout = null;
        }, 16); // ~60fps
    }

    private notifyViewportChange(): void {
        if (this.onViewportChangeCallback) {
            const bounds = this.viewport.getVisibleBounds();
            const zoom = this.viewport.scale.x;
            this.onViewportChangeCallback(
                { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
                zoom
            );
        }
    }

    public setViewportChangeCallback(callback: (bounds: { x: number, y: number, width: number, height: number }, zoom: number) => void): void {
        this.onViewportChangeCallback = callback;
    }

    public loadFabric(geometry: FabricGeometry): void {
        this.currentGeometry = geometry;
        this.clearFabric();
        this.buildFabric();
        this.centerFabric();
        // Ensure culling and LOD are properly initialized
        setTimeout(() => {
            this.updateLOD();
            this.forceViewportUpdate();
        }, 100);
    }

    public forceViewportUpdate(): void {
        this.updateLOD();
        this.notifyViewportChange();
    }

    public loadDesign(designData: DesignData): void {
        this.currentDesign = designData;
        this.clearDesign();
        if (this.currentGeometry) {
            this.buildDesignOverlay();
        } else {
            console.warn('Design loaded but no fabric geometry available for overlay');
        }
    }

    public clearDesign(): void {
        this.designContainer.removeChildren();
    }

    private clearFabric(): void {
        this.fabricContainer.removeChildren();
        this.tileContainers = [];
        this.culledObjects.clear();
    }

    // Zoom control methods
    public zoomIn(): void {
        this.viewport.zoomPercent(0.25, true);
    }

    public zoomOut(): void {
        this.viewport.zoomPercent(-0.2, true);
    }

    public zoomToFit(): void {
        if (this.currentGeometry) {
            this.viewport.fitWorld(true);
            // Force culling update after fit operation
            setTimeout(() => this.updateLOD(), 50);
        }
    }

    public zoomReset(): void {
        this.viewport.setZoom(1, true);
    }

    public getZoomLevel(): number {
        return this.viewport.scale.x;
    }

    public panTo(x: number, y: number): void {
        this.viewport.moveCenter(x, y);
        // Force culling update after pan operation
        setTimeout(() => this.updateLOD(), 50);
    }

    public getViewportBounds(): { x: number, y: number, width: number, height: number } {
        const bounds = this.viewport.getVisibleBounds();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }

    private updateLOD(): void {
        const zoomLevel = this.viewport.scale.x;
        if (Math.abs(this.currentLOD - zoomLevel) < 0.01) return; // Avoid unnecessary updates
        
        this.currentLOD = zoomLevel;
        this.applyCulling();
        this.applyLevelOfDetail();
        this.updateWireThickness(zoomLevel);
    }
    
    // Wire management methods matching Java WireManager
    public highlightWire(wire: Graphics, color: number): void {
        wire.tint = color;
        this.highlightedWires.add(wire);
    }
    
    public unHighlightWire(wire: Graphics): void {
        wire.tint = this.DEFAULT_WIRE_COLOR;
        this.highlightedWires.delete(wire);
    }
    
    private updateWireThickness(zoomLevel: number): void {
        // Matching Java's exponential thickness calculation
        const LARGEST_THICKNESS = 4;
        const SMALLEST_THICKNESS = 0.2;
        
        const newThickness = (LARGEST_THICKNESS - SMALLEST_THICKNESS) * Math.exp(-zoomLevel) + SMALLEST_THICKNESS;
        
        for (const wire of this.highlightedWires) {
            // Update stroke width for highlighted wires
            wire.clear();
            // Re-draw with new thickness - this is simplified, full implementation would store original path
        }
    }

    private applyCulling(): void {
        if (!this.currentGeometry) return;

        const visibleBounds = this.viewport.getVisibleBounds();
        
        // Add buffer margin to prevent flickering at edges (25% of viewport size)
        const bufferMarginX = visibleBounds.width * 0.25;
        const bufferMarginY = visibleBounds.height * 0.25;
        
        const cullingBounds = {
            x: visibleBounds.x - bufferMarginX,
            y: visibleBounds.y - bufferMarginY,
            width: visibleBounds.width + (bufferMarginX * 2),
            height: visibleBounds.height + (bufferMarginY * 2)
        };
        
        const { tileLocations, tileGeomMap, tileNames } = this.currentGeometry;
        
        // Cull tiles that are outside viewport (matching Java logic)
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (!tileContainer) continue;

                // Get tile bounds from geometry (matching Java)
                const tileLocation = tileLocations[y][x];
                const tileName = tileNames[y][x];
                
                if (tileLocation && tileName) {
                    const tileGeometry = tileGeomMap[tileName];
                    if (tileGeometry) {
                        const tileBounds = {
                            x: tileLocation.x,
                            y: tileLocation.y,
                            width: tileGeometry.width,
                            height: tileGeometry.height
                        };
                        
                        const isVisible = this.boundsIntersect(tileBounds, cullingBounds);
                        
                        if (isVisible && this.culledObjects.has(tileContainer)) {
                            // Tile came back into view
                            tileContainer.visible = true;
                            this.culledObjects.delete(tileContainer);
                        } else if (!isVisible && !this.culledObjects.has(tileContainer)) {
                            // Tile went out of view
                            tileContainer.visible = false;
                            this.culledObjects.add(tileContainer);
                        }
                    }
                }
            }
        }
    }

    private boundsIntersect(tileBounds: any, viewportBounds: any): boolean {
        // Exact bounds intersection logic from Java with additional safety checks
        if (!tileBounds || !viewportBounds) return false;
        
        const tileRight = tileBounds.x + tileBounds.width;
        const tileBottom = tileBounds.y + tileBounds.height;
        const viewportRight = viewportBounds.x + viewportBounds.width;
        const viewportBottom = viewportBounds.y + viewportBounds.height;
        
        // Check if rectangles don't overlap (return false if they don't)
        if (tileRight <= viewportBounds.x ||    // Tile is to the left of viewport
            tileBounds.x >= viewportRight ||     // Tile is to the right of viewport
            tileBottom <= viewportBounds.y ||    // Tile is above viewport
            tileBounds.y >= viewportBottom) {    // Tile is below viewport
            return false;
        }
        
        return true; // Rectangles intersect
    }

    private applyLevelOfDetail(): void {
        const zoom = this.currentLOD;
        
        // Apply LOD to all tile containers
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (!tileContainer || this.culledObjects.has(tileContainer)) continue;

                this.applyTileLOD(tileContainer, zoom);
            }
        }
    }

    private applyTileLOD(tileContainer: Container, zoom: number): void {
        const lod = getLodLevel(zoom);
        
        tileContainer.children.forEach(child => {
            const childType = (child as any).userData?.type;
            
            switch (lod) {
                case LodLevel.LOW:
                    // LOW: Hide almost everything, show only basic tile rectangles
                    switch (childType) {
                        case 'tile':
                            child.visible = true;
                            break;
                        default:
                            child.visible = false;
                    }
                    break;
                    
                case LodLevel.MEDIUM:
                    // MEDIUM: Show low-LOD substitutes, hide detailed elements
                    switch (childType) {
                        case 'tile':
                        case 'lowLodSubstitute':
                        case 'lowLodWire':
                            child.visible = true;
                            break;
                        case 'switchMatrix':
                        case 'bel':
                        case 'port':
                        case 'wire':
                            child.visible = false;
                            break;
                        default:
                            child.visible = false;
                    }
                    break;
                    
                case LodLevel.HIGH:
                    // HIGH: Show all details
                    switch (childType) {
                        case 'tile':
                        case 'switchMatrix':
                        case 'bel':
                        case 'port':
                        case 'wire':
                            child.visible = true;
                            break;
                        case 'lowLodSubstitute':
                        case 'lowLodWire':
                            child.visible = false;
                            break;
                        default:
                            child.visible = true;
                    }
                    break;
            }
        });
    }

    private buildDesignOverlay(): void {
        if (!this.currentDesign || !this.currentGeometry) return;

        const config = this.currentDesign.bitstreamConfig;
        
        // Process each tile location that has routing connections
        for (const [locationKey, connectedPortsList] of Object.entries(config.connectivityMap)) {
            const location = DesignUtils.parseDiscreteLocation(locationKey);
            this.displayBitstreamConfigAtTile(location, connectedPortsList);
        }

        console.log(`Design overlay built: ${Object.keys(config.connectivityMap).length} tiles with connections`);
    }

    private displayBitstreamConfigAtTile(location: DiscreteLocation, connectedPortsList: ConnectedPorts[]): void {
        // Find the corresponding tile container
        const tileContainer = this.getTileContainer(location);
        if (!tileContainer) {
            console.warn(`No tile container found for location X${location.x}Y${location.y}`);
            return;
        }

        // Create design connections for this tile
        for (const ports of connectedPortsList) {
            this.createDesignConnection(tileContainer, ports, location);
        }
    }

    private getTileContainer(location: DiscreteLocation): Container | null {
        // Find tile container by matching fabric locations to design locations
        if (!this.currentGeometry) return null;

        const { tileLocations } = this.currentGeometry;
        
        // Search through tile grid to find matching location
        for (let y = 0; y < tileLocations.length; y++) {
            for (let x = 0; x < tileLocations[y].length; x++) {
                // Check if this is the tile we're looking for
                if (x === location.x && y === location.y) {
                    return this.tileContainers[y] && this.tileContainers[y][x] || null;
                }
            }
        }
        return null;
    }

    private createDesignConnection(tileContainer: Container, ports: ConnectedPorts, location: DiscreteLocation): void {
        // Create a highlighted connection line between the two ports
        const connectionLine = new Graphics();
        
        // For now, create a simple line overlay to indicate active connection
        // In a full implementation, we'd need to find the actual port positions
        const connectionColor = 0xff6600; // Orange color for design connections
        
        connectionLine.moveTo(10, 10);
        connectionLine.lineTo(90, 90);
        connectionLine.stroke({ width: 3, color: connectionColor, alpha: 0.8 });
        
        // Make connection interactive
        connectionLine.eventMode = 'static';
        connectionLine.cursor = 'pointer';
        connectionLine.on('pointerdown', () => {
            this.onDesignConnectionClick(ports, location);
        });

        // Add LOD metadata
        (connectionLine as any).userData = { type: 'designConnection' };

        // Add to design container (separate from fabric)
        this.designContainer.addChild(connectionLine);
        
        // Position relative to tile
        const tileX = tileContainer.x;
        const tileY = tileContainer.y;
        connectionLine.x = tileX;
        connectionLine.y = tileY;
    }

    private onDesignConnectionClick(ports: ConnectedPorts, location: DiscreteLocation): void {
        console.log(`Design connection clicked: ${ports.portA} -> ${ports.portB} at X${location.x}Y${location.y}`);
        
        // Send message to extension about connection details
        if (typeof window !== 'undefined' && window.postMessage) {
            window.postMessage({
                type: 'designConnectionClick',
                data: { ports, location }
            }, '*');
        }
    }

    private buildFabric(): void {
        if (!this.currentGeometry) {
            console.error('buildFabric called but no geometry available');
            return;
        }

        console.log('Building fabric with geometry:', this.currentGeometry.name);
        const { tileNames, tileLocations, tileGeomMap } = this.currentGeometry;
        console.log('Tile names array size:', tileNames.length, 'x', tileNames[0]?.length);
        console.log('Tile locations array size:', tileLocations.length, 'x', tileLocations[0]?.length);
        console.log('TileGeomMap keys:', Object.keys(tileGeomMap));

        // Initialize tile containers array
        for (let y = 0; y < tileNames.length; y++) {
            this.tileContainers[y] = [];
            for (let x = 0; x < tileNames[y].length; x++) {
                this.tileContainers[y][x] = new Container();
            }
        }

        let tilesCreated = 0;
        // Create tiles
        for (let y = 0; y < tileNames.length; y++) {
            for (let x = 0; x < tileNames[y].length; x++) {
                const tileName = tileNames[y][x];
                const tileLocation = tileLocations[y][x];

                if (tileName && tileLocation) {
                    const tileGeometry = tileGeomMap[tileName];
                    if (tileGeometry) {
                        this.createTile(tileGeometry, tileLocation, x, y);
                        tilesCreated++;
                    }
                }
            }
        }
        console.log(`Created ${tilesCreated} tiles`);
        
        // Add boundary markers (matching Java)
        this.buildMarkers();
    }
    
    private buildMarkers(): void {
        if (!this.currentGeometry) return;
        
        // Fabric boundary markers with large padding (matching Java's 2^16)
        const MARKER_PADDING = Math.pow(2, 16);
        
        const topLeft = new Graphics();
        topLeft.rect(0, 0, 0, 0);
        topLeft.fill(0x000000); // Transparent
        topLeft.x = -MARKER_PADDING;
        topLeft.y = -MARKER_PADDING;
        
        const topRight = new Graphics();
        topRight.rect(0, 0, 0, 0);
        topRight.fill(0x000000); // Transparent
        topRight.x = this.currentGeometry.width + MARKER_PADDING;
        topRight.y = -MARKER_PADDING;
        
        const bottomLeft = new Graphics();
        bottomLeft.rect(0, 0, 0, 0);
        bottomLeft.fill(0x000000); // Transparent
        bottomLeft.x = -MARKER_PADDING;
        bottomLeft.y = this.currentGeometry.height + MARKER_PADDING;
        
        const bottomRight = new Graphics();
        bottomRight.rect(0, 0, 0, 0);
        bottomRight.fill(0x000000); // Transparent
        bottomRight.x = this.currentGeometry.width + MARKER_PADDING;
        bottomRight.y = this.currentGeometry.height + MARKER_PADDING;
        
        this.fabricContainer.addChild(topLeft, topRight, bottomLeft, bottomRight);
    }

    private createTile(tileGeometry: TileGeometry, location: Location, fabricX: number, fabricY: number): void {
        const tileContainer = this.tileContainers[fabricY][fabricX];
        tileContainer.x = location.x;
        tileContainer.y = location.y;

        // Create tile rectangle with proper colors and opacity (matching JavaFX)
        const tileRect = new Graphics();
        const tileColor = this.getTileColor(tileGeometry.name);
        tileRect.rect(0, 0, tileGeometry.width, tileGeometry.height);
        tileRect.fill({ color: tileColor, alpha: 0.4 }); // Increased alpha for better visibility
        tileRect.stroke({ width: 1.0, color: 0xD3D3D3, alpha: 0.9 }); // LIGHTGRAY stroke, stronger
        
        // Make tile interactive
        tileRect.eventMode = 'static';
        tileRect.cursor = 'pointer';
        tileRect.on('pointerdown', () => {
            this.onTileClick(tileGeometry, fabricX, fabricY);
        });

        // Add LOD metadata
        (tileRect as any).userData = { type: 'tile' };
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

        // Create wires (for high detail level)
        for (const wireGeometry of tileGeometry.wireGeometryList) {
            this.createWire(wireGeometry, tileContainer);
        }

        // Create low LOD wires group
        this.createLowLodWiresGroup(tileGeometry, tileContainer);

        this.fabricContainer.addChild(tileContainer);
    }

    private createSwitchMatrix(smGeometry: any, tileContainer: Container): void {
        const smRect = new Graphics();
        smRect.rect(0, 0, smGeometry.width, smGeometry.height);
        smRect.fill({ color: 0x2a2a2a, alpha: 0.8 }); // Semi-transparent dark fill
        smRect.stroke({ width: 1, color: 0x888888, alpha: 0.9 }); // More visible stroke
        smRect.x = smGeometry.relX;
        smRect.y = smGeometry.relY;

        // Make switch matrix interactive
        smRect.eventMode = 'static';
        smRect.cursor = 'pointer';
        smRect.on('pointerdown', () => {
            this.onSwitchMatrixClick(smGeometry);
        });

        // Add LOD metadata
        (smRect as any).userData = { type: 'switchMatrix' };

        tileContainer.addChild(smRect);

        // Create ports
        for (const port of smGeometry.portGeometryList) {
            this.createPort(port, tileContainer, smGeometry);
        }

        for (const jumpPort of smGeometry.jumpPortGeometryList) {
            this.createPort(jumpPort, tileContainer, smGeometry);
        }
    }

    private createBel(belGeometry: any, tileContainer: Container): void {
        const belRect = new Graphics();
        belRect.rect(0, 0, belGeometry.width, belGeometry.height);
        belRect.fill({ color: 0x4a4a4a, alpha: 0.7 }); // More visible BEL fill
        belRect.stroke({ width: 1, color: 0xaaaaaa, alpha: 0.9 }); // Stronger stroke
        belRect.x = belGeometry.relX;
        belRect.y = belGeometry.relY;

        // Make BEL interactive
        belRect.eventMode = 'static';
        belRect.cursor = 'pointer';
        belRect.on('pointerdown', () => {
            this.onBelClick(belGeometry);
        });

        // Add LOD metadata
        (belRect as any).userData = { type: 'bel' };

        tileContainer.addChild(belRect);

        // Create BEL ports
        for (const port of belGeometry.portGeometryList) {
            this.createPort(port, tileContainer, belGeometry);
        }
    }

    private createPort(port: any, tileContainer: Container, parent: any): void {
        const portCircle = new Graphics();
        portCircle.circle(0, 0, 3); // Slightly larger ports for visibility
        portCircle.fill({ color: this.getPortColor(port), alpha: 0.8 });
        portCircle.stroke({ width: 0.5, color: 0x000000, alpha: 0.6 }); // Black outline
        portCircle.x = parent.relX + port.relX;
        portCircle.y = parent.relY + port.relY;

        // Make port interactive
        portCircle.eventMode = 'static';
        portCircle.cursor = 'pointer';
        portCircle.on('pointerdown', () => {
            this.onPortClick(port);
        });

        // Add LOD metadata
        (portCircle as any).userData = { type: 'port' };

        tileContainer.addChild(portCircle);
    }

    private createWire(wireGeometry: WireGeometry, tileContainer: Container): void {
        const path = wireGeometry.path;
        if (path.length < 2) return;

        // Create wire segments matching Java's approach (path counter counts down)
        for (let pathCounter = path.length; pathCounter >= 2; pathCounter--) {
            const start = path[pathCounter - 1];
            const end = path[pathCounter - 2];

            const wireGraphics = new Graphics();
            wireGraphics.moveTo(start.x, start.y);
            wireGraphics.lineTo(end.x, end.y);
            wireGraphics.stroke({ width: this.DEFAULT_WIRE_WIDTH * 2, color: this.DEFAULT_WIRE_COLOR, alpha: 0.8 }); // Thicker, more visible wires

            // Make wire interactive
            wireGraphics.eventMode = 'static';
            wireGraphics.cursor = 'pointer';
            wireGraphics.on('pointerdown', () => {
                this.onWireClick(wireGeometry);
            });

            // Add LOD metadata and wire name
            (wireGraphics as any).userData = { type: 'wire', wireName: wireGeometry.name };

            tileContainer.addChild(wireGraphics);
        }
    }

    private createLowLodSubstitute(smGeometry: any, tileContainer: Container): void {
        // Create low-LOD substitute rectangle for switch matrix (matching Java)
        const lowLodRect = new Graphics();
        lowLodRect.rect(0, 0, smGeometry.width, smGeometry.height);
        lowLodRect.fill(0x000000); // Black fill
        lowLodRect.stroke({ width: 1, color: 0xFFFFFF }); // White stroke
        lowLodRect.x = smGeometry.relX;
        lowLodRect.y = smGeometry.relY;

        // Add LOD metadata
        (lowLodRect as any).userData = { type: 'lowLodSubstitute' };

        // Start hidden (will be shown in MEDIUM LOD)
        lowLodRect.visible = false;
        tileContainer.addChild(lowLodRect);
    }

    private createLowLodWiresGroup(tileGeometry: TileGeometry, tileContainer: Container): void {
        // Create grouped low-LOD wires container (matching Java)
        const lowLodWiresGroup = new Container();
        (lowLodWiresGroup as any).userData = { type: 'lowLodWire' };
        
        // Add low-LOD wire rectangles
        for (const lowLodWire of tileGeometry.lowLodWiresGeoms) {
            const wireRect = new Graphics();
            wireRect.rect(0, 0, lowLodWire.width, lowLodWire.height);
            wireRect.fill(0x323232); // rgb(50,50,50)
            wireRect.stroke({ width: 2, color: 0x323232 });
            wireRect.x = lowLodWire.relX;
            wireRect.y = lowLodWire.relY;
            lowLodWiresGroup.addChild(wireRect);
        }

        // Add low-LOD overlay rectangles
        for (const lowLodOverlay of tileGeometry.lowLodOverlays) {
            const overlayRect = new Graphics();
            overlayRect.rect(0, 0, lowLodOverlay.width, lowLodOverlay.height);
            overlayRect.fill(0x5A5A5A); // rgb(90,90,90)
            overlayRect.stroke({ width: 2, color: 0x5A5A5A });
            overlayRect.x = lowLodOverlay.relX;
            overlayRect.y = lowLodOverlay.relY;
            lowLodWiresGroup.addChild(overlayRect);
        }

        // Start hidden (will be shown in MEDIUM LOD)
        lowLodWiresGroup.visible = false;
        tileContainer.addChild(lowLodWiresGroup);
    }

    private centerFabric(): void {
        if (!this.currentGeometry) return;

        // Set viewport world size to fabric size
        this.viewport.resize(this.app.screen.width, this.app.screen.height, this.currentGeometry.width, this.currentGeometry.height);
        
        // Fit the world in the viewport
        this.viewport.fitWorld(true);

        console.log(`Fabric centered: ${this.currentGeometry.width}x${this.currentGeometry.height} at scale ${this.viewport.scale.x.toFixed(3)}`);
    }

    private getTileColor(tileName: string): number {
        // Semantic tile coloring matching Java TileColorUtils
        const nameUpper = tileName.toUpperCase();
        
        if (nameUpper.includes('TERM')) {
            return 0xD3D3D3; // LIGHTGRAY
        } else if (nameUpper.includes('IO')) {
            return 0xFFFFE0; // LIGHTYELLOW
        } else if (nameUpper.includes('LUT')) {
            return 0xADD8E6; // LIGHTBLUE
        } else if (nameUpper.includes('REG')) {
            return 0xCD5C5C; // INDIANRED
        } else if (nameUpper.includes('DSP')) {
            return 0x90EE90; // LIGHTGREEN
        } else {
            return 0x9370DB; // MEDIUMPURPLE (default)
        }
    }

    private getPortColor(port: any): number {
        // Color based on port I/O direction
        if (port.io === 'INPUT') return 0x00ff00; // Green
        if (port.io === 'OUTPUT') return 0xff0000; // Red
        return 0xffff00; // Yellow for unknown/inout
    }

    private hslToHex(h: number, s: number, l: number): number {
        const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l / 100 - c / 2;

        let r = 0, g = 0, b = 0;

        if (0 <= h && h < 60) {
            r = c; g = x; b = 0;
        } else if (60 <= h && h < 120) {
            r = x; g = c; b = 0;
        } else if (120 <= h && h < 180) {
            r = 0; g = c; b = x;
        } else if (180 <= h && h < 240) {
            r = 0; g = x; b = c;
        } else if (240 <= h && h < 300) {
            r = x; g = 0; b = c;
        } else if (300 <= h && h < 360) {
            r = c; g = 0; b = x;
        }

        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);

        return (r << 16) | (g << 8) | b;
    }

    // Event handlers
    private onTileClick(tileGeometry: TileGeometry, x: number, y: number): void {
        console.log(`Tile clicked: ${tileGeometry.name} at (${x}, ${y})`);
        
        if (typeof window !== 'undefined' && window.postMessage) {
            window.postMessage({
                type: 'tileClick',
                data: { tileName: tileGeometry.name, x, y }
            }, '*');
        }
    }

    private onSwitchMatrixClick(smGeometry: any): void {
        console.log(`Switch matrix clicked: ${smGeometry.name || 'unknown'}`);
    }

    private onBelClick(belGeometry: any): void {
        console.log(`BEL clicked: ${belGeometry.name || 'unknown'}`);
    }

    private onPortClick(port: any): void {
        console.log(`Port clicked: ${port.name || 'unknown'}`);
    }

    private onWireClick(wireGeometry: WireGeometry): void {
        console.log(`Wire clicked`);
    }

    public destroy(): void {
        // Clean up timers
        if (this.viewportUpdateTimeout) {
            clearTimeout(this.viewportUpdateTimeout);
            this.viewportUpdateTimeout = null;
        }
        
        // Clean up containers and viewport
        this.fabricContainer.destroy({ children: true });
        this.designContainer.destroy({ children: true });
        this.viewport.destroy({ children: true });
        
        console.log('FabricRenderer destroyed with proper cleanup');
    }
}
