/**
 * @typedef ClickModifiers
 * @prop {boolean} alt
 * @prop {boolean} ctrl
 * @prop {boolean} shift
 */

/**
 * @property {InlineSourceInfo} sourceInfo
 * @property {FUActor[]} targets
 * @property {Set<String>} traits
 * @property {Event | null} event
 */
export class PipelineRequest {
	constructor(sourceInfo, targets) {
		this.sourceInfo = sourceInfo;
		this.targets = targets;
		this.traits = new Set();
	}
}

/**
 * @property {InlineSourceInfo} sourceInfo
 * @property {FUActor} sourceActor
 * @property {FUActor} actor The actor the pipeline is modifying
 * @property {Set<String>} traits
 * @property {Event | null} event
 * @property {?} result The result output
 */
export class PipelineContext {
	constructor(request, actor) {
		Object.assign(this, request);
		this.actor = actor;
		this.sourceActor = this.sourceInfo.resolveActor();
	}
}

/**
 * @callback PipelineStep
 * @param {PipelineContext} context
 * @returns {Boolean} False if the no further calls in the pipeline are needed
 * @remarks Only to be used synchronously
 */

/**
 * @param {PipelineRequest} request
 * @param {Function} getUpdatesForActor
 * @returns {Promise<Awaited<unknown>[]>}
 */
async function process(request, getUpdatesForActor) {
	const updates = [];
	for (const actor of request.targets) {
		updates.push(getUpdatesForActor(actor));
	}
	return Promise.all(updates);
}

/**
 * @param {Event} event
 * @returns {FUActor[]}
 */
function getSingleTarget(event) {
	const dataId = $(event.target).closest('a').data('id');
	const actor = fromUuidSync(dataId);
	if (!actor) {
		ui.notifications.warn('FU.ChatApplyEffectNoActorsTargeted', { localize: true });
		return [];
	}
	return [actor];
}

/**
 * @param {Event} event
 * @param {Object} dataset
 * @param {Function<FUActor[]>} getTargetsFunction
 * @param {Function<Event, Object, FUActor[], Promise>} defaultAction
 * @param {Function<Event, Object, FUActor[], Promise>} alternateAction
 */
async function handleClick(event, dataset, getTargetsFunction, defaultAction, alternateAction = null) {
	event.preventDefault();
	if (!dataset.disabled) {
		const targets = getTargetsFunction ? await getTargetsFunction(event) : [];
		if (event.ctrlKey || event.metaKey) {
			if (alternateAction) {
				await alternateAction(event, dataset, targets);
			}
			dataset.disabled = false;
		} else {
			await defaultAction(event, dataset, targets);
			dataset.disabled = false;
		}
	}
}

export const Pipeline = {
	getSingleTarget,
	process,
	handleClick,
};
