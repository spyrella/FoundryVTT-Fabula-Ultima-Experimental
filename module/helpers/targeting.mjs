import { ChooseWeaponDialog } from '../documents/items/skill/choose-weapon-dialog.mjs';
import { CHECK_RESULT } from '../checks/default-section-order.mjs';
import { Pipeline } from '../pipelines/pipeline.mjs';
import { Flags } from './flags.mjs';
import { SYSTEM } from './config.mjs';
import { RenderCheckSectionBuilder } from '../checks/check-hooks.mjs';
import { getTargeted } from './target-handler.mjs';

/**
 * @typedef {"self", "single", "multiple", "weapon", "special"} TargetingRule
 */

/**
 * @typedef TargetData
 * @property {string} name The name of the actor
 * @property {string} uuid The uuid of the actor
 * @property {string} link An html link to the actor
 * @property {"none", "hit", "miss"} result
 * //TODO: Add a map of optional properties?
 * @property {number} difficulty Additional information
 */

// TODO: Make an option for GM
/**
 * @type {boolean}
 */
const STRICT_TARGETING = false;

/**
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {FUActor[] | Token[] | TargetData[]} targets
 * @returns {FUActor[]|FUItem}
 */
async function filterTargetsByRule(actor, item, targets) {
	if (!item.system.targeting) {
		throw Error(`"No targeting data model in the given item ${item.name}`);
	}

	/**
	 * @type {TargetingDataModel}
	 */
	const targeting = item.system.targeting;

	switch (targeting.rule) {
		case 'self':
			return [actor];
		case 'single':
			if (targets.length === 0) {
				return [];
			} else if (targets.length > 1) {
				ui.notifications.warn('FU.ChatApplyMaxTargetWarning', { localize: true });
				return [];
			}
			return [targets[0]];
		case 'multiple':
			if (targets.length === 0) {
				return [];
			} else if (targets.length > targeting.max.value) {
				ui.notifications.warn('FU.ChatApplyMaxTargetWarning', { localize: true });
				return [];
			}
			return targets;
		case 'weapon': {
			const weapon = await ChooseWeaponDialog.prompt(actor);
			return [weapon];
		}
		case 'special':
			return [];
	}
}

/**
 * @property {String} name The name of the action to be used by jQuery
 * @property {String} icon The font awesome icon
 * @property {String} tooltip The localized tooltip to use
 * @property {Object} fields The fields to use for the action's dataset
 * @remarks Expects an action handler where dataset.id is a reference to an actor
 */
class TargetAction {
	constructor(name, icon, tooltip, fields) {
		this.name = name;
		this.icon = icon;
		this.tooltip = tooltip;
		this.fields = fields ?? {};
	}
}

/**
 * @type {TargetAction}
 * @description Target the token
 */
const defaultAction = new TargetAction('targetSingle', 'fa-bullseye', 'FU.ChatContextRetarget');

/**
 * @inheritDoc
 * @property {TargetAction[]} section.data.actions
 * @property {TargetAction} section.data.selectedAction
 */
export class TargetChatSectionBuilder extends RenderCheckSectionBuilder {
	constructor(data, actor, item, targets, flags) {
		super(data, actor, item, targets, flags, CHECK_RESULT, 'systems/projectfu/templates/chat/partials/chat-targets.hbs');
		Pipeline.toggleFlag(flags, Flags.ChatMessage.Targets);
		this.section.data.actions = [];
		this.section.data.selectedActions = [];
		if (item.system.targeting) {
			this.withTargetingFromModel();
		}
		this.addTargetAction(defaultAction);
	}

	/**
	 * Adds targeting data if the {@link FUItem}'s data model has a {@link TargetingDataModel}
	 */
	withTargetingFromModel() {
		this.targeting = this.item.system.targeting;
		this.section.data.rule = this.targeting.rule ?? Targeting.rule.multiple;
		this.addData(async (data) => {
			data.targets = await filterTargetsByRule(this.actor, this.item, this.targets);
		});
		return this;
	}

	/**
	 * @description Adds targeting data directly
	 * @param {TargetData[]} targets
	 *
	 */
	withDefaultTargeting() {
		this.section.data.rule = this.targets?.length > 1 ? Targeting.rule.multiple : Targeting.rule.single;
		this.section.data.targets = this.targets;
		return this;
	}

	/**
	 * @param {TargetAction} action An action to be applied on a target that was snapshot when the message was created
	 */
	addTargetAction(action) {
		this.addData(async (data) => {
			data.actions.push(action);
		});
	}

	/**
	 * @param {TargetAction} action An action to be applied on a target that is selected when invokeed
	 */
	addSelectedAction(action) {
		this.addData(async (data) => {
			data.selectedActions.push(action);
		});
	}

	applyDamage(accuracyData, damageData) {
		const action = new TargetAction('applyDamage', 'fa-heart-crack', 'FU.ChatApplyDamageTooltip', {
			accuracy: accuracyData,
			damage: damageData,
		});

		this.addTargetAction(action);

		const selectedAction = new TargetAction('applyDamageSelected', 'fa-heart-crack', 'FU.ChatApplyDamageTooltip', {
			accuracy: accuracyData,
			damage: damageData,
		});

		this.addSelectedAction(selectedAction);
	}

	validate() {
		if (!super.validate()) {
			return false;
		}

		if (!STRICT_TARGETING) {
			return true;
		}

		const rule = this.section.data.rule;
		const targets = this.section.data.targets;
		switch (rule) {
			case Targeting.rule.multiple:
				return targets.length >= 1;
			case Targeting.rule.single:
			case Targeting.rule.self:
				return targets.length === 1;
			default:
				break;
		}
		return true;
	}
}

/**
 * @returns {TargetData[]}
 */
function getSerializedTargetData() {
	const targets = getTargeted();
	return serializeTargetData(targets);
}

/**
 * @param {FUActor[]} targets
 * @return {TargetData[]}
 */
function serializeTargetData(targets) {
	return targets.map((target) => {
		return {
			name: target.name,
			uuid: target.uuid,
			link: target.link,
			result: 'none',
		};
	});
}

/**
 * @param {TargetData[]} targetData
 * @return {FUActor[]}
 */
function deserializeTargetData(targetData) {
	const targets = targetData.map((t) => fromUuidSync(t.uuid));
	return targets;
}

/**
 * @param {Document} document
 * @param {jQuery} jQuery
 */
function onRenderChatMessage(document, jQuery) {
	if (!document.getFlag(SYSTEM, Flags.ChatMessage.Targets)) {
		return;
	}

	jQuery.find(`a[data-action=${defaultAction.name}]`).click(function (event) {
		console.debug(`Targeting ${this.dataset.id}`);
		const actor = fromUuidSync(this.dataset.id);
		const token = actor.token.object;
		if (!validateCombatant(token)) {
			return;
		}
		return pingCombatant(token);
	});
}

function validateCombatant(token) {
	const canvas = game.canvas;
	if (!canvas.ready || token.scene.id !== canvas.scene.id) {
		return false;
	}
	if (!token.visible) {
		return ui.notifications.warn(game.i18n.localize('COMBAT.WarnNonVisibleToken'));
	}
	return true;
}

async function pingCombatant(token) {
	const canvas = game.canvas;
	await canvas.ping(token.center);
	await panToCombatant(token);
}

async function panToCombatant(token) {
	const canvas = game.canvas;
	const { x, y } = token.center;
	await canvas.animatePan({ x, y, scale: Math.max(canvas.stage.scale.x, 0.5) });
}

export const Targeting = Object.freeze({
	rule: {
		self: 'self',
		single: 'single',
		multiple: 'multiple',
		weapon: 'weapon',
		special: 'special',
	},
	filterTargetsByRule,
	getSerializedTargetData,
	serializeTargetData,
	deserializeTargetData,
	onRenderChatMessage,
	STRICT_TARGETING,
});
