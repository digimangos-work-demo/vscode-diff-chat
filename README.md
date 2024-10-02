# Copilot Diff Tool

## Overview

Copilot Diff Tool is a Visual Studio Code extension designed to assist with analyzing code changes. It provides tools to review file differences and integrates seamlessly with Git.

## Features

- Analyze file differences with HEAD.
- Review uncommitted changes.
- Integration with Git SCM.

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/digimangos-work-demo/vscode-diff-chat.git
    ```
2. Navigate to the project directory:
    ```sh
    cd vscode-diff-chat
    ```
3. Install dependencies:
    ```sh
    npm install
    ```

## Usage

1. Open the project in Visual Studio Code.
2. Run the extension:
    - Press `F5` to open a new VS Code window with the extension loaded.
3. Use the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on macOS) and type `Analyse diff (HEAD)` to analyze file differences with HEAD.

## Running the Sample

- Run `npm install` in terminal to install dependencies
- Run the `Run Extension` target in the Debug View. This will:
	- Start a task `npm: watch` to compile the code
	- Run the extension in a new VS Code window
	- You will see the @diff chat participant show in the GitHub Copilot Chat view

## Development

Documentation on interacting with the Chat API can be found here:
- [VSCode Docs - Chat extensions](https://code.visualstudio.com/api/extension-guides/chat)
- [Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)

### Build

To build the project, run:
```sh
npm run compile
```

### Watch
To watch for changes and recompile automatically, run:

```sh
npm run watch
```

### Lint
To lint the project, run:

```sh
npm run lint
```

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
