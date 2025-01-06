import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken, debug } from 'vscode';
import * as childProcess from 'child_process';
import * as Net from 'net';
import * as os from 'os';
import { InfoPlistManager } from './infoplist';
import { MockDebugSession } from './mockDebug';
import { Ctx } from './context';
import { LabeledVersion } from './labeledVersion';
const kPortNumber: number = 19815;
let ctx: Ctx;
export function activate(context: vscode.ExtensionContext) {
	ctx = new Ctx(context);
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
					program: "${file}",
					project: "${workspaceFolder}/Project/${workspaceFolderBasename}.4DProject",
					exec: "",
					execArgs: []
				}
			];
		}
	}, vscode.DebugConfigurationProviderTriggerKind.Dynamic));
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('4d', new DebugAdapterServerDescriptorFactory()));
	context.subscriptions.push(
		debug.onDidStartDebugSession((session) => {
			//request name
			if (session.configuration.request === "launch"
				|| session.configuration.request === "attach") {
				if (session.configuration.program) {
					const methodPath = path.parse(session.configuration.program);
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
			const configMethod = debugConfiguration.program
			const configProject = debugConfiguration.project
			if(!debugConfiguration.exec) {
				debugConfiguration.exec = ctx.config.getDefaultServerPath || "";
			}
			const exec = debugConfiguration.exec

			if (configMethod && path.parse(configMethod).ext !== ".4dm") {
				vscode.window.showErrorMessage(`The method "${configMethod}" to launch is not a method`);
				return undefined;
			}

			if (!configProject || path.parse(configProject).ext !== ".4DProject") {
				vscode.window.showErrorMessage(`The Project "${configProject}" does not exist`);
				return undefined;
			}

			if (!exec || !fs.existsSync(exec)) {
				if (!exec) {
					vscode.window.showInformationMessage(`The executable path should be set in the settings or in the launch.json.`, 'Open Settings').then(selection => {
						if (selection === 'Open Settings') {
							vscode.commands.executeCommand('workbench.action.openSettings', '4D-Debugger.executable');
						}
					});
				}
				else
				{
					vscode.window.showErrorMessage(`The executable "${exec}" does not exist`);
				}
				return undefined;
			}

			if(exec) {
				let currentVersion = LabeledVersion.get4DVersion(exec);
				if(currentVersion.compare(LabeledVersion.fromString("20R8")) < 0) {
					vscode.window.showErrorMessage("The 4D Server version is not compatible with the extension, please use a version equal or greater than 20R8");
					return undefined;
				}
			}
			if (!debugConfiguration.execArgs)
				debugConfiguration.execArgs = [];
		}
		return debugConfiguration
	}

}

function addLogger(port: number, resolve: any, host?: string) {
	const client = new Net.Socket();
	const server = Net.createServer((socket: Net.Socket) => {
		socket.on('data', (data: Buffer) => {
			console.log('Client -> Server:', data.toString());
			client.write(data);
		});

		client.on('data', (data: Buffer) => {
			console.log('Server -> Client:', data.toString());
			socket.write(data);
		});
	});

	client.connect(port, () => {
		console.log('Connected to the debug server');
	});

	server.listen(0, () => {
		let proxyPort = (server.address() as Net.AddressInfo).port
		console.log(`Proxy server listening on port ${proxyPort}`);
		resolve(new vscode.DebugAdapterServer(proxyPort, host))
	});
}

function getExePath(inPath: string): string {

	let serverPath = inPath;

	const type = os.type();
	const dirname = path.basename(serverPath);
	const infoPlist = InfoPlistManager.fromExePath(serverPath);

	if (type === "Darwin" && dirname.endsWith(".app")) {

		let nameExecutable = infoPlist.getExeName();
		if (nameExecutable === "") {
			nameExecutable = path.parse(serverPath).name;
		}
		serverPath = path.join(serverPath, "Contents", "MacOS", nameExecutable);
	}
	return serverPath;
}

function launch_exe(session: vscode.DebugSession, port: number, host : string | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
	const projectPath = session.configuration.project.replaceAll("/", path.sep);
	const executablePath = path.parse(getExePath(session.configuration.exec));
	const listArgs: [] = session.configuration.execArgs ?? [];
	return new Promise((resolve, reject) => {
		try {
			const fullPath = path.join(executablePath.dir, executablePath.base)
			if (!fs.existsSync(fullPath)) {
				vscode.debug.activeDebugConsole.append(`The ${fullPath} does not exist.`);
				resolve(undefined);
			}
			console.log(`Launching ${fullPath} ${['--project', projectPath, '--dap', ...listArgs]}`);
			const process = childProcess.spawn(fullPath,
				['--project', projectPath, '--dap', ...listArgs]);

			process.stdout.on("data", (chunk: Buffer) => {
				const str = chunk.toString();
				if (str.includes("DAP_READY")) {
					resolve(new vscode.DebugAdapterServer(port, host));
				}
				vscode.debug.activeDebugConsole.append(str);
			});
			process.stderr.on("data", (chunk: Buffer) => {
				const str = chunk.toString();
				str.split("\n").forEach((line) => {
					if (line.includes("DAP_Error")) {
						let message = line.replace("DAP_Error", "Error").trim();
						resolve(new vscode.DebugAdapterInlineImplementation(new MockDebugSession(message)));
					}
					vscode.debug.activeDebugConsole.append(str);
				});
			});
			process.on("error", (err) => {
				vscode.debug.activeDebugConsole.append(err.message);
				if (err.message.startsWith("DAP_Error")) {
					let message = err.message.replace("DAP_Error", "Error");
					resolve(new vscode.DebugAdapterInlineImplementation(new MockDebugSession(message)));
				}
			});
			process.on("exit", (err) => {
				vscode.debug.activeDebugConsole.append(`Process exited with code ${err}`);
				if(err !== 0) {
					// error message when the process does not stop correctly
					resolve(new vscode.DebugAdapterInlineImplementation(new MockDebugSession("Failed to execute the server")));
				}
			});

			ctx.extensionContext.subscriptions.push(
				debug.onDidTerminateDebugSession((session) => {
					process.kill('SIGKILL');
				}),
			);
		}
		catch (e) {
			const message = `Cannot launch the debugger: ${e}`;
			vscode.debug.activeDebugConsole.append(message);
			resolve(new vscode.DebugAdapterInlineImplementation(new MockDebugSession(message)));
		}
	});
}


class DebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined)
		: vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		const port = session?.configuration.port ?? kPortNumber;
		const host = session?.configuration.host ?? undefined;
		if (session.configuration.request === "launch") {
			return launch_exe(session, port, host);
		}
		return new vscode.DebugAdapterServer(port, host);
	}
}