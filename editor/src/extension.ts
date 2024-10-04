import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
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
	const factory: vscode.DebugAdapterDescriptorFactory = new DebugAdapterServerDescriptorFactory();
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('4d', factory));

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
				config.program = '${workspaceFolder}';
				config.stopOnEntry = true;
			}
		}

		if (config.request === 'launch' && folder) {
			const configProgram =path.join(folder.uri.fsPath, "Project", `${folder.name}.4DProject`);
			if (!config.program) {
				config.program = configProgram;
			}
			else
			{
				if(fs.lstatSync(config.program).isDirectory())
				{
					config.program = configProgram;
				}
				else
				{
					const program = path.parse(config.program);
					if(program.ext !== ".4DProject")
					{
						config.file = config.program;
						config.program = configProgram;
					}
				}
			}

			if (!config.executable) {
				return vscode.window.showInformationMessage("No 4D available").then(() => {
					return undefined;	// abort launch
				});
			}
		}
		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(() => {
				return undefined;	// abort launch
			});
		}

		return config;
	}

}


class DebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined)
		: Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		const port = session?.configuration.port ?? kPortNumber;
		console.log("SESSION", session.configuration);

		if (session.configuration.request === 'launch') {
			const programPath = session.configuration.program;
			const executablePath = path.parse(session.configuration.executable);
			let promise : Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> = new Promise((resolve, reject)=> {
				let args = [
					'--project', programPath, '--dap'
				];
				console.log(args)
				const process = childProcess.spawn(executablePath.base, args, {cwd: executablePath.dir});
	
				process.stdout.on("data", (chunk: Buffer) => {
					const str = chunk.toString();
					if(str.includes("DAP_READY")) {
						//The server may be delayed
						setTimeout(()=> {
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
			return await promise;
		}
		else
		{
			// make VS Code connect to debug server
			return new vscode.DebugAdapterServer(port);
		}
	}
}