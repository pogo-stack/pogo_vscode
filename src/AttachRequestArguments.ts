import { DebugProtocol } from 'vscode-debugprotocol';

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	/** An absolute path to the "program" to debug. */
	program: string;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	stopOnEntry: boolean;
	pogodebugger:  PogoDebuggerSettings;
}


export interface PogoDebuggerSettings {
	port?: number
}