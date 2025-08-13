/**
 * DesignRenderer.ts
 * 
 * Handles rendering of design overlays on top of the fabric structure.
 * This includes:
 * - Design routing connections (red wires from FASM files)
 * - Net visualization and highlighting
 * - Connection path rendering between switch matrix ports
 */

import { Graphics, Container } from 'pixi.js';
import { FabricDataShape } from '../types/FabricData';
import { DesignData, DesignUtils, DiscreteLocation, ConnectedPorts } from '../types/design';
import { 
    WIRE_CONSTANTS,
    simpleHash,
    DEBUG_CONSTANTS
} from './FabricConstants';

export type DesignConnectionClickCallback = (ports: ConnectedPorts, location: DiscreteLocation) => void;

export class DesignRenderer {
    private designContainer: Container;
    private tileContainers: Container[][] = [];
    private currentGeometry: FabricDataShape | null = null;
    private currentDesign: DesignData | null = null;
    
    // Event callbacks
    private onDesignConnectionClickCallback?: DesignConnectionClickCallback;

    constructor(designContainer: Container) {
        this.designContainer = designContainer;
    }

    // =============================================================================
    // INITIALIZATION
    // =============================================================================

    public initializeForGeometry(geometry: FabricDataShape, tileContainers: Container[][]): void {
        this.currentGeometry = geometry;
        this.tileContainers = tileContainers;
    }

    // =============================================================================
    // DESIGN LOADING AND BUILDING
    // =============================================================================

    public buildDesignOverlay(designData: DesignData): void {
        console.log(`🎯 BUILDING DESIGN OVERLAY: ${designData.filePath}`);
        console.log('Design data structure:', designData);
        
        this.currentDesign = designData;
        this.clearDesign();
        
        if (!this.currentGeometry) {
            console.error('❌ No geometry available - cannot build design overlay');
            return;
        }

        console.log('✅ Building design overlay with geometry and design data');
        
        // Process each location that has connections
        designData.config.connectivityMap.forEach((connectedPortsList, locationStr) => {
            console.log(`🔗 Processing location: ${locationStr} with ${connectedPortsList.length} connections`);
            
            try {
                const location = DesignUtils.parseDiscreteLocation(locationStr);
                this.displayBitstreamConfigAtTile(location, connectedPortsList);
            } catch (error) {
                console.error(`❌ Failed to parse location ${locationStr}:`, error);
            }
        });

        console.log('✅ Design overlay build complete');
    }

    public clearDesign(): void {
        this.designContainer.removeChildren();
        this.currentDesign = null;
    }

    // =============================================================================
    // BITSTREAM CONFIGURATION DISPLAY
    // =============================================================================

    private displayBitstreamConfigAtTile(location: DiscreteLocation, connectedPortsList: ConnectedPorts[]): void {
        const tileContainer = this.getTileContainer(location);
        if (!tileContainer) {
            console.warn(`⚠️  No tile container found for location X${location.x}Y${location.y}`);
            return;
        }

        console.log(`🎯 Displaying ${connectedPortsList.length} connections at X${location.x}Y${location.y}`);
        
        // Create design connections for each connected ports pair
        for (const ports of connectedPortsList) {
            this.createDesignConnection(tileContainer, ports, location);
        }
    }

    private createDesignConnection(tileContainer: Container, ports: ConnectedPorts, location: DiscreteLocation): void {
        console.log(`🔗 Creating connection: ${ports.portA} ↔ ${ports.portB} at X${location.x}Y${location.y}`);
        
        // Find the switch matrix container within the tile
        const switchMatrixContainer = this.findSwitchMatrixContainer(tileContainer);
        if (!switchMatrixContainer) {
            console.warn(`⚠️  No switch matrix container found in tile at X${location.x}Y${location.y}`);
            return;
        }

        // Find port positions within the switch matrix
        const portAPos = this.findPortPosition(switchMatrixContainer, ports.portA);
        const portBPos = this.findPortPosition(switchMatrixContainer, ports.portB);

        if (!portAPos || !portBPos) {
            console.warn(`⚠️  Could not find positions for ports ${ports.portA} or ${ports.portB}`);
            return;
        }

        // Create the connection line
        const connectionLine = new Graphics();
        
        // Convert local port positions to tile-relative positions
        const globalPortAPos = {
            x: switchMatrixContainer.x + portAPos.x,
            y: switchMatrixContainer.y + portAPos.y
        };
        const globalPortBPos = {
            x: switchMatrixContainer.x + portBPos.x,
            y: switchMatrixContainer.y + portBPos.y
        };

        connectionLine.moveTo(globalPortAPos.x, globalPortAPos.y);
        connectionLine.lineTo(globalPortBPos.x, globalPortBPos.y);
        
        // Calculate dynamic wire width based on zoom or use default
        const wireWidth = this.calculateDesignWireWidth();
        
        connectionLine.stroke({ 
            width: wireWidth, 
            color: WIRE_CONSTANTS.DESIGN_COLOR, // Red color matching JavaFX userDesignColor
            alpha: WIRE_CONSTANTS.DESIGN_ALPHA 
        });

        // Make interactive
        connectionLine.eventMode = 'static';
        connectionLine.cursor = 'pointer';
        connectionLine.on('click', () => this.onDesignConnectionClick(ports, location));

        // Add connection hash for identification
        const connectionHash = this.generateConnectionHash(ports, location);
        (connectionLine as any).userData = { 
            type: 'designConnection', 
            ports: ports, 
            location: location,
            hash: connectionHash 
        };

        // Add to tile container (not design container to keep it with the tile)
        tileContainer.addChild(connectionLine);
        
        console.log(`✅ Created design connection from (${globalPortAPos.x}, ${globalPortAPos.y}) to (${globalPortBPos.x}, ${globalPortBPos.y})`);
    }

    // =============================================================================
    // PORT AND CONTAINER FINDING
    // =============================================================================

    private getTileContainer(location: DiscreteLocation): Container | null {
        if (!this.tileContainers.length) return null;
        
        // Check bounds
        if (location.y < 0 || location.y >= this.tileContainers.length ||
            location.x < 0 || location.x >= this.tileContainers[location.y].length) {
            return null;
        }
        
        return this.tileContainers[location.y][location.x];
    }

    private findSwitchMatrixContainer(tileContainer: Container): Container | null {
        // Find the switch matrix container within the tile
        for (const child of tileContainer.children) {
            if (child.userData && child.userData.type === 'switchMatrix') {
                return child as Container;
            }
        }
        return null;
    }

    private findPortPosition(switchMatrixContainer: Container, portName: string): { x: number, y: number } | null {
        // Search through all children of the switch matrix to find the named port
        for (const child of switchMatrixContainer.children) {
            if (child.userData && child.userData.type === 'port') {
                const port = child.userData.port;
                if (port && port.name === portName) {
                    return { x: port.relX, y: port.relY };
                }
            }
        }
        
        console.warn(`⚠️  Port ${portName} not found in switch matrix`);
        return null;
    }

    // =============================================================================
    // UTILITY METHODS
    // =============================================================================

    private calculateDesignWireWidth(): number {
        // For now, return default width
        // This could be enhanced to scale based on zoom level
        return WIRE_CONSTANTS.DEFAULT_WIDTH * 2; // Slightly thicker than internal wires
    }

    private generateConnectionHash(ports: ConnectedPorts, location: DiscreteLocation): number {
        const hashString = `${location.x}_${location.y}_${ports.portA}_${ports.portB}`;
        return simpleHash(hashString);
    }

    // =============================================================================
    // NET MANAGEMENT
    // =============================================================================

    public highlightNet(netName: string): void {
        if (!this.currentDesign) return;
        
        const net = this.currentDesign.config.netMap.get(netName);
        if (!net) {
            console.warn(`Net ${netName} not found`);
            return;
        }

        console.log(`Highlighting net: ${netName} with ${net.entries.length} connections`);
        
        // Find and highlight all connections belonging to this net
        this.designContainer.children.forEach(child => {
            if (child.userData && 
                child.userData.type === 'designConnection' && 
                child.userData.netName === netName) {
                
                const graphics = child as Graphics;
                graphics.tint = 0x00FF00; // Highlight in green
            }
        });
    }

    public unHighlightAllNets(): void {
        this.designContainer.children.forEach(child => {
            if (child.userData && child.userData.type === 'designConnection') {
                const graphics = child as Graphics;
                graphics.tint = 0xFFFFFF; // Reset to normal color
            }
        });
    }

    // =============================================================================
    // STATISTICS AND INFO
    // =============================================================================

    public getDesignStatistics(): any {
        if (!this.currentDesign) return null;
        
        const stats = DesignUtils.generateStatistics(this.currentDesign.config);
        return {
            ...stats,
            renderTime: Date.now(), // Could track actual render time
            visibleConnections: this.getVisibleConnectionCount()
        };
    }

    private getVisibleConnectionCount(): number {
        let count = 0;
        this.designContainer.children.forEach(child => {
            if (child.userData && 
                child.userData.type === 'designConnection' && 
                child.visible) {
                count++;
            }
        });
        return count;
    }

    // =============================================================================
    // EVENT CALLBACKS
    // =============================================================================

    public setDesignConnectionClickCallback(callback: DesignConnectionClickCallback): void {
        this.onDesignConnectionClickCallback = callback;
    }

    private onDesignConnectionClick(ports: ConnectedPorts, location: DiscreteLocation): void {
        if (DEBUG_CONSTANTS.LOG_VIEWPORT_EVENTS) {
            console.log(`🖱️ Design connection clicked: ${ports.portA} ↔ ${ports.portB} at X${location.x}Y${location.y}`);
        }
        this.onDesignConnectionClickCallback?.(ports, location);
    }

    // =============================================================================
    // GETTERS
    // =============================================================================

    public getCurrentDesign(): DesignData | null {
        return this.currentDesign;
    }

    public getDesignContainer(): Container {
        return this.designContainer;
    }

    // =============================================================================
    // CLEANUP
    // =============================================================================

    public destroy(): void {
        this.clearDesign();
        this.currentGeometry = null;
        this.currentDesign = null;
        this.tileContainers = [];
    }
}