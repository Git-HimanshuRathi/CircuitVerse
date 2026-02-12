/* eslint-disable import/no-cycle */

import FSMState from "./FSMState";
import FSMTransition from "./FSMTransition";

/**
 * FSM data container
 */
export default class FSM {
    constructor() {
        this.states = [];
        this.transitions = [];
        this.type = "moore";
        this.stateCounter = 0;
    }

    addState(x, y) {
        const name = `S${this.stateCounter++}`;
        const state = new FSMState(x, y, name);
        if (this.states.length === 0) {
            state.isInitial = true;
        }
        this.states.push(state);
        return state;
    }

    addTransition(fromId, toId, input, output = "") {
        // Check for duplicates
        const existing = this.transitions.find(
            (t) => t.from === fromId && t.to === toId && t.input === input,
        );
        if (existing) {
            return null; // Duplicate
        }
        const transition = new FSMTransition(fromId, toId, input, output);
        this.transitions.push(transition);
        return transition;
    }

    removeState(stateId) {
        const state = this.getStateById(stateId);
        if (!state) return;

        // Remove associated transitions
        this.transitions = this.transitions.filter(
            (t) => t.from !== stateId && t.to !== stateId,
        );

        // Remove the state
        this.states = this.states.filter((s) => s.id !== stateId);

        // Reassign initial if needed
        if (state.isInitial && this.states.length > 0) {
            this.states[0].isInitial = true;
        }
    }

    removeTransition(transitionId) {
        this.transitions = this.transitions.filter(
            (t) => t.id !== transitionId,
        );
    }

    getStateById(id) {
        return this.states.find((s) => s.id === id);
    }

    setInitialState(stateId) {
        this.states.forEach((s) => {
            s.isInitial = false;
        });
        const state = this.getStateById(stateId);
        if (state) state.isInitial = true;
    }

    hasStateName(name, excludeId = null) {
        return this.states.some((s) => s.name === name && s.id !== excludeId);
    }

    /**
     * Get transition offset index for parallel edges
     */
    getTransitionOffset(transition) {
        const parallels = this.transitions.filter(
            (t) =>
                (t.from === transition.from && t.to === transition.to) ||
                (t.from === transition.to && t.to === transition.from),
        );
        if (parallels.length <= 1) return 0;
        const idx = parallels.indexOf(transition);
        return idx - Math.floor(parallels.length / 2);
    }

    /**
     * Validate FSM for synthesis
     * Returns { valid, warnings, errors }
     */
    validate() {
        const errors = [];
        const warnings = [];

        if (this.states.length < 2) {
            errors.push("Need at least 2 states");
        }
        if (this.transitions.length === 0) {
            errors.push("Need at least 1 transition");
        }
        if (!this.states.some((s) => s.isInitial)) {
            errors.push("No initial state set");
        }

        // Check for orphan states (no outgoing transitions)
        this.states.forEach((s) => {
            const outgoing = this.transitions.filter((t) => t.from === s.id);
            if (outgoing.length === 0) {
                warnings.push(`State "${s.name}" has no outgoing transitions`);
            }
        });

        // Get all unique inputs
        const allInputs = [...new Set(this.transitions.map((t) => t.input))];

        // Check for missing transitions (not all inputs covered)
        this.states.forEach((s) => {
            const coveredInputs = this.transitions
                .filter((t) => t.from === s.id)
                .map((t) => t.input);
            const missing = allInputs.filter(
                (inp) => !coveredInputs.includes(inp),
            );
            if (missing.length > 0) {
                warnings.push(
                    `State "${s.name}" missing transitions for inputs: ${missing.join(", ")}`,
                );
            }
        });

        return {
            valid: errors.length === 0,
            warnings,
            errors,
        };
    }
}
