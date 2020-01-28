import { DebugProtocol } from 'vscode-debugprotocol';


/**
 * This interface describes the mock-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the mock-debug extension.
 * The interface should always match this schema.
 * The interface should always match this schema.
 */
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
	/** An absolute path to the "program" to debug. */
	program: string;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	stopOnEntry?: boolean;
}

export interface AttachRequestArguments extends DebugProtocol.AttachRequestArguments {
	/** An absolute path to the "program" to debug. */
	program: string;
	/** enable logging the Debug Adapter Protocol */
	trace?: boolean;
	stopOnEntry: boolean;
}


