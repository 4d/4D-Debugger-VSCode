import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken, debug } from 'vscode';
import * as childProcess from 'child_process';
import * as Net from 'net';
import * as os from 'os';
import { InfoPlistManager } from './infoplist';
import { LabeledVersion } from './labeledVersion';
const kPortNumber: number = 19815;
let extensionContext: vscode.ExtensionContext;
export function activate(context: vscode.ExtensionContext) {
	start(context);
}

// This method is called when your extension is deactivated
export function deactivate() {

}


export function start(context: vscode.ExtensionContext) {
	extensionContext = context;

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
					method: "${file}",
					project: "${workspaceFolder}/Project/${workspaceFolderBasename}.4DProject",
					executable: "",
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
				if (session.configuration.method) {
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
			const configMethod = debugConfiguration.method
			const configProject = debugConfiguration.project

			if (configMethod && path.parse(configMethod).ext != ".4dm") {
				vscode.window.showErrorMessage(`The method "${configMethod}" to launch is not a method`);
				return undefined;
			}

			if (!configProject || path.parse(configProject).ext != ".4DProject") {
				vscode.window.showErrorMessage(`The Project "${configProject}" does not exist`);
				return undefined;
			}
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

function getExePath(inPath: string) : string {

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

function launch_exe(session: vscode.DebugSession, port: number): Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
	let projectPath: string = session.configuration.project;
	projectPath = projectPath.replaceAll("/", path.sep)
	const executablePath = path.parse(getExePath(session.configuration.executable));
	return new Promise((resolve, reject) => {
		let args = [
			'--project', projectPath, '--dap'
		];
		console.log(args)
		const process = childProcess.spawn(executablePath.base, args, { cwd: executablePath.dir });

		process.stdout.on("data", (chunk: Buffer) => {
			const str = chunk.toString();
			if (str.includes("DAP_READY")) {
				resolve(new vscode.DebugAdapterServer(port));
			}
			vscode.debug.activeDebugConsole.append(str);
		});
		process.stderr.on("data", (chunk: Buffer) => {
			const str = chunk.toString();
			vscode.debug.activeDebugConsole.append(str);
		});
		process.on("error", (err) => {
			vscode.debug.activeDebugConsole.append(err.message);
			reject();
		});
		process.on("exit", (err) => {
			reject();
		});

		extensionContext.subscriptions.push(
			debug.onDidTerminateDebugSession((session) => {
				process.kill();
			}),
		);
	});
}


class DebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {


	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined)
		: Promise<vscode.ProviderResult<vscode.DebugAdapterDescriptor>> {
		const port = session?.configuration.port ?? kPortNumber;
		const host = session?.configuration.host ?? undefined;
		if (session.configuration.request === "launch") {
			return launch_exe(session, port);
		}
		return new vscode.DebugAdapterServer(port, host);

	}
}