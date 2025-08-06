import * as vscode from 'vscode';
import * as path from 'path';
import { FabricGeometry, TileGeometry, BelGeometry, SwitchMatrixGeometry, PortGeometry, WireGeometry } from '../types/geometry';
import { DesignData, ConnectedPorts } from '../webview/ui/src/types/design';
import { GeometryParser } from '../parsers/GeometryParser';
import { FasmParser } from '../parsers/FasmParser';

// Tree item types for filtering and context menus
export type TreeItemType = 'fabric' | 'section' | 'tile' | 'bel' | 'switchMatrix' | 'port' | 'wire' | 'net' | 'connection';

export interface FabricElementData {
    type: TreeItemType;
    name: string;
    position?: { x: number; y: number };
    tileLocation?: { x: number; y: number };
    description?: string;
    children?: FabricElementData[];
}

export class FabricTreeItem extends vscode.TreeItem {
    constructor(
        public readonly data: FabricElementData,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(data.name, collapsibleState);

        this.tooltip = data.description || data.name;
        this.contextValue = data.type;

        // Set appropriate icons
        switch (data.type) {
            case 'fabric':
                this.iconPath = new vscode.ThemeIcon('circuit-board');
                break;
            case 'section':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'tile':
                this.iconPath = new vscode.ThemeIcon('grid-view');
                this.description = data.position ? `(${data.position.x}, ${data.position.y})` : '';
                break;
            case 'bel':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
            case 'switchMatrix':
                this.iconPath = new vscode.ThemeIcon('type-hierarchy');
                break;
            case 'port':
                this.iconPath = new vscode.ThemeIcon('plug');
                break;
            case 'wire':
                this.iconPath = new vscode.ThemeIcon('symbol-interface');
                break;
            case 'net':
                this.iconPath = new vscode.ThemeIcon('git-branch');
                break;
            case 'connection':
                this.iconPath = new vscode.ThemeIcon('arrow-right');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('symbol-misc');
        }

        // Make elements clickable for highlighting
        if (['tile', 'bel', 'switchMatrix', 'port', 'wire', 'net'].includes(data.type)) {
            this.command = {
                command: 'fabulator.highlightElement',
                title: 'Highlight in Viewer',
                arguments: [data]
            };
        }
    }
}

export class FabricExplorerProvider implements vscode.TreeDataProvider<FabricElementData> {
    private _onDidChangeTreeData: vscode.EventEmitter<FabricElementData | undefined | null | void> = new vscode.EventEmitter<FabricElementData | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FabricElementData | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentGeometry: FabricGeometry | null = null;
    private currentDesign: DesignData | null = null;
    private currentFabricFile: string | null = null;
    private treeData: FabricElementData[] = [];
    private searchFilter: string = '';

    constructor(private context: vscode.ExtensionContext) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setSearchFilter(filter: string): void {
        this.searchFilter = filter.toLowerCase();
        this.buildTreeData();
        this.refresh();
    }

    async loadFabricFile(filePath: string): Promise<void> {
        try {
            this.currentFabricFile = filePath;
            const parser = new GeometryParser(filePath);
            this.currentGeometry = await parser.parse();
            this.buildTreeData();
            this.refresh();

            vscode.window.showInformationMessage(`Loaded fabric: ${path.basename(filePath)}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load fabric file: ${error}`);
            console.error('Error loading fabric file:', error);
        }
    }

    async loadDesignFile(filePath: string): Promise<void> {
        try {
            if (!this.currentGeometry) {
                vscode.window.showWarningMessage('Please load a fabric file first before loading a design.');
                return;
            }

            const parser = new FasmParser(filePath);
            const bitstreamConfig = await parser.parse();
            const statistics = parser.getStatistics(bitstreamConfig);
            
            this.currentDesign = {
                bitstreamConfig: {
                    connectivityMap: Object.fromEntries(bitstreamConfig.connectivityMap),
                    netMap: Object.fromEntries(bitstreamConfig.netMap)
                },
                statistics,
                filePath
            };
            this.buildTreeData();
            this.refresh();

            vscode.window.showInformationMessage(`Loaded design: ${path.basename(filePath)}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load design file: ${error}`);
            console.error('Error loading design file:', error);
        }
    }

    private buildTreeData(): void {
        this.treeData = [];

        if (!this.currentGeometry) {
            this.treeData.push({
                type: 'section',
                name: 'No fabric loaded',
                description: 'Use the file icon to select a fabric CSV file',
                children: []
            });
            return;
        }

        // Add fabric info section
        const fabricInfo: FabricElementData = {
            type: 'fabric',
            name: this.currentGeometry.name || 'Unnamed Fabric',
            description: `${this.currentGeometry.numberOfColumns}×${this.currentGeometry.numberOfRows} fabric`,
            children: [
                {
                    type: 'section',
                    name: `Dimensions: ${this.currentGeometry.width}×${this.currentGeometry.height}`,
                    description: 'Fabric physical dimensions'
                },
                {
                    type: 'section',
                    name: `Tiles: ${this.currentGeometry.numberOfColumns}×${this.currentGeometry.numberOfRows}`,
                    description: 'Tile grid dimensions'
                },
                {
                    type: 'section',
                    name: `Tile Types: ${Object.keys(this.currentGeometry.tileGeomMap).length}`,
                    description: 'Number of unique tile types'
                }
            ]
        };
        this.treeData.push(fabricInfo);

        // Add tiles section
        const tilesSection = this.buildTilesSection();
        if (tilesSection) {
            this.treeData.push(tilesSection);
        }

        // Add tile types section
        const tileTypesSection = this.buildTileTypesSection();
        if (tileTypesSection) {
            this.treeData.push(tileTypesSection);
        }

        // Add design section if loaded
        if (this.currentDesign) {
            const designSection = this.buildDesignSection();
            if (designSection) {
                this.treeData.push(designSection);
            }
        }
    }

    private buildTilesSection(): FabricElementData | null {
        if (!this.currentGeometry) return null;

        const { tileNames, tileLocations, tileGeomMap } = this.currentGeometry;
        const tiles: FabricElementData[] = [];

        // Build flat list of all tiles for better searchability
        for (let y = 0; y < tileNames.length; y++) {
            for (let x = 0; x < tileNames[y].length; x++) {
                const tileName = tileNames[y][x];
                const tileLocation = tileLocations[y][x];

                if (tileName && tileLocation) {
                    const tileGeometry = tileGeomMap.get ? tileGeomMap.get(tileName) : (tileGeomMap as any)[tileName];
                    if (tileGeometry && this.matchesSearchFilter(tileName)) {
                        tiles.push({
                            type: 'tile',
                            name: `${tileName} [${x},${y}]`,
                            position: { x, y },
                            tileLocation: { x: tileLocation.x, y: tileLocation.y },
                            description: `Tile at grid position (${x}, ${y}), physical position (${tileLocation.x.toFixed(1)}, ${tileLocation.y.toFixed(1)})`
                        });
                    }
                }
            }
        }

        return {
            type: 'section',
            name: `Tiles (${tiles.length})`,
            description: 'All tiles in the fabric',
            children: tiles
        };
    }

    private buildTileTypesSection(): FabricElementData | null {
        if (!this.currentGeometry) return null;

        const { tileGeomMap } = this.currentGeometry;
        const tileTypes: FabricElementData[] = [];

        // Handle both Map and plain object types
        const entries = tileGeomMap.entries ? Array.from(tileGeomMap.entries()) : Object.entries(tileGeomMap);
        
        for (const [tileName, tileGeometry] of entries) {
            if (!this.matchesSearchFilter(tileName)) continue;

            const children: FabricElementData[] = [];

            // Add BELs
            if (tileGeometry.belGeometryList.length > 0) {
                const bels: FabricElementData[] = tileGeometry.belGeometryList
                    .filter((bel: BelGeometry) => this.matchesSearchFilter(bel.name))
                    .map((bel: BelGeometry) => ({
                        type: 'bel' as TreeItemType,
                        name: bel.name,
                        description: `BEL at (${bel.relX}, ${bel.relY})`,
                        children: bel.portGeometryList.map((port: PortGeometry) => ({
                            type: 'port' as TreeItemType,
                            name: port.name,
                            description: `Port: ${port.io || 'Unknown'} at (${port.relX}, ${port.relY})`
                        }))
                    }));

                if (bels.length > 0) {
                    children.push({
                        type: 'section',
                        name: `BELs (${bels.length})`,
                        description: 'Basic Elements (BELs) in this tile type',
                        children: bels
                    });
                }
            }

            // Add Switch Matrix
            if (tileGeometry.smGeometry) {
                const smChildren: FabricElementData[] = [];
                
                // Add SM ports
                if (tileGeometry.smGeometry.portGeometryList.length > 0) {
                    smChildren.push({
                        type: 'section',
                        name: `Ports (${tileGeometry.smGeometry.portGeometryList.length})`,
                        description: 'Switch matrix ports',
                        children: tileGeometry.smGeometry.portGeometryList.map((port: PortGeometry) => ({
                            type: 'port' as TreeItemType,
                            name: port.name,
                            description: `${port.io || 'Unknown'} port at (${port.relX}, ${port.relY})`
                        }))
                    });
                }

                // Add jump ports
                if (tileGeometry.smGeometry.jumpPortGeometryList.length > 0) {
                    smChildren.push({
                        type: 'section',
                        name: `Jump Ports (${tileGeometry.smGeometry.jumpPortGeometryList.length})`,
                        description: 'Switch matrix jump ports',
                        children: tileGeometry.smGeometry.jumpPortGeometryList.map((port: PortGeometry) => ({
                            type: 'port' as TreeItemType,
                            name: port.name,
                            description: `Jump port at (${port.relX}, ${port.relY})`
                        }))
                    });
                }

                children.push({
                    type: 'switchMatrix',
                    name: tileGeometry.smGeometry.name || 'Switch Matrix',
                    description: `Switch matrix at (${tileGeometry.smGeometry.relX}, ${tileGeometry.smGeometry.relY})`,
                    children: smChildren
                });
            }

            // Add Wires
            if (tileGeometry.wireGeometryList.length > 0) {
                const wires: FabricElementData[] = tileGeometry.wireGeometryList
                    .filter((wire: WireGeometry) => this.matchesSearchFilter(wire.name))
                    .map((wire: WireGeometry) => ({
                        type: 'wire' as TreeItemType,
                        name: wire.name,
                        description: `Wire with ${wire.path.length} segments`
                    }));

                if (wires.length > 0) {
                    children.push({
                        type: 'section',
                        name: `Wires (${wires.length})`,
                        description: 'Wires in this tile type',
                        children: wires
                    });
                }
            }

            tileTypes.push({
                type: 'section',
                name: tileName,
                description: `Tile type: ${tileGeometry.width}×${tileGeometry.height}`,
                children: children
            });
        }

        return {
            type: 'section',
            name: `Tile Types (${tileTypes.length})`,
            description: 'All tile types in the fabric',
            children: tileTypes
        };
    }

    private buildDesignSection(): FabricElementData | null {
        if (!this.currentDesign) return null;

        const { bitstreamConfig, statistics } = this.currentDesign;
        const children: FabricElementData[] = [];

        // Add statistics
        children.push({
            type: 'section',
            name: `Statistics`,
            description: 'Design statistics',
            children: [
                {
                    type: 'section',
                    name: `Total Nets: ${statistics.totalNets}`,
                    description: 'Number of nets in the design'
                },
                {
                    type: 'section',
                    name: `Total Connections: ${statistics.totalConnections}`,
                    description: 'Number of connections in the design'
                },
                {
                    type: 'section',
                    name: `Used Tiles: ${statistics.usedTiles}`,
                    description: 'Number of tiles with connections'
                }
            ]
        });

        // Add nets
        const nets: FabricElementData[] = [];
        for (const [netName, connections] of Object.entries(bitstreamConfig.connectivityMap)) {
            if (!this.matchesSearchFilter(netName)) continue;

            const connectionsArray = connections as ConnectedPorts[];
            const netConnections: FabricElementData[] = connectionsArray.map((conn: ConnectedPorts, index: number) => ({
                type: 'connection' as TreeItemType,
                name: `${conn.portA} → ${conn.portB}`,
                description: `Connection ${index + 1} in net ${netName}`
            }));

            nets.push({
                type: 'net',
                name: netName,
                description: `Net with ${connectionsArray.length} connections`,
                children: netConnections
            });
        }

        if (nets.length > 0) {
            children.push({
                type: 'section',
                name: `Nets (${nets.length})`,
                description: 'All nets in the design',
                children: nets
            });
        }

        return {
            type: 'section',
            name: `Design: ${path.basename(this.currentDesign.filePath)}`,
            description: 'Loaded design information',
            children: children
        };
    }

    private matchesSearchFilter(text: string): boolean {
        if (!this.searchFilter) return true;
        return text.toLowerCase().includes(this.searchFilter);
    }

    getTreeItem(element: FabricElementData): vscode.TreeItem {
        const hasChildren = element.children && element.children.length > 0;
        const collapsibleState = hasChildren 
            ? vscode.TreeItemCollapsibleState.Collapsed 
            : vscode.TreeItemCollapsibleState.None;

        return new FabricTreeItem(element, collapsibleState);
    }

    getChildren(element?: FabricElementData): Thenable<FabricElementData[]> {
        if (!element) {
            // Root level
            return Promise.resolve(this.treeData);
        }

        // Return children if they exist
        return Promise.resolve(element.children || []);
    }

    getCurrentGeometry(): FabricGeometry | null {
        return this.currentGeometry;
    }

    getCurrentDesign(): DesignData | null {
        return this.currentDesign;
    }

    getCurrentFabricFile(): string | null {
        return this.currentFabricFile;
    }
}