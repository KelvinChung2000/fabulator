import * as vscode from 'vscode';
import { FabricWebviewProvider } from './webview/FabricWebviewProvider';
import { GeometryParser } from './parsers/GeometryParser';
import { FasmParser } from './parsers/FasmParser';
import { FabricExplorerProvider, FabricElementData } from './sidebar/FabricExplorerProvider';
import { SearchPanel } from './sidebar/SearchPanel';
import { ProjectsProvider } from './sidebar/ProjectsProvider';
import { SynthesisProvider, PlaceRouteProvider } from './sidebar/ImplementationProviders';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
	console.log('FABulator extension is now active!');

	// Attempt auto-start of FABulous if workspace contains a .FABulous directory
	try {
		if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
			for (const folder of vscode.workspace.workspaceFolders) {
				(async () => {
					const fabulousPath = vscode.Uri.joinPath(folder.uri, '.FABulous');
					try {
						await vscode.workspace.fs.stat(fabulousPath);
						const alreadyStarted = context.globalState.get<boolean>('fabulator.fabulousStarted');
						if (!alreadyStarted) {
							startFabulousTerminal(folder.uri.fsPath, context, true);
						}
					} catch { /* ignore missing */ }
				})();
			}
		}
	} catch (e) {
		console.warn('FABulator: auto-start scan failed', e);
	}

	// Create sidebar providers
	const fabricExplorerProvider = new FabricExplorerProvider(context);
	const searchPanel = new SearchPanel(context.extensionUri);
	const projectsProvider = new ProjectsProvider(context);
	const synthesisProvider = new SynthesisProvider(context);
	const placeRouteProvider = new PlaceRouteProvider(context);

	// Register sidebar providers
	vscode.window.registerTreeDataProvider('fabulator.fabricExplorer', fabricExplorerProvider);
	vscode.window.registerWebviewViewProvider('fabulator.searchPanel', searchPanel);
	vscode.window.registerTreeDataProvider('fabulator.projects', projectsProvider);
	vscode.window.registerTreeDataProvider('fabulator.synthesis', synthesisProvider);
	vscode.window.registerTreeDataProvider('fabulator.placeRoute', placeRouteProvider);

	// Connect search panel to fabric explorer
	searchPanel.setSearchCallback((searchTerm: string) => {
		console.log('Extension received search term from SearchPanel:', searchTerm);
		fabricExplorerProvider.setSearchFilter(searchTerm);
	});
	console.log('Search callback connected between SearchPanel and FabricExplorerProvider');

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

	// Output channels
	const synthChannel = vscode.window.createOutputChannel('FABulous Synthesis');
	const prChannel = vscode.window.createOutputChannel('FABulous Place&Route');

	function readProjectEnv(projectPath: string): Record<string,string> {
		try {
			const envPath = path.join(projectPath, '.FABulous', '.env');
			if (fs.existsSync(envPath)) {
				const content = fs.readFileSync(envPath, 'utf8');
				const lines = content.split(/\r?\n/);
				const map: Record<string,string> = {};
				for (const l of lines) {
					const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
					if (m) { map[m[1]] = m[2].replace(/^"|"$/g,''); }
				}
				return map;
			}
		} catch {}
		return {};
	}

	function resolveToolPath(kind: 'synthesis' | 'placeRoute' | 'fabulous', projectPath?: string): string {
		const cfg = vscode.workspace.getConfiguration();
		const priority = cfg.get<string>('fabulator.toolPath.priority', 'projectEnvFirst');
		const extPath = kind === 'synthesis' ? cfg.get<string>('fabulator.toolPath.synthesis') : kind === 'placeRoute' ? cfg.get<string>('fabulator.toolPath.placeRoute') : cfg.get<string>('fabulator.toolPath.fabulous');
		const projEnv = projectPath ? readProjectEnv(projectPath) : {};
		const envValue = projEnv['FABULOUS_BIN'] || projEnv['FABULOUS_PATH'];
		const system = 'FABulous';
		const map: Record<string,(string|undefined)[]> = {
			projectEnvFirst: [envValue, extPath, system],
			extensionConfigFirst: [extPath, envValue, system],
			systemEnvFirst: [system, envValue, extPath]
		};
		const order = map[priority] || map.projectEnvFirst;
		for (const candidate of order) {
			if (candidate && candidate.trim().length > 0) { return candidate; }
		}
		return system;
	}

	function spawnStreaming(kind: 'SYNTH' | 'P&R', toolPath: string, args: string[], cwd: string, extraEnv: Record<string,string>) {
		const cfg = vscode.workspace.getConfiguration();
		const showProgress = cfg.get<boolean>('fabulator.progress.notifications', true);
		const channel = kind === 'SYNTH' ? synthChannel : prChannel;
		const run = () => {
			channel.show(true);
			channel.appendLine(`[${kind}] CMD: ${toolPath} ${args.join(' ')}`);
			const child = spawn(toolPath, args, { cwd, shell: false, env: { ...process.env, ...extraEnv } });
			let closed = false;
			child.stdout.on('data', d => channel.append(new TextDecoder().decode(d)));
			child.stderr.on('data', d => channel.append(new TextDecoder().decode(d)));
			child.on('close', code => { closed = true; channel.appendLine(`\n[${kind}] Process exited with code ${code}`); });
			child.on('error', err => channel.appendLine(`\n[${kind}] Error: ${err.message}`));
			return child;
		};
		if (!showProgress) { run(); return; }
		vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `${kind === 'SYNTH' ? 'Synthesis' : 'Place & Route'} running...`, cancellable: true }, (progress, token) => {
			return new Promise<void>(resolve => {
				const child = run();
				token.onCancellationRequested(() => {
					try { child.kill(); channel.appendLine(`\n[${kind}] Cancel requested by user.`); } catch {}
					resolve();
				});
				child.on('close', () => resolve());
			});
		});
	}
	const openFabricCommand = vscode.commands.registerCommand('fabulator.openFabric', async () => {
        const lastDir = context.globalState.get<string>('fabulator.lastFabricDir');
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Open Fabric',
			filters: {
				'CSV files': ['csv'],
				'All files': ['*']
			},
            defaultUri: lastDir ? vscode.Uri.file(lastDir) : undefined
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			// Remember directory
			context.globalState.update('fabulator.lastFabricDir', vscode.Uri.joinPath(fileUri[0], '..').fsPath);
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

	// Helper to start FABulous in an integrated terminal
	function startFabulousTerminal(projectPath: string, ctx: vscode.ExtensionContext, auto: boolean = false) {
		// Always create a fresh terminal. Increment an index for readability.
		const baseName = 'FABulous';
		const existingFabTerms = vscode.window.terminals.filter(t => t.name.startsWith(baseName));
		const index = existingFabTerms.length + 1;
		const termName = existingFabTerms.length === 0 ? baseName : `${baseName} (${index})`;
		const terminal = vscode.window.createTerminal({ name: termName, cwd: projectPath });
		terminal.show();
		// Provide user feedback
		if (auto) {
			vscode.window.showInformationMessage(`FABulous project detected. Starting FABulous CLI in new terminal (cwd: ${projectPath}).`);
		} else {
			vscode.window.showInformationMessage(`Starting FABulous CLI in new terminal (cwd: ${projectPath}).`);
		}
		// Send command to terminal including project path as first argument
		// Assumes FABulous is available on PATH. Quotes handle spaces in path.
		const quotedPath = projectPath.includes(' ') ? `"${projectPath}"` : projectPath;
		terminal.sendText(`FABulous ${quotedPath}`);
		ctx.globalState.update('fabulator.fabulousStarted', true);
		return terminal;
	}

	// Command: Start FABulous (manual)
	const startFabulousCommand = vscode.commands.registerCommand('fabulator.startFABulous', async () => {
		// Let user pick a folder; default to first workspace folder
		const selected = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select FABulous Project Directory',
			defaultUri: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri : undefined
		});
		if (!selected || selected.length === 0) { return; }
		startFabulousTerminal(selected[0].fsPath, context, false);
	});

	// Command: Add project path
	const addProjectCommand = vscode.commands.registerCommand('fabulator.addProject', async () => {
		const selected = await vscode.window.showOpenDialog({
			canSelectFiles: false,
			canSelectFolders: true,
			canSelectMany: false,
			openLabel: 'Select FABulous Project Root',
			defaultUri: vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 ? vscode.workspace.workspaceFolders[0].uri : undefined
		});
		if (!selected || selected.length === 0) { return; }
		projectsProvider.addProject(selected[0].fsPath);
		vscode.window.showInformationMessage(`Added project path: ${selected[0].fsPath}`);
	});

	// Geometry auto-detection helper
	async function findGeometryCsv(projectPath: string): Promise<string | undefined> {
		// Strategy: look for files named geometry.csv or eFPGA_geometry.csv in root or demo/ or Fabric/ directories.
		const candidateNames = ['geometry.csv', 'eFPGA_geometry.csv'];
		const candidateDirs = ['', 'demo', 'demo/Fabric', 'Fabric'];
		for (const dir of candidateDirs) {
			for (const name of candidateNames) {
				try {
					const uri = vscode.Uri.file(require('path').join(projectPath, dir, name));
					await vscode.workspace.fs.stat(uri);
					return uri.fsPath;
				} catch { /* continue */ }
			}
		}
		return undefined;
	}

	// Command: Show Fabric smart
	const showFabricCommand = vscode.commands.registerCommand('fabulator.showFabric', async () => {
		const projects = projectsProvider.getProjects();
		if (projects.length === 0) {
			vscode.window.showWarningMessage('No FABulous projects added. Use "FABulator: Add Project Path" first.');
			return;
		}
		let chosen: string | undefined;
		if (projects.length === 1) {
			chosen = projects[0];
		} else {
			const pick = await vscode.window.showQuickPick(projects.map(p => ({ label: require('path').basename(p), description: p, value: p })), { placeHolder: 'Select project to show fabric from' });
			if (!pick) { return; }
			chosen = pick.value;
		}
		if (!chosen) { return; }
		// Auto-detect geometry file
		let geometryPath = await findGeometryCsv(chosen);
		if (!geometryPath) {
			const confirm = await vscode.window.showWarningMessage('Geometry CSV not auto-detected. Select manually?', 'Select File', 'Cancel');
			if (confirm === 'Select File') {
				const open = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Select Geometry CSV', filters: { 'CSV files': ['csv'] } });
				if (!open || open.length === 0) { return; }
				geometryPath = open[0].fsPath;
			} else { return; }
		}
		try {
			// Load into sidebar + viewer
			await fabricExplorerProvider.loadFabricFile(geometryPath);
			const panel = (getOrCreateWebviewPanel());
			const parser = new GeometryParser(geometryPath);
			const geometry = await parser.parse();
			const geometryData = { ...geometry, tileGeomMap: Object.fromEntries(geometry.tileGeomMap) };
			panel.webview.postMessage({ type: 'loadFabric', data: geometryData });
			vscode.window.showInformationMessage(`Loaded fabric from ${geometry.name}`);
		} catch (err) {
			vscode.window.showErrorMessage(`Failed to load fabric: ${err}`);
		}
	});

	// Command: Remove project
	const removeProjectCommand = vscode.commands.registerCommand('fabulator.removeProject', async (item?: any) => {
		let target: string | undefined;
		if (item && item.projectPath) { target = item.projectPath; }
		else {
			const projects = projectsProvider.getProjects();
			if (projects.length === 0) { vscode.window.showInformationMessage('No projects to remove.'); return; }
			const pick = await vscode.window.showQuickPick(projects.map(p => ({ label: require('path').basename(p), description: p, value: p })), { placeHolder: 'Select project to remove' });
			if (!pick) { return; }
			target = pick.value;
		}
		if (!target) { return; }
		projectsProvider.removeProject(target);
		vscode.window.showInformationMessage(`Removed project: ${target}`);
	});

	const openDesignCommand = vscode.commands.registerCommand('fabulator.openDesign', async () => {
        const lastDir = context.globalState.get<string>('fabulator.lastDesignDir') || context.globalState.get<string>('fabulator.lastFabricDir');
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Open Design',
			filters: {
				'FASM files': ['fasm'],
				'All files': ['*']
			},
            defaultUri: lastDir ? vscode.Uri.file(lastDir) : undefined
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			context.globalState.update('fabulator.lastDesignDir', vscode.Uri.joinPath(fileUri[0], '..').fsPath);
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
        const lastDir = context.globalState.get<string>('fabulator.lastFabricDir');
		const options: vscode.OpenDialogOptions = {
			canSelectMany: false,
			openLabel: 'Select Fabric File',
			filters: {
				'CSV files': ['csv'],
				'All files': ['*']
			},
            defaultUri: lastDir ? vscode.Uri.file(lastDir) : undefined
		};

		const fileUri = await vscode.window.showOpenDialog(options);
		if (fileUri && fileUri[0]) {
			context.globalState.update('fabulator.lastFabricDir', vscode.Uri.joinPath(fileUri[0], '..').fsPath);
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
		highlightElementCommand,
		startFabulousCommand,
		addProjectCommand,
		showFabricCommand,
		removeProjectCommand
	);

	// Implementation commands
	const addSynthFile = vscode.commands.registerCommand('fabulator.synth.addFile', async () => {
		const pick = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Add Synthesis Source', filters: { 'HDL': ['v', 'sv', 'vh', 'vhd', 'vhdl'] , 'All files': ['*'] } });
		if (!pick) { return; }
		pick.forEach(u => synthesisProvider.addFile(u.fsPath));
	});
	const removeSynthFile = vscode.commands.registerCommand('fabulator.synth.removeFile', (item: any) => {
		if (item && item.filePath) { synthesisProvider.removeFile(item.filePath); }
	});
	const startSynth = vscode.commands.registerCommand('fabulator.synth.start', async () => {
		const files = synthesisProvider.getFiles();
		if (files.length === 0) { vscode.window.showWarningMessage('No synthesis sources added.'); return; }
		synthChannel.show(true);
		synthChannel.appendLine(`[SYNTH] Starting synthesis for ${files.length} file(s).`);
		const projects = projectsProvider.getProjects();
		if (projects.length === 0) { synthChannel.appendLine('No project paths defined. Aborting synthesis.'); return; }
		let project = context.globalState.get<string>('fabulator.lastImplProject');
		if (!project || !projects.includes(project)) {
			project = projects.length === 1 ? projects[0] : (await vscode.window.showQuickPick(projects.map(p => ({ label: path.basename(p), description: p, value: p })), { placeHolder: 'Select project for synthesis' }))?.value;
		}
		if (!project) { return; }
		context.globalState.update('fabulator.lastImplProject', project);
		const toolPath = resolveToolPath('synthesis', project);
		const cfg = vscode.workspace.getConfiguration();
		const extraArgs = cfg.get<string[]>('fabulator.synthesis.args', []);
		const envObj = cfg.get<Record<string,string>>('fabulator.synthesis.env', {});
		const args = [...extraArgs, '-p', ...files];
		spawnStreaming('SYNTH', toolPath, args, project, envObj || {});
	});

	const addPRFile = vscode.commands.registerCommand('fabulator.pr.addFile', async () => {
		const pick = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Add P&R Source', filters: { 'Netlist/Config': ['json','bit','v','sv'] , 'All files': ['*'] } });
		if (!pick) { return; }
		pick.forEach(u => placeRouteProvider.addFile(u.fsPath));
	});
	const removePRFile = vscode.commands.registerCommand('fabulator.pr.removeFile', (item: any) => {
		if (item && item.filePath) { placeRouteProvider.removeFile(item.filePath); }
	});
	const startPR = vscode.commands.registerCommand('fabulator.pr.start', async () => {
		const files = placeRouteProvider.getFiles();
		if (files.length === 0) { vscode.window.showWarningMessage('No P&R sources added.'); return; }
		prChannel.show(true);
		prChannel.appendLine(`[P&R] Starting place & route for ${files.length} file(s).`);
		const projects = projectsProvider.getProjects();
		if (projects.length === 0) { prChannel.appendLine('No project paths defined. Aborting place & route.'); return; }
		let project = context.globalState.get<string>('fabulator.lastImplProject');
		if (!project || !projects.includes(project)) {
			project = projects.length === 1 ? projects[0] : (await vscode.window.showQuickPick(projects.map(p => ({ label: path.basename(p), description: p, value: p })), { placeHolder: 'Select project for place & route' }))?.value;
		}
		if (!project) { return; }
		context.globalState.update('fabulator.lastImplProject', project);
		const toolPath = resolveToolPath('placeRoute', project);
		const cfg = vscode.workspace.getConfiguration();
		const extraArgs = cfg.get<string[]>('fabulator.placeRoute.args', []);
		const envObj = cfg.get<Record<string,string>>('fabulator.placeRoute.env', {});
		const args = [...extraArgs, '-p', ...files];
		spawnStreaming('P&R', toolPath, args, project, envObj || {});
	});

	context.subscriptions.push(addSynthFile, removeSynthFile, startSynth, addPRFile, removePRFile, startPR, synthChannel, prChannel);
}

// This method is called when your extension is deactivated
export function deactivate() {}
