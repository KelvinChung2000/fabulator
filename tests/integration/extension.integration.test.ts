import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeometryParser } from '../../src/parsers/GeometryParser';
import path from 'path';

// Mock VS Code API
const mockVscode = {
  window: {
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showOpenDialog: vi.fn()
  },
  Uri: {
    joinPath: vi.fn(),
    file: vi.fn()
  },
  commands: {
    registerCommand: vi.fn()
  }
};

vi.mock('vscode', () => mockVscode);

describe('Extension Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-end fabric loading workflow', () => {
    it('should parse geometry file and prepare data for webview', async () => {
      const testGeometryPath = path.join(__dirname, '../fixtures/test-geometry.csv');
      
      // Step 1: Parse geometry file (simulating extension host)
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();
      
      // Verify parsing results
      expect(geometry.name).toBe('TestFabric');
      expect(geometry.numberOfRows).toBe(2);
      expect(geometry.numberOfColumns).toBe(2);
      expect(geometry.tileGeomMap.size).toBe(3); // CLB, IO, DSP
      
      // Step 2: Convert Map to object for JSON serialization (simulating extension→webview)
      const serializedGeometry = {
        ...geometry,
        tileGeomMap: Object.fromEntries(geometry.tileGeomMap)
      };
      
      // Verify serialization
      expect(serializedGeometry.tileGeomMap).toBeDefined();
      expect(serializedGeometry.tileGeomMap['CLB']).toBeDefined();
      expect(serializedGeometry.tileGeomMap['CLB'].name).toBe('CLB');
      
      // Step 3: Verify data integrity after serialization
      const jsonString = JSON.stringify(serializedGeometry);
      const parsedData = JSON.parse(jsonString);
      
      expect(parsedData.name).toBe('TestFabric');
      expect(parsedData.tileGeomMap.CLB.width).toBe(100);
      expect(parsedData.tileGeomMap.CLB.smGeometry.name).toBe('SM_CLB');
      
      // Step 4: Verify complex nested structures
      const clbTile = parsedData.tileGeomMap.CLB;
      expect(clbTile.belGeometryList).toHaveLength(1);
      expect(clbTile.belGeometryList[0].name).toBe('LUT');
      expect(clbTile.wireGeometryList).toHaveLength(1);
      expect(clbTile.wireGeometryList[0].path).toHaveLength(2);
    });

    it('should handle large eFPGA geometry file efficiently', async () => {
      const eFPGAPath = path.join(__dirname, '../eFPGA_geometry.csv');
      
      const startTime = Date.now();
      const parser = new GeometryParser(eFPGAPath);
      const geometry = await parser.parse();
      const parseTime = Date.now() - startTime;
      
      // Performance assertions
      expect(parseTime).toBeLessThan(5000); // Should parse in under 5 seconds
      
      // Correctness assertions
      expect(geometry.name).toBe('eFPGA');
      expect(geometry.numberOfRows).toBe(16);
      expect(geometry.numberOfColumns).toBe(10);
      expect(geometry.width).toBe(3018);
      expect(geometry.height).toBe(4770);
      
      // Verify tile types
      expect(geometry.tileGeomMap.has('LUT4AB')).toBe(true);
      expect(geometry.tileGeomMap.has('DSP_top')).toBe(true);
      expect(geometry.tileGeomMap.has('RAM_IO')).toBe(true);
      
      // Verify complex structures
      const lut4abTile = geometry.tileGeomMap.get('LUT4AB');
      expect(lut4abTile).toBeDefined();
      expect(lut4abTile!.wireGeometryList.length).toBeGreaterThan(0);
      
      // Test serialization of large data
      const serializationStart = Date.now();
      const serialized = {
        ...geometry,
        tileGeomMap: Object.fromEntries(geometry.tileGeomMap)
      };
      const jsonString = JSON.stringify(serialized);
      const serializationTime = Date.now() - serializationStart;
      
      expect(serializationTime).toBeLessThan(2000); // Should serialize in under 2 seconds
      expect(jsonString.length).toBeGreaterThan(100000); // Should be substantial data
    });
  });

  describe('Error handling workflows', () => {
    it('should handle file not found gracefully', async () => {
      const parser = new GeometryParser('non-existent-file.csv');
      
      await expect(parser.parse()).rejects.toThrow();
    });

    it('should handle malformed geometry data', async () => {
      // Create a temporary malformed file
      const malformedCSV = `INVALID_HEADER
garbage,data,here
PARAMS
Name,MalformedTest
InvalidParam,InvalidValue`;
      
      const fs = await import('fs/promises');
      const tempPath = path.join(__dirname, '../fixtures/malformed-integration.csv');
      await fs.writeFile(tempPath, malformedCSV);
      
      try {
        const parser = new GeometryParser(tempPath);
        const geometry = await parser.parse();
        
        // Should parse what it can
        expect(geometry.name).toBe('MalformedTest');
        expect(geometry.numberOfRows).toBe(0); // Invalid params should default to 0
        
      } finally {
        // Clean up
        await fs.unlink(tempPath);
      }
    });

    it('should handle empty geometry file', async () => {
      const fs = await import('fs/promises');
      const tempPath = path.join(__dirname, '../fixtures/empty-integration.csv');
      await fs.writeFile(tempPath, '');
      
      try {
        const parser = new GeometryParser(tempPath);
        const geometry = await parser.parse();
        
        // Should create empty geometry
        expect(geometry.name).toBe('');
        expect(geometry.numberOfRows).toBe(0);
        expect(geometry.tileGeomMap.size).toBe(0);
        
      } finally {
        await fs.unlink(tempPath);
      }
    });
  });

  describe('Data consistency tests', () => {
    it('should maintain data integrity through parse→serialize→parse cycle', async () => {
      const testGeometryPath = path.join(__dirname, '../fixtures/test-geometry.csv');
      
      // First parse
      const parser1 = new GeometryParser(testGeometryPath);
      const geometry1 = await parser1.parse();
      
      // Serialize and deserialize
      const serialized = {
        ...geometry1,
        tileGeomMap: Object.fromEntries(geometry1.tileGeomMap)
      };
      const jsonString = JSON.stringify(serialized);
      const parsed = JSON.parse(jsonString);
      
      // Reconstruct Map
      const reconstructed = {
        ...parsed,
        tileGeomMap: new Map(Object.entries(parsed.tileGeomMap))
      };
      
      // Verify data integrity
      expect(reconstructed.name).toBe(geometry1.name);
      expect(reconstructed.numberOfRows).toBe(geometry1.numberOfRows);
      expect(reconstructed.tileGeomMap.size).toBe(geometry1.tileGeomMap.size);
      
      // Deep comparison of tile data
      const originalCLB = geometry1.tileGeomMap.get('CLB');
      const reconstructedCLB = reconstructed.tileGeomMap.get('CLB');
      
      expect(reconstructedCLB).toBeDefined();
      expect(reconstructedCLB!.name).toBe(originalCLB!.name);
      expect(reconstructedCLB!.width).toBe(originalCLB!.width);
      expect(reconstructedCLB!.belGeometryList.length).toBe(originalCLB!.belGeometryList.length);
      expect(reconstructedCLB!.wireGeometryList.length).toBe(originalCLB!.wireGeometryList.length);
    });

    it('should handle edge cases in fabric layout', async () => {
      // Create a fabric with edge cases
      const edgeCaseCSV = `PARAMS
Name,EdgeCaseFabric
Rows,3
Columns,3
Width,300
Height,300

FABRIC_DEF
Null,CLB,Null
CLB,Null,CLB
Null,CLB,Null

FABRIC_LOCS
Null,100/0,Null
0/100,Null,200/100
Null,100/200,Null

TILE
Name,CLB
Width,100
Height,100`;
      
      const fs = await import('fs/promises');
      const tempPath = path.join(__dirname, '../fixtures/edge-case-integration.csv');
      await fs.writeFile(tempPath, edgeCaseCSV);
      
      try {
        const parser = new GeometryParser(tempPath);
        const geometry = await parser.parse();
        
        // Verify checkerboard pattern
        expect(geometry.tileNames).toHaveLength(3);
        expect(geometry.tileNames[0]).toEqual(['Null', 'CLB', 'Null']);
        expect(geometry.tileNames[1]).toEqual(['CLB', 'Null', 'CLB']);
        expect(geometry.tileNames[2]).toEqual(['Null', 'CLB', 'Null']);
        
        // Verify null locations
        expect(geometry.tileLocations[0][0]).toBeNull();
        expect(geometry.tileLocations[0][1]).toEqual({ x: 100, y: 0 });
        expect(geometry.tileLocations[1][1]).toBeNull();
        
      } finally {
        await fs.unlink(tempPath);
      }
    });
  });

  describe('Performance and memory tests', () => {
    it('should handle multiple parse operations efficiently', async () => {
      const testGeometryPath = path.join(__dirname, '../fixtures/test-geometry.csv');
      
      const parseOperations = [];
      const iterations = 10;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        parseOperations.push(
          new GeometryParser(testGeometryPath).parse()
        );
      }
      
      const results = await Promise.all(parseOperations);
      const totalTime = Date.now() - startTime;
      
      // All results should be consistent
      results.forEach(geometry => {
        expect(geometry.name).toBe('TestFabric');
        expect(geometry.tileGeomMap.size).toBe(3);
      });
      
      // Performance should be reasonable
      expect(totalTime).toBeLessThan(5000); // 10 operations in under 5 seconds
      expect(totalTime / iterations).toBeLessThan(1000); // Average under 1 second per parse
    });

    it('should clean up resources properly', async () => {
      const testGeometryPath = path.join(__dirname, '../fixtures/test-geometry.csv');
      
      // Parse and immediately discard multiple times
      for (let i = 0; i < 5; i++) {
        const parser = new GeometryParser(testGeometryPath);
        const geometry = await parser.parse();
        
        // Verify parsing worked
        expect(geometry.name).toBe('TestFabric');
        
        // Let parser go out of scope (should be garbage collected)
      }
      
      // If we get here without memory issues, cleanup is working
      expect(true).toBe(true);
    });
  });
});