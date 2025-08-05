import { describe, it, expect, beforeEach } from 'vitest';
import { FasmParser } from '../src/parsers/FasmParser';
import { DesignUtils } from '../src/types/design';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FasmParser', () => {
    const testDataDir = path.join(__dirname, '../test/fixtures');
    const testFasmPath = path.join(testDataDir, 'test_design.fasm');

    beforeEach(async () => {
        // Create test directory if it doesn't exist
        try {
            await fs.access(testDataDir);
        } catch {
            await fs.mkdir(testDataDir, { recursive: true });
        }

        // Create test FASM file
        const testFasmContent = `# routing for net 'test_net_1'
X0Y1.test_port_1.test_port_2
X0Y1.test_port_2.test_port_3
X2Y1.test_port_1.test_port_4
X0Y3.test_port_5.test_port_7

# routing for net 'test_net_2'

# routing for net 'test_net_3'
X11Y1.test_port_4.test_port_1
X7Y13.test_port7.test_port_6
`;
        await fs.writeFile(testFasmPath, testFasmContent);
    });

    describe('FASM file parsing', () => {
        it('should parse complete FASM file correctly', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();

            // Check nets
            expect(config.netMap.size).toBe(3);
            expect(config.netMap.has('test_net_1')).toBe(true);
            expect(config.netMap.has('test_net_2')).toBe(true);
            expect(config.netMap.has('test_net_3')).toBe(true);
        });

        it('should parse net entries correctly', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();

            const net1 = config.netMap.get('test_net_1')!;
            expect(net1.entries).toHaveLength(4);
            
            // Check first entry
            expect(net1.entries[0].location).toEqual({ x: 0, y: 1 });
            expect(net1.entries[0].ports).toEqual({ 
                portA: 'test_port_1', 
                portB: 'test_port_2' 
            });

            // Check that net_2 is empty
            const net2 = config.netMap.get('test_net_2')!;
            expect(net2.entries).toHaveLength(0);

            // Check net_3
            const net3 = config.netMap.get('test_net_3')!;
            expect(net3.entries).toHaveLength(2);
        });

        it('should build connectivity map correctly', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();

            // Check X0Y1 has multiple connections (should be 2 based on test data)
            const x0y1Connections = config.connectivityMap.get('X0Y1');
            expect(x0y1Connections).toBeDefined();
            expect(x0y1Connections!).toHaveLength(2); // Updated expectation

            // Check X11Y1 has one connection
            const x11y1Connections = config.connectivityMap.get('X11Y1');
            expect(x11y1Connections).toBeDefined();
            expect(x11y1Connections!).toHaveLength(1);
        });
    });

    describe('Location parsing', () => {
        it('should parse discrete locations correctly', () => {
            expect(DesignUtils.parseDiscreteLocation('X0Y1')).toEqual({ x: 0, y: 1 });
            expect(DesignUtils.parseDiscreteLocation('X123Y456')).toEqual({ x: 123, y: 456 });
        });

        it('should handle invalid location formats', () => {
            expect(() => DesignUtils.parseDiscreteLocation('invalid')).toThrow();
            expect(() => DesignUtils.parseDiscreteLocation('X1')).toThrow();
            expect(() => DesignUtils.parseDiscreteLocation('Y1')).toThrow();
        });

        it('should convert locations to strings correctly', () => {
            expect(DesignUtils.discreteLocationToString({ x: 0, y: 1 })).toBe('X0Y1');
            expect(DesignUtils.discreteLocationToString({ x: 123, y: 456 })).toBe('X123Y456');
        });
    });

    describe('File validation', () => {
        it('should validate correct FASM files', async () => {
            const isValid = await FasmParser.validateFasmFile(testFasmPath);
            expect(isValid).toBe(true);
        });

        it('should reject invalid files', async () => {
            const invalidPath = path.join(testDataDir, 'invalid.fasm');
            await fs.writeFile(invalidPath, 'This is not a FASM file\\nNo routing information here');
            
            const isValid = await FasmParser.validateFasmFile(invalidPath);
            expect(isValid).toBe(false);
        });

        it('should handle non-existent files gracefully', async () => {
            const isValid = await FasmParser.validateFasmFile('non-existent.fasm');
            expect(isValid).toBe(false);
        });
    });

    describe('Statistics generation', () => {
        it('should generate correct statistics', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();
            const stats = parser.getStatistics(config);

            expect(stats.totalNets).toBe(3);
            expect(stats.nonEmptyNets).toBe(2); // net_2 is empty
            expect(stats.totalConnections).toBe(6); // 4 + 0 + 2
            expect(stats.usedTiles).toBe(5); // X0Y1, X2Y1, X0Y3, X11Y1, X7Y13
            expect(stats.longestNet).toBe('test_net_1');
            expect(stats.averageNetLength).toBe(3); // 6 connections / 2 non-empty nets
        });
    });

    describe('Error handling', () => {
        it('should handle malformed routing entries', async () => {
            const malformedFasm = path.join(testDataDir, 'malformed.fasm');
            await fs.writeFile(malformedFasm, `# routing for net 'test'
X0Y1.port_only_two_parts
X0Y1.too.many.parts.here
INVALID_LOCATION.port1.port2
X0Y1.port1.INIT_SKIP_THIS
`);

            const parser = new FasmParser(malformedFasm);
            // Should not throw, but skip invalid entries
            const config = await parser.parse();
            const net = config.netMap.get('test')!;
            expect(net.entries).toHaveLength(0); // All entries should be skipped
        });

        it('should throw on routing without net name', async () => {
            const invalidFasm = path.join(testDataDir, 'no-net.fasm');
            await fs.writeFile(invalidFasm, 'X0Y1.port1.port2\\n');

            const parser = new FasmParser(invalidFasm);
            await expect(parser.parse()).rejects.toThrow('Routing entry found without a net name');
        });

        it('should throw on non-existent file', async () => {
            const parser = new FasmParser('non-existent.fasm');
            await expect(parser.parse()).rejects.toThrow('Failed to parse FASM file');
        });
    });

    describe('Utility functions', () => {
        it('should get all nets correctly', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();
            const nets = DesignUtils.getAllNets(config);

            expect(nets).toHaveLength(3);
            expect(nets.map(n => n.name).sort()).toEqual(['test_net_1', 'test_net_2', 'test_net_3']);
        });

        it('should get used tile locations correctly', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();
            const locations = DesignUtils.getUsedTileLocations(config);

            expect(locations).toHaveLength(5);
            expect(locations).toContainEqual({ x: 0, y: 1 });
            expect(locations).toContainEqual({ x: 2, y: 1 });
            expect(locations).toContainEqual({ x: 0, y: 3 });
            expect(locations).toContainEqual({ x: 11, y: 1 });
            expect(locations).toContainEqual({ x: 7, y: 13 });
        });

        it('should identify empty nets correctly', async () => {
            const parser = new FasmParser(testFasmPath);
            const config = await parser.parse();
            
            const net1 = config.netMap.get('test_net_1')!;
            const net2 = config.netMap.get('test_net_2')!;
            
            expect(DesignUtils.isNetEmpty(net1)).toBe(false);
            expect(DesignUtils.isNetEmpty(net2)).toBe(true);
        });
    });
});
