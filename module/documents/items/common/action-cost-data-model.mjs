import { FU } from '../../../helpers/config.mjs';

/**
 * @property {FU.resources} resource.value The resource type
 * @property {Number} amount.value The resource cost
 * @property {FU.targetingRules} rule.value The type of targeting rule to use
 * @property {Number} limit.value The maximum number of targets
 */
export class ActionCostDataModel extends foundry.abstract.DataModel {
	static defineSchema() {
		const { NumberField, StringField } = foundry.data.fields;
		return {
			resource: new StringField({ initial: FU.resources.mp, required: true }),
			amount: new NumberField({ initial: 0, integer: true, nullable: false }),
			rule: new StringField({ initial: FU.targetingRules.self, required: true }),
			limit: new NumberField({ initial: 0, min: 0, max: 3, integer: true, nullable: false }),
		};
	}
}
