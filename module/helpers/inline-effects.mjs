import { statusEffects } from './statuses.mjs';
import { FUActor } from '../documents/actors/actor.mjs';
import { FUItem } from '../documents/items/item.mjs';
import { Flags } from './flags.mjs';
import { SYSTEM } from './config.mjs';
import { FUActiveEffect } from '../documents/effects/active-effect.mjs';
import { Effects, toggleStatusEffect } from '../documents/effects/effects.mjs';
import { targetHandler } from './target-handler.mjs';
import { InlineEffectConfiguration } from './inline-effect-configuration.mjs';
import { InlineHelper } from './inline-helper.mjs';

const INLINE_EFFECT = 'InlineEffect';
const INLINE_EFFECT_CLASS = 'inline-effect';

const SUPPORTED_STATUSES = Effects.statuses;
const BOONS_AND_BANES = Effects.boonsAndBanes;

/**
 * @typedef InlineEffectConfig
 * @property {"status", "boonOrBane", "custom"} type
 * @property {'dazed', 'enraged', 'poisoned', 'shaken', 'slow', 'weak'} status
 * @property {GuidedInlineEffectConfig} guided
 */

const enricher = {
	pattern: /@EFFECT\[([a-zA-Z0-9+/-]+={0,3})]/g,
	enricher: inlineEffectEnricher,
};

function createEffectAnchor(effect) {
	const anchor = document.createElement('a');
	anchor.draggable = true;
	anchor.dataset.effect = InlineHelper.toBase64(effect);
	anchor.classList.add('inline', INLINE_EFFECT_CLASS, 'disable-how-to');
	const icon = document.createElement('i');
	icon.classList.add('fun', 'fu-aura');
	anchor.append(icon);
	anchor.append(effect.name);
	return anchor;
}

function createBrokenAnchor() {
	const anchor = document.createElement('a');
	anchor.classList.add('inline', 'broken');
	const icon = document.createElement('i');
	icon.classList.add('fas', 'fa-chain-broken');
	anchor.append(icon);
	anchor.append(game.i18n.localize('FU.InlineEffectInvalid'));
	return anchor;
}

function createStatusAnchor(effectValue, status) {
	const anchor = document.createElement('a');
	anchor.draggable = true;
	anchor.dataset.status = effectValue;
	anchor.classList.add('inline', INLINE_EFFECT_CLASS, 'disable-how-to');
	const icon = document.createElement('i');
	icon.classList.add('fun', 'fu-aura');
	anchor.append(icon);
	anchor.append(game.i18n.localize(status.name));
	return anchor;
}

/**
 * @param text
 * @param options
 */
function inlineEffectEnricher(text, options) {
	/** @type string */
	const effectValue = text[1];

	if (SUPPORTED_STATUSES.includes(effectValue) || BOONS_AND_BANES.includes(effectValue)) {
		const status = statusEffects.find((value) => value.id === effectValue);
		if (status) {
			return createStatusAnchor(effectValue, status);
		}
	} else {
		const decodedEffect = InlineHelper.fromBase64(effectValue);
		if (decodedEffect && decodedEffect.name && decodedEffect.changes) {
			return createEffectAnchor(decodedEffect);
		}
	}

	return createBrokenAnchor();
}

// TODO: Use the helper
/**
 * @param {ClientDocument} document
 * @param {HTMLElement} element - The target HTML element associated with the event.
 * @returns {string|null}
 */
function determineSource(document, element) {
	if (document instanceof FUActor) {
		const itemId = $(element).closest('[data-item-id]').data('itemId'); // Changed event.target to element
		return itemId ? document.items.get(itemId).uuid : document.uuid;
	} else if (document instanceof FUItem) {
		return document.uuid;
	} else if (document instanceof ChatMessage) {
		const speakerActor = ChatMessage.getSpeakerActor(document.speaker);
		const flagItem = document.getFlag(SYSTEM, Flags.ChatMessage.Item);
		if (flagItem && speakerActor) {
			const item = speakerActor.items.get(flagItem._id);
			return item ? item.uuid : null;
		}
		if (speakerActor) {
			return speakerActor.uuid;
		}
	}
	return null;
}

/**
 * @param {ClientDocument} document
 * @param {jQuery} html
 */
function activateListeners(document, html) {
	if (document instanceof DocumentSheet) {
		document = document.document;
	}

	html.find('a.inline.inline-effect[draggable]')
		.on('click', async function (event) {
			const source = determineSource(document, this);
			const effectData = InlineHelper.fromBase64(this.dataset.effect);
			const status = this.dataset.status;
			const isCtrlClick = event.ctrlKey;

			const targets = await targetHandler();
			if (!targets.length) return;
			targets.forEach((actor) => {
				if (effectData) {
					isCtrlClick ? Effects.onRemoveEffectFromActor(actor, source, effectData) : Effects.onApplyEffectToActor(actor, source, effectData);
				} else if (status) {
					isCtrlClick ? toggleStatusEffect(actor, status, source, { disable: true }) : !actor.statuses.has(status) && toggleStatusEffect(actor, status, source);
				}
			});
		})
		.on('dragstart', function (event) {
			/** @type DragEvent */
			event = event.originalEvent;
			if (!(event.target instanceof HTMLElement) || !event.dataTransfer) {
				return;
			}
			const source = determineSource(document, this);

			const data = {
				type: INLINE_EFFECT,
				source: source,
				effect: InlineHelper.fromBase64(this.dataset.effect),
				status: this.dataset.status,
			};
			event.dataTransfer.setData('text/plain', JSON.stringify(data));
			event.stopPropagation();
		})
		.on('contextmenu', function (event) {
			event.preventDefault();
			event.stopPropagation();
			let effectData;
			if (this.dataset.status) {
				const status = this.dataset.status;
				const statusEffect = CONFIG.statusEffects.find((value) => value.id === status);
				if (statusEffect) {
					effectData = { ...statusEffect, statuses: [status] };
				}
			} else {
				effectData = InlineHelper.fromBase64(this.dataset.effect);
			}
			if (effectData) {
				effectData.origin = determineSource(document, this);
				const cls = getDocumentClass('ActiveEffect');
				delete effectData.id;
				cls.migrateDataSafe(effectData);
				cls.cleanData(effectData);
				Actor.create({ name: 'Temp Actor', type: 'character' }, { temporary: true })
					.then((value) => {
						return cls.create(effectData, { temporary: true, render: true, parent: value });
					})
					.then((value) => {
						const activeEffectConfig = new ActiveEffectConfig(value);
						activeEffectConfig.render(true, { editable: false });
					});
			}
		});
}

function onDropActor(actor, sheet, { type, source, effect, status }) {
	if (type === INLINE_EFFECT) {
		if (status) {
			if (!actor.statuses.has(status)) {
				toggleStatusEffect(actor, status, source);
			}
		} else if (effect) {
			ActiveEffect.create(
				{
					...effect,
					origin: source,
					flags: foundry.utils.mergeObject(effect.flags ?? {}, { [SYSTEM]: { [FUActiveEffect.TEMPORARY_FLAG]: true } }),
				},
				{ parent: actor },
			);
		}
		return false;
	}
}

function showEffectConfiguration(state, dispatch, view, ...rest) {
	new InlineEffectConfiguration(state, dispatch).render(true);
}

function initialize() {
	CONFIG.TextEditor.enrichers.push(enricher);
	Hooks.on('renderChatMessage', activateListeners);
	Hooks.on('renderApplication', activateListeners);
	Hooks.on('renderActorSheet', activateListeners);
	Hooks.on('renderItemSheet', activateListeners);
	Hooks.on('dropActorSheetData', onDropActor);
}

export const InlineEffects = {
	showEffectConfiguration,
	initialize,
};
