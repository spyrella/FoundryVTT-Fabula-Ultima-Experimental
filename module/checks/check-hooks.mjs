import { SYSTEM } from '../helpers/config.mjs';
import { Pipeline } from '../pipelines/pipeline.mjs';

export const CheckHooks = Object.freeze({
	prepareCheck: `${SYSTEM}.prepareCheck`,
	processCheck: `${SYSTEM}.processCheck`,
	renderCheck: `${SYSTEM}.renderCheck`,
});

/**
 * @typedef {string} CheckId
 */

/**
 * @typedef CheckModifier
 * @property {string} label the label or localization key for this modifier
 * @property {number} value the value of this modifier
 */

/**
 * @typedef CheckV2 the basic configuration of the check. This object is sealed
 * @property {CheckType} type the type of the check
 * @property {CheckId} id a unique identifier for this check
 * @property {Attribute} primary the first attribute
 * @property {Attribute} secondary the second attribute
 * @property {CheckModifier[]} modifiers array of modifiers
 * @property {Object} additionalData additional data attached to the check, not used by the core check engine, for extension use
 */

/**
 * @callback CheckCallback
 * @param {CheckV2} check
 * @param {FUActor} actor
 * @param {FUItem} item
 * @return {Promise | void}
 */

/**
 * @callback CheckCallbackRegistration
 * @param {CheckCallback} callback
 * @param {number} [priority=0]
 * @return void
 */

/**
 * @callback PrepareCheckHook
 * Hook called to prepare static modifiers
 * @param {CheckV2} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallbackRegistration} registerCallback
 */

/**
 * @type PrepareCheckHook
 */
// eslint-disable-next-line no-unused-vars
const prepareCheck = (check, actor, item, registerCallback) => {};

/**
 * @typedef CheckResultV2
 * @property {CheckType} type the type of the check
 * @property {CheckId} id a unique identifier for this check
 * @property {string} actorUuid
 * @property {string} itemUuid
 * @property {Roll | Object} roll the Roll instance or serialized form of the primary check
 * @property {(Roll | Object)[]} additionalRolls any secondary rolls, either as Roll instances or serialized
 * @property {Attribute} primary.attribute the first attribute
 * @property {number} primary.dice the dice corresponding to the first attribute
 * @property {number} primary.result the result of the primary die
 * @property {Attribute} secondary.attribute the second attribute
 * @property {number} secondary.dice the dice corresponding to the second attribute
 * @property {number} secondary.result the result of the secondary die
 * @property {CheckModifier[]} modifiers array of modifiers
 * @property {number} modifierTotal the sum of all modifiers
 * @property {number} result the total result of the check
 * @property {boolean} fumble
 * @property {boolean} critical
 * @property {Object} additionalData additional data attached to the check
 */

/**
 * @callback ProcessCheckHook
 * Hook called to process the result of the roll
 * @param {CheckResultV2} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 */

/**
 * @type ProcessCheckHook
 */
// eslint-disable-next-line no-unused-vars
const processCheck = (check, actor, item) => {};

/**
 * @typedef CheckSection
 * @property {string} [content] the HTML markup to insert into the message, takes precedence over 'partial'
 * @property {string} [partial] the partial to render
 * @property {Object} [data] data to be passed to the partial
 * @property {number} [order] sections will be rendered in order, from lowest to highest
 */

/**
 * @typedef {(CheckSection | Promise<CheckSection> | (() => CheckSection) | (() => Promise<CheckSection>))[]} CheckRenderData
 */

/**
 * @callback RenderCheckHook
 * @description Hook called to determine how to render the results
 * @param {CheckRenderData} sections
 * @param {CheckResultV2} check
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {Object} additionalFlags
 * @param {TargetData[]} targets
 */

/**
 * @type RenderCheckHook
 */
// eslint-disable-next-line no-unused-vars
const renderCheck = (sections, check, actor, item, additionalFlags) => {};

/**
 * @description To be used within a {@link RenderCheckHook}
 * @property {FUActor} actor
 * @property {FUItem} item
 * @property {Object} flags
 * @property {TargetData[]} targets A snapshot of the targets at the beginning of the hook
 * @property {TargetingDataModel} targeting
 * @property {CheckSection} section
 * @property {Boolean} executed
 * @property {List<Promise<*>>} additions
 */
export class RenderCheckSectionBuilder {
	constructor(data, actor, item, targets, flags, order, partial) {
		this.data = data;
		this.actor = actor;
		this.item = item;
		this.targets = targets;
		this.flags = flags;
		this.executed = false;
		this.additions = [];
		this.section = {
			order: order,
			partial: partial,
			data: {
				name: item.name,
				actor: actor.uuid,
				item: item.uuid,
			},
		};
	}

	toggleFlag(flag) {
		Pipeline.toggleFlag(this.flags, flag);
	}

	/**
	 * @param {Promise<Object, void>} onData
	 * @remarks Supports asynchronous operation
	 */
	addData(onData) {
		this.additions.push(onData(this.section.data));
	}

	/**
	 * @description Pushes the section onto {@link CheckRenderData}
	 */
	push() {
		if (this.executed === true) {
			throw Error('Already executed.');
		}
		this.data.push(async () => {
			await Promise.all(this.additions);
			if (this.validate()) {
				return this.section;
			}
			return {};
		});
		this.executed = true;
	}

	/**
	 * @returns {boolean} Whether the section should be pushed
	 */
	validate() {
		return true;
	}
}
