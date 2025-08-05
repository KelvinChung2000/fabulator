/**
 * TypeScript definitions for FASM design data structures
 * Equivalent to Java BitstreamConfiguration, Net, and related classes
 */

export interface DiscreteLocation {
    x: number;
    y: number;
}

export interface ConnectedPorts {
    portA: string;
    portB: string;
}

export interface NetEntry {
    location: DiscreteLocation;
    ports: ConnectedPorts;
}

export interface Net {
    name: string;
    entries: NetEntry[];
}

export interface BitstreamConfiguration {
    /** Map from tile location to list of connected ports at that location */
    connectivityMap: Map<string, ConnectedPorts[]>;
    /** Map from net name to Net object containing all routing information */
    netMap: Map<string, Net>;
}

export class BitstreamConfigurationBuilder {
    private connectivityMap: Map<string, ConnectedPorts[]> = new Map();
    private netMap: Map<string, Net> = new Map();

    public addNet(netName: string): void {
        if (!this.netMap.has(netName)) {
            this.netMap.set(netName, {
                name: netName,
                entries: []
            });
        }
    }

    public addEntry(netName: string, location: DiscreteLocation, portA: string, portB: string): void {
        const locationKey = `X${location.x}Y${location.y}`;
        const ports: ConnectedPorts = { portA, portB };

        // Add to connectivity map
        if (!this.connectivityMap.has(locationKey)) {
            this.connectivityMap.set(locationKey, []);
        }
        this.connectivityMap.get(locationKey)!.push(ports);

        // Add to net map
        const net = this.netMap.get(netName);
        if (net) {
            net.entries.push({
                location,
                ports
            });
        }
    }

    public build(): BitstreamConfiguration {
        return {
            connectivityMap: this.connectivityMap,
            netMap: this.netMap
        };
    }

    public static empty(): BitstreamConfiguration {
        return {
            connectivityMap: new Map(),
            netMap: new Map()
        };
    }
}

/**
 * Utility functions for working with design data
 */
export class DesignUtils {
    /**
     * Parse discrete location from string format "X0Y1"
     */
    public static parseDiscreteLocation(locationStr: string): DiscreteLocation {
        const match = locationStr.match(/X(\d+)Y(\d+)/);
        if (!match) {
            throw new Error(`Invalid location format: ${locationStr}`);
        }
        return {
            x: parseInt(match[1], 10),
            y: parseInt(match[2], 10)
        };
    }

    /**
     * Convert discrete location to string format "X0Y1"
     */
    public static discreteLocationToString(location: DiscreteLocation): string {
        return `X${location.x}Y${location.y}`;
    }

    /**
     * Get all nets from a bitstream configuration
     */
    public static getAllNets(config: BitstreamConfiguration): Net[] {
        return Array.from(config.netMap.values());
    }

    /**
     * Get all unique tile locations used in the design
     */
    public static getUsedTileLocations(config: BitstreamConfiguration): DiscreteLocation[] {
        const locations: DiscreteLocation[] = [];
        for (const locationKey of config.connectivityMap.keys()) {
            locations.push(this.parseDiscreteLocation(locationKey));
        }
        return locations;
    }

    /**
     * Check if a net is empty (has no routing entries)
     */
    public static isNetEmpty(net: Net): boolean {
        return net.entries.length === 0;
    }
}
