import { FU } from './config.mjs';
import { InlineHelper } from './inline-helper.mjs';
import { Effects } from '../documents/effects/effects.mjs';

/*
possible changes from official effects:
- improve attributes (custom) ✔
- cap attribute (downgrade) ✔
- grant extra damage (add) -> missing generic damage ✔
- improve accuracy (add) -> missing generic accuracy ✔
- upgrade def/mdef (upgrade) ✔
- grant resistance (custom) ✔
- apply vulnerability (custom) ✔
- grant immunity (upgrade) ✔
- grant absorption (custom) ✔
- grant status immunity (override) ✔
- change attack damage type (override)
- grant additional actions (add) -> missing data field
- lower crit threshold (override) -> not yet supported
 */
/**
 * @typedef GuidedInlineEffectChangeTemplate
 * @property {string} label
 * @property {string} template
 * @property {Object} [templateData]
 * @property {(Object) => EffectChangeData | EffectChangeData[]} toChange
 */

/**
 * @typedef GuidedInlineEffectConfig
 * @property {string} name
 * @property {string} icon
 * @property {string} description
 * @property {Object[]} changes
 */

/**
 *
 * @type {Record<string, GuidedInlineEffectChangeTemplate>}
 */
const SUPPORTED_CHANGE_TYPES = {
	improveAttribute: {
		label: 'FU.InlineEffectConfigImproveAttribute',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-attribute.hbs',
		templateData: {
			attributes: FU.attributes,
		},
		toChange: ({ attribute }) => ({
			key: `system.attributes.${attribute}`,
			mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
			value: 'upgrade',
		}),
	},
	capAttribute: {
		label: 'FU.InlineEffectConfigCapAttribute',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-attribute.hbs',
		templateData: {
			attributes: FU.attributes,
		},
		toChange: ({ attribute }) => ({
			key: `system.attributes.${attribute}.current`,
			mode: CONST.ACTIVE_EFFECT_MODES.DOWNGRADE,
			value: `@system.attributes.${attribute}.base`,
		}),
	},
	damage: {
		label: 'FU.InlineEffectConfigModifyDamageBonuses',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-damage-bonuses.hbs',
		templateData: {
			types: {
				all: 'FU.InlineEffectConfigModifyDamageBonusesTypeAll',
				melee: 'FU.InlineEffectConfigModifyDamageBonusesTypeMelee',
				ranged: 'FU.InlineEffectConfigModifyDamageBonusesTypeRanged',
				spell: 'FU.InlineEffectConfigModifyDamageBonusesTypeSpells',
			},
		},
		toChange: ({ damageType, value }) => {
			const createChange = (type, value) => ({
				key: `system.bonuses.damage.${type}`,
				mode: CONST.ACTIVE_EFFECT_MODES.ADD,
				value,
			});
			if (damageType === 'all') {
				return [createChange('melee', value), createChange('ranged', value), createChange('spell', value)];
			}
			return createChange(damageType, value);
		},
	},
	accuracy: {
		label: 'FU.InlineEffectConfigModifyAccuracy',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-accuracy.hbs',
		templateData: {
			checks: {
				accuracyAndMagic: 'FU.InlineEffectConfigModifyAccuracyChecksAll',
				accuracyCheck: 'FU.InlineEffectConfigModifyAccuracyChecksAccuracy',
				magicCheck: 'FU.InlineEffectConfigModifyAccuracyChecksMagic',
				openCheck: 'FU.InlineEffectConfigModifyAccuracyOpenChecks',
			},
		},
		toChange: ({ check, value }) => {
			const createChange = (check, value) => ({
				key: `system.bonuses.accuracy.${check}`,
				mode: CONST.ACTIVE_EFFECT_MODES.ADD,
				value,
			});

			if (check === 'accuracyAndMagic') {
				return [createChange('accuracyCheck', value), createChange('magicCheck', value)];
			}
			return createChange(check, value);
		},
	},
	improveDefenses: {
		label: 'FU.InlineEffectConfigBuffDefenses',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-defenses.hbs',
		templateData: {
			defenses: FU.defenses,
		},
		toChange: ({ defense, value }) => ({
			key: `system.derived.${defense}.value`,
			mode: CONST.ACTIVE_EFFECT_MODES.ADD,
			value,
		}),
	},
	vulnerability: {
		label: 'FU.InlineEffectConfigApplyVulnerability',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-affinity.hbs',
		templateData: {
			damageTypes: Effects.damageTypes,
		},
		toChange: ({ damageType }) => ({
			key: `system.affinities.${damageType}`,
			mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
			value: 'downgrade',
		}),
	},
	resistance: {
		label: 'FU.InlineEffectConfigGrantResistance',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-affinity.hbs',
		templateData: {
			damageTypes: Effects.damageTypes,
		},
		toChange: ({ damageType }) => ({
			key: `system.affinities.${damageType}`,
			mode: CONST.ACTIVE_EFFECT_MODES.CUSTOM,
			value: 'upgrade',
		}),
	},
	immunity: {
		label: 'FU.InlineEffectConfigGrantImmunity',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-affinity.hbs',
		templateData: {
			damageTypes: Effects.damageTypes,
		},
		toChange: ({ damageType }) => ({
			key: `system.affinities.${damageType}.current`,
			mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
			value: String(FU.affValue.immunity),
		}),
	},
	absorption: {
		label: 'FU.InlineEffectConfigGrantAbsorption',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-affinity.hbs',
		templateData: {
			damageTypes: Effects.damageTypes,
		},
		toChange: ({ damageType }) => ({
			key: `system.affinities.${damageType}.current`,
			mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
			value: String(FU.affValue.absorption),
		}),
	},
	immunityStatus: {
		label: 'FU.InlineEffectConfigGrantStatusEffectImmunity',
		template: 'systems/projectfu/templates/app/partials/inline-effect-config-modify-status-effects.hbs',
		templateData: {
			temporaryEffects: Effects.temporaryEffects,
		},
		toChange: ({ temporaryEffect }) => ({
			key: `system.immunities.${temporaryEffect}.base`,
			mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
			value: true,
		}),
	},
};

class TempActiveEffectConfig extends ActiveEffectConfig {
	async _updateObject(event, formData) {
		this.object.updateSource(formData);
		return this.render();
	}

	async close(options = {}) {
		if (options.force) {
			this.wasSubmitted = true;
		}
		return super.close(options);
	}
}

export class InlineEffectConfiguration extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			classes: ['form', 'sheet', 'projectfu', 'unique-dialog'],
			resizable: true,
			height: 'auto',
			closeOnSubmit: false,
			editable: true,
			sheetConfig: false,
			submitOnChange: true,
			submitOnClose: true,
		});
	}

	#defaultIcon = '/icons/svg/aura.svg';
	#defaultName = game.i18n.localize('FU.NewEffect');

	#state;
	#dispatch;

	constructor(state, dispatch) {
		super({ type: 'status' }, { title: game.i18n.localize('FU.InlineEffectConfig') });
		this.#state = state;
		this.#dispatch = dispatch;
	}

	get template() {
		return 'systems/projectfu/templates/app/inline-effect-config.hbs';
	}

	getData(options = {}) {
		return {
			data: this.object,
			effectTypes: {
				status: 'FU.InlineEffectTypeStatus',
				boonOrBane: 'FU.InlineEffectTypeBoonOrBane',
				guided: 'FU.InlineEffectTypeGuided',
				custom: 'FU.InlineEffectTypeCustom',
			},
			statuses: Object.entries(FU.statusEffects)
				.filter(([key]) => Effects.statuses.includes(key))
				.reduce((agg, [key, value]) => (agg[key] = value) && agg, {}),
			boonsAndBanes: Object.entries(FU.statusEffects)
				.filter(([key]) => Effects.boonsAndBanes.includes(key))
				.reduce((agg, [key, value]) => (agg[key] = value) && agg, {}),
			changeTypes: SUPPORTED_CHANGE_TYPES,
			defaultIcon: this.#defaultIcon,
			defaultName: this.#defaultName,
		};
	}

	async _updateObject(event, formData) {
		formData = foundry.utils.expandObject(formData);
		if (formData.type === 'guided' && formData.type !== this.object.type) {
			formData.guided ??= { changes: [{ type: Object.keys(SUPPORTED_CHANGE_TYPES).at(0) }] };
		}
		this.object = formData;
		if (this.object?.guided?.changes) {
			this.object.guided.changes = Array.from(Object.values(this.object.guided.changes));
		}
		this.render();
	}

	activateListeners(html) {
		html.find('img[data-edit]').on('click', this.#onEditImage.bind(this));
		html.find('.change-controls .change-control[data-action]').click(this.#onChangeControl.bind(this));
		html.find('button[data-action=finish]').click(this.#onFinish.bind(this));
		return super.activateListeners(html);
	}

	#onEditImage(event) {
		const attr = event.currentTarget.dataset.edit;
		const current = foundry.utils.getProperty(this.object, attr);
		const fp = new FilePicker({
			current,
			type: 'image',
			redirectToRoot: [this.#defaultIcon],
			callback: (path) => {
				event.currentTarget.src = path;
				if (this.options.submitOnChange) {
					return this._onSubmit(event);
				}
			},
			top: this.position.top + 40,
			left: this.position.left + 10,
		});
		return fp.browse();
	}

	#onChangeControl(event) {
		const action = event.currentTarget.dataset.action;
		switch (action) {
			case 'add': {
				const idx = this.object?.guided?.changes?.length ?? 0;
				return this.submit({
					updateData: {
						[`guided.changes.${idx}`]: { type: Object.keys(SUPPORTED_CHANGE_TYPES).at(0) },
					},
				});
			}
			case 'delete':
				event.currentTarget.closest('.change').remove();
				return this.submit().then(() => this.render());
		}
	}

	#onFinish(event) {
		this.close({ finish: true });
	}

	async close(options = {}) {
		await super.close(options);
		if (options.finish) {
			if (['status', 'boonOrBane'].includes(this.object.type)) {
				this.#dispatch(this.#state.tr.insertText(` @EFFECT[${this.object.status}] `));
			}
			if (this.object.type === 'guided') {
				const effectData = { ...this.object.guided };
				effectData.changes = (effectData.changes ?? []).flatMap((value) => SUPPORTED_CHANGE_TYPES[value.type].toChange(value));
				const encodedEffect = InlineHelper.toBase64(effectData);
				this.#dispatch(this.#state.tr.insertText(` @EFFECT[${encodedEffect}] `));
			}
			if (this.object.type === 'custom') {
				const cls = getDocumentClass('ActiveEffect');
				const tempActor = await Actor.create({ name: 'Temp Actor', type: 'character' }, { temporary: true });
				const tempEffect = await cls.create(
					{
						_id: foundry.utils.randomID(),
						name: game.i18n.localize(this.#defaultName),
						icon: this.#defaultIcon,
					},
					{ temporary: true, parent: tempActor },
				);
				const activeEffectConfig = new TempActiveEffectConfig(tempEffect);
				activeEffectConfig.render(true);
				const dispatch = this.#dispatch;
				const state = this.#state;
				const hookRef = Hooks.on('closeActiveEffectConfig', function (sheet) {
					if (sheet === activeEffectConfig) {
						Hooks.off('closeActiveEffectConfig', hookRef);
						if (sheet.wasSubmitted) {
							const effectData = sheet.document.toObject();
							delete effectData._id;
							const encodedEffect = InlineHelper.toBase64(effectData);
							dispatch(state.tr.insertText(` @EFFECT[${encodedEffect}] `));
						}
					}
				});
			}
		}
	}
}
