import { FU } from '../../../helpers/config.mjs';

/**
 * @property {FU.resources} resource.value The resource type
 * @property {Number} amount.value The resource cost
s
 */
export class ActionCostDataModel extends foundry.abstract.DataModel {
	static defineSchema() {
		const { NumberField, StringField } = foundry.data.fields;
		return {
			resource: new StringField({ initial: FU.resources.mp, required: true }),
			amount: new NumberField({ initial: 0, integer: true, nullable: false }),
		};
	}
}
