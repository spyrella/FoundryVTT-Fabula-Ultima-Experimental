import { FUActor } from '../actors/actor.mjs';
import { FU, SYSTEM } from '../../helpers/config.mjs';
import { FUActiveEffect } from './active-effect.mjs';

/**
 * @typedef EffectChangeData
 * @property {String} key The attribute path in the Actor or Item data which the change modifies
 * @property {String} value The value of the change effect
 * @property {Number} mode The modification mode with which the change is applied
 * @property {Number} priority The priority level with which this change is applied
 * @remarks https://foundryvtt.com/api/interfaces/foundry.types.EffectChangeData.html
 */

/**
 *
 * Change Modes
 * {
 *     "Add" : 0,
 *     "Multiply" : 1,
 *     "Override": 2,
 *     "Downgrade": 3,
 *     "Upgrade": 4,
 *     "Custom": 5
 * }
 */

/**
 * @typedef {Object} ActiveEffectData
 * @property {string} _id - The unique identifier of the active effect.
 * @property {string} name - The name of the active effect.
 * @property {string} img - The image path associated with the active effect.
 * @property {EffectChangeData[]} changes - An array of changes applied by the active effect.
 * @property {boolean} disabled - Whether the active effect is disabled.
 * @property {EffectDurationData} duration - The duration data of the active effect.
 * @property {string} description - The description of the active effect.
 * @property {string} origin - The source or origin of the active effect.
 * @property {string} tint - The tint color applied to the active effect.
 * @property {boolean} transfer - Whether the active effect can be transferred.
 * @property {Set<string>} statuses - A set of statuses associated with the active effect.
 * @property {Object} flags - Additional flags or metadata for the active effect.
 */

/**
 * @param {Actor|Item} owner The owning document which manages this effect
 * @param {String} effectType
 * @param {String} name
 * @returns {*}
 */
function createTemporaryEffect(owner, effectType, name) {
	return owner.createEmbeddedDocuments('ActiveEffect', [
		{
			label: name ?? game.i18n.localize('FU.NewEffect'),
			icon: 'icons/svg/aura.svg',
			origin: owner.uuid,
			'duration.rounds': effectType === 'temporary' ? 1 : undefined,
			disabled: effectType === 'inactive',
		},
	]);
}

/**
 * Manage Active Effect instances through the Actor Sheet via effect control buttons.
 * @param {MouseEvent} event      The left-click event on the effect control
 * @param {Actor|Item} owner      The owning document which manages this effect
 */
export async function onManageActiveEffect(event, owner) {
	event.preventDefault();
	const a = event.currentTarget;
	const li = a.closest('li');
	const effectId = li.dataset.effectId;
	let effect;
	if (owner instanceof FUActor) {
		effect = Array.from(owner.allApplicableEffects()).find((value) => value.id === effectId);
	} else {
		effect = owner.effects.get(effectId);
	}
	switch (a.dataset.action) {
		case 'create':
			return createTemporaryEffect(owner, li.dataset.effectType);
		case 'edit':
			return effect.sheet.render(true);
		case 'delete':
			return effect.delete();
		case 'toggle':
			return effect.update({ disabled: !effect.disabled });
		case 'copy-inline':
			await handleCopyInlineEffect(effect);
			break;
		case 'roll':
			return await handleRollEffect(effect, owner);
	}
}

/**
 * Prepare the data structure for Active Effects which are currently applied to an Actor or Item.
 * @param {ActiveEffect[]} effects    The array of Active Effect instances to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
	// Define effect header categories
	const categories = {
		temporary: {
			type: 'temporary',
			label: game.i18n.localize('FU.TemporaryEffects'),
			effects: [],
		},
		passive: {
			type: 'passive',
			label: game.i18n.localize('FU.PassiveEffects'),
			effects: [],
		},
		inactive: {
			type: 'inactive',
			label: game.i18n.localize('FU.InactiveEffects'),
			effects: [],
		},
	};

	// Iterate over active effects, classifying them into categories
	for (let e of effects) {
		if (e.disabled) categories.inactive.effects.push(e);
		else if (e.isTemporary) categories.temporary.effects.push(e);
		else categories.passive.effects.push(e);
	}
	return categories;
}

/**
 * A helper function to toggle a status effect on an Actor.
 * Designed based off TokenDocument#toggleActiveEffect to properly interact with token hud.
 * @param {FUActor} actor the actor the status should get applied to
 * @param {string} statusEffectId The status effect id based on CONFIG.statusEffects
 * @param {string} [source] the UUID of the document that caused the effect
 * @returns {Promise<boolean>} Whether the ActiveEffect is now on or off
 */
export async function toggleStatusEffect(actor, statusEffectId, source = undefined) {
	const existing = actor.effects.filter((effect) => isActiveEffectForStatusEffectId(effect, statusEffectId));
	if (existing.length > 0) {
		await Promise.all(existing.map((e) => e.delete()));
		return false;
	} else {
		const statusEffect = CONFIG.statusEffects.find((e) => e.id === statusEffectId);
		if (statusEffect) {
			await ActiveEffect.create({ ...statusEffect, statuses: [statusEffectId], origin: source }, { parent: actor });
		}
		return true;
	}
}

// Helper function to encode an effect in base64
export function encodeBase64(data) {
	return btoa(unescape(encodeURIComponent(data)));
}

// Helper function to generate the @EFFECT format string
export function formatEffect(effect) {
	const encodedEffect = encodeBase64(JSON.stringify(effect.toJSON()));
	return `@EFFECT[${encodedEffect}]`;
}

/**
 * Generate encoded effect and copy to clipboard.
 * @param {ActiveEffect} effect - The ActiveEffect to encode and copy
 */
export async function handleCopyInlineEffect(effect) {
	try {
		const encodedEffect = formatEffect(effect);

		await navigator.clipboard.writeText(encodedEffect);

		if (ui && ui.notifications) {
			ui.notifications.info('Inline effect copied to clipboard.');
		}
	} catch (error) {
		console.error('Failed to copy effect to clipboard:', error);
	}
}

export function isActiveEffectForStatusEffectId(effect, statusEffectId) {
	return effect.statuses.size === 1 && effect.statuses.has(statusEffectId);
}

/**
 * Handle rolling the effect and creating a chat message.
 * @param {ActiveEffect} effect  The ActiveEffect to be rolled and encoded
 * @param {Actor|Item} owner     The owning document (actor or item)
 */
async function handleRollEffect(effect, owner) {
	if (!effect) {
		ui.notifications.error('Effect not found.');
		return;
	}

	const formattedEffect = formatEffect(effect);
	const description = effect.description ? effect.description : game.i18n.localize('FU.NoItem');

	const messageContent = `
		<div class="chat-effect-message">
			<header class="title-desc chat-header flexrow"><h2>${effect.name}</h2></header>
			<div class="chat-desc">
				${description}
				${formattedEffect ? `<div><hr>${formattedEffect}</div>` : ''}
			</div>
		</div>
	`;

	await ChatMessage.create({
		content: messageContent,
		speaker: ChatMessage.getSpeaker({ actor: owner }),
	});
}

function onRemoveEffectFromActor(actor, source, effect) {
	if (!actor) return;

	const existingEffect = actor.effects.find(
		(e) =>
			e.getFlag(SYSTEM, FUActiveEffect.TEMPORARY_FLAG) &&
			e.origin === source &&
			e.changes.length === effect.changes.length &&
			e.changes.every((change, index) => change.key === effect.changes[index].key && change.mode === effect.changes[index].mode && change.value === effect.changes[index].value),
	);

	if (existingEffect) {
		console.log(`Removing effect: ${existingEffect.name}`);
		existingEffect.delete();
	} else {
		console.log('No matching effect found to remove.');
	}
}

/**
 * @param {FUActor} actor
 * @param {String} sourceUuid
 * @param {ActiveEffectData} effect
 */
function onApplyEffectToActor(actor, sourceUuid, effect) {
	if (actor) {
		ActiveEffect.create(
			{
				...effect,
				origin: sourceUuid,
				flags: foundry.utils.mergeObject(effect.flags ?? {}, { [SYSTEM]: { [FUActiveEffect.TEMPORARY_FLAG]: true } }),
			},
			{ parent: actor },
		);
	}
}

const SUPPORTED_STATUSES = ['dazed', 'enraged', 'poisoned', 'shaken', 'slow', 'weak'];
const BOONS_AND_BANES = ['dex-up', 'ins-up', 'mig-up', 'wlp-up', 'dex-down', 'ins-down', 'mig-down', 'wlp-down', 'guard', 'cover', 'aura', 'barrier', 'flying', 'provoked'];
const damageTypes = (({ untyped, ...rest }) => rest)(FU.damageTypes);
const temporaryEffects = (({ ...rest }) => rest)(FU.temporaryEffects);

export const Effects = Object.freeze({
	statuses: SUPPORTED_STATUSES,
	boonsAndBanes: BOONS_AND_BANES,
	damageTypes: damageTypes,
	temporaryEffects: temporaryEffects,
	onRemoveEffectFromActor,
	onApplyEffectToActor,
	createTemporaryEffect,
});