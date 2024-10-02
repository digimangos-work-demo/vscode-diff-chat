import * as vscode from 'vscode';
import { GitExtension } from './types/git.d';
import * as child from 'child_process';
import path from 'path';

const DIFF_PARTICIPANT_ID = 'chat-sample.diff';

interface IcatchatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    };
}

// Use gpt-4o since it is fast and high quality. gpt-3.5-turbo and gpt-4 are also available.
const MODEL_SELECTOR: vscode.LanguageModelChatSelector = { vendor: 'copilot', family: 'gpt-4o' };

// This function is called when the extension is activated
export function activate(context: vscode.ExtensionContext) {
    // Define the chat request handler
    const handler: vscode.ChatRequestHandler = async (
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<IcatchatResult> => {
        if (request.command === 'diffWithHead') {
            return await handleDiffWithHead(request, stream, token);
        } else {
            return await handleDefault(request, stream, token);
        }
    };

    // Register the diffWithHead command
    vscode.commands.registerCommand('vscode-diff-chat.diffWithHead', async (args: vscode.TreeItem) => {
        vscode.commands.executeCommand('workbench.action.chat.open', `@diff /diffWithHead ${args.resourceUri?.fsPath}`);
    });

    // Create a chat participant for handling diff requests
    const diff = vscode.chat.createChatParticipant(DIFF_PARTICIPANT_ID, handler);
    diff.iconPath = vscode.Uri.joinPath(context.extensionUri, 'diff.jpeg');
    diff.followupProvider = {
        provideFollowups(
            result: IcatchatResult,
            context: vscode.ChatContext,
            token: vscode.CancellationToken
        ) {
            return [
                {
                    prompt: 'Would you like to perform another diff?',
                    label: vscode.l10n.t('Run a new diff'),
                    command: 'diffWithHead',
                } as vscode.ChatFollowup,
            ];
        },
    };

    // Create a telemetry logger
    const logger = createTelemetryLogger();
}

// Handle the diffWithHead command
async function handleDiffWithHead(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<IcatchatResult> {
    stream.progress('Looking for diff details');

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!workspaceFolder) {
        stream.markdown('Workspace folder not found.');
        return { metadata: { command: 'diffWithHead' } };
    }

    const filePaths = request.prompt.split(/\s+/).filter(Boolean);
    const normalizedPaths = filePaths.map((filePath) => {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceFolder, filePath);
        return path.relative(workspaceFolder, absolutePath);
    });

    const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExtension) {
        stream.markdown('Git extension not found.');
        return { metadata: { command: 'diffWithHead' } };
    }

    const git = gitExtension.exports.getAPI(1);
    const repository = git.repositories[0];
    const diffs = await repository.diffWithHEAD();
    const results: string[] = [];

    if (diffs.length === 0) {
        results.push('No changes found.');
    } else {
        const filteredDiffs =
            normalizedPaths.length > 0
                ? diffs.filter((change) =>
                      normalizedPaths.includes(path.relative(workspaceFolder, change.uri.fsPath))
                  )
                : diffs;

        for (const change of filteredDiffs) {
            const res = child.execFileSync('git', ['diff', change.uri.path], {
                cwd: vscode.workspace.workspaceFolders![0].uri.path,
            });
            results.push(res.toString());
        }
    }

    try {
        const [model] = await vscode.lm.selectChatModels(MODEL_SELECTOR);
        if (model) {
            const messages = [
                vscode.LanguageModelChatMessage.User(
                    'You are a tool which takes the git diff for file changes and analyzes them.'
                ),
                ...results.map((r) => vscode.LanguageModelChatMessage.User(r)),
            ];

            const chatResponse = await model.sendRequest(messages, {}, token);
            for await (const fragment of chatResponse.text) {
                stream.markdown(fragment);
            }
        }
    } catch (err) {
        handleError(err, stream);
    }

    logUsage('diffWithHead');
    return { metadata: { command: 'diffWithHead' } };
}

// Handle default chat requests
async function handleDefault(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken
): Promise<IcatchatResult> {
    try {
        const [model] = await vscode.lm.selectChatModels(MODEL_SELECTOR);
        if (model) {
            const messages = [
                vscode.LanguageModelChatMessage.User('You are a diff analysis tool.'),
                vscode.LanguageModelChatMessage.User(request.prompt),
            ];

            const chatResponse = await model.sendRequest(messages, {}, token);
            for await (const fragment of chatResponse.text) {
                stream.markdown(fragment);
            }
        }
    } catch (err) {
        handleError(err, stream);
    }

    logUsage('');
    return { metadata: { command: '' } };
}

// Handle errors during chat requests
function handleError(err: any, stream: vscode.ChatResponseStream): void {
    if (err instanceof vscode.LanguageModelError) {
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(vscode.l10n.t("I'm sorry, something broke :("));
        }
    } else {
        throw err;
    }
}

// Log usage of the extension
function logUsage(kind: string): void {
    const logger = createTelemetryLogger();
    logger.logUsage('request', { kind });
}

// Create a telemetry logger
function createTelemetryLogger(): vscode.TelemetryLogger {
    return vscode.env.createTelemetryLogger({
        sendEventData(eventName, data) {
            // Capture event telemetry
        },
        sendErrorData(error, data) {
            // Capture error telemetry
        },
    });
}

// This function is called when the extension is deactivated
export function deactivate() {}