'use strict';

import * as vscode from 'vscode'
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { PogoDebugSession } from "./PogoDebugSession";
import * as Net from 'net';

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does not (yet) work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true;

export function activate(context: vscode.ExtensionContext) {

	const provider = new PogodebugConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('pogodebug', provider))

	if (EMBED_DEBUG_ADAPTER) {
		const factory = new PogodebugAdapterDescriptorFactory();
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('pogodebug', factory));
		context.subscriptions.push(factory);
	}
}

export function deactivate() {
	// nothing to do
}


export class PogoDebugConfiguation {
	[key: string]: any;
	type: string;
	name: string;
	request: string;
	debuggerPort?:  number;
	stopOnEntry: boolean;
}

class PogodebugConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: PogoDebugConfiguation, token?: CancellationToken): ProviderResult<DebugConfiguration> {

		// if launch.json is missing or empty
		if (!config.type && !config.request && !config.name) {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document.languageId === 'pogo') {
				config.type = 'pogodebug';
				config.name = 'Pogo debugger';
				config.request = 'debug';
			}
		}

		return config;
	}
}

class PogodebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {

		if (!this.server) {
			// start listening on a random port
			this.server = Net.createServer(socket => {
				const session = new PogoDebugSession();
				session.setRunAsServer(true);
				session.start(<NodeJS.ReadableStream>socket, socket);
			}).listen(0);
		}

		const newLocal = (<Net.AddressInfo>this.server.address());
		// make VS Code connect to debug server
		return new vscode.DebugAdapterServer(newLocal.port);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}
