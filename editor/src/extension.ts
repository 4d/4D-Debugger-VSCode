import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';

const kPortNumber : number = 19815;
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "4d-debug" is now active!');
	start(context);
}

// This method is called when your extension is deactivated
export function deactivate() {

}


export function start(context: vscode.ExtensionContext) {

	const provider = new ConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('4d', provider));

	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('4d', {
		provideDebugConfigurations(folder: WorkspaceFolder | undefined): ProviderResult<DebugConfiguration[]> {
			console.log('provideDebugConfigurations', folder);
			return [
				{
					name: "4D:Attach",
					request: "attach",
					type: "4d",
					program: "${workspaceFolder}",
					port: kPortNumber,
				},
				{
					name: "4D:Launch",
					request: "launch",
					type: "4d",
					program: "${workspaceFolder}"
				}
			];
		}
	}, vscode.DebugConfigurationProviderTriggerKind.Dynamic));
	let factory: vscode.DebugAdapterDescriptorFactory = new DebugAdapterServerDescriptorFactory();
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('4d', factory));

}

class ConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Message a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		console.log(config);
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === '4d') {
				config.type = '4d';
				config.name = '4D:Attach';
				config.request = 'attach';
				config.port = kPortNumber;
				config.program = '${workspaceFolder}';
				config.stopOnEntry = true;
			}
		}

		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		return config;
	}

}


class DebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		let port = session?.configuration.port ?? kPortNumber;
		// make VS Code connect to debug server
		return new vscode.DebugAdapterServer(port);
	}

}