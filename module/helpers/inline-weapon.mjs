import { FU } from './config.mjs';
import { InlineHelper } from './inline-helper.mjs';
import { targetHandler } from './target-handler.mjs';
import { CharacterDataModel } from '../documents/actors/character/character-data-model.mjs';
import { ChooseWeaponDialog } from '../documents/items/skill/choose-weapon-dialog.mjs';
import { Effects } from '../documents/effects/effects.mjs';

const INLINE_WEAPON = 'InlineWeapon';
const className = `inline-weapon`;

/**
 * @type {TextEditorEnricherConfig}
 */
const editorEnricher = {
	pattern: /@WEAPON\[(?<traits>.*?)\]/g,
	enricher: (match, options) => {
		const traits = match.groups.traits.split(' ');
		if (traits.length >= 1) {
			const anchor = document.createElement('a');
			anchor.classList.add('inline', className);
			anchor.draggable = true;
			anchor.dataset.traits = match.groups.traits;
			// TOOLTIP
			anchor.setAttribute('data-tooltip', `${game.i18n.localize('FU.InlineWeapon')} (${traits})`);

			const label = traits.map(InlineHelper.capitalize).join(' ');
			// ICON
			const icon = document.createElement('i');
			icon.classList.add(`fui`, FU.allIcon.weaponEnchant);
			anchor.append(icon);
			// TEXT
			anchor.append(label);
			return anchor;
		}

		return null;
	},
};

/**
 * @param {ClientDocument} document
 * @param {jQuery} html
 */
function activateListeners(document, html) {
	if (document instanceof DocumentSheet) {
		document = document.document;
	}

	html.find(`a.inline.inline-weapon[draggable]`)
		.on('click', async function () {
			let targets = await targetHandler();
			if (targets.length > 0) {
				const sourceInfo = InlineHelper.determineSource(document, this);
				const traits = this.dataset.traits.split(' ');
				targets.forEach(async (target) => {
					await applyTraitsToWeapon(target, sourceInfo, traits);
				});
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
				type: INLINE_WEAPON,
				sourceInfo: sourceInfo,
			};
			event.dataTransfer.setData('text/plain', JSON.stringify(data));
			event.stopPropagation();
		});
}

/**
 * @param {String} type
 * @returns {ActiveEffectData}
 */
function createAlterDamageTypeEffect(type) {
	return {
		fuid: `alter-damage-type-${type}`,
		name: `Alter Damage Type (${InlineHelper.capitalize(type)})`,
		img: `systems/projectfu/styles/static/affinities/${type}.svg`,
		transfer: false,
		changes: [
			{
				key: 'system.damageType.value',
				mode: Effects.modes.Override,
				value: type,
			},
		],
	};
}

/**
 * @param {FUActor} actor
 * @param {InlineSourceInfo} sourceInfo
 * @param {string[]} traits
 */
async function applyTraitsToWeapon(actor, sourceInfo, traits) {
	if (actor.system instanceof CharacterDataModel) {
		const source = sourceInfo.resolve();
		const weapon = await ChooseWeaponDialog.prompt(actor);

		traits.forEach(async (trait) => {
			if (trait in FU.damageTypes) {
				const effectData = createAlterDamageTypeEffect(trait);
				const effect = await Effects.onApplyEffectToActor(weapon, source, effectData);
				console.info(`Created effect: ${effect.uuid} on weapon uuid: ${weapon.uuid}, id: ${weapon.id}`);

				return Effects.linkEffectToActor(actor, effect);
			}
		});

		console.info(`Applied ${traits} from ${sourceInfo.name} to weapon '${weapon.uuid}' on actor '${actor.uuid}' from source ${source.uuid}`);
	} else {
		ui.notifications.error('FU.ChatApplyNoCharacterSelected', { localize: true });
	}
}

function onDropActor(actor, sheet, { type, sourceInfo, ignore }) {
	if (type === INLINE_WEAPON) {
		return false;
	}
}

export const InlineWeapon = {
	enricher: editorEnricher,
	activateListeners,
	onDropActor,
};
