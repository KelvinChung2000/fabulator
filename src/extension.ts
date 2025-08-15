// Clean rewritten extension (JSON-only fabric support)
import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { FabricWebviewProvider } from './webview/FabricWebviewProvider';
import { RawSerializedFabric } from './webview/ui/src/types/geometry';
import { FabricData, UpstreamFabricJSON } from './webview/ui/src/types/FabricData';
import { FasmParser } from './parsers/FasmParser';
import { FabricExplorerProvider, FabricElementData } from './sidebar/FabricExplorerProvider';
import { SearchPanel } from './sidebar/SearchPanel';
import { ProjectsProvider } from './sidebar/ProjectsProvider';
import { SynthesisProvider, PlaceRouteProvider } from './sidebar/ImplementationProviders';

export function activate(context: vscode.ExtensionContext) {
	const fabricExplorerProvider = new FabricExplorerProvider(context);
	const searchPanel = new SearchPanel(context.extensionUri);
	const projectsProvider = new ProjectsProvider(context);
	const synthesisProvider = new SynthesisProvider(context);
	const placeRouteProvider = new PlaceRouteProvider(context);

	vscode.window.registerTreeDataProvider('fabulator.fabricExplorer', fabricExplorerProvider);
	vscode.window.registerWebviewViewProvider('fabulator.searchPanel', searchPanel);
	vscode.window.registerTreeDataProvider('fabulator.projects', projectsProvider);
	vscode.window.registerTreeDataProvider('fabulator.synthesis', synthesisProvider);
	vscode.window.registerTreeDataProvider('fabulator.placeRoute', placeRouteProvider);

	searchPanel.setSearchCallback(term => fabricExplorerProvider.setSearchFilter(term));

	let panelRef: vscode.WebviewPanel | undefined;
	const getOrCreateWebviewPanel = () => {
		if (panelRef) { panelRef.reveal(vscode.ViewColumn.One); return panelRef; }
		panelRef = vscode.window.createWebviewPanel('fabulator.fabricView','FABulator - Fabric Viewer',vscode.ViewColumn.One,{ enableScripts: true, localResourceRoots: [context.extensionUri], retainContextWhenHidden: true });
		const provider = new FabricWebviewProvider(context.extensionUri);
		panelRef.webview.html = provider.getHtmlForWebview(panelRef.webview);
		panelRef.webview.onDidReceiveMessage(msg => {
			if (msg.type === 'error') { vscode.window.showErrorMessage(`FABulator Error: ${msg.message}`); }
			else if (msg.type === 'warning') { vscode.window.showWarningMessage(`FABulator Warning: ${msg.message}`); }
		});
		panelRef.onDidDispose(() => { panelRef = undefined; });
		return panelRef;
	};

	const synthChannel = vscode.window.createOutputChannel('FABulous Synthesis');
	const prChannel = vscode.window.createOutputChannel('FABulous Place&Route');

	async function readProjectEnv(projectPath: string): Promise<Record<string,string>> {
		try {
			const envPath = path.join(projectPath, '.FABulous', '.env');
			try {
				await vscode.workspace.fs.stat(vscode.Uri.file(envPath));
				const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(envPath));
				const lines = Buffer.from(raw).toString('utf8').split(/\r?\n/);
				const out: Record<string,string> = {};
				for (const l of lines) { const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if (m) { out[m[1]] = m[2].replace(/^"|"$/g,''); } }
				return out;
			} catch {
				// File doesn't exist or can't be read
				return {};
			}
		} catch { /* ignore */ }
		return {};
	}
	async function resolveToolPath(kind: 'synthesis' | 'placeRoute' | 'fabulous', projectPath?: string): Promise<string> {
		const cfg = vscode.workspace.getConfiguration();
		const extPath = kind === 'synthesis' ? cfg.get<string>('fabulator.toolPath.synthesis') : kind === 'placeRoute' ? cfg.get<string>('fabulator.toolPath.placeRoute') : cfg.get<string>('fabulator.toolPath.fabulous');
		const projEnv = projectPath ? await readProjectEnv(projectPath) : {};
		return projEnv['FABULOUS_BIN'] || projEnv['FABULOUS_PATH'] || extPath || 'FABulous';
	}
	function spawnStreaming(kind: 'SYNTH' | 'P&R', toolPath: string, args: string[], cwd: string, extraEnv: Record<string,string>) {
		const cfg = vscode.workspace.getConfiguration();
		const showProgress = cfg.get<boolean>('fabulator.progress.notifications', true);
		const channel = kind === 'SYNTH' ? synthChannel : prChannel;
		const run = () => {
			channel.show(true);
			channel.appendLine(`[${kind}] CMD: ${toolPath} ${args.join(' ')}`);
			const child = spawn(toolPath, args, { cwd, shell: false, env: { ...process.env, ...extraEnv } });
			child.stdout.on('data', d => channel.append(new TextDecoder().decode(d)));
			child.stderr.on('data', d => channel.append(new TextDecoder().decode(d)));
			child.on('close', code => channel.appendLine(`\n[${kind}] Process exited with code ${code}`));
			child.on('error', err => channel.appendLine(`\n[${kind}] Error: ${err.message}`));
			return child;
		};
		if (!showProgress) { run(); return; }
		vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `${kind === 'SYNTH' ? 'Synthesis' : 'Place & Route'} running...`, cancellable: true }, (_p, token) => {
			return new Promise<void>(resolve => {
				const child = run();
				token.onCancellationRequested(() => { try { child.kill(); channel.appendLine(`\n[${kind}] Cancel requested by user.`); } catch {}; resolve(); });
				child.on('close', () => resolve());
			});
		});
	}

	// Auto-start FABulous if .FABulous exists (async to avoid blocking activation)
	setTimeout(async () => {
		try {
			for (const f of vscode.workspace.workspaceFolders || []) {
				const fabulousPath = path.join(f.uri.fsPath, '.FABulous');
				try {
					await vscode.workspace.fs.stat(vscode.Uri.file(fabulousPath));
					if (!context.globalState.get<boolean>('fabulator.fabulousStarted')) {
						startFabulousTerminal(f.uri.fsPath, context, true);
					}
				} catch {
					// .FABulous directory doesn't exist, skip
				}
			}
		} catch (error) {
			console.error('FABulator auto-start failed:', error);
		}
	}, 1000);

	function startFabulousTerminal(projectPath: string, ctx: vscode.ExtensionContext, auto = false) {
		const baseName = 'FABulous';
		const existing = vscode.window.terminals.filter(t => t.name.startsWith(baseName));
		const termName = existing.length === 0 ? baseName : `${baseName} (${existing.length + 1})`;
		const term = vscode.window.createTerminal({ name: termName, cwd: projectPath });
		term.show();
		term.sendText(`FABulous ${projectPath.includes(' ') ? `"${projectPath}"` : projectPath}`);
		ctx.globalState.update('fabulator.fabulousStarted', true);
		if (auto) { vscode.window.showInformationMessage(`Started FABulous CLI (auto) in ${projectPath}`); }
		return term;
	}

	const openFabricCommand = vscode.commands.registerCommand('fabulator.openFabric', async () => {
		const lastDir = context.globalState.get<string>('fabulator.lastFabricDir');
		const pick = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Open Fabric', filters: { 'Fabric JSON': ['json'] , 'All files': ['*'] }, defaultUri: lastDir ? vscode.Uri.file(lastDir) : undefined });
		if (!pick || !pick[0]) { return; }
		const uri = pick[0];
		context.globalState.update('fabulator.lastFabricDir', vscode.Uri.joinPath(uri, '..').fsPath);
		try {
			const raw = await vscode.workspace.fs.readFile(uri);
			const parsed = JSON.parse(Buffer.from(raw).toString('utf8')) as UpstreamFabricJSON;
			
			// Validate required properties
			console.log('Parsed fabric data keys:', Object.keys(parsed));
			if (!parsed.width || !parsed.height) {
				vscode.window.showErrorMessage(`Invalid fabric file: Missing width (${parsed.width}) or height (${parsed.height}) properties`);
				return;
			}
			
			const fabricData = FabricData.fromRaw(parsed as any);
			const cfg = vscode.workspace.getConfiguration();
			const safeMode = cfg.get<boolean>('fabulator.safeMode', false);
			const stats = fabricStats(fabricData);
			console.log('[FABulator] Fabric stats', stats);
			const sizeScore = stats.totalTiles * Math.log10(stats.totalBels + 10);
			if (safeMode || sizeScore > 150000) {
				vscode.window.showWarningMessage(`Fabric opened in safe mode (sizeScore=${sizeScore.toFixed(0)}). Visualization skipped.`);
				return;
			}
			const panel = getOrCreateWebviewPanel();
			panel.webview.postMessage({ type: 'loadFabric', data: fabricData.toJSON() });
			vscode.window.showInformationMessage(`Loaded fabric: ${fabricData.name}`);
		} catch (e:any) {
			vscode.window.showErrorMessage(`Failed to load fabric: ${e.message}`);
		}
	});

	const startFabulousCommand = vscode.commands.registerCommand('fabulator.startFABulous', async () => {
		const sel = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Select FABulous Project Directory', defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri });
		if (!sel || !sel[0]) { return; }
		startFabulousTerminal(sel[0].fsPath, context, false);
	});

	const addProjectCommand = vscode.commands.registerCommand('fabulator.addProject', async () => {
		const sel = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Select FABulous Project Root', defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri });
		if (!sel || !sel[0]) { return; }
		projectsProvider.addProject(sel[0].fsPath);
		vscode.window.showInformationMessage(`Added project path: ${sel[0].fsPath}`);
	});

	async function findSerializedFabric(projectPath: string): Promise<string | undefined> {
		const candidate = path.join(projectPath, '.FABulous', 'fabric_serial.json');
		try { await vscode.workspace.fs.stat(vscode.Uri.file(candidate)); return candidate; } catch {}
		return undefined;
	}

	const showFabricCommand = vscode.commands.registerCommand('fabulator.showFabric', async () => {
		const projects = projectsProvider.getProjects();
		if (projects.length === 0) { vscode.window.showWarningMessage('No FABulous projects added.'); return; }
		let chosen: string | undefined = projects.length === 1 ? projects[0] : (await vscode.window.showQuickPick(projects.map(p => ({ label: path.basename(p), description: p, value: p })), { placeHolder: 'Select project' }))?.value;
		if (!chosen) { return; }
		try {
			const serialPath = await findSerializedFabric(chosen);
			if (!serialPath) { vscode.window.showWarningMessage('No serialized fabric JSON found.'); return; }
			const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(serialPath));
			const rawJson = JSON.parse(Buffer.from(raw).toString('utf8')) as UpstreamFabricJSON;
			const fabricData = FabricData.fromRaw(rawJson as any);
			const cfg = vscode.workspace.getConfiguration();
			const safeMode = cfg.get<boolean>('fabulator.safeMode', false);
			const stats = fabricStats(fabricData);
			console.log('[FABulator] Fabric stats', stats);
			const sizeScore = stats.totalTiles * Math.log10(stats.totalBels + 10);
			if (safeMode || sizeScore > 150000) {
				vscode.window.showWarningMessage(`Fabric opened in safe mode (sizeScore=${sizeScore.toFixed(0)}). Visualization skipped.`);
				return;
			}
			const panel = getOrCreateWebviewPanel();
			panel.webview.postMessage({ type: 'loadFabric', data: fabricData.toJSON() });
			vscode.window.showInformationMessage(`Loaded fabric from ${fabricData.name}`);
		} catch (err:any) {
			vscode.window.showErrorMessage(`Failed to load fabric: ${err.message}`);
		}
	});

	const removeProjectCommand = vscode.commands.registerCommand('fabulator.removeProject', async (item?: any) => {
		let target: string | undefined = item?.projectPath;
		if (!target) {
			const projects = projectsProvider.getProjects();
			if (projects.length === 0) { vscode.window.showInformationMessage('No projects to remove.'); return; }
			const pick = await vscode.window.showQuickPick(projects.map(p => ({ label: path.basename(p), description: p, value: p })), { placeHolder: 'Select project to remove' });
			if (!pick) { return; }
			target = pick.value;
		}
		projectsProvider.removeProject(target);
		vscode.window.showInformationMessage(`Removed project: ${target}`);
	});

	const openDesignCommand = vscode.commands.registerCommand('fabulator.openDesign', async () => {
		const lastDir = context.globalState.get<string>('fabulator.lastDesignDir') || context.globalState.get<string>('fabulator.lastFabricDir');
		const pick = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Open Design', filters: { 'FASM files': ['fasm'], 'All files': ['*'] }, defaultUri: lastDir ? vscode.Uri.file(lastDir) : undefined });
		if (!pick || !pick[0]) { return; }
		context.globalState.update('fabulator.lastDesignDir', vscode.Uri.joinPath(pick[0], '..').fsPath);
		try {
			const isValid = await FasmParser.validateFasmFile(pick[0].fsPath);
			if (!isValid) { vscode.window.showWarningMessage('File may not be a valid FASM file.'); }
			const parser = new FasmParser(pick[0].fsPath);
			const bitstreamConfig = await parser.parse();
			const statistics = parser.getStatistics(bitstreamConfig);
			const panel = getOrCreateWebviewPanel();
			panel.webview.postMessage({ type: 'loadDesign', data: { bitstreamConfig: { connectivityMap: Object.fromEntries(bitstreamConfig.connectivityMap), netMap: Object.fromEntries(bitstreamConfig.netMap) }, statistics, filePath: pick[0].fsPath } });
			vscode.window.showInformationMessage(`Loaded design: ${statistics.totalNets} nets, ${statistics.totalConnections} connections`);
		} catch (e:any) {
			vscode.window.showErrorMessage(`Failed to parse FASM design: ${e.message}`);
		}
	});

	const selectFabricFileCommand = vscode.commands.registerCommand('fabulator.selectFabricFile', async () => {
		const lastDir = context.globalState.get<string>('fabulator.lastFabricDir');
		const pick = await vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Select Fabric File', filters: { 'Fabric JSON': ['json'], 'All files': ['*'] }, defaultUri: lastDir ? vscode.Uri.file(lastDir) : undefined });
		if (!pick || !pick[0]) { return; }
		context.globalState.update('fabulator.lastFabricDir', vscode.Uri.joinPath(pick[0], '..').fsPath);
		try {
			const raw = await vscode.workspace.fs.readFile(pick[0]);
			const parsed = JSON.parse(Buffer.from(raw).toString('utf8')) as UpstreamFabricJSON;
			
			// Validate required properties
			console.log('Parsed fabric data keys:', Object.keys(parsed));
			console.log('Fabric name:', parsed.name);
			console.log('Fabric width:', parsed.width);
			console.log('Fabric height:', parsed.height);
			
			if (!parsed.width || !parsed.height) {
				vscode.window.showErrorMessage(`Invalid fabric file: Missing width (${parsed.width}) or height (${parsed.height}) properties`);
				return;
			}
			
			const fabricData = FabricData.fromRaw(parsed as any);
			const panel = getOrCreateWebviewPanel();
			panel.webview.postMessage({ type: 'loadFabric', data: fabricData.toJSON() });
			vscode.window.showInformationMessage(`Loaded fabric: ${fabricData.name}`);
		} catch (e:any) { 
			console.error('Fabric loading error:', e);
			vscode.window.showErrorMessage(`Failed to load fabric file: ${e.message}`); 
		}
	});

	const refreshSidebarCommand = vscode.commands.registerCommand('fabulator.refreshSidebar', () => {
		fabricExplorerProvider.refresh();
		searchPanel.clearSearch();
		vscode.window.showInformationMessage('Sidebar refreshed');
	});
	const highlightElementCommand = vscode.commands.registerCommand('fabulator.highlightElement', async (element: FabricElementData) => {
		const panel = getOrCreateWebviewPanel();
		panel.webview.postMessage({ type: 'highlightElement', data: element });
		let msg = `Highlighting ${element.type}: ${element.name}`;
		if (element.position) { msg += ` at (${element.position.x}, ${element.position.y})`; }
		vscode.window.showInformationMessage(msg);
	});

	const addSynthFile = vscode.commands.registerCommand('fabulator.synth.addFile', async () => {
		const pick = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Add Synthesis Source', filters: { 'HDL': ['v','sv','vh','vhd','vhdl'], 'All files': ['*'] } });
		if (!pick) { return; }
		pick.forEach(u => synthesisProvider.addFile(u.fsPath));
	});
	const removeSynthFile = vscode.commands.registerCommand('fabulator.synth.removeFile', (item: any) => { if (item?.filePath) { synthesisProvider.removeFile(item.filePath); } });
	const startSynth = vscode.commands.registerCommand('fabulator.synth.start', async () => {
		const files = synthesisProvider.getFiles();
		if (files.length === 0) { vscode.window.showWarningMessage('No synthesis sources added.'); return; }
		const projects = projectsProvider.getProjects();
		if (projects.length === 0) { vscode.window.showWarningMessage('No project paths defined.'); return; }
		let project = context.globalState.get<string>('fabulator.lastImplProject');
		if (!project || !projects.includes(project)) { project = projects.length === 1 ? projects[0] : (await vscode.window.showQuickPick(projects.map(p => ({ label: path.basename(p), description: p, value: p })), { placeHolder: 'Select project for synthesis' }))?.value; }
		if (!project) { return; }
		context.globalState.update('fabulator.lastImplProject', project);
		const toolPath = await resolveToolPath('synthesis', project);
		const cfg = vscode.workspace.getConfiguration();
		const extraArgs = cfg.get<string[]>('fabulator.synthesis.args', []);
		const envObj = cfg.get<Record<string,string>>('fabulator.synthesis.env', {});
		synthChannel.show(true);
		synthChannel.appendLine(`[SYNTH] Starting synthesis for ${files.length} file(s).`);
		spawnStreaming('SYNTH', toolPath, [...extraArgs, '-p', ...files], project, envObj || {});
	});
	const addPRFile = vscode.commands.registerCommand('fabulator.pr.addFile', async () => {
		const pick = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Add P&R Source', filters: { 'Netlist/Config': ['json','bit','v','sv'], 'All files': ['*'] } });
		if (!pick) { return; }
		pick.forEach(u => placeRouteProvider.addFile(u.fsPath));
	});
	const removePRFile = vscode.commands.registerCommand('fabulator.pr.removeFile', (item: any) => { if (item?.filePath) { placeRouteProvider.removeFile(item.filePath); } });
	const startPR = vscode.commands.registerCommand('fabulator.pr.start', async () => {
		const files = placeRouteProvider.getFiles();
		if (files.length === 0) { vscode.window.showWarningMessage('No P&R sources added.'); return; }
		const projects = projectsProvider.getProjects();
		if (projects.length === 0) { vscode.window.showWarningMessage('No project paths defined.'); return; }
		let project = context.globalState.get<string>('fabulator.lastImplProject');
		if (!project || !projects.includes(project)) { project = projects.length === 1 ? projects[0] : (await vscode.window.showQuickPick(projects.map(p => ({ label: path.basename(p), description: p, value: p })), { placeHolder: 'Select project for place & route' }))?.value; }
		if (!project) { return; }
		context.globalState.update('fabulator.lastImplProject', project);
		const toolPath = await resolveToolPath('placeRoute', project);
		const cfg = vscode.workspace.getConfiguration();
		const extraArgs = cfg.get<string[]>('fabulator.placeRoute.args', []);
		const envObj = cfg.get<Record<string,string>>('fabulator.placeRoute.env', {});
		prChannel.show(true);
		prChannel.appendLine(`[P&R] Starting place & route for ${files.length} file(s).`);
		spawnStreaming('P&R', toolPath, [...extraArgs, '-p', ...files], project, envObj || {});
	});

	const helloWorldCommand = vscode.commands.registerCommand('fabulator.helloWorld', () => vscode.window.showInformationMessage('Hello World from FABulator!'));

	context.subscriptions.push(
		openFabricCommand, openDesignCommand, helloWorldCommand, selectFabricFileCommand,
		refreshSidebarCommand, highlightElementCommand, startFabulousCommand, addProjectCommand,
		showFabricCommand, removeProjectCommand, addSynthFile, removeSynthFile, startSynth,
		addPRFile, removePRFile, startPR, synthChannel, prChannel
	);

	function fabricStats(f: FabricData) {
		let totalBels = 0; let maxBelPorts = 0; let totalPorts = 0;
		for (const k of Object.keys((f as any).tileGeomMap || {})) {
			const tg: any = (f as any).tileGeomMap[k];
			if (!tg || !Array.isArray(tg.belGeometryList)) { continue; }
			for (const bel of tg.belGeometryList) {
				totalBels++;
				if (Array.isArray(bel.portGeometryList)) {
					totalPorts += bel.portGeometryList.length;
					if (bel.portGeometryList.length > maxBelPorts) { maxBelPorts = bel.portGeometryList.length; }
				}
			}
		}
		const totalTiles = f.numberOfRows * f.numberOfColumns;
		return { totalTiles, totalBels, totalPorts, maxBelPorts };
	}
}

export function deactivate() {}
