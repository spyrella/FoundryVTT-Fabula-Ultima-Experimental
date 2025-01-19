import { CHECK_FLAVOR, CHECK_RESULT } from './default-section-order.mjs';
import { FUActor } from '../documents/actors/actor.mjs';
import { TargetChatSectionBuilder, Targeting } from '../helpers/targeting.mjs';
import { ResourcePipeline } from '../pipelines/resource-pipeline.mjs';
import { RenderCheckSectionBuilder } from './check-hooks.mjs';
import { FU } from '../helpers/config.mjs';
import { Flags } from '../helpers/flags.mjs';

/**
 * @param {CheckRenderData} sections
 * @param {string} description
 * @param {string} summary
 * @param {number} [order]
 */
const description = (sections, description, summary, order) => {
	if (summary || description) {
		sections.push(async () => ({
			partial: 'systems/projectfu/templates/chat/partials/chat-item-description.hbs',
			data: {
				summary,
				description: await TextEditor.enrichHTML(description),
			},
			order,
		}));
	}
};

/**
 * @param {CheckRenderData} sections
 * @param {ProgressDataModel} clock
 * @param {number} [order]
 */
const clock = (sections, clock, order) => {
	sections.push(async () => ({
		partial: 'systems/projectfu/templates/chat/partials/chat-clock-details.hbs',
		data: {
			data: clock,
			arr: clock.generateProgressArray(),
		},
		order: order,
	}));
};

/**
 * @typedef Tag
 * @property {string} [tag] gets localized
 * @property {any} [value] doesn't get localized
 * @property {string} [tooltip] tooltip to attach to the tag, gets localized
 * @property {boolean} [flip] switches the position of tag and value
 * @property {string} [separator] placed between tag and
 * @property {any} [show] can be omitted, if defined and falsy doesn't render tag
 */

/**
 * @param {CheckRenderData} sections
 * @param {Tag[]} tags
 * @param {number} [order]
 */
const tags = (sections, tags = [], order) => {
	tags = tags.filter((tag) => !('show' in tag) || tag.show);
	if (tags.length > 0) {
		sections.push(async () => ({
			partial: 'systems/projectfu/templates/chat/partials/chat-item-tags.hbs',
			data: {
				tags: tags,
			},
			order: order,
		}));
	}
};

/**
 * @param {CheckRenderData} sections
 * @param {string} quality
 * @param {number} [order]
 */
const quality = (sections, quality, order) => {
	if (quality) {
		sections.push({
			partial: 'systems/projectfu/templates/chat/partials/chat-item-quality.hbs',
			data: {
				quality,
			},
			order,
		});
	}
};

/**
 * @param {CheckRenderData} sections
 * @param {ProgressDataModel} resource
 * @param {number} [order]
 */
const resource = (sections, resource, order) => {
	sections.push(async () => ({
		partial: 'systems/projectfu/templates/chat/partials/chat-resource-details.hbs',
		data: {
			data: resource,
		},
		order: order,
	}));
};

/**
 * Sets chat message flavor by default. Specify order for other usecases.
 * @param {CheckRenderData} sections
 * @param {{name: string, img: string, id: string, uuid: string}} item
 * @param {number} [order]
 */
const itemFlavor = (sections, item, order = CHECK_FLAVOR) => {
	sections.push({
		order: order,
		partial: 'systems/projectfu/templates/chat/chat-check-flavor-item.hbs',
		data: {
			name: item.name,
			img: item.img,
			id: item.id,
			uuid: item.uuid,
		},
	});
};

/**
 * @param {CheckRenderData} sections
 * @param {string} opportunity
 * @param {number} [order]
 */
const opportunity = (sections, opportunity, order) => {
	if (opportunity) {
		sections.push({
			partial: 'systems/projectfu/templates/chat/partials/chat-item-opportunity.hbs',
			data: {
				opportunity: opportunity,
			},
			order: order,
		});
	}
};

/**
 * @param {CheckRenderData} sections
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {TargetData[]} targets
 * @param {Object} flags
 * @param accuracyData
 * @param damageData
 */
const damage = (sections, actor, item, targets, flags, accuracyData, damageData) => {
	const isTargeted = targets?.length > 0 || !Targeting.STRICT_TARGETING;
	if (isTargeted) {
		const targetingSection = new TargetChatSectionBuilder(sections, actor, item, targets, flags);
		targetingSection.withDefaultTargeting(targets);
		targetingSection.applyDamage(accuracyData, damageData);
		targetingSection.push();

		async function showFloatyText(target) {
			const actor = await fromUuid(target.uuid);
			if (actor instanceof FUActor) {
				actor.showFloatyText(game.i18n.localize(target.result === 'hit' ? 'FU.Hit' : 'FU.Miss'));
			}
		}

		if (game.dice3d) {
			Hooks.once('diceSoNiceRollComplete', () => {
				for (const target of targets) {
					showFloatyText(target);
				}
			});
		} else {
			for (const target of targets) {
				showFloatyText(target);
			}
		}
	}
};

/**
 * @param {CheckRenderData} data
 * @param {FUActor} actor
 * @param {FUItem} item
 * @param {TargetData[]} targets
 * @param {Object} flags
 */
const spendResource = (data, actor, item, targets, flags) => {
	if (item.system.cost) {
		if (item.system.cost.amount === 0) {
			return;
		}

		const expense = ResourcePipeline.calculateExpense(item, targets);
		if (expense.amount === 0) {
			return;
		}

		const builder = new RenderCheckSectionBuilder(data, actor, item, targets, flags, CHECK_RESULT, 'systems/projectfu/templates/chat/partials/chat-item-spend-resource.hbs');
		builder.addData(async (data) => {
			data.expense = expense;
			data.icon = FU.resourceIcons[item.system.cost.resource];
		});
		builder.toggleFlag(Flags.ChatMessage.ResourceLoss);
		builder.push();
	}
};

export const CommonSections = Object.freeze({
	description,
	clock,
	tags,
	quality,
	resource,
	itemFlavor,
	opportunity,
	damage,
	spendResource,
});
