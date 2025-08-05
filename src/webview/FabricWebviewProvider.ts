import * as vscode from 'vscode';
import { getNonce } from './utilities/getNonce';
import { getUri } from './utilities/getUri';

export class FabricWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'fabulator.fabricView';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('FabricWebviewProvider.resolveWebviewView called');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        console.log('Webview HTML set, webview should be ready');

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
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
        );
    }

    public loadFabric(fabricData: any) {
        console.log('FabricWebviewProvider.loadFabric called with:', fabricData);
        if (this._view) {
            console.log('Sending loadFabric message to webview');
            this._view.webview.postMessage({
                type: 'loadFabric',
                data: fabricData
            });
        } else {
            console.error('No webview available to load fabric data');
            vscode.window.showErrorMessage('FABulator webview is not ready. Please try again.');
        }
    }

    public loadDesign(designData: any) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'loadDesign',
                data: designData
            });
        }
    }

    public getHtmlForWebview(webview: vscode.Webview) {
        // Use Vite dev server in development, built assets in production
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        if (isDevelopment) {
            // Development mode: use Vite dev server
            return this._getDevHtml();
        } else {
            // Production mode: use built assets
            return this._getProdHtml(webview);
        }
    }

    private _getDevHtml() {
        const nonce = getNonce();
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-eval' 'unsafe-inline' http://localhost:3000; style-src 'unsafe-inline' http://localhost:3000; connect-src http://localhost:3000 ws://localhost:3000;">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FABulator</title>
            <style>
                body { margin: 0; padding: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); overflow: hidden; }
                #root { width: 100%; height: 100vh; }
            </style>
        </head>
        <body>
            <div id="root"></div>
            <script type="module" src="http://localhost:3000/src/main.tsx"></script>
        </body>
        </html>`;
    }

    private _getProdHtml(webview: vscode.Webview) {
        const scriptUri = getUri(webview, this._extensionUri, ["out", "webview", "assets", "index.js"]);
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'unsafe-eval'; style-src 'unsafe-inline';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FABulator</title>
            <style>
                body { margin: 0; padding: 0; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); overflow: hidden; }
                #root { width: 100%; height: 100vh; }
            </style>
        </head>
        <body>
            <div id="root"></div>
            <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}