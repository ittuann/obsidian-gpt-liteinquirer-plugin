import {
	App,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	request
} from 'obsidian';



interface LightweightChatGPTPluginSettings {
	apiKey: string;
	maxTokens: number;
	temperature: number;
	chatGPTModel: string;
	insertionMode: string;
	showSidebarIcon: boolean;
}

const DEFAULT_SETTINGS: LightweightChatGPTPluginSettings = {
	apiKey: '',
	maxTokens: 16,
	temperature: 1.0,
	chatGPTModel: 'gpt-3.5-turbo',
	insertionMode: 'end',
	showSidebarIcon: true
}

export default class LightweightChatGPTPlugin extends Plugin {
	settings: LightweightChatGPTPluginSettings;
	ribbonIconEl: HTMLElement;

	async onload() {

		try {
			await this.loadSettings();
		} catch (error) {
			console.error('Error loading settings:', error);
		}

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.showSidebarIcon) {
				this.addSidebarIcon();
			}
		});

        this.addCommand({
            id: 'open-lightweight-window',
            name: 'Open Lightweight Window',
            callback: () => {
				try {
					new LightweightChatGPTWindow(this.app, this.settings.apiKey, this.settings.temperature, this.settings.maxTokens, this.settings.chatGPTModel, this.settings.insertionMode).open();
				} catch (error) {
					console.error('Error opening Lightweight ChatGPT Plugin Window:', error);
				}
			}
            // hotkeys: [
            //     {
            //         modifiers: ['CTRL'],
            //         key: 'k',
            //     },
            // ]
        });

		try {
			this.addSettingTab(new LightweightChatGPTSettingTab(this.app, this));
		} catch (error) {
			console.error('Error adding settings tab:', error);
		}

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		// this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
		// 	console.log('click', evt);
		// });
		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		// this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	addSidebarIcon() {
		try {
			this.ribbonIconEl = this.addRibbonIcon('feather', 'GPT-LiteInquirer', (evt: MouseEvent) => {
				try {
					new LightweightChatGPTWindow(this.app, this.settings.apiKey, this.settings.temperature, this.settings.maxTokens, this.settings.chatGPTModel, this.settings.insertionMode).open();
				} catch (error) {
					console.error('Error opening Lightweight ChatGPT Plugin Window:', error);
				}
			});
		} catch (error) {
			console.error('Error adding sidebar icon:', error);
		}

		// Perform additional things with the ribbon
		// this.ribbonIconEl.addClass('gpt-liteinquirer-ribbon-class');
	}

	removeSidebarIcon() {
		if (this.ribbonIconEl) {
			try {
				this.ribbonIconEl.remove();
			} catch (error) {
				console.error('Error closing sidebar icon:', error);
			}
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}



class LightweightChatGPTWindow extends Modal {
	private inputTextArea: HTMLTextAreaElement;
	private outputContainer: HTMLElement;
	private maxTokensInput: HTMLInputElement;
	private apiKey: string;
	private temperature: number;
	private maxTokens: number;
	private responseAPIText: string;
	private insertionMode: string;
	private chatGPTModel: string;

	constructor(app: App, apiKey: string, temperature: number, maxTokens: number, chatGPTModel: string, insertionMode: string) {
		super(app);
		this.apiKey = apiKey;
		this.temperature = temperature;
		this.maxTokens = maxTokens;
		this.chatGPTModel = chatGPTModel;
		this.insertionMode = insertionMode;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: 'GPT Lite Inquirer Window' });

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const selectedText = activeView ? activeView.editor.getSelection() : '';

		this.inputTextArea = contentEl.createEl('textarea');
		this.inputTextArea.classList.add('gpt-input-textarea')
		this.inputTextArea.rows = 4;
		this.inputTextArea.placeholder = 'Enter your text here ...';
		this.inputTextArea.value = selectedText ? `${selectedText}\n====\n` : '';

		this.inputTextArea.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey) {
				event.preventDefault();
				this.insertAtCursor(this.inputTextArea, '\n');
			} else if (event.key === 'Enter' && event.ctrlKey) {
                event.preventDefault();
				sendButton.click();
            }
		});

		contentEl.createEl('hr');

		// Max Tokens
		const maxTokensContainer = contentEl.createEl('div');
		maxTokensContainer.className = "max-tokens-container";

		const maxTokensLabelContainer = maxTokensContainer.createEl('div');
		maxTokensLabelContainer.createEl('label', { text: 'Max tokens:' });
        const maxTokensDescription = maxTokensLabelContainer.createEl('p', { text: 'Max OpenAI ChatGpt Tokens' });
        maxTokensDescription.classList.add('max-tokens-description');

		this.maxTokensInput = maxTokensContainer.createEl('input', { type: 'number' });
		this.maxTokensInput.placeholder = 'Enter max Tokens number';
		this.maxTokensInput.classList.add('max-tokens-input');
		this.maxTokensInput.min = "1";
		this.maxTokensInput.max = "2048";
		this.maxTokensInput.value = this.maxTokens.toString();

		// Listener for maxTokensInput input event
		this.maxTokensInput.addEventListener('input', () => {
			if (parseInt(this.maxTokensInput.value) > parseInt(this.maxTokensInput.max)) {
                this.maxTokensInput.value = this.maxTokensInput.max;
                new Notice(`Max tokens cannot exceed ${this.maxTokensInput.max}`);
            } else if (!parseInt(this.maxTokensInput.value) && parseInt(this.maxTokensInput.value) < parseInt(this.maxTokensInput.min)) {
                this.maxTokensInput.value = this.maxTokensInput.min;
                new Notice(`Max tokens cannot be less than ${this.maxTokensInput.min}`);
            }
        });

		// Send Button
		const buttonSendContainer = contentEl.createEl('div');
		buttonSendContainer.style.marginTop = '1rem';
		const sendButton = buttonSendContainer.createEl('button', { 
			text: 'Send'
		}, (el: HTMLButtonElement) => {
			el.style.backgroundColor = 'green';
			el.style.color = 'white';
		});

		const responseDivider = contentEl.createEl('hr');
		responseDivider.style.display = 'none';

		// Output Container
		this.outputContainer = contentEl.createEl('div');
		this.outputContainer.classList.add('output-container');

		// Add Other Button
		const buttonsContainer = contentEl.createEl('div');
		buttonsContainer.style.display = 'flex';
		buttonsContainer.style.marginTop = '1rem';
		const copyToClipboardButton = buttonsContainer.createEl('button', { 
			text: 'Copy to clipboard'
		}, (el: HTMLButtonElement) => {
			el.style.backgroundColor = 'green';
			el.style.color = 'white';
		});
		copyToClipboardButton.style.marginRight = '1rem';
		copyToClipboardButton.style.display = 'none';
		const addToPostButton = buttonsContainer.createEl('button', { text: 'Add to current document' });
		addToPostButton.style.marginRight = '1rem';
		addToPostButton.style.display = 'none';
		
		// Listener for sendButton click event
		sendButton.addEventListener('click', async () => {
			if (!parseInt(this.maxTokensInput.value)) {
				new Notice(`Use the default value of ${this.maxTokens.toString()} for max Tokens`);
				this.maxTokensInput.value = this.maxTokens.toString();
			}

			if (!this.inputTextArea.value) {
				new Notice('Please Enter text');
				return;
			}

			sendButton.textContent = 'Sending ...';
			sendButton.textContent = 'Waiting for API full response ...';
			copyToClipboardButton.style.display = 'none';
			addToPostButton.style.display = 'none';
			responseDivider.style.display = 'none';
			
			try {
				this.responseAPIText = await this.sendRequestToChatGPT();
				sendButton.textContent = 'Send';
				copyToClipboardButton.style.display = 'block';
				addToPostButton.style.display = 'block';
				responseDivider.style.display = 'block';
			} catch (error) {
				sendButton.textContent = 'Send';
				// new Notice('Error during API request: ' + error.message);
			}
		});

		copyToClipboardButton.addEventListener('click', () => {
			this.copyToClipboard(this.responseAPIText);
		});

		addToPostButton.addEventListener('click', () => {
			this.appendToCurrentNote(this.inputTextArea.value, this.responseAPIText, this.insertionMode);
		});
	}

	async sendRequestToChatGPT() {
		if (!this.apiKey) {
			new Notice('Please enter your API key in the plugin settings.');
			return;
		}
		this.outputContainer.empty();

		new Notice('Sending...');
		const apiUrl = 'https://api.openai.com';
		const apiUrlPatch = '/v1/chat/completions'
		const maxTokens = parseInt(this.maxTokensInput.value);
		try {
			const response = await request({
				url: apiUrl + apiUrlPatch,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify({
					model: this.chatGPTModel,
					max_tokens: maxTokens,
					temperature: this.temperature,
					messages: [
						{ role: 'user', content: this.inputTextArea.value }
					]
				})
			});

			const result = JSON.parse(response);
			if (result.choices && result.choices.length > 0) {
				const gptResponse = result.choices[0].message.content;
		
				// Display the response in the output container
				this.outputContainer.empty();
				this.outputContainer.createEl('p', { text: gptResponse });
				return gptResponse;
			} else if (result.error) {
				throw new Error(JSON.stringify(result.error));
			} else {
				throw new Error('Unexpected API response format');
			}
		} catch (error) {
			// Handle errors
			console.error('Error during API request:', error);
			new Notice(
				'Error during API request: ' + error.message
			);
		}
	}

	insertAtCursor(textArea: HTMLTextAreaElement, text: string) {
        const startPos = textArea.selectionStart;
        const endPos = textArea.selectionEnd;

        textArea.value = textArea.value.substring(0, startPos) + text + textArea.value.substring(endPos, textArea.value.length);
        textArea.selectionStart = startPos + text.length;
        textArea.selectionEnd = startPos + text.length;
    }

	async appendToCurrentNote(sentText: string, receivedText: string, insertionMode: string) {
		const receivedAPIText = receivedText || '';
		if (receivedAPIText.length <= 0) {
			new Notice('No text to add');
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const activeLeaf = activeView?.leaf;
		if (activeView && activeLeaf && activeLeaf.view instanceof MarkdownView) {
			const editor = activeLeaf.view.editor;

			// const formattedText = `\n---\n\n${sentText}\n\n${receivedAPIText}\n\n---\n`;
			const formattedText = `\n---\n\n${receivedAPIText}\n\n---\n`;

			if (insertionMode === 'end') {
				const lastLine = editor.lastLine();
				editor.replaceRange(formattedText, { line: lastLine + 1, ch: 0 });
			} else if (insertionMode === 'current') {
				const cursorPosition = editor.getCursor();
				const currentLine = cursorPosition.line;
				editor.replaceRange(formattedText, { line: currentLine + 1, ch: 0 });
			}

		} else {
			new Notice('Cannot append content to the current view. Please open a markdown note.');
		}
	}

	async copyToClipboard(receivedText: string) {
		const receivedAPIText = receivedText || '';
		if (receivedAPIText.length > 0) {
			navigator.clipboard.writeText(receivedAPIText).then(() => {
				new Notice('Copied to clipboard!');
			}).catch((error) => {
				console.error('Error copying to clipboard:', error);
				new Notice('Error copying to clipboard');
			});
		} else {
			new Notice('No text to copy');
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class LightweightChatGPTSettingTab extends PluginSettingTab {
	plugin: LightweightChatGPTPlugin;

	constructor(app: App, plugin: LightweightChatGPTPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Settings Lightweight ChatGPT Window' });

		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Enter your OpenAI API key')
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Default Max Tokens')
			.setDesc('Enter the maximum number of tokens for the API response (integer, min: 1, max: 2048)')
			.addText(text => text
				.setPlaceholder('Enter max tokens')
				.setValue(this.plugin.settings.maxTokens.toString())
				.onChange(async (value) => {
					let parsedValue = parseInt(value);
					if (parsedValue < 1) {
						parsedValue = 1;
					} else if (parsedValue > 2048) {
						parsedValue = 2048;
					}
					this.plugin.settings.maxTokens = parsedValue;
					await this.plugin.saveSettings();
				}));
	
		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Enter the temperature value between 0 and 2 (inclusive) for the API response')
			.addText(text => text
				.setPlaceholder('Enter temperature')
				.setValue(this.plugin.settings.temperature.toString())
				.onChange(async (value) => {
					let parsedValue = parseFloat(value);
					if (parsedValue < 0) {
						parsedValue = 0;
					} else if (parsedValue > 2) {
						parsedValue = 2;
					}
					this.plugin.settings.temperature = parsedValue ;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('OpenAI Model')
			.setDesc('Select the OpenAI model to use')
			.addDropdown(dropDown => dropDown
				.addOption('gpt-3.5-turbo', 'gpt-3.5-turbo')
				.setValue(this.plugin.settings.chatGPTModel)
				.onChange(async (value) => {
					this.plugin.settings.chatGPTModel = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Insertion Mode')
			.setDesc('Choose how to insert text')
			.addDropdown(dropdown => dropdown
				.addOption('end', 'Insert at end of document')
				.addOption('current', 'Insert at current position')
				.setValue(this.plugin.settings.insertionMode)
				.onChange(async (value) => {
					this.plugin.settings.insertionMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Sidebar Icon')
			.setDesc('Toggle to show or hide the sidebar icon')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showSidebarIcon)
				.onChange(async (value) => {
					this.plugin.settings.showSidebarIcon = value;
					await this.plugin.saveSettings();
					if (value) {
						this.plugin.addSidebarIcon();
					} else {
						this.plugin.removeSidebarIcon();
					}
				}));
		
		const politeMessage = containerEl.createEl('p', {
			cls: 'polite-message',
		});
		politeMessage.textContent = 'If you enjoy this plugin or would like to show your support, please consider giving it a free star on GitHub~ Your appreciation means a lot to me!';
		// politeMessage.style.textAlign = 'center';
		
		const githubLink = containerEl.createEl('div', {
			cls: 'github-link-container',
		});
		const githubAnchor = githubLink.createEl('a', {
			cls: 'github-link',
		});
		githubAnchor.href = 'https://github.com/ittuann/obsidian-gpt-liteinquirer-plugin';
		githubAnchor.target = '_blank';
		githubAnchor.rel = 'noopener';
		// const githubLogo = githubAnchor.createEl('img', {
		// 	cls: 'github-logo',
		// });
		// githubLogo.src = 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png';
		// githubLogo.alt = 'GitHub';
		// githubLogo.style.width = '24px';
		// githubLogo.style.height = '24px';
		// githubLogo.style.verticalAlign = 'middle';
		// githubLogo.style.marginRight = '4px';
		githubAnchor.createEl('span', {
			text: 'View on GitHub',
		});
		const style = document.createElement('style');
		style.innerHTML = `
			.polite-message {
				margin-bottom: 1rem;
				font-style: italic;
			}
			.github-link-container {
				margin-top: 2rem;
				text-align: center;
			}
			.github-link {
				color: #0366d6;
				text-decoration: none;
				border: 1px solid #0366d6;
				border-radius: 4px;
				padding: 0.5rem 1rem;
				font-weight: bold;
				transition: all 0.3s;
			}
			.github-link:hover {
				background-color: #0366d6;
				color: white;
				text-decoration: none;
			}
		`;
		containerEl.appendChild(style);
	}
}
