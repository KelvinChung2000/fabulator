import * as vscode from 'vscode';
import { FabricWebviewProvider } from './webview/FabricWebviewProvider';
import { GeometryParser } from './parsers/GeometryParser';
import { FasmParser } from './parsers/FasmParser';
import { FabricExplorerProvider, FabricElementData } from './sidebar/FabricExplorerProvider';
import { SearchPanel } from './sidebar/SearchPanel';

export function activate(context: vscode.ExtensionContext) {
	console.log('FABulator extension is now active!');

	// Create sidebar providers
	const fabricExplorerProvider = new FabricExplorerProvider(context);
	const searchPanel = new SearchPanel(context.extensionUri);

	// Register sidebar providers
	vscode.window.registerTreeDataProvider('fabulator.fabricExplorer', fabricExplorerProvider);
	vscode.window.registerWebviewViewProvider('fabulator.searchPanel', searchPanel);

	// Connect search panel to fabric explorer
	searchPanel.setSearchCallback((searchTerm: string) => {
		fabricExplorerProvider.setSearchFilter(searchTerm);
	});

	// Keep track of active webview panels
	let currentFabricPanel: vscode.WebviewPanel | undefined = undefined;

	// Helper function to create or show webview panel
	const getOrCreateWebviewPanel = () => {
		if (currentFabricPanel) {
			// If panel exists, bring it to the front
			currentFabricPanel.reveal(vscode.ViewColumn.One);
			return currentFabricPanel;
		}

		// Create new webview panel
		currentFabricPanel = vscode.window.createWebviewPanel(
			'fabulator.fabricView', // Panel type
			'FABulator - Fabric Viewer', // Panel title
			vscode.ViewColumn.One, // Editor column to show the panel in
			{
				enableScripts: true,
				localResourceRoots: [context.extensionUri],
				retainContextWhenHidden: true
			}
		);

		// Set up the webview content
		const provider = new FabricWebviewProvider(context.extensionUri);
		currentFabricPanel.webview.html = provider.getHtmlForWebview(currentFabricPanel.webview);

		// Handle messages from the webview
		currentFabricPanel.webview.onDidReceiveMessage(
			message => {
				console.log('Received message from webview:', message);
				switch (message.type) {
					case 'tileClick':
						vscode.window.showInformationMessage(`Clicked tile: ${message.data.tileName} at (${message.data.x}, ${message.data.y})`);
						break;
					case 'error':
						vscode.window.showErrorMessage(`FABulator Error: ${message.message}`);
						break;
					case 'warning':
						vscode.window.showWarningMessage(`FABulator Warning: ${message.message}`);
						break;
					case 'ready':
						console.log('Webview reported ready');
						break;
					case 'fabricLoaded':
						console.log('Fabric loaded successfully:', message.data);
						break;
					case 'designLoaded':
						console.log('Design loaded successfully:', message.data);
						break;
				}
			},
			undefined,
			context.subscriptions
		);

		// Reset panel reference when disposed
		currentFabricPanel.onDidDispose(
			() => {
				currentFabricPanel = undefined;
			},
			null,
			context.subscriptions
		);

		return currentFabricPanel;
	};

	// Register commands
	const openFabricCommand = vscode.commands.registerCommand('fabulator.openFabric', async () => {
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Open Fabric',
			filters: {
				'CSV files': ['csv'],
				'All files': ['*']
			}
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			try {
				vscode.window.showInformationMessage(`Parsing fabric: ${fileUri[0].fsPath}`);
				
				// Get or create the webview panel
				const panel = getOrCreateWebviewPanel();
				
				const parser = new GeometryParser(fileUri[0].fsPath);
				const geometry = await parser.parse();
				
				// Convert Map to object for JSON serialization
				const geometryData = {
					...geometry,
					tileGeomMap: Object.fromEntries(geometry.tileGeomMap)
				};
				
				// Send data to webview
				panel.webview.postMessage({
					type: 'loadFabric',
					data: geometryData
				});
				
				vscode.window.showInformationMessage(`Successfully loaded fabric: ${geometry.name}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to parse fabric: ${error}`);
				console.error('Fabric parsing error:', error);
			}
		}
	});

	const openDesignCommand = vscode.commands.registerCommand('fabulator.openDesign', async () => {
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Open Design',
			filters: {
				'FASM files': ['fasm'],
				'All files': ['*']
			}
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			try {
				vscode.window.showInformationMessage(`Parsing FASM design: ${fileUri[0].fsPath}`);
				
				// Validate FASM file first
				const isValid = await FasmParser.validateFasmFile(fileUri[0].fsPath);
				if (!isValid) {
					vscode.window.showWarningMessage(`File may not be a valid FASM file: ${fileUri[0].fsPath}`);
				}

				// Get or create the webview panel
				const panel = getOrCreateWebviewPanel();

				const parser = new FasmParser(fileUri[0].fsPath);
				const bitstreamConfig = await parser.parse();
				const statistics = parser.getStatistics(bitstreamConfig);
				
				// Convert Map to object for JSON serialization
				const designData = {
					bitstreamConfig: {
						connectivityMap: Object.fromEntries(bitstreamConfig.connectivityMap),
						netMap: Object.fromEntries(bitstreamConfig.netMap)
					},
					statistics,
					filePath: fileUri[0].fsPath
				};
				
				// Send data to webview
				panel.webview.postMessage({
					type: 'loadDesign',
					data: designData
				});
				
				vscode.window.showInformationMessage(
					`Successfully loaded design: ${statistics.totalNets} nets, ${statistics.totalConnections} connections`
				);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to parse FASM design: ${error}`);
			}
		}
	});

	const helloWorldCommand = vscode.commands.registerCommand('fabulator.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from FABulator!');
	});

	// Sidebar command handlers
	const selectFabricFileCommand = vscode.commands.registerCommand('fabulator.selectFabricFile', async () => {
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Select Fabric File',
			filters: {
				'CSV files': ['csv'],
				'All files': ['*']
			}
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			try {
				// Load into sidebar
				await fabricExplorerProvider.loadFabricFile(fileUri[0].fsPath);

				// Always create/show the main webview panel and load the fabric
				const panel = getOrCreateWebviewPanel();
				
				const parser = new GeometryParser(fileUri[0].fsPath);
				const geometry = await parser.parse();
				
				const geometryData = {
					...geometry,
					tileGeomMap: Object.fromEntries(geometry.tileGeomMap)
				};
				
				panel.webview.postMessage({
					type: 'loadFabric',
					data: geometryData
				});
				
				vscode.window.showInformationMessage(`Successfully loaded fabric: ${geometry.name}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to load fabric file: ${error}`);
			}
		}
	});

	const refreshSidebarCommand = vscode.commands.registerCommand('fabulator.refreshSidebar', () => {
		fabricExplorerProvider.refresh();
		searchPanel.clearSearch();
		vscode.window.showInformationMessage('Sidebar refreshed');
	});

	const highlightElementCommand = vscode.commands.registerCommand('fabulator.highlightElement', async (element: FabricElementData) => {
		console.log('Highlight element:', element);
		
		// Get or create the webview panel
		const panel = getOrCreateWebviewPanel();
		
		// Send highlight message to webview
		panel.webview.postMessage({
			type: 'highlightElement',
			data: element
		});

		// Show info message
		let message = `Highlighting ${element.type}: ${element.name}`;
		if (element.position) {
			message += ` at (${element.position.x}, ${element.position.y})`;
		}
		vscode.window.showInformationMessage(message);
	});

	// Register commands
	context.subscriptions.push(
		openFabricCommand, 
		openDesignCommand, 
		helloWorldCommand,
		selectFabricFileCommand,
		refreshSidebarCommand,
		highlightElementCommand
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
