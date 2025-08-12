import * as vscode from 'vscode';
import * as path from 'path';

export abstract class BaseImplProvider implements vscode.TreeDataProvider<ImplFileItem> {
	protected _onDidChangeTreeData = new vscode.EventEmitter<ImplFileItem | undefined | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(protected context: vscode.ExtensionContext, private storageKey: string, private icon: string) {}

	getTreeItem(element: ImplFileItem): vscode.TreeItem { return element; }
	getChildren(): Thenable<ImplFileItem[]> {
		return Promise.resolve(this.getFiles().map(f => new ImplFileItem(f, this.icon)));
	}

	refresh() { this._onDidChangeTreeData.fire(); }

	addFile(filePath: string) {
		const files = this.getFiles();
		if (!files.includes(filePath)) { files.push(filePath); this.save(files); this.refresh(); }
	}
	removeFile(filePath: string) {
		this.save(this.getFiles().filter(f => f !== filePath));
		this.refresh();
	}
	clear() { this.save([]); this.refresh(); }

	getFiles(): string[] { return this.context.globalState.get<string[]>(this.storageKey) || []; }
	protected save(files: string[]) { this.context.globalState.update(this.storageKey, files); }
}

export class SynthesisProvider extends BaseImplProvider {
	constructor(ctx: vscode.ExtensionContext) { super(ctx, 'fabulator.synthesisFiles', 'gear'); }
}

export class PlaceRouteProvider extends BaseImplProvider {
	constructor(ctx: vscode.ExtensionContext) { super(ctx, 'fabulator.placeRouteFiles', 'run'); }
}

export class ImplFileItem extends vscode.TreeItem {
	constructor(public readonly filePath: string, icon: string) {
		super(path.basename(filePath), vscode.TreeItemCollapsibleState.None);
		this.description = path.dirname(filePath);
		this.tooltip = filePath;
		this.contextValue = 'implFile';
		this.iconPath = new vscode.ThemeIcon(icon);
	}
}
