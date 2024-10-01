import * as vscode from 'vscode';
import { GitExtension } from './types/git.d';
import * as child from 'child_process';
import path from 'path';

const DIFF_PARTICIPANT_ID = 'chat-sample.diff';

interface IcatchatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
}

// Use gpt-4o since it is fast and high quality. gpt-3.5-turbo and gpt-4 are also available.
const MODEL_SELECTOR: vscode.LanguageModelChatSelector = { vendor: 'copilot', family: 'gpt-4o' };

export function activate(context: vscode.ExtensionContext) {

    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<IcatchatResult> => {
        if (request.command === 'diffWithHead') {
            stream.progress('Looking for diff details');

            const filePaths = request.prompt.split(/\s+/).filter(Boolean);
            const workspaceFolder = vscode.workspace.workspaceFolders![0].uri.fsPath;
            const normalisedPaths = filePaths.map(filePath => {
                const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspaceFolder, filePath);
                return path.relative(workspaceFolder, absolutePath);
            });

            const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            if (!gitExtension) {
                throw new Error('Git extension not found');
            }
            const git = gitExtension.exports.getAPI(1);
            const repository = git.repositories[0];
            
            const diff = await repository.diffWithHEAD();
            const results: string[] = [];
            
            if (diff.length === 0) {
                results.push('No changes found');
            } else {
                const filteredDiffs = normalisedPaths.length > 0 
                    ? diff.filter(change => normalisedPaths.includes(path.relative(workspaceFolder, change.uri.fsPath)))
                    : diff;
            
                for (const change of filteredDiffs) {
                    console.log('change: ', change);
                    const res = child.execFileSync('git', ['diff', change.uri.path], {
                        cwd: vscode.workspace.workspaceFolders![0].uri.path
                    });
                    results.push(res.toString());
                }
            }
           

            try {
                const [model] = await vscode.lm.selectChatModels(MODEL_SELECTOR);
                if (model) {
                    const messages = [
                        vscode.LanguageModelChatMessage.User('You are a tool which take the git diff for file changes and and analyses them.'),
                        ...results.map(r => vscode.LanguageModelChatMessage.User(r))
                    ];

                    const chatResponse = await model.sendRequest(messages, {}, token);
                    for await (const fragment of chatResponse.text) {
                        stream.markdown(fragment);
                    }
                }
            } catch(err) {
                handleError(logger, err, stream);
            }

            logger.logUsage('request', { kind: 'diffWithHead'});
            return { metadata: { command: 'diffWithHead' } };
        } else {
            try {
                const [model] = await vscode.lm.selectChatModels(MODEL_SELECTOR);
                if (model) {
                    const messages = [
                        vscode.LanguageModelChatMessage.User(`You are a diff analysis tool.`),
                        vscode.LanguageModelChatMessage.User(request.prompt)
                    ];
                    
                    const chatResponse = await model.sendRequest(messages, {}, token);
                    for await (const fragment of chatResponse.text) {
                        stream.markdown(fragment);
                    }
                }
            } catch(err) {
                handleError(logger, err, stream);
            }

            logger.logUsage('request', { kind: ''});
            return { metadata: { command: '' } };
        }
    };

    vscode.commands.registerCommand('vscode-diff-chat.diffWithHead', async (args: vscode.TreeItem) => {
        vscode.commands.executeCommand('workbench.action.chat.open', `@diff /diffWithHead ${args.resourceUri?.fsPath}`);
    });

    const diff = vscode.chat.createChatParticipant(DIFF_PARTICIPANT_ID, handler);
    diff.iconPath = vscode.Uri.joinPath(context.extensionUri, 'diff.jpeg');
    diff.followupProvider = {
        provideFollowups(result: IcatchatResult, context: vscode.ChatContext, token: vscode.CancellationToken) {
            return [{
                prompt: 'Would you like to perform anthoer diff?',
                label: vscode.l10n.t('Run a new diff'),
                command: 'diffWithHead',
            } satisfies vscode.ChatFollowup];
        }
    };

    const logger = vscode.env.createTelemetryLogger({
        sendEventData(eventName, data) {
            // Capture event telemetry
            console.log(`Event: ${eventName}`);
            console.log(`Data: ${JSON.stringify(data)}`);
        },
        sendErrorData(error, data) {
            // Capture error telemetry
            console.error(`Error: ${error}`);
            console.error(`Data: ${JSON.stringify(data)}`);
        }
    });
}

function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
    logger.logError(err);
    
    if (err instanceof vscode.LanguageModelError) {
        console.log(err.message, err.code, err.cause);
        if (err.cause instanceof Error && err.cause.message.includes('off_topic')) {
            stream.markdown(vscode.l10n.t('I\'m sorry, something broke :(.'));
        }
    } else {
        throw err;
    }
}

export function deactivate() { }