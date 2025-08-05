import * as fs from 'fs/promises';
import { 
    BitstreamConfiguration, 
    BitstreamConfigurationBuilder, 
    DiscreteLocation, 
    DesignUtils 
} from '../types/design';

/**
 * Parses FASM (FABulous Assembly) files to extract bitstream configuration and routing information.
 * 
 * FASM format example:
 * # routing for net 'net_name'
 * X0Y1.port_a.port_b
 * X2Y3.port_c.port_d
 * 
 * This parser extracts:
 * - Net names from comments
 * - Tile locations (X0Y1 format)
 * - Connected port pairs
 */
export class FasmParser {
    private filePath: string;
    private currentNetName: string = '';
    private configBuilder: BitstreamConfigurationBuilder;

    constructor(filePath: string) {
        this.filePath = filePath;
        this.configBuilder = new BitstreamConfigurationBuilder();
    }

    /**
     * Parse the FASM file and return the bitstream configuration
     */
    public async parse(): Promise<BitstreamConfiguration> {
        try {
            const fileContent = await fs.readFile(this.filePath, 'utf-8');
            const lines = fileContent.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    this.processLine(line, i + 1);
                }
            }

            return this.configBuilder.build();
        } catch (error) {
            throw new Error(`Failed to parse FASM file '${this.filePath}': ${error}`);
        }
    }

    /**
     * Process a single line from the FASM file
     */
    private processLine(line: string, lineNumber: number): void {
        try {
            if (line.startsWith('#')) {
                this.processComment(line);
                return;
            }

            // Skip empty lines and lines that don't contain routing information
            if (!line.includes('.')) {
                return;
            }

            this.processRoutingEntry(line);
        } catch (error) {
            throw new Error(`Error processing line ${lineNumber}: ${line}. ${error}`);
        }
    }

    /**
     * Process comment lines to extract net names
     */
    private processComment(line: string): void {
        if (line.includes('net')) {
            // Extract net name from comment like "# routing for net 'net_name'"
            const netMatch = line.match(/net\s+'([^']+)'/);
            if (netMatch) {
                this.currentNetName = netMatch[1];
                this.configBuilder.addNet(this.currentNetName);
            }
        }
    }

    /**
     * Process routing entries like "X0Y1.port_a.port_b"
     */
    private processRoutingEntry(line: string): void {
        const parts = line.split('.');
        
        // Valid routing entry should have exactly 3 parts: location.portA.portB
        if (parts.length !== 3) {
            // Skip invalid lines (like INIT entries or malformed entries)
            return;
        }

        const [locationStr, portA, portB] = parts;

        // Skip INIT entries (configuration bits, not routing)
        if (portB.startsWith('INIT')) {
            return;
        }

        try {
            const location = DesignUtils.parseDiscreteLocation(locationStr);
            
            if (!this.currentNetName) {
                throw new Error(`Routing entry found without a net name: ${line}`);
            }

            this.configBuilder.addEntry(this.currentNetName, location, portA, portB);
        } catch (error) {
            throw new Error(`Invalid location format '${locationStr}': ${error}`);
        }
    }

    /**
     * Validate FASM file format by checking for required elements
     */
    public static async validateFasmFile(filePath: string): Promise<boolean> {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            const lines = fileContent.split('\n');

            let hasNetComment = false;
            let hasRoutingEntry = false;

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.includes('# routing for net')) {
                    hasNetComment = true;
                }
                if (trimmedLine.match(/^X\d+Y\d+\.[^.]+\.[^.]+$/)) {
                    hasRoutingEntry = true;
                }
                if (hasNetComment && hasRoutingEntry) {
                    return true;
                }
            }

            return hasNetComment || hasRoutingEntry; // Accept files with at least one indicator
        } catch (error) {
            return false;
        }
    }

    /**
     * Get basic statistics about the parsed FASM file
     */
    public getStatistics(config: BitstreamConfiguration): FasmStatistics {
        const nets = DesignUtils.getAllNets(config);
        const usedTiles = DesignUtils.getUsedTileLocations(config);
        
        let totalConnections = 0;
        for (const net of nets) {
            totalConnections += net.entries.length;
        }

        const nonEmptyNets = nets.filter(net => !DesignUtils.isNetEmpty(net));

        return {
            totalNets: nets.length,
            nonEmptyNets: nonEmptyNets.length,
            totalConnections,
            usedTiles: usedTiles.length,
            longestNet: this.findLongestNet(nets),
            averageNetLength: nonEmptyNets.length > 0 ? totalConnections / nonEmptyNets.length : 0
        };
    }

    private findLongestNet(nets: any[]): string {
        let longestNetName = '';
        let maxLength = 0;

        for (const net of nets) {
            if (net.entries.length > maxLength) {
                maxLength = net.entries.length;
                longestNetName = net.name;
            }
        }

        return longestNetName;
    }
}

/**
 * Statistics about a parsed FASM file
 */
export interface FasmStatistics {
    totalNets: number;
    nonEmptyNets: number;
    totalConnections: number;
    usedTiles: number;
    longestNet: string;
    averageNetLength: number;
}
