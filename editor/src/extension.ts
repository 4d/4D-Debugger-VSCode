import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken, debug } from 'vscode';
import * as childProcess from 'child_process';


const kPortNumber: number = 19815;
export function activate(context: vscode.ExtensionContext) {
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
					port: kPortNumber,
				},
				{
					name: "4D:Launch",
					request: "launch",
					type: "4d",
					method: "${file}"
				}
			];
		}
	}, vscode.DebugConfigurationProviderTriggerKind.Dynamic));
	const factory: vscode.DebugAdapterDescriptorFactory = new DebugAdapterServerDescriptorFactory();
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('4d', factory));
	context.subscriptions.push(
		debug.onDidStartDebugSession((session) => {
			//request name
			if (session.configuration.request === "launch" 
				|| session.configuration.request === "attach") {
				if(session.configuration.method)
				{
					const methodPath = path.parse(session.configuration.method);
					const args = {
						expression: methodPath.name,
						context: 'repl'
					};
					debug.activeDebugSession?.customRequest("evaluate", args)
				}

			}
		}),
	);

	context.subscriptions.push(
		debug.onDidReceiveDebugSessionCustomEvent((session) => {
			console.log("event")
		}),
	);

	context.subscriptions.push(
		debug.onDidTerminateDebugSession((session) => {
			console.log("Session is done")
		}),
	);
}

class ConfigurationProvider implements vscode.DebugConfigurationProvider {

	getPort(inPackagePath: string | undefined): number {
		if (!inPackagePath) {
			return kPortNumber;
		}
		const settingsPath = path.join(inPackagePath, "Project/Sources/settings.4DSettings");
		if (!fs.existsSync(settingsPath)) {
			return kPortNumber;
		}
		const content = fs.readFileSync(settingsPath, 'utf8');
		const match = content.match(/publication_port\s*=\s*"(\d+)"/i);
		if (match) {
			return parseInt(match[1]) + 2;
		}
		else {
			return kPortNumber;
		}
	}
	/**
	 * Message a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, _token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		console.log("CONFIG", config);
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === '4d') {
				config.type = '4d';
				config.name = '4D:Attach';
				config.request = 'attach';
				config.port = this.getPort(folder?.uri.fsPath);
				config.stopOnEntry = true;
			}
		}


		return config;
	}

	resolveDebugConfigurationWithSubstitutedVariables(folder: WorkspaceFolder | undefined, debugConfiguration: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		const configPort = this.getPort(folder?.uri.fsPath);
		if (!debugConfiguration.port) {
			debugConfiguration.port = configPort;
		}

		if (debugConfiguration.request === 'launch' && folder) {
			const configMethod = debugConfiguration.method
			const configProject = debugConfiguration.project

			if (!configMethod || path.parse(configMethod).ext != ".4dm") {
				vscode.window.showErrorMessage(`The method "${configMethod}" to launch is not a method`);
				return undefined;
			}

			if (!configProject || path.parse(configProject).ext != ".4DProject") {
				vscode.window.showErrorMessage(`The Project "${configProject}" does not exist`);
				return undefined;
			}

			if (!configProject || path.parse(configProject).ext != ".4DProject") {
				vscode.window.showErrorMessage(`The Project "${configProject}" does not exist`);
			}
		}
		return debugConfiguration
	}

}


function launch_exe(session: vscode.DebugSession, port: number): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
	let projectPath : string = session.configuration.project;
	projectPath = projectPath.replaceAll("/", path.sep)
	const executablePath = path.parse(session.configuration.executable);
	return new Promise((resolve, reject) => {
		let args = [
			'--project', projectPath, '--dap'
		];
		console.log(args)
		const process = childProcess.spawn(executablePath.base, args, { cwd: executablePath.dir });

		process.stdout.on("data", (chunk: Buffer) => {
			const str = chunk.toString();
			if (str.includes("DAP_READY")) {
				//The server may be delayed
				setTimeout(() => {
					resolve(new vscode.DebugAdapterServer(port));
				}, 100)
			}
			console.log(str);
		});
		process.stderr.on("data", (chunk: Buffer) => {
			const str = chunk.toString();
			console.error(str);
		});
		process.on("error", (err) => {
			console.log(err);
			reject();
		});
		process.on("exit", (err) => {
			console.log(err);
			reject();
		});
	});
}


class DebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined)
		: Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		const port = session?.configuration.port ?? kPortNumber;
		if (session.configuration.request === "launch") {
			return launch_exe(session, port);
		}
		console.log("SESSION", session.configuration);
		return new vscode.DebugAdapterServer(port);
	}
}