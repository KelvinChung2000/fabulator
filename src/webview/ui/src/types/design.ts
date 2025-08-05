/**
 * Frontend types for design data - mirrors backend design types but optimized for webview
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
    /** Map from location key (X0Y1) to list of connected ports at that location */
    connectivityMap: Record<string, ConnectedPorts[]>;
    /** Map from net name to Net object containing all routing information */
    netMap: Record<string, Net>;
}

export interface DesignStatistics {
    totalNets: number;
    nonEmptyNets: number;
    totalConnections: number;
    usedTiles: number;
    longestNet: string;
    averageNetLength: number;
}

export interface DesignData {
    bitstreamConfig: BitstreamConfiguration;
    statistics: DesignStatistics;
    filePath: string;
}

/**
 * Utility functions for working with design data in the frontend
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
        return Object.values(config.netMap);
    }

    /**
     * Get all unique tile locations used in the design
     */
    public static getUsedTileLocations(config: BitstreamConfiguration): DiscreteLocation[] {
        const locations: DiscreteLocation[] = [];
        for (const locationKey of Object.keys(config.connectivityMap)) {
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

    /**
     * Get nets sorted by length (number of connections)
     */
    public static getNetsSortedByLength(config: BitstreamConfiguration): Net[] {
        return this.getAllNets(config).sort((a, b) => b.entries.length - a.entries.length);
    }

    /**
     * Filter nets by name pattern
     */
    public static filterNetsByName(config: BitstreamConfiguration, pattern: string): Net[] {
        const regex = new RegExp(pattern, 'i');
        return this.getAllNets(config).filter(net => regex.test(net.name));
    }

    /**
     * Get connections at a specific tile location
     */
    public static getConnectionsAtLocation(config: BitstreamConfiguration, location: DiscreteLocation): ConnectedPorts[] {
        const locationKey = this.discreteLocationToString(location);
        return config.connectivityMap[locationKey] || [];
    }

    /**
     * Check if a tile location is used in the design
     */
    public static isTileUsed(config: BitstreamConfiguration, location: DiscreteLocation): boolean {
        const locationKey = this.discreteLocationToString(location);
        return locationKey in config.connectivityMap;
    }

    /**
     * Get nets that pass through a specific tile location
     */
    public static getNetsAtLocation(config: BitstreamConfiguration, location: DiscreteLocation): Net[] {
        const nets: Net[] = [];
        for (const net of this.getAllNets(config)) {
            const hasLocation = net.entries.some(entry => 
                entry.location.x === location.x && entry.location.y === location.y
            );
            if (hasLocation) {
                nets.push(net);
            }
        }
        return nets;
    }
}
