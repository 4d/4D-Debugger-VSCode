import { Config } from './config';
import * as vscode from 'vscode';


export class Ctx {
    private _config : Config;
    private _ctx : vscode.ExtensionContext;

    constructor(ctx : vscode.ExtensionContext) {
        this._ctx = ctx;
        this._config = new Config();
    }

    get config() : Config {
        return this._config;
    }

    get extensionContext() : vscode.ExtensionContext {
        return this._ctx;
    }
}