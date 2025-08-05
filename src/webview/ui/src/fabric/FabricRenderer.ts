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
    
    // Event callbacks
    private onViewportChangeCallback?: (bounds: { x: number, y: number, width: number, height: number }, zoom: number) => void;ication, Graphics, Container, Sprite, FederatedPointerEvent } from 'pixi.js';
import { FabricGeometry, TileGeometry, Location, WireGeometry } from '../types/geometry';
import { DesignData, DesignUtils, DiscreteLocation, ConnectedPorts } from '../types/design';

export class FabricRenderer {
    private app: Application;
    private fabricContainer: Container;
    private designContainer: Container;
    private tileContainers: Container[][] = [];
    private currentGeometry: FabricGeometry | null = null;
    private currentDesign: DesignData | null = null;
    private zoomLevel: number = 1;
    private viewportBounds: { x: number, y: number, width: number, height: number } = { x: 0, y: 0, width: 0, height: 0 };

    constructor(app: Application) {
        this.app = app;
        this.fabricContainer = new Container();
        this.designContainer = new Container();
        this.app.stage.addChild(this.fabricContainer);
        this.app.stage.addChild(this.designContainer);
    }

    public loadFabric(geometry: FabricGeometry): void {
        this.currentGeometry = geometry;
        this.clearFabric();
        this.buildFabric();
        this.centerFabric();
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

        tileContainer.addChild(wireGraphics);
    }

    private createLowLodWire(lowLodWire: any, tileContainer: Container, isOverlay: boolean): void {
        const wireRect = new Graphics();
        wireRect.rect(0, 0, lowLodWire.width, lowLodWire.height);
        
        if (isOverlay) {
            wireRect.fill(0x5a5a5a);
            wireRect.stroke({ width: 1, color: 0x5a5a5a });
        } else {
            wireRect.fill(0x323232);
            wireRect.stroke({ width: 1, color: 0x323232 });
        }
        
        wireRect.x = lowLodWire.relX;
        wireRect.y = lowLodWire.relY;

        tileContainer.addChild(wireRect);
    }

    private getTileColor(tileName: string): number {
        // Simple hash-based color generation
        let hash = 0;
        for (let i = 0; i < tileName.length; i++) {
            hash = tileName.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Generate a color with good contrast
        const hue = Math.abs(hash) % 360;
        return this.hslToHex(hue, 30, 25); // Low saturation, dark
    }

    private getPortColor(port: any): number {
        if (port.io === 'I') {
            return 0x4CAF50; // Green for input
        } else if (port.io === 'O') {
            return 0xF44336; // Red for output
        }
        return 0xFFEB3B; // Yellow for unknown
    }

    private hslToHex(h: number, s: number, l: number): number {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = (n: number) => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color);
        };
        return (f(0) << 16) | (f(8) << 8) | f(4);
    }

    private centerFabric(): void {
        if (!this.currentGeometry) return;

        const screenWidth = this.app.screen.width;
        const screenHeight = this.app.screen.height;
        const fabricWidth = this.currentGeometry.width;
        const fabricHeight = this.currentGeometry.height;

        // Fit fabric to screen with padding
        const scaleX = (screenWidth * 0.8) / fabricWidth;
        const scaleY = (screenHeight * 0.8) / fabricHeight;
        const scale = Math.min(scaleX, scaleY, 0.5); // Limit max scale for large fabrics

        this.fabricContainer.scale.set(scale);
        
        // Center the scaled fabric
        this.fabricContainer.x = (screenWidth - fabricWidth * scale) / 2;
        this.fabricContainer.y = (screenHeight - fabricHeight * scale) / 2;

        console.log(`Fabric centered: ${fabricWidth}x${fabricHeight} at scale ${scale.toFixed(3)}`);
    }

    public updateLod(zoomLevel: number, viewportBounds: any): void {
        this.zoomLevel = zoomLevel;
        this.viewportBounds = viewportBounds;
        
        // TODO: Implement LOD system based on zoom level
        // For now, show everything
    }

    public destroy(): void {
        this.fabricContainer.destroy({ children: true });
        this.designContainer.destroy({ children: true });
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
}