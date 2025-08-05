import { describe, it, expect } from 'vitest';
import { GeometryParser } from '../src/parsers/GeometryParser';
import { LocationUtils, Side, IO } from '../src/types/geometry';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('GeometryParser', () => {
  const testGeometryPath = path.join(__dirname, '../test/fixtures/test-geometry.csv');

  describe('Location parsing', () => {
    it('should parse x/y format locations correctly', () => {
      const parser = new GeometryParser('dummy');
      const location = (parser as any).parseLocation('123/456');
      
      expect(location.x).toBe(123);
      expect(location.y).toBe(456);
    });

    it('should parse (x,y) format locations as fallback', () => {
      const parser = new GeometryParser('dummy');
      const location = (parser as any).parseLocation('(123,456)');
      
      expect(location.x).toBe(123);
      expect(location.y).toBe(456);
    });

    it('should handle invalid location formats gracefully', () => {
      const parser = new GeometryParser('dummy');
      const location = (parser as any).parseLocation('invalid');
      
      expect(location.x).toBe(0);
      expect(location.y).toBe(0);
    });
  });

  describe('CSV parsing', () => {
    it('should parse complete geometry file correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      // Verify basic parameters
      expect(geometry.name).toBe('TestFabric');
      expect(geometry.numberOfRows).toBe(2);
      expect(geometry.numberOfColumns).toBe(2);
      expect(geometry.width).toBe(200);
      expect(geometry.height).toBe(200);
      expect(geometry.numberOfLines).toBe(10);
    });

    it('should parse fabric definition correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      expect(geometry.tileNames).toHaveLength(2);
      expect(geometry.tileNames[0]).toEqual(['CLB', 'IO']);
      expect(geometry.tileNames[1]).toEqual(['DSP', 'CLB']);
    });

    it('should parse fabric locations correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      expect(geometry.tileLocations).toHaveLength(2);
      expect(geometry.tileLocations[0][0]).toEqual({ x: 0, y: 0 });
      expect(geometry.tileLocations[0][1]).toEqual({ x: 100, y: 0 });
      expect(geometry.tileLocations[1][0]).toEqual({ x: 0, y: 100 });
      expect(geometry.tileLocations[1][1]).toEqual({ x: 100, y: 100 });
    });

    it('should parse tile geometries correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      // Check CLB tile
      const clbTile = geometry.tileGeomMap.get('CLB');
      expect(clbTile).toBeDefined();
      expect(clbTile!.name).toBe('CLB');
      expect(clbTile!.width).toBe(100);
      expect(clbTile!.height).toBe(100);

      // Check IO tile
      const ioTile = geometry.tileGeomMap.get('IO');
      expect(ioTile).toBeDefined();
      expect(ioTile!.name).toBe('IO');
      expect(ioTile!.width).toBe(100);
      expect(ioTile!.height).toBe(100);

      // Check DSP tile
      const dspTile = geometry.tileGeomMap.get('DSP');
      expect(dspTile).toBeDefined();
      expect(dspTile!.name).toBe('DSP');
      expect(dspTile!.width).toBe(100);
      expect(dspTile!.height).toBe(200);
    });

    it('should parse switch matrix geometries correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      const clbTile = geometry.tileGeomMap.get('CLB');
      expect(clbTile!.smGeometry).toBeDefined();
      
      const sm = clbTile!.smGeometry!;
      expect(sm.name).toBe('SM_CLB');
      expect(sm.relX).toBe(10);
      expect(sm.relY).toBe(10);
      expect(sm.width).toBe(80);
      expect(sm.height).toBe(80);
      expect(sm.src).toBe('clb_switch.v');
      expect(sm.csv).toBe('clb_switch.csv');
    });

    it('should parse BEL geometries correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      const clbTile = geometry.tileGeomMap.get('CLB');
      expect(clbTile!.belGeometryList).toHaveLength(1);
      
      const bel = clbTile!.belGeometryList[0];
      expect(bel.name).toBe('LUT');
      expect(bel.relX).toBe(20);
      expect(bel.relY).toBe(20);
      expect(bel.width).toBe(60);
      expect(bel.height).toBe(60);
      expect(bel.src).toBe('lut.v');
    });

    it('should parse port geometries correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      const clbTile = geometry.tileGeomMap.get('CLB');
      const sm = clbTile!.smGeometry!;
      
      // Check switch matrix port
      expect(sm.portGeometryList).toHaveLength(1);
      const smPort = sm.portGeometryList[0];
      expect(smPort.name).toBe('N1');
      expect(smPort.sourceName).toBe('wire_n1');
      expect(smPort.destName).toBe('bel_input');
      expect(smPort.io).toBe(IO.INPUT);
      expect(smPort.side).toBe(Side.NORTH);
      expect(smPort.relX).toBe(40);
      expect(smPort.relY).toBe(0);

      // Check BEL port
      const bel = clbTile!.belGeometryList[0];
      expect(bel.portGeometryList).toHaveLength(1);
      const belPort = bel.portGeometryList[0];
      expect(belPort.name).toBe('A');
      expect(belPort.sourceName).toBe('sm_out');
      expect(belPort.destName).toBe('lut_a');
      expect(belPort.io).toBe(IO.INPUT);
      expect(belPort.relX).toBe(0);
      expect(belPort.relY).toBe(10);
    });

    it('should parse wire geometries correctly', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      const clbTile = geometry.tileGeomMap.get('CLB');
      expect(clbTile!.wireGeometryList).toHaveLength(1);
      
      const wire = clbTile!.wireGeometryList[0];
      expect(wire.name).toBe('wire_n1');
      expect(wire.path).toHaveLength(2);
      expect(wire.path[0]).toEqual({ x: 40, y: 0 });
      expect(wire.path[1]).toEqual({ x: 40, y: 20 });
    });

    it('should generate low LOD routing', async () => {
      const parser = new GeometryParser(testGeometryPath);
      const geometry = await parser.parse();

      const clbTile = geometry.tileGeomMap.get('CLB');
      
      // Low LOD generation should create some rectangles based on wire density
      expect(clbTile!.lowLodWiresGeoms).toBeDefined();
      expect(clbTile!.lowLodOverlays).toBeDefined();
      
      // The arrays might be empty for simple test case, but should be defined
      expect(Array.isArray(clbTile!.lowLodWiresGeoms)).toBe(true);
      expect(Array.isArray(clbTile!.lowLodOverlays)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const parser = new GeometryParser('non-existent-file.csv');
      
      await expect(parser.parse()).rejects.toThrow();
    });

    it('should handle malformed CSV content', async () => {
      // Create a temporary malformed CSV
      const malformedPath = path.join(__dirname, '../test/fixtures/malformed.csv');
      await fs.writeFile(malformedPath, 'INVALID_CONTENT\ngarbage,data');
      
      const parser = new GeometryParser(malformedPath);
      const geometry = await parser.parse();
      
      // Should not crash, but may have empty/default values
      expect(geometry.name).toBe('');
      expect(geometry.numberOfRows).toBe(0);
      
      // Clean up
      await fs.unlink(malformedPath);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty lines in CSV', async () => {
      const csvWithEmptyLines = `PARAMS
Name,EdgeCaseTest


Rows,1
Columns,1

FABRIC_DEF
TestTile

FABRIC_LOCS
0/0`;
      
      const tempPath = path.join(__dirname, '../test/fixtures/empty-lines.csv');
      await fs.writeFile(tempPath, csvWithEmptyLines);
      
      const parser = new GeometryParser(tempPath);
      const geometry = await parser.parse();
      
      expect(geometry.name).toBe('EdgeCaseTest');
      expect(geometry.numberOfRows).toBe(1);
      expect(geometry.numberOfColumns).toBe(1);
      
      // Clean up
      await fs.unlink(tempPath);
    });

    it('should handle Null tiles in fabric definition', async () => {
      const csvWithNulls = `PARAMS
Name,NullTest
Rows,1
Columns,2

FABRIC_DEF
Null,TestTile

FABRIC_LOCS
Null,100/0`;
      
      const tempPath = path.join(__dirname, '../test/fixtures/null-tiles.csv');
      await fs.writeFile(tempPath, csvWithNulls);
      
      const parser = new GeometryParser(tempPath);
      const geometry = await parser.parse();
      
      expect(geometry.tileNames[0]).toEqual(['Null', 'TestTile']);
      expect(geometry.tileLocations[0][0]).toBeNull();
      expect(geometry.tileLocations[0][1]).toEqual({ x: 100, y: 0 });
      
      // Clean up
      await fs.unlink(tempPath);
    });
  });
});

describe('LocationUtils', () => {
  describe('create', () => {
    it('should create location with default values', () => {
      const loc = LocationUtils.create();
      expect(loc.x).toBe(0);
      expect(loc.y).toBe(0);
    });

    it('should create location with specified values', () => {
      const loc = LocationUtils.create(10, 20);
      expect(loc.x).toBe(10);
      expect(loc.y).toBe(20);
    });
  });

  describe('add', () => {
    it('should add two locations and return new location', () => {
      const loc1 = LocationUtils.create(10, 20);
      const loc2 = LocationUtils.create(5, 15);
      const result = LocationUtils.add(loc1, loc2);
      
      expect(result.x).toBe(15);
      expect(result.y).toBe(35);
      expect(loc1.x).toBe(10); // Original should be unchanged
      expect(loc1.y).toBe(20);
    });
  });

  describe('addInPlace', () => {
    it('should add location in place', () => {
      const loc1 = LocationUtils.create(10, 20);
      const loc2 = LocationUtils.create(5, 15);
      
      LocationUtils.addInPlace(loc1, loc2);
      
      expect(loc1.x).toBe(15);
      expect(loc1.y).toBe(35);
    });
  });

  describe('scaleInverse', () => {
    it('should scale location by inverse of value', () => {
      const loc = LocationUtils.create(20, 40);
      LocationUtils.scaleInverse(loc, 2);
      
      expect(loc.x).toBe(10);
      expect(loc.y).toBe(20);
    });
  });

  describe('averageOf', () => {
    it('should calculate average of multiple locations', () => {
      const loc1 = LocationUtils.create(0, 0);
      const loc2 = LocationUtils.create(10, 20);
      const loc3 = LocationUtils.create(20, 40);
      
      const average = LocationUtils.averageOf(loc1, loc2, loc3);
      
      expect(average.x).toBe(10);
      expect(average.y).toBe(20);
    });
  });

  describe('isValid', () => {
    it('should return true for valid locations', () => {
      const loc = LocationUtils.create(10, 20);
      expect(LocationUtils.isValid(loc)).toBe(true);
    });

    it('should return false for locations with NaN values', () => {
      const loc1 = { x: NaN, y: 10 };
      const loc2 = { x: 10, y: NaN };
      const loc3 = { x: NaN, y: NaN };
      
      expect(LocationUtils.isValid(loc1)).toBe(false);
      expect(LocationUtils.isValid(loc2)).toBe(false);
      expect(LocationUtils.isValid(loc3)).toBe(false);
    });
  });

  describe('equals', () => {
    it('should return true for equal locations', () => {
      const loc1 = LocationUtils.create(10, 20);
      const loc2 = LocationUtils.create(10, 20);
      
      expect(LocationUtils.equals(loc1, loc2)).toBe(true);
    });

    it('should return false for different locations', () => {
      const loc1 = LocationUtils.create(10, 20);
      const loc2 = LocationUtils.create(15, 25);
      
      expect(LocationUtils.equals(loc1, loc2)).toBe(false);
    });
  });
});