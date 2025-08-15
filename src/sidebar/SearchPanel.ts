import * as vscode from 'vscode';
import { getNonce } from '../webview/utilities/getNonce';

export class SearchPanel implements vscode.WebviewViewProvider {
    public static readonly viewType = 'fabulator.searchPanel';

    private _view?: vscode.WebviewView;
    private searchCallback?: (searchTerm: string) => void;

    constructor(
        private readonly _extensionUri: vscode.Uri
    ) {}

    public setSearchCallback(callback: (searchTerm: string) => void) {
        this.searchCallback = callback;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'search':
                        console.log('SearchPanel received search message:', message.value);
                        if (this.searchCallback) {
                            this.searchCallback(message.value);
                        } else {
                            console.warn('No search callback set!');
                        }
                        break;
                    case 'clearSearch':
                        console.log('SearchPanel received clear search message');
                        if (this.searchCallback) {
                            this.searchCallback('');
                        } else {
                            console.warn('No search callback set for clear!');
                        }
                        break;
                }
            },
            undefined
        );
    }

    public clearSearch() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearSearch' });
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        // Get nonce for security
        const nonce = getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Fabric Search</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    font-weight: var(--vscode-font-weight);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-sideBar-background);
                    margin: 0;
                    padding: 8px;
                }
                
                .search-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .search-input-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                
                .search-input {
                    width: 100%;
                    padding: 6px 30px 6px 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    font-size: inherit;
                    font-family: inherit;
                    border-radius: 2px;
                    box-sizing: border-box;
                }
                
                .search-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                    border-color: var(--vscode-focusBorder);
                }
                
                .clear-button {
                    position: absolute;
                    right: 4px;
                    background: none;
                    border: none;
                    color: var(--vscode-input-foreground);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 2px;
                    font-size: 12px;
                    opacity: 0.7;
                    display: none;
                }
                
                .clear-button:hover {
                    opacity: 1;
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                
                .search-info {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    line-height: 1.4;
                }
                
                .search-tips {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    line-height: 1.3;
                    margin-top: 4px;
                    padding: 6px;
                    background-color: var(--vscode-textCodeBlock-background);
                    border-radius: 3px;
                }
                
                .search-tips ul {
                    margin: 0;
                    padding-left: 12px;
                }
                
                .search-tips li {
                    margin: 2px 0;
                }
            </style>
        </head>
        <body>
            <div class="search-container">
                <div class="search-input-container">
                    <input 
                        type="text" 
                        class="search-input" 
                        id="searchInput"
                        placeholder="Search tiles, BELs, ports, wires..."
                        autocomplete="off"
                    />
                    <button class="clear-button" id="clearButton" title="Clear search">✕</button>
                </div>
                
                <div class="search-info">
                    Search across all fabric elements and design nets. Results update in real-time.
                </div>
                
                <div class="search-tips">
                    <strong>Tips:</strong>
                    <ul>
                        <li>Search by element name or type</li>
                        <li>Click elements to highlight in viewer</li>
                        <li>Use context menu for more actions</li>
                    </ul>
                </div>
            </div>

            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                const searchInput = document.getElementById('searchInput');
                const clearButton = document.getElementById('clearButton');
                let searchTimeout = null;

                function updateClearButton() {
                    if (searchInput.value.length > 0) {
                        clearButton.style.display = 'block';
                    } else {
                        clearButton.style.display = 'none';
                    }
                }

                function doSearch() {
                    const searchValue = searchInput.value.trim();
                    console.log('SearchPanel doSearch called with:', searchValue);
                    vscode.postMessage({
                        type: 'search',
                        value: searchValue
                    });
                    updateClearButton();
                }

                // Debounced search
                searchInput.addEventListener('input', () => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(doSearch, 300);
                });

                // Clear search
                clearButton.addEventListener('click', () => {
                    searchInput.value = '';
                    vscode.postMessage({
                        type: 'clearSearch'
                    });
                    updateClearButton();
                    searchInput.focus();
                });

                // Handle Enter key
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        clearTimeout(searchTimeout);
                        doSearch();
                    }
                });

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'clearSearch':
                            searchInput.value = '';
                            updateClearButton();
                            break;
                    }
                });

                // Initialize
                updateClearButton();
                searchInput.focus();
            </script>
        </body>
        </html>`;
    }
}

