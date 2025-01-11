import { OptionalFeatureDataModel } from './optional-feature-data-model.mjs';
import { onManageActiveEffect, prepareActiveEffectCategories } from '../../effects/effects.mjs';

export class FUOptionalFeatureSheet extends ItemSheet {
	// Initialize drag counter
	dragCounter = 0;

	static get defaultOptions() {
		// add all the tab configurations from registered class features
		const featureTabConfigs = [];
		for (let value of Object.values(CONFIG.FU.optionalFeatureRegistry.optionals())) {
			featureTabConfigs.push(...value.getTabConfigurations());
		}
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ['projectfu', 'sheet', 'item', 'backgroundstyle'],
			width: 700,
			tabs: [
				{
					navSelector: '.sheet-tabs',
					contentSelector: '.sheet-body',
					initial: 'description',
				},
				...featureTabConfigs,
			],
			dragDrop: [
				{
					dragSelector: '.directory-item.document.item', // Selector for draggable items
					dropSelector: '.desc.drop-zone', // Selector for item sheet
				},
			],
		});
	}

	async _updateObject(event, formData) {
		if (!this.object.id) return;

		// on change of feature type ask user to confirm user
		if (this.item.system.optionalType !== formData['system.optionalType']) {
			const shouldChangeType = await Dialog.confirm({
				title: game.i18n.localize('FU.OptionalFeatureDialogChangeTypeTitle'),
				content: game.i18n.localize('FU.OptionalFeatureDialogChangeTypeContent'),
				options: { classes: ['projectfu', 'unique-dialog', 'backgroundstyle'] },
				rejectClose: false,
			});

			if (!shouldChangeType) {
				return this.render();
			}

			// remove all the formData referencing the old data model
			for (const key of Object.keys(formData)) {
				if (key.startsWith('system.data.')) {
					delete formData[key];
				}
			}

			// recursively add delete instructions for every field in the old data model
			const schema = this.item.system.data.constructor.schema;
			schema.apply(function () {
				const path = this.fieldPath.split('.');
				if (!game.release.isNewer(12)) {
					path.shift(); // remove data model name
				}
				path.unshift('system', 'data');
				const field = path.pop();
				path.push(`-=${field}`);
				formData[path.join('.')] = null;
			});
		} else {
			formData = foundry.utils.expandObject(formData);
			formData.system.data = this.item.system.data.constructor.processUpdateData(formData.system.data) ?? formData.system.data;
		}

		this.object.update(formData);
	}

	constructor(object, options) {
		super(object, options);
	}

	get template() {
		return `systems/projectfu/templates/item/item-optional-feature-sheet.hbs`;
	}

	async getData(options = {}) {
		const data = super.getData(options);
		data.system = this.item.system;
		if (data.system.data instanceof OptionalFeatureDataModel) {
			data.optional = data.system.data.constructor;
			data.optionalTemplate = data.optional.template;
			data.additionalData = await data.optional.getAdditionalData(data.system.data);
			const schema = data.optional.schema;

			data.enrichedHtml = {};
			schema.apply(function () {
				if (this instanceof foundry.data.fields.HTMLField) {
					const path = this.fieldPath.split('.');
					if (!game.release.isNewer(12)) {
						path.shift(); // remove data model name
					}
					path.pop(); // remove actual field name
					let enrichedHtml = data.enrichedHtml;
					let modelData = data.system.data;
					for (let pathFragment of path) {
						enrichedHtml[pathFragment] ??= {};
						enrichedHtml = enrichedHtml[pathFragment];
						modelData = modelData[pathFragment];
					}
					enrichedHtml[this.name] = modelData[this.name];
				}
			});

			async function enrichRecursively(obj) {
				for (let [key, value] of Object.entries(obj)) {
					if (typeof value === 'object') {
						await enrichRecursively(value);
					} else {
						obj[key] = await TextEditor.enrichHTML(value, { rollData: data.additionalData?.rollData });
					}
				}
			}

			await enrichRecursively(data.enrichedHtml);
		}
		data.optionals = Object.entries(CONFIG.FU.optionalFeatureRegistry.optionals()).reduce((agg, [key, value]) => (agg[key] = value.translation) && agg, {});
		data.effects = prepareActiveEffectCategories(this.item.effects);
		return data;
	}

	activateListeners(html) {
		super.activateListeners(html);

		// Render the active effect sheet for viewing/editing when middle-clicking
		html.find('.effect').mouseup((ev) => {
			if (ev.button === 1 && !$(ev.target).hasClass('effect-control')) {
				const li = $(ev.currentTarget);
				const simulatedEvent = {
					preventDefault: () => {},
					currentTarget: {
						dataset: { action: 'edit' },
						closest: () => li[0],
						classList: {
							contains: (cls) => li.hasClass(cls),
						},
					},
				};

				onManageActiveEffect(simulatedEvent, this.item);
			}
		});

		// Active Effect Roll management
		html.on('click', '.effect-roll', (ev) => onManageActiveEffect(ev, this.item));

		html.find('.regenerate-fuid-button').click(async (event) => {
			event.preventDefault();

			// Call the regenerateFUID method on the item
			const newFUID = await this.item.regenerateFUID();

			if (newFUID) {
				this.render();
			}
		});

		html.find('.effect-control').click((ev) => onManageActiveEffect(ev, this.item));

		html.find('[data-action=pdfLink]').click(() => {
			const match = this.item.system.source.match(/([A-Za-z]+)\s*(\d+)/);

			if (match) {
				const pdfCode = match[1];
				const pageNumber = match[2];

				// Check if the openPDFByCode function exists
				if (ui.pdfpager && ui.pdfpager.openPDFByCode) {
					ui.pdfpager.openPDFByCode(pdfCode, { page: pageNumber });
				} else {
					// TODO: Create Fallback method using a normal Foundry link
				}
			} else {
				console.error('Invalid input format. Please use proper syntax "PDFCode PageNumber"');
			}
		});

		if (this.item.system.data instanceof OptionalFeatureDataModel) {
			this.item.system.data.constructor.activateListeners(html.find('[data-optional-content]'), this.item, this);
		}

		// dropzone event listeners
		const dropZone = html.find('.desc.drop-zone');
		dropZone.on('dragenter', this._onDragEnter.bind(this));
		dropZone.on('dragleave', this._onDragLeave.bind(this));
		dropZone.on('drop', this._onDropReset.bind(this));
	}

	/* -------------------------------------------- */

	_onDragEnter(event) {
		event.preventDefault();
		this.dragCounter++;
		const dropZone = $(event.currentTarget);
		dropZone.addClass('highlight-drop-zone');
	}

	_onDragLeave(event) {
		event.preventDefault();
		this.dragCounter--;
		if (this.dragCounter === 0) {
			const dropZone = $(event.currentTarget);
			dropZone.removeClass('highlight-drop-zone');
		}
	}

	_onDropReset(event) {
		this.dragCounter = 0;
		const dropZone = $(event.currentTarget);
		dropZone.removeClass('highlight-drop-zone');
	}

	/* -------------------------------------------- */

	async _onDrop(event) {
		console.log('Drop event detected');
		event.preventDefault();

		// Retrieve drag data using TextEditor
		const data = TextEditor.getDragEventData(event);

		const itemData = await this._getItemDataFromDropData(data);

		// Determine the configuration based on item type
		const config = this._findItemConfig(itemData.type);
		if (config) {
			// Check if there is an active ProseMirror editor
			const activeEditor = document.querySelector('.editor-content.ProseMirror');
			if (itemData.type === 'effect') {
				if (activeEditor) {
					// Handle effect drop into ProseMirror editor
					await this._handleEditorEffectDrop(itemData, event);
				} else {
					// Handle effect drop into actor sheet
					await this._importEffectData(itemData);
				}
			} else {
				// Handle other item drops
				await this._processItemDrop(itemData, config);
			}
		} else {
			// Default behavior for unknown item types
			await super._onDrop(event);
		}
	}

	// Helper function to get item data from drop data
	async _getItemDataFromDropData(data) {
		try {
			return await Item.implementation.fromDropData(data);
		} catch (error) {
			console.error('Failed to get item data from drop data:', error);
			return null;
		}
	}

	// Helper function to find the appropriate update configuration
	_findItemConfig(type) {
		const itemTypeConfigs = [
			{
				types: ['effect'],
				update: async (itemData) => {
					// Effects are handled separately
					return;
				},
			},
		];

		return itemTypeConfigs.find((config) => config.types.includes(type));
	}

	// Process item drop based on the configuration
	async _processItemDrop(itemData, config) {
		const existingItem = this.actor.items.find((i) => i.name === itemData.name && i.type === itemData.type);
		if (existingItem) {
			await config.update(itemData, existingItem);
		} else {
			await super._onDrop(event);
		}
	}

	// Import effect data into the specific item's effects array
	async _importEffectData(itemData) {
		const newEffects = itemData.effects || [];

		// Get existing effect IDs from the item
		const existingEffectIds = this.item.effects.map((effect) => effect._id);

		// Filter out new effects that are already present
		const filteredNewEffects = newEffects.filter((effect) => !existingEffectIds.includes(effect._id));

		// Create new ActiveEffect documents for the filtered effects
		if (filteredNewEffects.length > 0) {
			const effectsToCreate = filteredNewEffects.map((effectData) => ({
				...effectData,
				parent: this.item,
			}));

			// Create the new ActiveEffect documents
			await ActiveEffect.createDocuments(effectsToCreate, { parent: this.item });

			// console.log('Created New Effects:', createdEffects);
		} else {
			console.log('No new effects to add');
		}
	}

	// Handle dropping effects into a text editor
	async _handleEditorEffectDrop(itemData, event) {
		const activeEditor = document.querySelector('.editor-content.ProseMirror');
		if (activeEditor) {
			const effects = itemData.effects || [];
			// Use an arrow function to ensure `this` context is correct
			const formattedEffects = effects.map((effect) => this._formatEffect(effect)).join(' ');

			// Prevent the default behavior of creating a link
			event.preventDefault();
			event.stopPropagation();

			// Get the current content of the editor
			const currentContent = activeEditor.innerHTML;

			// Append the formatted effects to the current content of the editor
			activeEditor.innerHTML = currentContent + formattedEffects;

			console.log(`Appended formatted effects to the ProseMirror editor.`);
		} else {
			console.log('No active ProseMirror editor found.');
		}
	}

	// Helper function to encode an effect in base64
	_encodeBase64(data) {
		return btoa(unescape(encodeURIComponent(data)));
	}

	// Helper function to generate the @EFFECT format string
	_formatEffect(effect) {
		const encodedEffect = this._encodeBase64(JSON.stringify(effect));
		return `@EFFECT[${encodedEffect}]`;
	}

	_canDragDrop() {
		console.log('Checking drag drop capability');
		return this.isEditable;
	}

	/* -------------------------------------------- */
}
