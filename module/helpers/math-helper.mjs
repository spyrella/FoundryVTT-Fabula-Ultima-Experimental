function clamp(value, min, max) {
	return Math.max(min, Math.min(value, max));
}

/**
 * @description A sandbox-safe evaluation function to execute user-input code with access to scoped Math methods.
 * @param {String} expression A simple arithmetic expression
 * @returns {Number} The evaluated value
 * @author Uses Foundry's API
 */
function evaluate(expression) {
	try {
		return Roll.safeEval(expression);
	} catch (e) {
		return expression;
	}
}

export const MathHelper = Object.freeze({
	clamp,
	evaluate,
});
