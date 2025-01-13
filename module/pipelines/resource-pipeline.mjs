import { Pipeline, PipelineRequest } from './pipeline.mjs';
import { FU, SYSTEM } from '../helpers/config.mjs';
import { getSelected, getTargeted } from '../helpers/target-handler.mjs';
import { InlineSourceInfo } from '../helpers/inline-helper.mjs';
import { CHECK_RESULT } from '../checks/default-section-order.mjs';
import { SpellDataModel } from '../documents/items/spell/spell-data-model.mjs';
import { Flags } from '../helpers/flags.mjs';

/**
 * @property {Number} amount
 * @property {String} resourceType
 * @property {Boolean} uncapped
 * @extends PipelineRequest
 * @inheritDoc
 */
export class ResourceRequest extends PipelineRequest {
	constructor(sourceInfo, targets, resourceType, amount, uncapped = false) {
		super(sourceInfo, targets);
		this.resourceType = resourceType;
		this.amount = amount;
		this.uncapped = uncapped;
	}

	/**
	 * @returns {boolean} True if the resource is FP, EXP or ZENIT
	 */
	get isMetaCurrency() {
		return this.resourceType === 'fp' || this.resourceType === 'exp' || this.resourceType === 'zenit';
	}

	/**
	 * @returns {string} The key to the resource within the actor's data model
	 */
	get attributeKey() {
		return `resources.${this.resourceType}`;
	}

	/**
	 * @returns {string} The full path to the accessor for resource in an actor's data model
	 */
	get attributePath() {
		return `resources.${this.resourceType}.value`;
	}

	get resourceLabel() {
		return game.i18n.localize(FU.resources[this.resourceType]);
	}
}

const recoveryFlavor = {
	hp: 'FU.HealthPointRecovery',
	mp: 'FU.MindPointRecovery',
	ip: 'FU.InventoryPointRecovery',
	fp: 'FU.TextEditorButtonCommandGain',
	exp: 'FU.TextEditorButtonCommandGain',
	zenit: 'FU.TextEditorButtonCommandGain',
};

const recoveryMessages = {
	hp: 'FU.HealthPointRecoveryMessage',
	mp: 'FU.MindPointRecoveryMessage',
	ip: 'FU.InventoryPointRecoveryMessage',
	fp: 'FU.ChatResourceGain',
	exp: 'FU.ChatResourceGain',
	zenit: 'FU.ChatResourceGain',
};

/**
 * @param {FUActor} actor
 * @param {String} resourcePath
 * @returns {number|number}
 */
function getResourcetValue(actor, resourcePath) {
	return parseInt(foundry.utils.getProperty(actor.system, resourcePath), 10) || 0;
}

/**
 * @param {FUActor} actor
 * @param {String} attributePath
 * @param {Number} amountRecovered
 * @returns {Promise<*>
 */
function createUpdateForRecovery(actor, attributePath, amountRecovered) {
	const currentValue = getResourcetValue(actor, attributePath);
	const newValue = Math.floor(currentValue) + Math.floor(amountRecovered);

	// Update the actor's resource directly
	const updateData = {
		[`system.${attributePath}`]: Math.floor(newValue),
	};
	return actor.update(updateData);
}

/**
 * @param {ResourceRequest} request
 * @return {Promise<Awaited<unknown>[]>}
 */
async function processRecovery(request) {
	const flavor = game.i18n.localize(recoveryFlavor[request.resourceType]);

	const updates = [];
	for (const actor of request.targets) {
		const amountRecovered = Math.max(0, request.amount + (actor.system.bonuses.incomingRecovery[request.resourceType] || 0));
		const attr = foundry.utils.getProperty(actor.system, request.attributeKey);
		const uncappedRecoveryValue = amountRecovered + attr.value;
		const updates = [];

		// Handle uncapped recovery logic
		if (request.uncapped === true && uncappedRecoveryValue > (attr.max || 0) && !request.isMetaCurrency) {
			// Overheal recovery
			const newValue = Object.defineProperties({}, Object.getOwnPropertyDescriptors(attr)); // Clone attribute
			newValue.value = uncappedRecoveryValue;
			updates.push(actor.modifyTokenAttribute(request.attributeKey, newValue, false, false));
		} else if (!request.isMetaCurrency) {
			// Normal recovery
			updates.push(actor.modifyTokenAttribute(request.attributeKey, amountRecovered, true));
		}

		// Handle specific cases for fp and exp
		if (request.isMetaCurrency) {
			updates.push(createUpdateForRecovery(actor, request.attributePath, amountRecovered));
		}

		updates.push(
			ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor }),
				flavor: flavor,
				content: await renderTemplate('systems/projectfu/templates/chat/chat-apply-recovery.hbs', {
					message: recoveryMessages[request.resourceType],
					actor: actor.name,
					amount: amountRecovered,
					resource: request.resourceLabel,
					from: request.sourceInfo.name,
				}),
			}),
		);
	}
	return Promise.all(updates);
}

const lossFlavor = {
	hp: 'FU.HealthPointLoss',
	mp: 'FU.MindPointLoss',
	ip: 'FU.InventoryPointLoss',
	fp: 'FU.TextEditorButtonCommandLoss',
	exp: 'FU.TextEditorButtonCommandLoss',
	zenit: 'FU.TextEditorButtonCommandLoss',
};

/**
 * @param {ResourceRequest} request
 * @return {Promise<Awaited<unknown>[]>}
 */
async function processLoss(request) {
	const amountLost = -request.amount;
	const flavor = game.i18n.localize(lossFlavor[request.resourceType]);

	const updates = [];
	for (const actor of request.targets) {
		if (request.isMetaCurrency) {
			const currentValue = foundry.utils.getProperty(actor.system, `${request.attributeKey}.value`) || 0;
			const newValue = Math.floor(currentValue) + Math.floor(amountLost);

			// Update the actor's resource directly
			const updateData = {};
			updateData[`system.${request.attributeKey}.value`] = Math.floor(newValue);
			updates.push(actor.update(updateData));
		} else {
			updates.push(actor.modifyTokenAttribute(`${request.attributeKey}`, amountLost, true));
		}

		updates.push(
			ChatMessage.create({
				speaker: ChatMessage.getSpeaker({ actor }),
				flavor: flavor,
				flags: Pipeline.initializedFlags(Flags.ChatMessage.ResourceLoss, true),
				content: await renderTemplate('systems/projectfu/templates/chat/chat-apply-loss.hbs', {
					message: 'FU.ChatResourceLoss',
					actor: actor.name,
					amount: request.amount,
					uuid: actor.uuid,
					resource: request.resourceType,
					key: request.attributeKey,
					resourceLabel: request.resourceLabel,
					from: request.sourceInfo.name,
				}),
			}),
		);
	}
	return Promise.all(updates);
}

/**
 * @param {CheckRenderData} data
 * @param {FUActor} actor
 * @param {FUItem} item
 */
function addSpendResourceChatMessageSection(data, actor, item, flags) {
	// TODO: Handle to the data models (misc ability, skill)
	if (item.system instanceof SpellDataModel) {
		Pipeline.toggleFlag(flags, Flags.ChatMessage.ResourceLoss);
		const resource = 'mp';
		data.push({
			order: CHECK_RESULT,
			partial: 'systems/projectfu/templates/chat/partials/chat-item-spend-resource.hbs',
			data: {
				name: item.name,
				actor: actor.uuid,
				item: item.uuid,
				icon: FU.resourceIcons[resource],
				hasTargets: item.system.maxTargets.value > 1,
			},
		});
	} else if (item.system.cost) {
		if (item.system.cost.amount === 0) {
			return;
		}
		Pipeline.toggleFlag(flags, Flags.ChatMessage.ResourceLoss);
		data.push({
			order: CHECK_RESULT,
			partial: 'systems/projectfu/templates/chat/partials/chat-item-spend-resource.hbs',
			data: {
				name: item.name,
				actor: actor.uuid,
				item: item.uuid,
				icon: FU.resourceIcons[item.system.cost.resource],
				hasTargets: item.system.rule === FU.targetingRules.multiple,
			},
		});
	}
}

/**
 * @param {Document} document
 * @param {jQuery} jQuery
 */
function onRenderChatMessage(document, jQuery) {
	if (!document.getFlag(SYSTEM, Flags.ChatMessage.ResourceLoss)) {
		return;
	}

	/**
	 * @param {Event} event
	 * @param dataset
	 * @param {FUActor[]} targets
	 * @returns {Promise<Awaited<*>[]>}
	 */
	const applyResourceLoss = async (event, dataset, targets) => {
		const sourceInfo = new InlineSourceInfo(dataset.name, dataset.actor, dataset.item);
		const actor = sourceInfo.resolveActor();
		const item = sourceInfo.resolveItem();

		let amount;
		let resource;
		let maxTargets;

		if (item.system instanceof SpellDataModel) {
			resource = 'mp';
			amount = item.system.mpCost.value;
			maxTargets = item.system.maxTargets.value ?? 0;
		} else if (item.system.cost) {
			resource = item.system.cost.resource;
			amount = item.system.cost.amount;
			maxTargets = item.system.cost.limit;
		}

		if (maxTargets > 1) {
			const targetCount = targets.length;
			if (targetCount === 0) {
				ui.notifications.warn('FU.ChatApplyNoCharacterSelected', { localize: true });
				return;
			} else if (targetCount > maxTargets) {
				ui.notifications.warn('FU.ChatApplyMaxTargetWarning', { localize: true });
				return;
			} else {
				amount = amount * targetCount;
			}
		}

		const request = new ResourceRequest(sourceInfo, [actor], resource, amount);
		return ResourcePipeline.processLoss(request);
	};

	Pipeline.handleClickRevert(jQuery, 'revertResourceLoss', async (dataset) => {
		const actor = fromUuidSync(dataset.uuid);
		const amount = dataset.amount;
		const attributeKey = dataset.key;
		const updates = [];
		updates.push(actor.modifyTokenAttribute(attributeKey, amount, true));
		return Promise.all(updates);
	});

	jQuery.find(`a[data-action=applyTargetedResourceLoss]`).click(function (event) {
		return Pipeline.handleClick(event, this.dataset, getTargeted, applyResourceLoss);
	});
	jQuery.find(`a[data-action=applySelectedResourceLoss]`).click(function (event) {
		return Pipeline.handleClick(event, this.dataset, getSelected, applyResourceLoss);
	});
	jQuery.find(`a[data-action=applyResourceLoss]`).click(function (event) {
		return Pipeline.handleClick(event, this.dataset, null, applyResourceLoss);
	});
}

export const ResourcePipeline = {
	processRecovery,
	processLoss,
	onRenderChatMessage,
	addSpendResourceChatMessageSection,
};
