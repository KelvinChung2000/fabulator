import { Application, Graphics, Container, Sprite } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { FabricGeometry, TileGeometry, Location, WireGeometry } from '../types/geometry';
import { DesignData, DesignUtils, DiscreteLocation, ConnectedPorts } from '../types/design';

// Level of Detail thresholds
const LOD_THRESHOLDS = {
    HIDE_PORTS: 0.1,      // Hide ports when zoom < 10%
    HIDE_WIRES: 0.2,      // Hide detailed wires when zoom < 20%
    HIDE_BELS: 0.05,      // Hide BELs when zoom < 5%
    SHOW_LOW_LOD: 0.3,    // Show low LOD elements when zoom < 30%
    SHOW_LABELS: 1.0      // Show text labels when zoom >= 100%
};

export class EnhancedFabricRenderer {
    private app: Application;
    private viewport: Viewport;
    private fabricContainer: Container;
    private designContainer: Container;
    private tileContainers: Container[][] = [];
    private currentGeometry: FabricGeometry | null = null;
    private currentDesign: DesignData | null = null;
    private currentLOD: number = 1;
    private culledObjects: Set<Container> = new Set();
    
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
        // Listen to viewport changes for LOD updates
        this.viewport.on('moved', () => {
            this.updateLOD();
            this.notifyViewportChange();
        });

        this.viewport.on('zoomed', () => {
            this.updateLOD();
            this.notifyViewportChange();
        });
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
        this.updateLOD();
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
    }

    private applyCulling(): void {
        if (!this.currentGeometry) return;

        const visibleBounds = this.viewport.getVisibleBounds();
        
        // Cull tiles that are outside viewport
        for (let y = 0; y < this.tileContainers.length; y++) {
            for (let x = 0; x < this.tileContainers[y].length; x++) {
                const tileContainer = this.tileContainers[y][x];
                if (!tileContainer) continue;

                const tileBounds = tileContainer.getBounds();
                const isVisible = this.boundsIntersect(tileBounds, visibleBounds);
                
                if (isVisible && this.culledObjects.has(tileContainer)) {
                    tileContainer.visible = true;
                    this.culledObjects.delete(tileContainer);
                } else if (!isVisible && !this.culledObjects.has(tileContainer)) {
                    tileContainer.visible = false;
                    this.culledObjects.add(tileContainer);
                }
            }
        }
    }

    private boundsIntersect(bounds1: any, bounds2: any): boolean {
        return !(bounds1.x + bounds1.width < bounds2.x ||
                bounds2.x + bounds2.width < bounds1.x ||
                bounds1.y + bounds1.height < bounds2.y ||
                bounds2.y + bounds2.height < bounds1.y);
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
        tileContainer.children.forEach(child => {
            const childName = (child as any).userData?.type;
            
            switch (childName) {
                case 'port':
                    child.visible = zoom >= LOD_THRESHOLDS.HIDE_PORTS;
                    break;
                case 'wire':
                    child.visible = zoom >= LOD_THRESHOLDS.HIDE_WIRES;
                    break;
                case 'bel':
                    child.visible = zoom >= LOD_THRESHOLDS.HIDE_BELS;
                    break;
                case 'lowLodWire':
                    child.visible = zoom < LOD_THRESHOLDS.SHOW_LOW_LOD;
                    break;
                case 'label':
                    child.visible = zoom >= LOD_THRESHOLDS.SHOW_LABELS;
                    break;
                default:
                    // Keep tiles and switch matrices always visible
                    child.visible = true;
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
        if (!this.currentGeometry) return;

        const { tileNames, tileLocations, tileGeomMap } = this.currentGeometry;

        // Initialize tile containers array
        for (let y = 0; y < tileNames.length; y++) {
            this.tileContainers[y] = [];
            for (let x = 0; x < tileNames[y].length; x++) {
                this.tileContainers[y][x] = new Container();
            }
        }

        // Create tiles
        for (let y = 0; y < tileNames.length; y++) {
            for (let x = 0; x < tileNames[y].length; x++) {
                const tileName = tileNames[y][x];
                const tileLocation = tileLocations[y][x];

                if (tileName && tileLocation) {
                    const tileGeometry = tileGeomMap[tileName];
                    if (tileGeometry) {
                        this.createTile(tileGeometry, tileLocation, x, y);
                    }
                }
            }
        }
    }

    private createTile(tileGeometry: TileGeometry, location: Location, fabricX: number, fabricY: number): void {
        const tileContainer = this.tileContainers[fabricY][fabricX];
        tileContainer.x = location.x;
        tileContainer.y = location.y;

        // Create tile rectangle
        const tileRect = new Graphics();
        tileRect.rect(0, 0, tileGeometry.width, tileGeometry.height);
        tileRect.fill(this.getTileColor(tileGeometry.name));
        tileRect.stroke({ width: 1, color: 0x666666, alpha: 0.8 });
        
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
        }

        // Create BELs
        for (const belGeometry of tileGeometry.belGeometryList) {
            this.createBel(belGeometry, tileContainer);
        }

        // Create wires (for high detail level)
        for (const wireGeometry of tileGeometry.wireGeometryList) {
            this.createWire(wireGeometry, tileContainer);
        }

        // Create low LOD wires
        for (const lowLodWire of tileGeometry.lowLodWiresGeoms) {
            this.createLowLodWire(lowLodWire, tileContainer, false);
        }

        // Create low LOD overlays
        for (const lowLodOverlay of tileGeometry.lowLodOverlays) {
            this.createLowLodWire(lowLodOverlay, tileContainer, true);
        }

        this.fabricContainer.addChild(tileContainer);
    }

    private createSwitchMatrix(smGeometry: any, tileContainer: Container): void {
        const smRect = new Graphics();
        smRect.rect(0, 0, smGeometry.width, smGeometry.height);
        smRect.fill(0x2a2a2a);
        smRect.stroke({ width: 1, color: 0x888888, alpha: 0.6 });
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
        belRect.fill(0x4a4a4a);
        belRect.stroke({ width: 1, color: 0xaaaaaa, alpha: 0.7 });
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
        portCircle.circle(0, 0, 2);
        portCircle.fill(this.getPortColor(port));
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
        const wireGraphics = new Graphics();
        const path = wireGeometry.path;

        if (path.length < 2) return;

        wireGraphics.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            wireGraphics.lineTo(path[i].x, path[i].y);
        }
        wireGraphics.stroke({ width: 0.5, color: 0x888888, alpha: 0.6 });

        // Make wire interactive
        wireGraphics.eventMode = 'static';
        wireGraphics.cursor = 'pointer';
        wireGraphics.on('pointerdown', () => {
            this.onWireClick(wireGeometry);
        });

        // Add LOD metadata
        (wireGraphics as any).userData = { type: 'wire' };

        tileContainer.addChild(wireGraphics);
    }

    private createLowLodWire(lowLodWire: any, tileContainer: Container, isOverlay: boolean): void {
        const wireRect = new Graphics();
        wireRect.rect(0, 0, lowLodWire.width, lowLodWire.height);
        
        if (isOverlay) {
            wireRect.fill({ color: 0x444444, alpha: 0.3 });
        } else {
            wireRect.fill(0x333333);
        }
        wireRect.stroke({ width: 0.5, color: 0x666666, alpha: 0.4 });
        
        wireRect.x = lowLodWire.relX;
        wireRect.y = lowLodWire.relY;

        // Add LOD metadata
        (wireRect as any).userData = { type: 'lowLodWire' };

        tileContainer.addChild(wireRect);
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
        // Generate consistent color based on tile name hash
        let hash = 0;
        for (let i = 0; i < tileName.length; i++) {
            const char = tileName.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Convert hash to HSL color
        const hue = Math.abs(hash) % 360;
        const saturation = 70;
        const lightness = 60;

        return this.hslToHex(hue, saturation, lightness);
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
        this.fabricContainer.destroy({ children: true });
        this.designContainer.destroy({ children: true });
        this.viewport.destroy({ children: true });
    }
}
