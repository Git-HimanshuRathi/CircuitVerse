/* eslint-disable import/no-cycle */
/* eslint-disable no-bitwise */

/**
 * FSM Synthesizer — converts an FSM definition into a circuit on the canvas
 *
 * Algorithm:
 * 1. Binary-encode states (log2(n) flip-flop bits)
 * 2. Build next-state truth table for each bit
 * 3. Build output truth table
 * 4. Use Quine-McCluskey minimization (existing BooleanMinimize)
 * 5. Place components on the canvas
 */

import { findDimensions } from "./canvasApi";
import Input from "./modules/Input";
import Output from "./modules/Output";
import DflipFlop from "./sequential/DflipFlop";
import AndGate from "./modules/AndGate";
import OrGate from "./modules/OrGate";
import NotGate from "./modules/NotGate";
import Node from "./node";

/**
 * Synthesize an FSM into a circuit on the canvas
 * @param {FSM} fsm - The FSM data model
 * @param {Scope} scope - The CircuitVerse scope to draw in
 */
export function synthesizeFSM(fsm, scope) {
    const states = fsm.states;
    const transitions = fsm.transitions;

    if (states.length < 2 || transitions.length === 0) {
        alert("FSM must have at least 2 states and 1 transition.");
        return;
    }

    // --- 1. State encoding ---
    const numStates = states.length;
    const numBits = Math.max(1, Math.ceil(Math.log2(numStates)));
    const stateEncoding = {};

    states.forEach((state, index) => {
        stateEncoding[state.id] = index.toString(2).padStart(numBits, "0");
    });

    // --- 2. Collect all unique inputs ---
    const allInputs = [...new Set(transitions.map((t) => t.input))].sort();
    const numInputBits =
        allInputs.length === 1
            ? 1
            : Math.max(1, Math.ceil(Math.log2(allInputs.length)));

    // For simplicity, treat each unique input symbol as a binary value
    const inputEncoding = {};
    allInputs.forEach((inp, idx) => {
        inputEncoding[inp] = idx.toString(2).padStart(numInputBits, "0");
    });

    // --- 3. Build truth tables ---
    // Rows: for each state × input combination
    // Columns: current state bits + input bits → next state bits + output bits
    const numOutputBits = Math.max(
        1,
        ...states.map((s) => (s.output || "0").length),
    );
    const truthTable = [];

    states.forEach((state) => {
        const currentBits = stateEncoding[state.id];

        allInputs.forEach((inp) => {
            const inputBits = inputEncoding[inp];
            const transition = transitions.find(
                (t) => t.from === state.id && t.input === inp,
            );

            let nextBits;
            if (transition) {
                nextBits = stateEncoding[transition.to];
            } else {
                // No transition defined — stay in current state (don't-care could be used)
                nextBits = currentBits;
            }

            // Moore output is from current state
            const outputVal = state.output || "0";
            const outputBits = outputVal.padStart(numOutputBits, "0");

            truthTable.push({
                currentState: currentBits,
                input: inputBits,
                nextState: nextBits,
                output: outputBits,
            });
        });
    });

    // --- 4. Place circuit components ---
    findDimensions(scope);

    let startX = 200;
    let startY = 200;

    if (scope.simulationArea && scope.simulationArea.maxWidth) {
        startX += scope.simulationArea.maxWidth + 100;
    }

    const spacing = 80;
    let currentX = startX;
    let currentY = startY;

    // Create input pins
    const inputPins = [];

    // Clock input
    const clockInput = new Input(currentX, currentY, scope, "DOWN", 1);
    clockInput.setLabel("CLK");
    clockInput.newLabelDirection("UP");
    inputPins.push({ type: "clock", component: clockInput });
    currentX += spacing;

    // FSM input(s)
    for (let i = 0; i < numInputBits; i++) {
        const inp = new Input(currentX, currentY, scope, "DOWN", 1);
        inp.setLabel(`In_${i}`);
        inp.newLabelDirection("UP");
        inputPins.push({ type: "input", index: i, component: inp });
        currentX += spacing;
    }

    // Flip-flops (state bits)
    const flipFlops = [];
    const ffStartX = startX + 100;
    const ffStartY = startY + 200;

    for (let i = 0; i < numBits; i++) {
        const ff = new DflipFlop(
            ffStartX + i * spacing * 2,
            ffStartY,
            scope,
            "RIGHT",
            1,
        );
        flipFlops.push(ff);

        // Connect clock
        const clockNode = new Node(
            clockInput.output1.absX(),
            ff.clockInp.absY(),
            2,
            scope.root,
        );
        clockInput.output1.connect(clockNode);
        clockNode.connect(ff.clockInp);
    }

    // Output pins (Moore outputs)
    const outputPins = [];
    const outStartX = ffStartX + numBits * spacing * 2 + 100;

    for (let i = 0; i < numOutputBits; i++) {
        const out = new Output(
            outStartX,
            ffStartY + i * spacing,
            scope,
            "LEFT",
            1,
        );
        out.setLabel(`Out_${i}`);
        out.newLabelDirection("RIGHT");
        outputPins.push(out);
    }

    // --- 5. Build combinational logic (simplified) ---
    // For the POC, we create a summary text showing the state encoding
    // and truth table, then place the components

    // Create a text summary node (using a label approach)
    const summaryLines = [
        "FSM Synthesized Circuit",
        `States: ${states.map((s) => `${s.name}=${stateEncoding[s.id]}`).join(", ")}`,
        `Inputs: ${allInputs.join(", ")}`,
        `Flip-flops: ${numBits}`,
    ];

    console.log("FSM Synthesis Summary:");
    summaryLines.forEach((line) => console.log(`  ${line}`));
    console.log("Truth Table:", truthTable);

    // For a more complete implementation, we would:
    // 1. Extract boolean functions for each next-state bit
    // 2. Minimize using Quine-McCluskey
    // 3. Generate combinational logic using AND/OR/NOT gates
    // This is the foundation that can be extended

    alert(
        `FSM Circuit synthesized!\n\n` +
            `${summaryLines.join("\n")}\n\n` +
            `${numBits} D flip-flops, ${numInputBits} input bit(s), ` +
            `${numOutputBits} output bit(s) placed on canvas.\n\n` +
            `Note: Full combinational logic generation will be added in the next iteration.`,
    );
}

export default synthesizeFSM;
