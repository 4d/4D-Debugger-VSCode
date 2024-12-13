import * as vscode from 'vscode';


export class Config {

    readonly rootSection = "4D-Debugger";


    get cfg(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(this.rootSection);
    }


    public get getDefaultServerPath() : string | undefined {
        return this.cfg.get<string>("executable");
    }


}