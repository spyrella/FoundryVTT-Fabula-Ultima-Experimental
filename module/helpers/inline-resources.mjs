import { FU } from './config.mjs';
import { targetHandler } from './target-handler.mjs';
import { InlineHelper } from './inline-helper.mjs';
import { ExpressionContext, Expressions } from '../expressions/expressions.mjs';

const INLINE_RECOVERY = 'InlineRecovery';
const INLINE_LOSS = 'InlineLoss';

const classInlineRecovery = 'inline-recovery';
const classInlineLoss = 'inline-loss';

/**
 * @type {TextEditorEnricherConfig}
 */
const inlineRecoveryEnricher = {
	pattern: /@(?:HEAL|GAIN)\[\s*(?<amount>\(?.*?\)*?)\s(?<type>\w+?)]/gi,
	enricher: recoveryEnricher,
};

/**
 * @type {TextEditorEnricherConfig}
 */
const inlineLossEnricher = {
	pattern: /@LOSS\[\s*(?<amount>\(?.*?\)*?)\s(?<type>\w+?)]/gi,
	enricher: lossEnricher,
};

const recoveryFlavor = {
	hp: 'FU.HealthPointRecovery',
	mp: 'FU.MindPointRecovery',
	ip: 'FU.InventoryPointRecovery',
	fp: 'FU.TextEditorButtonCommandGain',
	exp: 'FU.TextEditorButtonCommandGain',
	zenit: 'FU.TextEditorButtonCommandGain',
};

const lossFlavor = {
	hp: 'FU.HealthPointLoss',
	mp: 'FU.MindPointLoss',
	ip: 'FU.InventoryPointLoss',
	fp: 'FU.TextEditorButtonCommandLoss',
	exp: 'FU.TextEditorButtonCommandLoss',
	zenit: 'FU.TextEditorButtonCommandLoss',
};

const messages = {
	hp: 'FU.HealthPointRecoveryMessage',
	mp: 'FU.MindPointRecoveryMessage',
	ip: 'FU.InventoryPointRecoveryMessage',
	fp: 'FU.ChatResourceGain',
	exp: 'FU.ChatResourceGain',
	zenit: 'FU.ChatResourceGain',
};

function createReplacementElement(amount, type, elementClass, uncapped, tooltip) {
	if (type in FU.resources) {
		const anchor = document.createElement('a');
		anchor.dataset.type = type;
		anchor.setAttribute('data-tooltip', `${game.i18n.localize(tooltip)} (${amount})`);

		// Used to enable over-healing
		if (uncapped === true) {
			anchor.dataset.uncapped = 'true';
		}
		anchor.draggable = true;
		anchor.classList.add('inline', elementClass);

		const indicator = document.createElement('i');
		indicator.classList.add('indicator');
		anchor.append(indicator);

		// AMOUNT
		InlineHelper.appendAmountToAnchor(anchor, amount);
		// TYPE
		anchor.append(` ${game.i18n.localize(FU.resourcesAbbr[type])}`);
		// ICON
		const icon = document.createElement('i');
		icon.className = FU.resourceIcons[type];
		icon.classList.add(type);
		anchor.append(icon);

		return anchor;
	} else {
		return null;
	}
}

function recoveryEnricher(text, options) {
	// Detect and handle uncapped recovery
	let uncapped = false;
	if (text[1].match(/^\d+\+$/)) {
		uncapped = true;
		text[1] = text[1].slice(0, -1);
	}

	const amount = text[1];
	const type = text[2];
	return createReplacementElement(amount, type.toLowerCase(), classInlineRecovery, uncapped, `FU.InlineRecovery`);
}

function lossEnricher(text, options) {
	const amount = text[1];
	const type = text[2];
	return createReplacementElement(amount, type.toLowerCase(), classInlineLoss, false, `FU.InlineLoss`);
}

/**
 * @param {ClientDocument} document
 * @param {jQuery} html
 */
function activateListeners(document, html) {
	if (document instanceof DocumentSheet) {
		document = document.document;
	}

	html.find('a.inline.inline-recovery[draggable], a.inline.inline-loss[draggable]')
		.on('click', async function () {
			let targets = await targetHandler();
			if (targets.length > 0) {
				const sourceInfo = InlineHelper.determineSource(document, this);
				const type = this.dataset.type;
				const uncapped = this.dataset.uncapped === 'true';
				const context = ExpressionContext.fromUuid(sourceInfo.actorUuid, sourceInfo.itemUuid, targets);
				const amount = Expressions.evaluate(this.dataset.amount, context);

				if (this.classList.contains(classInlineRecovery)) {
					targets.forEach((actor) => applyRecovery(actor, type, amount, sourceInfo.name || 'inline recovery', uncapped));
				} else if (this.classList.contains(classInlineLoss)) {
					targets.forEach((actor) => applyLoss(actor, type, amount, sourceInfo.name || 'inline loss'));
				}
			}
		})
		.on('dragstart', function (event) {
			/** @type DragEvent */
			event = event.originalEvent;
			if (!(this instanceof HTMLElement) || !event.dataTransfer) {
				return;
			}

			const sourceInfo = InlineHelper.determineSource(document, this);
			const data = {
				type: this.classList.contains(classInlineRecovery) ? INLINE_RECOVERY : INLINE_LOSS,
				sourceInfo: sourceInfo,
				recoveryType: this.dataset.type,
				amount: this.dataset.amount,
				uncapped: this.dataset.uncapped === 'true',
			};
			event.dataTransfer.setData('text/plain', JSON.stringify(data));
			event.stopPropagation();
		});
}

function onDropActor(actor, sheet, { type, recoveryType, amount, sourceInfo, uncapped }) {
	const context = ExpressionContext.fromUuid(sourceInfo.actorUuid, sourceInfo.itemUuid, [actor]);
	amount = Expressions.evaluate(amount, context);

	if (type === INLINE_RECOVERY && !Number.isNaN(amount)) {
		applyRecovery(actor, recoveryType, amount, sourceInfo.name, uncapped);
		return false;
	} else if (type === INLINE_LOSS && !Number.isNaN(amount)) {
		applyLoss(actor, recoveryType, amount, sourceInfo.name);
		return false;
	}
}

async function applyRecovery(actor, resource, amount, source, uncapped) {
	const amountRecovered = Math.max(0, amount + (actor.system.bonuses.incomingRecovery[resource] || 0));
	const isValue = resource === 'fp' || resource === 'exp' || resource === 'zenit';
	const attrKey = `resources.${resource}`;
	const attr = foundry.utils.getProperty(actor.system, attrKey);
	const uncappedRecoveryValue = amountRecovered + attr.value;
	const updates = [];

	// Handle uncapped recovery logic
	if (uncapped === true && uncappedRecoveryValue > (attr.max || 0) && !isValue) {
		// Overheal recovery
		const newValue = Object.defineProperties({}, Object.getOwnPropertyDescriptors(attr)); // Clone attribute
		newValue.value = uncappedRecoveryValue;
		updates.push(actor.modifyTokenAttribute(attrKey, newValue, false, false));
	} else if (!isValue) {
		// Normal recovery
		updates.push(actor.modifyTokenAttribute(attrKey, amountRecovered, true));
	}

	// Handle specific cases for fp and exp
	if (isValue) {
		const currentValue = parseInt(foundry.utils.getProperty(actor.system, `resources.${resource}.value`), 10) || 0;
		const newValue = Math.floor(currentValue) + Math.floor(amountRecovered);

		// Update the actor's resource directly
		const updateData = {
			[`system.resources.${resource}.value`]: Math.floor(newValue),
		};
		await actor.update(updateData);
	}

	updates.push(
		ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: game.i18n.localize(recoveryFlavor[resource]),
			content: await renderTemplate('systems/projectfu/templates/chat/chat-apply-recovery.hbs', {
				message: messages[resource],
				actor: actor.name,
				amount: amountRecovered,
				resource: game.i18n.localize(FU.resources[resource]),
				from: source,
			}),
		}),
	);
	return Promise.all(updates);
}

async function applyLoss(actor, resource, amount, source) {
	const amountLost = -amount;
	const isValue = resource === 'fp' || resource === 'exp' || resource === 'zenit';
	const updates = [];

	// Handle specific cases for fp and exp
	if (isValue) {
		const currentValue = foundry.utils.getProperty(actor.system, `resources.${resource}.value`) || 0;
		const newValue = Math.floor(currentValue) + Math.floor(amountLost);

		// Update the actor's resource directly
		const updateData = {};
		updateData[`system.resources.${resource}.value`] = Math.floor(newValue);
		await actor.update(updateData);
	} else {
		updates.push(actor.modifyTokenAttribute(`resources.${resource}`, amountLost, true));
	}

	updates.push(
		ChatMessage.create({
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: game.i18n.localize(lossFlavor[resource]),
			content: await renderTemplate('systems/projectfu/templates/chat/chat-apply-loss.hbs', {
				message: 'FU.ChatResourceLoss',
				actor: actor.name,
				amount: amount,
				resource: game.i18n.localize(FU.resources[resource]),
				from: source,
			}),
		}),
	);
	return Promise.all(updates);
}

export const InlineResources = {
	enrichers: [inlineRecoveryEnricher, inlineLossEnricher],
	activateListeners,
	onDropActor,
};
