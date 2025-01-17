import { CheckHooks } from '../../../checks/check-hooks.mjs';
import { FU } from '../../../helpers/config.mjs';

Hooks.on(CheckHooks.renderCheck, (sections, check, actor, item) => {
	if (item?.system instanceof TreasureDataModel) {
		sections.push(item.createChatMessage(item, false).then((v) => ({ content: v.content })));
	}
});

/**
 * @property {string} subtype.value
 * @property {string} summary.value
 * @property {string} description
 * @property {boolean} isFavored.value
 * @property {boolean} showTitleCard.value
 * @property {number} cost.value
 * @property {number} quantity.value
 * @property {string} origin.value
 * @property {string} source.value
 */
export class TreasureDataModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const { SchemaField, StringField, HTMLField, BooleanField, NumberField } = foundry.data.fields;
		return {
			fuid: new StringField(),
			subtype: new SchemaField({ value: new StringField({ initial: 'treasure', choices: Object.keys(FU.treasureType) }) }),
			summary: new SchemaField({ value: new StringField() }),
			description: new HTMLField(),
			isFavored: new SchemaField({ value: new BooleanField() }),
			showTitleCard: new SchemaField({ value: new BooleanField() }),
			cost: new SchemaField({ value: new NumberField({ initial: 100, min: 0, integer: true, nullable: false }) }),
			quantity: new SchemaField({ value: new NumberField({ initial: 1, min: 0, integer: true, nullable: false }) }),
			origin: new SchemaField({ value: new StringField() }),
			source: new SchemaField({ value: new StringField() }),
		};
	}
}
