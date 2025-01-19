import { Targeting } from '../../../helpers/targeting.mjs';

/**
 * @property {FU.targetingRules} rule.value The type of targeting rule to use
 * @property {Number} max.value The maximum number of target
 */
export class TargetingDataModel extends foundry.abstract.DataModel {
	static defineSchema() {
		const { NumberField, StringField } = foundry.data.fields;
		return {
			rule: new StringField({ initial: Targeting.rule.self, required: true }),
			max: new NumberField({ initial: 0, min: 0, max: 3, integer: true, nullable: false }),
		};
	}
}
