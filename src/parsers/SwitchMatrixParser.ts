/**
 * SwitchMatrixParser.ts
 * 
 * Parses switch matrix CSV files to extract routing configuration data.
 * These CSV files define the programmable connections within switch matrices.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SwitchMatrixWireGeometry, SwitchMatrixConnection, Location } from '../types/geometry';

export interface SwitchMatrixConfiguration {
    connections: SwitchMatrixConnection[];
    wireGeometries: SwitchMatrixWireGeometry[];
}

export class SwitchMatrixParser {
    
    /**
     * Parse a switch matrix CSV file to extract routing configuration
     */
    public static async parseSwitchMatrixCSV(csvFilePath: string): Promise<SwitchMatrixConfiguration | null> {
        try {
            if (!fs.existsSync(csvFilePath)) {
                console.warn(`Switch matrix CSV file not found: ${csvFilePath}`);
                return null;
            }

            const content = fs.readFileSync(csvFilePath, 'utf-8');
            return this.parseCSVContent(content, csvFilePath);
        } catch (error) {
            console.error(`Error parsing switch matrix CSV file ${csvFilePath}:`, error);
            return null;
        }
    }

    /** Synchronous variant used to guarantee wiring before rendering */
    public static parseSwitchMatrixCSVSync(csvFilePath: string): SwitchMatrixConfiguration | null {
        try {
            if (!fs.existsSync(csvFilePath)) { return null; }
            const content = fs.readFileSync(csvFilePath, 'utf-8');
            return this.parseCSVContent(content, csvFilePath);
        } catch {
            return null; }
    }

    private static parseCSVContent(content: string, filePath: string): SwitchMatrixConfiguration {
        const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        const connections: SwitchMatrixConnection[] = [];
        const wireGeometries: SwitchMatrixWireGeometry[] = [];
        
        let parsingMode: 'connections' | 'wires' | 'unknown' = 'unknown';
        
        // 1) First try to parse the common "matrix" format used by FABulous demos
        //    Header row lists all destination ports, each subsequent row begins with a
        //    source port followed by 0/1 flags per destination, possibly ending with
        //    a trailing "#,N" count column.
        const matrixParsed = this.tryParseMatrixFormat(lines);
        if (matrixParsed) {
            return matrixParsed;
        }
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Detect section headers
            if (trimmedLine.toLowerCase().includes('connection') || trimmedLine.toLowerCase().includes('routing')) {
                parsingMode = 'connections';
                continue;
            } else if (trimmedLine.toLowerCase().includes('wire') || trimmedLine.toLowerCase().includes('geometry')) {
                parsingMode = 'wires';
                continue;
            }
            
            const tokens = this.parseCSVLine(trimmedLine);
            if (tokens.length < 2) { continue; }
            
            try {
                if (parsingMode === 'connections') {
                    const connection = this.parseConnectionLine(tokens);
                    if (connection) {
                        connections.push(connection);
                    }
                } else if (parsingMode === 'wires') {
                    const wireGeometry = this.parseWireGeometryLine(tokens);
                    if (wireGeometry) {
                        wireGeometries.push(wireGeometry);
                    }
                } else {
                    // Try to auto-detect based on line structure
                    if (tokens.length >= 2 && this.looksLikeConnection(tokens)) {
                        const connection = this.parseConnectionLine(tokens);
                        if (connection) {
                            connections.push(connection);
                        }
                    } else if (tokens.length >= 4 && this.looksLikeWireGeometry(tokens)) {
                        const wireGeometry = this.parseWireGeometryLine(tokens);
                        if (wireGeometry) {
                            wireGeometries.push(wireGeometry);
                        }
                    }
                }
            } catch (error) {
                console.warn(`Error parsing line in ${path.basename(filePath)}: "${trimmedLine}"`, error);
            }
        }
        
        // If no explicit wire geometries, generate them from connections
        if (wireGeometries.length === 0 && connections.length > 0) {
            console.log(`Generating wire geometries from ${connections.length} connections`);
            for (const connection of connections) {
                const wireGeom = this.generateWireGeometryFromConnection(connection);
                if (wireGeom) {
                    wireGeometries.push(wireGeom);
                }
            }
        }
        
        console.log(`Parsed switch matrix CSV: ${connections.length} connections, ${wireGeometries.length} wire geometries`);
        
        return {
            connections,
            wireGeometries
        };
    }

    /**
     * Attempt to parse a matrix-style switch matrix CSV.
     * Returns null if the format doesn't match.
     */
    private static tryParseMatrixFormat(lines: string[]): SwitchMatrixConfiguration | null {
        if (lines.length < 2) { return null; }

        const headerTokens = this.parseCSVLine(lines[0]);
        // Heuristic: header must have many columns and mostly non-numeric labels
        const nonNumericCount = headerTokens.filter(t => !this.isNumeric(t) && t !== '#').length;
        if (headerTokens.length < 5 || nonNumericCount < Math.max(3, Math.floor(headerTokens.length * 0.3))) {
            return null; // doesn't look like a port header
        }

        // First token can be a tile name (e.g. RegFile). Treat the rest as destination ports.
    const destPorts = headerTokens.slice(1).filter(t => t && t !== '#');
        if (destPorts.length === 0) { return null; }

        const connections: SwitchMatrixConnection[] = [];

        for (let i = 1; i < lines.length; i++) {
            const tokens = this.parseCSVLine(lines[i]);
            if (tokens.length < 2) { continue; }

            const sourcePort = tokens[0];
            // Skip rows that don't look like a source label
            if (!sourcePort || this.isNumeric(sourcePort)) { continue; }

            // Iterate across the row. Column j corresponds to destPorts[j-1]
            for (let j = 1; j < tokens.length; j++) {
                const v = tokens[j];
        if (v === '1' || v === 'true' || v === 'TRUE') {
                    const destIdx = j - 1;
                    if (destIdx >= 0 && destIdx < destPorts.length) {
            const raw = destPorts[destIdx];
            const destPort = (raw || '').trim();
                        if (destPort && !this.isNumeric(destPort) && destPort !== '#') {
                            connections.push({ sourcePort, destPort });
                        }
                    }
                }
            }
        }

        if (connections.length === 0) { return null; }

        // Generate placeholder wire geometries which will be resolved to actual port coordinates later
        const wireGeometries: SwitchMatrixWireGeometry[] = connections.map(c => this.generateWireGeometryFromConnection(c)!)
            .filter(Boolean) as SwitchMatrixWireGeometry[];

        return { connections, wireGeometries };
    }

    private static parseConnectionLine(tokens: string[]): SwitchMatrixConnection | null {
        if (tokens.length < 2) { return null; }
        
        const sourcePort = tokens[0].trim();
        const destPort = tokens[1].trim();
        
    if (!sourcePort || !destPort) { return null; }
        
        // Check for optional path coordinates
        let customPath: Location[] | undefined;
        if (tokens.length >= 4) {
            try {
                customPath = [];
                for (let i = 2; i < tokens.length; i += 2) {
                    if (i + 1 < tokens.length) {
                        const x = parseFloat(tokens[i]);
                        const y = parseFloat(tokens[i + 1]);
                        if (!isNaN(x) && !isNaN(y)) {
                            customPath.push({ x, y });
                        }
                    }
                }
            } catch (error) {
                // If path parsing fails, use default routing
                customPath = undefined;
            }
        }
        
        return {
            sourcePort,
            destPort,
            customPath
        };
    }

    private static parseWireGeometryLine(tokens: string[]): SwitchMatrixWireGeometry | null {
        if (tokens.length < 6) { return null; } // name, source, dest, x1, y1, x2, y2 at minimum
        
        try {
            const name = tokens[0].trim();
            const sourcePort = tokens[1].trim();
            const destPort = tokens[2].trim();
            
            const path: Location[] = [];
            for (let i = 3; i < tokens.length; i += 2) {
                if (i + 1 < tokens.length) {
                    const x = parseFloat(tokens[i]);
                    const y = parseFloat(tokens[i + 1]);
                    if (!isNaN(x) && !isNaN(y)) {
                        path.push({ x, y });
                    }
                }
            }
            
            if (path.length < 2 || !name || !sourcePort || !destPort) {
                return null;
            }
            
            return {
                name,
                sourcePort,
                destPort,
                path
            };
        } catch (error) {
            return null;
        }
    }

    private static looksLikeConnection(tokens: string[]): boolean {
        // Connection lines typically have 2-4 tokens: source, dest, [optional coordinates]
        if (tokens.length < 2) { return false; }
        
        // First two tokens should be port names (strings)
        const sourcePort = tokens[0].trim();
        const destPort = tokens[1].trim();
        
        return sourcePort.length > 0 && destPort.length > 0 && 
               !this.isNumeric(sourcePort) && !this.isNumeric(destPort);
    }

    private static looksLikeWireGeometry(tokens: string[]): boolean {
        // Wire geometry lines have name, source, dest, then coordinate pairs
        if (tokens.length < 6) { return false; }
        
        // Check if latter tokens are numeric (coordinates)
        for (let i = 3; i < Math.min(7, tokens.length); i++) {
            if (!this.isNumeric(tokens[i].trim())) {
                return false;
            }
        }
        
        return true;
    }

    private static isNumeric(str: string): boolean {
        return !isNaN(parseFloat(str)) && isFinite(parseFloat(str));
    }

    private static generateWireGeometryFromConnection(connection: SwitchMatrixConnection): SwitchMatrixWireGeometry | null {
        // Use custom path if available, otherwise create simple point-to-point connection
        let path: Location[];
        
        if (connection.customPath && connection.customPath.length >= 2) {
            path = [...connection.customPath];
        } else {
            // Create a simple direct connection - coordinates will be resolved later by renderer
            path = [
                { x: 0, y: 0 }, // Will be replaced with actual source port position
                { x: 0, y: 0 }  // Will be replaced with actual dest port position
            ];
        }
        
        return {
            name: `${connection.sourcePort}_to_${connection.destPort}`,
            sourcePort: connection.sourcePort,
            destPort: connection.destPort,
            path
        };
    }

    private static parseCSVLine(line: string): string[] {
        const tokens: string[] = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                tokens.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        tokens.push(current.trim());
        return tokens.filter(token => token.length > 0);
    }
}