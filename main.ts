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
	chatGPTModel: string;
	apiUrl: string;
	apiUrlPath: string;
	temperature: number;
	maxTokens: number;
	defaultPrompt: string;
	insertionMode: string;
	displayTokensUsage: boolean;
	showSidebarIcon: boolean;
}

const DEFAULT_SETTINGS: LightweightChatGPTPluginSettings = {
	apiKey: '',
	chatGPTModel: 'gpt-3.5-turbo',
	apiUrl: 'https://api.openai.com',
	apiUrlPath: '/v1/chat/completions',
	temperature: 1.0,
	maxTokens: 16,
	defaultPrompt: '',
	insertionMode: 'end',
	displayTokensUsage: true,
	showSidebarIcon: true
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    } else {
        return String(error);
    }
}

export default class LightweightChatGPTPlugin extends Plugin {
	settings: LightweightChatGPTPluginSettings;
	ribbonIconEl: HTMLElement;

	async onload() {

		try {
			await this.loadSettings();
		} catch (error: Error | unknown) {
			let message: string;
			if (error instanceof Error) {
				message = error.message;
			} else {
				message = String(error);
			}
			console.error('Error loading settings:', message);
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
					new LightweightChatGPTWindow(this.app, this).open();
				} catch (error: unknown) {
					console.error('Error opening Lightweight ChatGPT Plugin Window:', extractErrorMessage(error));
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
		} catch (error: unknown) {
			console.error('Error adding settings tab:', extractErrorMessage(error));
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
					new LightweightChatGPTWindow(this.app, this).open();
				} catch (error: unknown) {
					console.error('Error opening Lightweight ChatGPT Plugin Window:', extractErrorMessage(error));
				}
			});
		} catch (error: unknown) {
			console.error('Error adding sidebar icon:', extractErrorMessage(error));
		}

		// Perform additional things with the ribbon
		// this.ribbonIconEl.addClass('gpt-liteinquirer-ribbon-class');
	}

	removeSidebarIcon() {
		if (this.ribbonIconEl) {
			try {
				this.ribbonIconEl.remove();
			} catch (error: unknown) {
				console.error('Error closing sidebar icon:', extractErrorMessage(error));
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

	plugin: LightweightChatGPTPlugin;

	private inputTextArea: HTMLTextAreaElement;
	private outputContainer: HTMLElement;
	private displayTokensUsageContainer: HTMLElement;
	private maxTokensInput: HTMLInputElement;

	private responseAPIText: string;
	private isSendingRequest = false;

	constructor(app: App, plugin: LightweightChatGPTPlugin) {
		super(app);
		this.plugin = plugin;
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

		if (!this.plugin.settings.defaultPrompt && selectedText) {
			this.inputTextArea.value = `${selectedText}\n----\n`;
		} else if (this.plugin.settings.defaultPrompt && !selectedText) {
			this.inputTextArea.value = `${this.plugin.settings.defaultPrompt}\n`;
		} else if (this.plugin.settings.defaultPrompt && selectedText) {
			this.inputTextArea.value = `${selectedText}\n----\n${this.plugin.settings.defaultPrompt}\n`;
		} else {
			this.inputTextArea.value = '';
		}

		this.inputTextArea.addEventListener<'keydown'>('keydown', (event) => {
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
        const maxTokensDescription = maxTokensLabelContainer.createEl('p', { text: 'Max OpenAI ChatGPT Tokens' });
        maxTokensDescription.classList.add('max-tokens-description');

		this.maxTokensInput = maxTokensContainer.createEl('input', { type: 'number' });
		this.maxTokensInput.placeholder = 'Enter max Tokens number';
		this.maxTokensInput.classList.add('max-tokens-input');
		this.maxTokensInput.min = "1";
		this.maxTokensInput.max = "2048";
		this.maxTokensInput.value = this.plugin.settings.maxTokens.toString();

		// Listener for maxTokensInput input event
		this.maxTokensInput.addEventListener<'input'>('input', () => {
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

		const responseDividerLine = contentEl.createEl('hr');
		responseDividerLine.style.display = 'none';

		// Output Container
		this.outputContainer = contentEl.createEl('div');
		this.outputContainer.classList.add('output-container');

		// Tokens Container
		this.displayTokensUsageContainer = contentEl.createEl('div');
		this.displayTokensUsageContainer.classList.add('display-tokens-usage-container');

		// Add Other Button
		const buttonsBottomContainer = contentEl.createEl('div');
		buttonsBottomContainer.classList.add('buttons-bottom-container');
		const copyToClipboardButton = buttonsBottomContainer.createEl('button', { text: 'Copy to clipboard' });
		copyToClipboardButton.style.marginRight = '1rem';
		copyToClipboardButton.style.backgroundColor = 'green';
		copyToClipboardButton.style.color = 'white';
		copyToClipboardButton.style.display = 'none';
		const addToPostButton = buttonsBottomContainer.createEl('button', { text: 'Add to current document' });
		addToPostButton.style.marginRight = '1rem';
		addToPostButton.style.display = 'none';

		// Listener for sendButton click event
		sendButton.addEventListener<'click'>('click', async () => {
			if (!parseInt(this.maxTokensInput.value)) {
				new Notice(`Use the default value of ${this.plugin.settings.maxTokens.toString()} for max Tokens`);
				this.maxTokensInput.value = this.plugin.settings.maxTokens.toString();
			}

			if (!this.plugin.settings.apiKey) {
				new Notice('Please enter your API key in the plugin settings.');
				return;
			}

			if (!this.inputTextArea.value) {
				new Notice('Please enter text');
				return;
			}

			if (this.isSendingRequest) {
				// new Notice('Please wait until receive API response');
				return;
			}

			this.isSendingRequest = true;
			sendButton.textContent = 'Sending ...';
			sendButton.textContent = 'Waiting for API full response ...';

			try {
				new Notice('Sending...');
				this.responseAPIText = await this.sendRequestToChatGPT();

				if (this.responseAPIText && this.responseAPIText.trim() !== '') {
					this.outputContainer.empty();
				}

				this.outputContainer.createEl('p', { text: this.responseAPIText });

				sendButton.textContent = 'Send';
				responseDividerLine.style.display = 'block';
				copyToClipboardButton.style.display = 'block';
				addToPostButton.style.display = 'block';
			} catch (error: unknown) {
				sendButton.textContent = 'Send';
				console.error('Error during API request:', extractErrorMessage(error));
			} finally {
				this.isSendingRequest = false;
			}
		});

		copyToClipboardButton.addEventListener<'click'>('click', () => {
			this.copyToClipboard(this.responseAPIText);
		});

		addToPostButton.addEventListener<'click'>('click', () => {
			this.appendToCurrentNote(this.inputTextArea.value, this.responseAPIText, this.plugin.settings.insertionMode);
		});
	}

	async displayTokensUsage(promptTokens: number, completionTokens: number, totalTokens: number) {
		this.displayTokensUsageContainer.empty();

		this.displayTokensUsageContainer.createEl('p', {
			text: `Tokens Usage Prompt: ${promptTokens} /
			Completion: ${completionTokens} /
			Total: ${totalTokens}`
		});
	}

	async sendRequestToChatGPT() {
		const maxTokens = parseInt(this.maxTokensInput.value);

		try {
			const response = await request({
				url: this.plugin.settings.apiUrl + this.plugin.settings.apiUrlPath,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.plugin.settings.apiKey}`
				},
				body: JSON.stringify({
					model: this.plugin.settings.chatGPTModel,
					max_tokens: maxTokens,
					temperature: this.plugin.settings.temperature,
					stream: false,
					messages: [
						{ role: 'user', content: this.inputTextArea.value }
					]
				})
			});

			const currentResult = JSON.parse(response);
			if (currentResult.choices && currentResult.choices.length > 0) {
				const gptResponse = currentResult.choices[0].message.content;

				const promptTokens = currentResult.usage.prompt_tokens;
				const completionTokens = currentResult.usage.completion_tokens;
				const totalTokens = currentResult.usage.total_tokens;

				if (this.plugin.settings.displayTokensUsage) {
					this.displayTokensUsage(promptTokens, completionTokens, totalTokens);
				}

				return gptResponse;
			} else if (currentResult.error) {
				throw new Error(JSON.stringify(currentResult.error));
			} else {
				throw new Error('Unexpected API response format');
			}
		} catch (error: unknown) {
			// Handle errors
			console.error('Error during API request:', extractErrorMessage(error));
			new Notice(
				'Error during API request: ' + extractErrorMessage(error)
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
			}).catch((error: unknown) => {
				console.error('Error copying to clipboard:', extractErrorMessage(error));
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
			.setName('API Key*')
			.setDesc(
                createFragment((frag) => {
                    frag.appendText('Enter your OpenAI API key. ');
					frag.appendText('If you don\'t have it, you can ');
                    frag.createEl('a', {
                        href: 'https://platform.openai.com/account/api-keys',
                        text: 'Click Here',
                    });
                    frag.appendText(' to apply.');
                }),
            )
			.addText(text => text
				.setPlaceholder('Enter your API key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('OpenAI Model')
			.setDesc('Select the OpenAI model to use.')
			.addDropdown(dropDown => dropDown
				.addOption('gpt-3.5-turbo', 'gpt-3.5-turbo')
				.setValue(this.plugin.settings.chatGPTModel)
				.onChange(async (value) => {
					this.plugin.settings.chatGPTModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API URL*')
			.setDesc('Modify here if you want to use a self-built server, otherwise keep the default without any changes.')
			.addText(text => text
				.setPlaceholder('https://api.openai.com')
				.setValue(this.plugin.settings.apiUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('API URL Path*')
			.setDesc('Modify here if you want to use a self-built server, otherwise keep the default without any changes.')
			.addText(text => text
				.setPlaceholder('/v1/chat/completions')
				.setValue(this.plugin.settings.apiUrlPath)
				.onChange(async (value) => {
					this.plugin.settings.apiUrlPath = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h6', {text: 'ChatGPT Model setting'});

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Enter the temperature value between 0 and 2 (inclusive) for the API response')
			.addText(text => text
				.setPlaceholder('Enter temperature')
				.setValue(this.plugin.settings.temperature.toString())
				.onChange(async (value) => {
					let parsedValue = parseFloat(value);
					if (isNaN(parsedValue)) {
						parsedValue = 1;
					}
					if (parsedValue < 0) {
						parsedValue = 0;
					} else if (parsedValue > 2) {
						parsedValue = 2;
					}
					this.plugin.settings.temperature = parsedValue ;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Max Tokens')
			.setDesc(this.plugin.settings.chatGPTModel === "gpt-4"
				? 'Enter the maximum number of tokens for the API response (integer, min: 1, max: 4096)'
				: 'Enter the maximum number of tokens for the API response (integer, min: 1, max: 2048)')
			.addText(text => text
				.setPlaceholder('Enter max tokens')
				.setValue(this.plugin.settings.maxTokens.toString())
				.onChange(async (value) => {
					let parsedValue = parseInt(value);
					let parsedMaxValue = 2048;
					if (this.plugin.settings.chatGPTModel === "gpt-4") {
						parsedMaxValue = 4096;
					}
					if (isNaN(parsedValue) || parsedValue > parsedMaxValue) {
						parsedValue = parsedMaxValue;
					} else if (parsedValue < 1) {
						parsedValue = 1;
					}
					this.plugin.settings.maxTokens = parsedValue;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Prompt')
			.setDesc(
				'Default Prompt will be automatically inserted into the requested Prompt. (Not necessary)'
			)
			.addTextArea(text => text
				.setPlaceholder('Enter Default Prompt')
				.setValue(this.plugin.settings.defaultPrompt)
				.onChange(async (value) => {
					this.plugin.settings.defaultPrompt = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h6', {text: 'Additional setting'});

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
			.setName('Display Tokens Usage')
			.setDesc('Toggle to display or hide the number of Tokens used per request.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.displayTokensUsage)
				.onChange(async (value) => {
					this.plugin.settings.displayTokensUsage = value;
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
			cls: 'settings-polite-message',
		});
		politeMessage.textContent = 'If you enjoy this plugin or would like to show your support, please consider giving it a free star on GitHub~ Your appreciation means a lot to me!';

		const githubLink = containerEl.createEl('div', {
			cls: 'settings-github-link-container',
		});
		const githubAnchor = githubLink.createEl('a', {
			cls: 'settings-github-link',
		});
		githubAnchor.href = 'https://github.com/ittuann/obsidian-gpt-liteinquirer-plugin';
		githubAnchor.target = '_blank';
		githubAnchor.rel = 'noopener';

		const githubLogo = githubAnchor.createEl('img', {
			cls: 'settings-github-logo',
		});
		githubLogo.src = 'https://assets.stickpng.com/images/5847f98fcef1014c0b5e48c0.png';
		githubLogo.alt = 'GitHub';

		const githubText = githubAnchor.createEl('span', {
			text: 'View on GitHub',
		});
		githubText.style.display = 'inline-block';
		githubText.style.verticalAlign = 'middle';
	}
}
