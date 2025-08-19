// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "create-unit-test" is now active!');

    // Register the command 'single-click-create-unit-test'
    let disposable = vscode.commands.registerCommand('single-click-create-unit-test', async () => {
        // Display an initial message
        vscode.window.showInformationMessage('Starting unit test generation...');

        // --- Start: Get selected file content ---
        const activeEditor = vscode.window.activeTextEditor;
        let fileContent = '';
        let fileName = 'untitled_file'; // Default for untitled or unsaved files

        if (activeEditor) {
            fileContent = activeEditor.document.getText();
            // Get the file name if it's a saved file
            if (!activeEditor.document.isUntitled) {
                fileName = activeEditor.document.fileName.split('/').pop() || activeEditor.document.fileName.split('\\').pop() || 'untitled';
            }
            vscode.window.showInformationMessage(`Reading content from: ${fileName}`);
        } else {
            vscode.window.showErrorMessage('No active text editor found. Please open a file.');
            return; // Stop execution if no active editor
        }
        // --- End: Get selected file content ---

        // --- Start: Basic fetch test to diagnose environment issues ---
        try {
            // This is a simple public API endpoint for testing fetch
            const testResponse = await fetch('https://jsonplaceholder.typicode.com/todos/1');
            const testData = await testResponse.json();
            console.log('Basic fetch test successful:', testData);
            vscode.window.showInformationMessage('Basic fetch test successful! Proceeding to Gemini...');
        } catch (testError) {
            // If this fails, it indicates a broader issue with fetch in the environment
            console.error('Basic fetch test failed:', testError);
            vscode.window.showErrorMessage('Basic fetch test failed: ' + (testError as Error).message); // Cast to Error to access message
            return; // Stop execution if basic fetch fails
        }
        // --- End: Basic fetch test ---

        // Define the prompt for Gemini, including the file content
        const userPrompt = `Generate unit tests for the following file named '${fileName}':\n\n\`\`\`\n${fileContent}\n\`\`\`\n\nPlease provide the unit tests in a suitable testing framework (e.g., Jest, Mocha, Vitest) for JavaScript/TypeScript, or the appropriate framework for the detected language if different. Ensure the response is primarily the code block, with minimal conversational text outside of it.`;


        try {
            // Prepare the chat history for the Gemini API call
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: userPrompt }] });

            // Construct the payload for the Gemini API
            const payload = { contents: chatHistory };

            // API key will be provided by the Canvas environment at runtime
            // NOTE: The API key should typically be handled securely and not hardcoded.
            // For this example, it's included as per the user's input, but in a real extension,
            // you'd want to use VS Code's SecretStorage or similar.
            const apiKey = "AIzaSyAAJ2JM1RpQ7TVkxnrr7PgyRM8DqMJVeTQ";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`; // Corrected API URL concatenation

            // Make the fetch call to the Gemini API
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            // Parse the JSON response
            const result = await response.json() as {
                candidates?: Array<{
                    content?: {
                        parts?: Array<{ text?: string }>
                    }
                }>
            };

            let geminiResponseText: string;
            let extractedCode: string = '';
            let detectedLanguage: string = 'javascript'; // Default language for new file

            // Check if the response contains valid content
            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                // Extract the generated text from Gemini's response
                geminiResponseText = result.candidates[0].content.parts[0].text ?? '';
                vscode.window.showInformationMessage('Gemini response received. Extracting code...');

                // Regex to find code blocks: ```[language]\n[code]\n```
                const codeBlockRegex = /```(?:\w+)?\s*([\s\S]*?)```/g;
                let match;
                let allExtractedCode: string[] = [];

                while ((match = codeBlockRegex.exec(geminiResponseText)) !== null) {
                    allExtractedCode.push(match[1].trim());
                }

                if (allExtractedCode.length > 0) {
                    extractedCode = allExtractedCode.join('\n\n'); // Join multiple code blocks if present
                    vscode.window.showInformationMessage('Code block(s) extracted from Gemini response.');

                    // Attempt to infer language from the first code block (if available)
                    const firstCodeBlockMatch = geminiResponseText.match(/```(\w+)?\s*([\s\S]*?)```/);
                    if (firstCodeBlockMatch && firstCodeBlockMatch[1]) {
                        detectedLanguage = firstCodeBlockMatch[1].toLowerCase();
                        // Map common language aliases to VS Code language IDs
                        switch (detectedLanguage) {
                            case 'js':
                            case 'jsx':
                                detectedLanguage = 'javascript';
                                break;
                            case 'ts':
                            case 'tsx':
                                detectedLanguage = 'typescript';
                                break;
                            case 'py':
                                detectedLanguage = 'python';
                                break;
                            case 'cs':
                                detectedLanguage = 'csharp';
                                break;
                            // Add more mappings as needed
                        }
                    }

                } else {
                    // If no code block is found, use the entire response as a fallback
                    extractedCode = geminiResponseText;
                    vscode.window.showWarningMessage('No specific code block found in Gemini response. Using full response content.');
                }

                // --- Start: Create new file and add response ---
                const baseFileName = fileName.split('.').slice(0, -1).join('.');
                // Determine file extension based on detected language, default to .js
                let newFileExtension = '.js';
                if (detectedLanguage === 'typescript') {
                    newFileExtension = '.ts';
                } else if (detectedLanguage === 'python') {
                    newFileExtension = '.py';
                }
                // Add more language-to-extension mappings as needed

                const newFileName = `${baseFileName}.test${newFileExtension}`; // Suggests .test.js or .test.ts etc.
                const workspaceFolders = vscode.workspace.workspaceFolders;

                if (!workspaceFolders) {
                    vscode.window.showErrorMessage('Please open a workspace folder to create the file.');
                    return;
                }

                // Get the URI for the new file in the same directory as the active file, or the first workspace folder
                let fileUri;
                if (activeEditor && !activeEditor.document.isUntitled) {
                    const activeFileDir = vscode.Uri.file(activeEditor.document.fileName).with({ path: activeEditor.document.fileName.substring(0, activeEditor.document.fileName.lastIndexOf('/')) });
                    fileUri = vscode.Uri.joinPath(activeFileDir, newFileName);
                } else {
                    fileUri = vscode.Uri.joinPath(workspaceFolders[0].uri, newFileName);
                }

                try {
                    // Write the extracted code content to the new file
                    await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(extractedCode));

                    // Open the new document in a new editor tab
                    const document = await vscode.workspace.openTextDocument(fileUri);
                    await vscode.window.showTextDocument(document, vscode.ViewColumn.Beside);
                    vscode.window.showInformationMessage(`Created unit test file: ${newFileName}`);
                } catch (fileError) {
                    vscode.window.showErrorMessage('Failed to create or open file: ' + (fileError as Error).message);
                    console.error('Error creating/opening file:', fileError);
                }
                // --- End: Create new file and add response ---

            } else {
                // Handle cases where the response structure is unexpected or content is missing
                geminiResponseText = 'Gemini did not return a valid response.';
                vscode.window.showErrorMessage('Error: ' + geminiResponseText);
                console.error('Gemini API response was unexpected:', result);
            }

        } catch (error) {
            // Handle any errors during the Gemini API call
            const errorMessage = (error instanceof Error) ? error.message : String(error);
            vscode.window.showErrorMessage('Failed to get response from Gemini: ' + errorMessage);
            console.error('Error calling Gemini API:', error);
        }
    });
 
    // Add the command registration to the extension's subscriptions
    context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }