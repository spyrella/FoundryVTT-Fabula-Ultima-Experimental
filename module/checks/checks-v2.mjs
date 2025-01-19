import { CheckHooks } from './check-hooks.mjs';
import { FU, SYSTEM } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';
import { AttributeCheck } from './attribute-check.mjs';
import { CheckPush } from './check-push.mjs';
import { CheckReroll } from './check-reroll.mjs';
import { AccuracyCheck } from './accuracy-check.mjs';
import { MagicCheck } from './magic-check.mjs';
import { SpecialResults } from './special-results.mjs';
import { Support } from './support/support.mjs';
import { OpenCheck } from './open-check.mjs';
import { OpposedCheck } from './opposed-check.mjs';
import { CheckRetarget } from './check-retarget.mjs';
import { GroupCheck } from './group-check.mjs';
import { SupportCheck } from './support-check.mjs';
import { Targeting } from '../helpers/targeting.mjs';

/**
 * @typedef CheckAttributes
 * @property {Attribute} primary
 * @property {Attribute} secondary
 */

/**
 * @typedef {Object} CheckConfigurationPromptData
 * @property {Attribute} primary
 * @property {Attribute} secondary
 * @property {Number} modifier
 * @property {Number} difficulty
 */

/**
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {CheckCallback} [configCallback]
 */
const accuracyCheck = async (actor, item, configCallback) => {
	const check = {
		type: 'accuracy',
	};
	return performCheck(check, actor, item, configCallback);
};

/**
 *
 * @param {FUActor} actor
 * @param {CheckAttributes} attributes
 * @param {CheckCallback} [configCallback]
 */
const attributeCheck = async (actor, attributes, configCallback) => {
	/** @type Partial<CheckV2> */
	const check = {
		type: 'attribute',
		primary: attributes.primary,
		secondary: attributes.secondary,
	};

	return performCheck(check, actor, undefined, configCallback);
};

/**
 * @param {FUActor} actor
 * @param {CheckCallback} configCallback
 * @return {Promise<void>}
 */
const groupCheck = async (actor, configCallback) => {
	/** @type Partial<CheckV2> */
	const check = {
		type: 'group',
	};

	return performCheck(check, actor, undefined, configCallback);
};

/**
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {CheckCallback} [configCallback]
 */
const magicCheck = async (actor, item, configCallback) => {
	const check = {
		type: 'magic',
	};
	return performCheck(check, actor, item, configCallback);
};

/**
 * @param {FUActor} actor
 * @param {CheckAttributes} attributes
 * @param {CheckCallback} [configCallback]
 */
const openCheck = async (actor, attributes, configCallback) => {
	/** @type Partial<CheckV2> */
	const check = {
		type: 'open',
		primary: attributes.primary,
		secondary: attributes.secondary,
	};

	return performCheck(check, actor, undefined, configCallback);
};

/**
 * @param {FUActor} actor
 * @param {CheckCallback} configCallback
 */
const opposedCheck = async (actor, configCallback) => {
	/** @type Partial<CheckV2> */
	const check = {
		type: 'opposed',
	};

	return performCheck(check, actor, undefined, configCallback);
};

/**
 * @param {FUActor} actor
 * @param {CheckCallback} configCallback
 */
const supportCheck = async (actor, configCallback) => {
	/** @type Partial<CheckV2> */
	const check = {
		type: 'support',
	};

	return performCheck(check, actor, undefined, configCallback);
};

/**
 * @param {CheckResultV2} check
 * @return {CheckV2}
 */
const checkFromCheckResult = (check) => {
	return {
		id: foundry.utils.randomID(),
		type: check.type,
		primary: check.primary.attribute,
		secondary: check.secondary.attribute,
		modifiers: check.modifiers,
		additionalData: { ...check.additionalData },
	};
};

/**
 * @callback CheckModificationCallback
 * @param {CheckResultV2} check
 * @param {FUActor} actor
 * @param {FUItem} item
 * @return {Promise<{[roll]: Roll, [check]: CheckV2} | boolean | void>} returning false will abort the operation, returning nothing, true or an object with changed check configuration will proceed
 */
/**
 * @param {CheckId} checkId
 * @param {CheckModificationCallback} callback
 * @return {Promise<void>}
 */
const modifyCheck = async (checkId, callback) => {
	const message = game.messages.search({ filters: [{ field: 'flags.projectfu.CheckV2.id', value: checkId }] }).at(0);
	if (message) {
		/** @type CheckResultV2 */
		const oldResult = foundry.utils.duplicate(message.getFlag(SYSTEM, Flags.ChatMessage.CheckV2));
		const actor = await fromUuid(oldResult.actorUuid);
		const item = await fromUuid(oldResult.itemUuid);
		let callbackResult = await callback(oldResult, actor, item);
		if (typeof callbackResult === 'undefined') {
			callbackResult = true;
		}
		if (callbackResult) {
			const { check = checkFromCheckResult(oldResult), roll = Roll.fromData(oldResult.roll) } = (typeof callbackResult === 'object' && callbackResult) ?? {};
			const result = await processResult(check, roll, actor, item);
			return renderCheck(result, actor, item, message.flags);
		}
	} else {
		throw new Error('Check to be modified not found.');
	}
};

/**
 * @param {Partial<CheckV2>} check
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {CheckCallback} initialConfigCallback
 * @return {Promise<CheckV2>}
 */
async function prepareCheck(check, actor, item, initialConfigCallback) {
	check.primary ??= '';
	check.secondary ??= '';
	check.id ??= foundry.utils.randomID();
	check.modifiers ??= [];
	check.additionalData ??= {};
	Object.seal(check);
	await (initialConfigCallback ? initialConfigCallback(check, actor, item) : undefined);
	Object.defineProperty(check, 'type', {
		value: check.type,
		writable: false,
		enumerable: true,
	});
	if (!check.type) {
		throw new Error('check type missing');
	}
	Object.defineProperty(check, 'id', {
		value: check.id,
		writable: false,
		configurable: false,
		enumerable: true,
	});
	if (!check.id) {
		throw new Error('check id missing');
	}

	/**
	 * @type {{callback: Promise | (() => Promise | void), priority: number}[]}
	 */
	const callbacks = [];
	const registerCallbacks = (callback, priority = 0) => {
		callbacks.push({ callback, priority });
	};

	Hooks.callAll(CheckHooks.prepareCheck, check, actor, item, registerCallbacks);

	callbacks.sort((a, b) => a.priority - b.priority);
	for (let callbackObj of callbacks) {
		await callbackObj.callback(check, actor, item);
	}

	if (!check.primary || !check.secondary) {
		throw new Error('check attribute missing');
	}

	return check;
}

/**
 * Executes only the check preparation workflow, including hooks, and returns the prepared check.
 * If an error is thrown during preparation it will be present in the error property of the returned object and the check may be in a partially configured state.
 *
 * @param {CheckType} type
 * @param {FUActor} actor
 * @param {FUItem} [item]
 * @param {CheckCallback} [initialConfigCallback]
 * @return {Promise<{check: CheckV2, error: any}>}
 */
async function prepareCheckDryRun(type, actor, item, initialConfigCallback) {
	/** @type CheckV2 */
	let check = { type };
	let error;
	try {
		check = await prepareCheck(check, actor, item, initialConfigCallback);
	} catch (e) {
		error = e;
	}
	return {
		check,
		error,
	};
}

const CRITICAL_THRESHOLD = 6;

/**
 * @param {CheckV2} check
 * @param {FUActor} actor
 * @param {FUItem} item
 * @return {Promise<Roll>}
 */
async function rollCheck(check, actor, item) {
	const { primary, secondary, modifiers } = check;
	/** @type AttributesDataModel */
	const attributes = actor.system.attributes;
	const primaryDice = attributes[primary].current;
	const secondaryDice = attributes[secondary].current;

	const modifierTotal = modifiers.reduce((agg, curr) => (agg += curr.value), 0);
	let modPart = '';
	if (modifierTotal > 0) {
		modPart = ` + ${modifierTotal}`;
	} else if (modifierTotal < 0) {
		modPart = ` - ${Math.abs(modifierTotal)}`;
	}
	const formula = `d${primaryDice}[${primary}] + d${secondaryDice}[${secondary}]${modPart}`;

	return new Roll(formula).roll();
}

/**
 * @param {RollTerm} term
 * @param {FUActor} actor
 * @return {{result: number, dice: number}}
 */
const extractDieResults = (term, actor) => {
	const DiceTermClass = foundry.utils.isNewerVersion(game.version, '12.0.0') ? foundry.dice.terms.DiceTerm : DiceTerm;
	const NumericTermClass = foundry.utils.isNewerVersion(game.version, '12.0.0') ? foundry.dice.terms.NumericTerm : NumericTerm;
	if (term instanceof DiceTermClass) {
		return {
			dice: term.faces,
			result: term.total,
		};
	} else if (term instanceof NumericTermClass) {
		return {
			dice: term.options.faces ?? actor.system.attributes[term.flavor].current,
			result: term.total,
		};
	} else {
		throw new Error(`Unexpected formula term for primary attribute: ${term}`);
	}
};

/**
 * @param {CheckV2} check
 * @param {Roll} roll
 * @param {FUActor} actor
 * @param {FUItem} item
 * @return {Promise<Readonly<CheckResultV2>>}
 */
const processResult = async (check, roll, actor, item) => {
	if (!roll._evaluated) {
		await roll.roll();
	}

	const primary = extractDieResults(roll.terms[0], actor);

	const secondary = extractDieResults(roll.terms[2], actor);

	/**
	 * @type {Readonly<CheckResultV2>}
	 */
	const result = Object.freeze({
		type: check.type,
		id: check.id,
		actorUuid: actor.uuid,
		itemUuid: item?.uuid,
		roll: roll.toJSON(),
		additionalRolls: [],
		primary: Object.freeze({
			attribute: check.primary,
			dice: primary.dice,
			result: primary.result,
		}),
		secondary: Object.freeze({
			attribute: check.secondary,
			dice: secondary.dice,
			result: secondary.result,
		}),
		modifiers: Object.freeze(check.modifiers.map(Object.freeze)),
		modifierTotal: check.modifiers.reduce((agg, curr) => agg + curr.value, 0),
		result: roll.total,
		fumble: primary.result === 1 && secondary.result === 1,
		critical: primary.result === secondary.result && primary.result >= CRITICAL_THRESHOLD,
		additionalData: check.additionalData,
	});

	Hooks.callAll(CheckHooks.processCheck, result, actor, item);

	return result;
};

/**
 * @param {CheckResultV2} result
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {Record<string, any>} [flags]
 * @return {Promise<void>}
 */
async function renderCheck(result, actor, item, flags = {}) {
	/**
	 * @type {CheckRenderData}
	 */
	const renderData = [];
	const additionalFlags = {};
	// TODO: Pass in as a parameter
	const targets = Targeting.getSerializedTargetData();

	Hooks.callAll(CheckHooks.renderCheck, renderData, result, actor, item, additionalFlags, targets);

	/**
	 * @type {CheckSection[]}
	 */
	const allSections = [];
	for (let value of renderData) {
		value = await (value instanceof Function ? value() : value);
		if (value) {
			allSections.push(value);
		}
	}

	const partitionedSections = allSections.reduce(
		(agg, curr) => {
			if (Number.isNaN(curr.order)) {
				agg.flavor.push(curr);
			} else {
				agg.body.push(curr);
			}
			return agg;
		},
		{ flavor: [], body: [] },
	);
	/**
	 * @type {CheckSection[]}
	 */
	const flavorSections = partitionedSections.flavor;
	/**
	 * @type {CheckSection[]}
	 */
	const bodySections = partitionedSections.body;

	bodySections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

	let flavor;
	if (flavorSections.length) {
		flavor = '';
		for (let flavorSection of flavorSections) {
			if (flavorSection.content) {
				flavor = flavor + flavorSection.content;
			} else {
				flavor = await renderTemplate(flavorSection.partial, flavorSection.data);
			}
		}
	}
	if (!flavor?.trim()) {
		flavor = item
			? await renderTemplate('systems/projectfu/templates/chat/chat-check-flavor-item.hbs', {
					name: item.name,
					img: item.img,
					id: item.id,
					uuid: item.uuid,
				})
			: await renderTemplate('systems/projectfu/templates/chat/chat-check-flavor-check.hbs', {
					title: FU.checkTypes[result.type] || 'FU.RollCheck',
				});
	}

	const rolls = [result.roll, ...result.additionalRolls].filter(Boolean);

	let speaker = ChatMessage.getSpeaker({ actor });
	if (speaker.scene && speaker.token) {
		const token = game.scenes.get(speaker.scene)?.tokens?.get(speaker.token);
		if (token) {
			speaker = ChatMessage.getSpeaker({ token });
		}
	}
	const chatMessage = {
		flavor: flavor,
		content: await renderTemplate('systems/projectfu/templates/chat/chat-checkV2.hbs', { sections: bodySections }),
		rolls: rolls,
		type: foundry.utils.isNewerVersion(game.version, '12.0.0') ? undefined : CONST.CHAT_MESSAGE_TYPES.ROLL,
		speaker: speaker,
		flags: foundry.utils.mergeObject(
			{
				[SYSTEM]: {
					[Flags.ChatMessage.CheckV2]: result,
				},
			},
			foundry.utils.mergeObject(additionalFlags, flags, { overwrite: false }),
			{ overwrite: false, recursive: true },
		),
	};
	return void ChatMessage.create(chatMessage);
}

/**
 * Reapply event listeners when new chat messages are added to the DOM.
 */
function reapplyClickListeners() {
	Hooks.on('renderChatLog', (app, html) => {
		// Reapply event listeners for each chat message
		html.on('click', function (event) {
			const itemId = event.target.dataset.itemId;
			if (event.target.dataset.itemId) {
				const messageId = $(event.target).parents('[data-message-id]').data('messageId');
				const message = game.messages.get(messageId);
				if (message) {
					const actor = ChatMessage.getSpeakerActor(message.speaker);
					if (actor) {
						const item = actor.items.get(itemId);
						if (item) {
							item.sheet.render(true);
						}
					}
				}
			}
		});
	});
}

// Initialize click listeners
reapplyClickListeners();

/**
 * @param {Partial<import('./check-hooks.mjs').CheckV2>} check
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {CheckCallback} [initialConfigCallback]
 */
const performCheck = async (check, actor, item, initialConfigCallback = undefined) => {
	const preparedCheck = await prepareCheck(check, actor, item, initialConfigCallback);
	const roll = await rollCheck(preparedCheck, actor, item);
	const result = await processResult(preparedCheck, roll, actor, item);
	return await renderCheck(result, actor, item);
};

/**
 * @param {FUActor} actor
 * @param {FUItem} item
 * @return {Promise<void>}
 */
const display = async (actor, item) => {
	/** @type CheckResultV2 */
	const check = Object.freeze({
		type: 'display',
		id: foundry.utils.randomID(),
		actorUuid: actor.uuid,
		itemUuid: item?.uuid,
		roll: null,
		additionalRolls: [],
		primary: null,
		secondary: null,
		modifiers: null,
		modifierTotal: null,
		result: null,
		fumble: null,
		critical: null,
		additionalData: {},
	});
	Hooks.callAll(CheckHooks.processCheck, check, actor, item);
	await renderCheck(check, actor, item);
};

/**
 * @type {CheckType[]}
 */
const allExceptDisplay = ['accuracy', 'attribute', 'group', 'magic', 'open', 'opposed', 'support', 'initiative'];
/**
 * @param {ChatMessage | string} message a ChatMessage or ID of a ChatMessage
 * @param {CheckType | CheckType[]} [type]
 * @return boolean
 */
const isCheck = (message, type = allExceptDisplay) => {
	if (typeof message === 'string') {
		message = game.messages.get(message);
	}
	if (message instanceof ChatMessage) {
		/** @type CheckResultV2 */
		const flag = message.getFlag(SYSTEM, Flags.ChatMessage.CheckV2);
		if (flag) {
			if (type) {
				if (Array.isArray(type)) {
					return type.includes(flag.type);
				} else {
					return type === flag.type;
				}
			} else {
				return true;
			}
		} else {
			return false;
		}
	}
	return false;
};

/**
 * @param {FUActor} actor
 * @param {CheckConfigurationPromptData} check
 * @param {String} title
 * @returns {Promise<CheckConfigurationPromptData>}
 */
async function promptConfiguration(actor, check, title) {
	title = title || 'FU.DialogCheckTitle';
	const attributes = actor.system.attributes;
	return await Dialog.wait(
		{
			title: game.i18n.localize(title),
			content: await renderTemplate('systems/projectfu/templates/dialog/dialog-check.hbs', {
				attributes: FU.attributes,
				attributeAbbr: FU.attributeAbbreviations,
				attributeValues: Object.entries(attributes).reduce(
					(previousValue, [attribute, { current }]) => ({
						...previousValue,
						[attribute]: current,
					}),
					{},
				),
				primary: check.primary || 'mig',
				secondary: check.secondary || 'mig',
				modifier: check.modifier || 0,
				difficulty: check.difficulty || 0,
			}),
			buttons: [
				{
					icon: '<i class="fas fa-dice"></i>',
					label: game.i18n.localize('FU.DialogCheckRoll'),
					callback: (jQuery) => {
						return {
							primary: jQuery.find('*[name=primary]:checked').val(),
							secondary: jQuery.find('*[name=secondary]:checked').val(),
							modifier: +jQuery.find('*[name=modifier]').val(),
							difficulty: +jQuery.find('*[name=difficulty]').val(),
						};
					},
				},
			],
		},
		{
			classes: ['projectfu', 'unique-dialog', 'backgroundstyle'],
		},
	);
}

document.addEventListener('click', (event) => {
	const toggleLink = event.target.closest('.universal-toggle');
	if (!toggleLink) return;

	const chatMessage = toggleLink.closest('.chat-message');
	const toggleSections = chatMessage.querySelectorAll('.toggle-section');
	const toggleIcon = toggleLink.querySelector('.toggle-icon');
	const isHidden = toggleIcon.classList.contains('fa-chevron-up');

	// Get game settings (true means hide, false means show)
	const settings = {
		tags: game.settings.get('projectfu', 'optionChatMessageHideTags'),
		quality: game.settings.get('projectfu', 'optionChatMessageHideQuality'),
		description: game.settings.get('projectfu', 'optionChatMessageHideDescription'),
		rollDetails: game.settings.get('projectfu', 'optionChatMessageHideRollDetails'),
	};

	// Toggle visibility based on current state and settings
	toggleSections.forEach((section) => {
		const shouldAlwaysShow = [
			{ className: 'accuracy-check-results', setting: settings.rollDetails },
			{ className: 'damage-results', setting: settings.rollDetails },
			{ className: 'description', setting: settings.description },
			{ className: 'quality', setting: settings.quality },
			{ className: 'tags', setting: settings.tags },
		].some(({ className, setting }) => section.classList.contains(className) && !setting);

		section.classList.toggle('shown', shouldAlwaysShow || isHidden);
		section.classList.toggle('hidden', !shouldAlwaysShow && !isHidden);
	});

	// Update toggle icon and tooltip
	const newState = !isHidden;
	toggleIcon.classList.toggle('fa-chevron-up', newState);
	toggleIcon.classList.toggle('fa-chevron-down', !newState);
	toggleLink.setAttribute('data-tooltip', game.i18n.localize(newState ? 'FU.ChatMessageHide' : 'FU.ChatMessageShow'));
});

export const ChecksV2 = Object.freeze({
	display,
	accuracyCheck,
	attributeCheck,
	groupCheck,
	magicCheck,
	openCheck,
	opposedCheck,
	supportCheck,
	modifyCheck,
	isCheck,
	promptConfiguration,
	prepareCheckDryRun,
});

CheckRetarget.initialize();
CheckReroll.initialize();
CheckPush.initialize();
SpecialResults.initialize();
AccuracyCheck.initialize();
AttributeCheck.initialize();
MagicCheck.initialize();
OpenCheck.initialize();
OpposedCheck.initialize();
GroupCheck.initialize();
SupportCheck.initialize();
Support.initialize();
