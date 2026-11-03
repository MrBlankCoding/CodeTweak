# Using the Editor

This guide covers the features and workflow of the CodeTweak script editor.

## Opening the Editor

You can access the editor in two ways:

1.  **Create a New Script**: Click the **CodeTweak icon** in your browser toolbar and select **Create Script**.
2.  **Edit an Existing Script**: Go to the **Dashboard** and click on any script in the list.

## The Editor Interface

The editor is split into several key areas:

### 1. Code Editor (Center)

The main window where you write your JavaScript and metadata block. It features syntax highlighting, auto-completion, and basic linting.

### 2. Header & Toolbar (Top)

- **Save**: Saves your script and immediately applies it to matched pages.
- **Settings**: Opens the editor's display and behavior settings.
- **Close**: Closes the editor and returns to the previous view.

### 3. Sidebar Panels (Right)

These panels allow you to configure your script without manually editing the metadata block:

- **Script Info**: Change the script's name, version, and description.
- **Execution Settings**: Manage `@match` patterns and `@run-at` timing.
- **GM API Access**: Toggle permissions for specific `GM_*` APIs.
- **External Resources**: Add `@require` and `@resource` links.
- **Script Errors**: View compilation and runtime errors for the current script.

## Debugging and Testing

- **Live Updates**: When you save a script, it is instantly updated. Refresh the target website to see your changes.
- **Console Logs**: Use `console.log()` in your script and open the browser's DevTools (F12) to see output.
- **Error Highlighting**: If your script has syntax errors, they will be highlighted in the **Script Errors** panel.
