import * as vscode from 'vscode';

interface ProjectItemData {
	path: string;
}

export class ProjectsProvider implements vscode.TreeDataProvider<ProjectItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ProjectItem | undefined | void> = new vscode.EventEmitter();
	readonly onDidChangeTreeData: vscode.Event<ProjectItem | undefined | void> = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {}

	getTreeItem(element: ProjectItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ProjectItem): Thenable<ProjectItem[]> {
		if (element) { return Promise.resolve([]); }
		const stored: string[] = this.getProjects();
		return Promise.resolve(stored.map(p => new ProjectItem(p)));
	}

	refresh() { this._onDidChangeTreeData.fire(); }

	addProject(path: string) {
		const items = this.getProjects();
		if (!items.includes(path)) {
			items.push(path);
			this.saveProjects(items);
			this.refresh();
		}
	}

	removeProject(path: string) {
		const items = this.getProjects().filter(p => p !== path);
		this.saveProjects(items);
		this.refresh();
	}

	getProjects(): string[] { return this.context.globalState.get<string[]>('fabulator.projects') || []; }
	private saveProjects(list: string[]) { this.context.globalState.update('fabulator.projects', list); }
}

export class ProjectItem extends vscode.TreeItem {
	constructor(public readonly projectPath: string) {
		super(projectPath, vscode.TreeItemCollapsibleState.None);
		this.description = projectPath;
		this.contextValue = 'fabulatorProject';
		this.tooltip = projectPath;
		this.iconPath = new vscode.ThemeIcon('root-folder');
	}
}
