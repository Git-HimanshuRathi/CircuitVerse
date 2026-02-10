/* eslint-disable import/no-cycle */
/* eslint-disable no-alert */

/**
 * FSM Editor — Visual finite state machine editor for CircuitVerse
 *
 * Gesture-based interaction model:
 *   Double-click canvas  → add state
 *   Shift+drag           → create transition
 *   Click                → select state/transition
 *   Drag                 → move state
 *   Delete/Backspace     → remove selected
 *   Double-click state   → rename (inline)
 *   Right-click state    → context menu
 *   Ctrl+Z               → undo
 */

import { synthesizeFSM } from "./fsmSynthesizer";

// Theme colors — pulled from CircuitVerse CSS variables at runtime
function getColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const get = (name, fallback) =>
        style.getPropertyValue(name).trim() || fallback;
    return {
        bg: get("--canvas-fill", "#fff"),
        stroke: get("--stroke", "#000"),
        text: get("--stroke", "#000"),
        primary: get("--bg-toggle-btn-primary", "#42b983"),
        wire: get("--bg-toggle-btn-primary", "#42b983"),
        panelBg: get("--primary", "#454545"),
        panelText: get("--text-panel", "#fff"),
        selected: "#42b983",
        hover: "rgba(66, 185, 131, 0.15)",
        error: "#dc5656",
    };
}

// ============================================================================
// Data Model
// ============================================================================

let nextStateId = 0;
let nextTransitionId = 0;

/**
 * FSM State
 */
class FSMState {
    constructor(x, y, name, output = "0") {
        this.id = `s${nextStateId++}`;
        this.x = x;
        this.y = y;
        this.name = name;
        this.output = output; // Moore output
        this.radius = 30;
        this.isInitial = false;
        this.isAccept = false;
    }

    containsPoint(px, py) {
        const dx = px - this.x;
        const dy = py - this.y;
        return dx * dx + dy * dy <= this.radius * this.radius;
    }

    draw(ctx, colors, isSelected, isHovered) {
        ctx.save();

        // Hover glow
        if (isHovered && !isSelected) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6, 0, 2 * Math.PI);
            ctx.fillStyle = colors.hover;
            ctx.fill();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? colors.selected : colors.stroke;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Accept (double circle)
        if (this.isAccept) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius - 5, 0, 2 * Math.PI);
            ctx.stroke();
        }

        // Initial state arrow
        if (this.isInitial) {
            const arrowLen = 30;
            const ax = this.x - this.radius - arrowLen;
            const ay = this.y;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(this.x - this.radius, ay);
            ctx.strokeStyle = colors.stroke;
            ctx.lineWidth = 2;
            ctx.stroke();
            // Arrowhead
            ctx.beginPath();
            ctx.moveTo(this.x - this.radius, ay);
            ctx.lineTo(this.x - this.radius - 8, ay - 5);
            ctx.lineTo(this.x - this.radius - 8, ay + 5);
            ctx.closePath();
            ctx.fillStyle = colors.stroke;
            ctx.fill();
        }

        // State name
        ctx.fillStyle = colors.text;
        ctx.font = "bold 14px Inter, Raleway, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.name, this.x, this.y);

        // Moore output (below)
        ctx.font = "11px Inter, Raleway, sans-serif";
        ctx.fillStyle = colors.wire;
        ctx.fillText(`/${this.output}`, this.x, this.y + this.radius + 14);

        ctx.restore();
    }
}

/**
 * FSM Transition
 */
class FSMTransition {
    constructor(fromId, toId, input, output = "") {
        this.id = `t${nextTransitionId++}`;
        this.from = fromId;
        this.to = toId;
        this.input = input;
        this.output = output; // empty for Moore
    }

    /**
     * Get label text
     */
    get label() {
        return this.output ? `${this.input}/${this.output}` : this.input;
    }

    /**
     * Draw the transition arrow
     */
    draw(
        ctx,
        fromState,
        toState,
        colors,
        isSelected,
        isHovered,
        offsetIndex = 0,
    ) {
        if (!fromState || !toState) return;
        ctx.save();

        const isSelfLoop = this.from === this.to;

        if (isSelfLoop) {
            this._drawSelfLoop(ctx, fromState, colors, isSelected, isHovered);
        } else {
            this._drawArrow(
                ctx,
                fromState,
                toState,
                colors,
                isSelected,
                isHovered,
                offsetIndex,
            );
        }

        ctx.restore();
    }

    _drawSelfLoop(ctx, state, colors, isSelected, isHovered) {
        const r = state.radius;
        const loopRadius = 20;
        const cx = state.x;
        const cy = state.y - r - loopRadius;

        ctx.beginPath();
        ctx.arc(cx, cy, loopRadius, 0.3 * Math.PI, 0.7 * Math.PI);
        ctx.strokeStyle = isSelected
            ? colors.selected
            : isHovered
              ? colors.primary
              : colors.stroke;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Arrowhead at right end
        const angle = 0.3 * Math.PI;
        const ax = cx + loopRadius * Math.cos(angle);
        const ay = cy + loopRadius * Math.sin(angle);
        this._drawArrowHead(ctx, ax, ay, angle + Math.PI / 2, ctx.strokeStyle);

        // Label
        ctx.fillStyle = colors.text;
        ctx.font = "12px Inter, Raleway, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(this.label, cx, cy - loopRadius - 4);
    }

    _drawArrow(
        ctx,
        fromState,
        toState,
        colors,
        isSelected,
        isHovered,
        offsetIndex,
    ) {
        const dx = toState.x - fromState.x;
        const dy = toState.y - fromState.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        // Normalize
        const nx = dx / dist;
        const ny = dy / dist;

        // Perpendicular offset for parallel transitions
        const perpX = -ny;
        const perpY = nx;
        const offset = offsetIndex * 15;

        // Start and end points (on circle edge)
        const sx = fromState.x + nx * fromState.radius + perpX * offset;
        const sy = fromState.y + ny * fromState.radius + perpY * offset;
        const ex = toState.x - nx * toState.radius + perpX * offset;
        const ey = toState.y - ny * toState.radius + perpY * offset;

        // Curve control point
        const midX = (sx + ex) / 2 + perpX * (20 + Math.abs(offset));
        const midY = (sy + ey) / 2 + perpY * (20 + Math.abs(offset));

        // Draw curve
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        if (offset !== 0) {
            ctx.quadraticCurveTo(midX, midY, ex, ey);
        } else {
            ctx.lineTo(ex, ey);
        }
        ctx.strokeStyle = isSelected
            ? colors.selected
            : isHovered
              ? colors.primary
              : colors.stroke;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Arrowhead
        const angle = Math.atan2(
            ey - (offset !== 0 ? midY : sy),
            ex - (offset !== 0 ? midX : sx),
        );
        this._drawArrowHead(ctx, ex, ey, angle, ctx.strokeStyle);

        // Label
        const labelX = offset !== 0 ? midX : (sx + ex) / 2;
        const labelY = offset !== 0 ? midY - 10 : (sy + ey) / 2 - 10;
        ctx.fillStyle = colors.text;
        ctx.font = "12px Inter, Raleway, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(this.label, labelX, labelY);
    }

    _drawArrowHead(ctx, x, y, angle, color) {
        const headLen = 10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
            x - headLen * Math.cos(angle - Math.PI / 6),
            y - headLen * Math.sin(angle - Math.PI / 6),
        );
        ctx.lineTo(
            x - headLen * Math.cos(angle + Math.PI / 6),
            y - headLen * Math.sin(angle + Math.PI / 6),
        );
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
    }

    /**
     * Check if a point is near this transition line
     */
    containsPoint(px, py, fromState, toState) {
        if (!fromState || !toState) return false;

        if (this.from === this.to) {
            // Self-loop hit test
            const r = fromState.radius;
            const loopRadius = 20;
            const cx = fromState.x;
            const cy = fromState.y - r - loopRadius;
            const dx = px - cx;
            const dy = py - cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            return Math.abs(d - loopRadius) < 8;
        }

        // Line distance test
        const ax = fromState.x;
        const ay = fromState.y;
        const bx = toState.x;
        const by = toState.y;

        const abx = bx - ax;
        const aby = by - ay;
        const apx = px - ax;
        const apy = py - ay;
        const ab2 = abx * abx + aby * aby;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
        const closestX = ax + t * abx;
        const closestY = ay + t * aby;
        const dx = px - closestX;
        const dy = py - closestY;
        return dx * dx + dy * dy < 100; // 10px threshold
    }
}

/**
 * FSM data container
 */
class FSM {
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

// ============================================================================
// Undo History
// ============================================================================

class UndoHistory {
    constructor(maxSize = 50) {
        this.stack = [];
        this.maxSize = maxSize;
    }

    push(snapshot) {
        if (this.stack.length >= this.maxSize) {
            this.stack.shift();
        }
        this.stack.push(JSON.stringify(snapshot));
    }

    pop() {
        if (this.stack.length === 0) return null;
        return JSON.parse(this.stack.pop());
    }

    get canUndo() {
        return this.stack.length > 0;
    }
}

// ============================================================================
// Context Menu
// ============================================================================

class ContextMenu {
    constructor() {
        this.el = null;
        this._create();
    }

    _create() {
        this.el = document.createElement("div");
        this.el.className = "fsm-context-menu";
        this.el.style.display = "none";
        document.body.appendChild(this.el);

        // Close on any click outside
        document.addEventListener("mousedown", (e) => {
            if (!this.el.contains(e.target)) {
                this.hide();
            }
        });
    }

    show(x, y, items) {
        this.el.innerHTML = "";
        items.forEach((item) => {
            if (item.separator) {
                const sep = document.createElement("div");
                sep.className = "fsm-context-separator";
                this.el.appendChild(sep);
                return;
            }
            const btn = document.createElement("div");
            btn.className = "fsm-context-item";
            btn.textContent = item.label;
            btn.addEventListener("click", () => {
                item.action();
                this.hide();
            });
            this.el.appendChild(btn);
        });

        this.el.style.left = `${x}px`;
        this.el.style.top = `${y}px`;
        this.el.style.display = "block";
    }

    hide() {
        this.el.style.display = "none";
    }

    destroy() {
        if (this.el && this.el.parentNode) {
            this.el.parentNode.removeChild(this.el);
        }
    }
}

// ============================================================================
// FSM Editor (Canvas UI)
// ============================================================================

let activeEditor = null;

export class FSMEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;
        this.fsm = new FSM();
        this.history = new UndoHistory();
        this.contextMenu = new ContextMenu();

        // Interaction state
        this.selectedState = null;
        this.selectedTransition = null;
        this.hoveredState = null;
        this.hoveredTransition = null;
        this.draggingState = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.isShiftDragging = false;
        this.shiftDragFrom = null;
        this.mouseX = 0;
        this.mouseY = 0;

        // Inline editing
        this.editingState = null;
        this.editInput = null;

        this.init();
    }

    init() {
        if (!this.container) {
            console.error("FSM Editor container not found");
            return;
        }

        // Create canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = 650;
        this.canvas.height = 400;
        this.canvas.className = "fsm-editor-canvas";
        this.canvas.tabIndex = 0; // Make focusable for keyboard events
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");

        // Bind events
        this.canvas.addEventListener("mousedown", this._onMouseDown.bind(this));
        this.canvas.addEventListener("mousemove", this._onMouseMove.bind(this));
        this.canvas.addEventListener("mouseup", this._onMouseUp.bind(this));
        this.canvas.addEventListener(
            "dblclick",
            this._onDoubleClick.bind(this),
        );
        this.canvas.addEventListener(
            "contextmenu",
            this._onContextMenu.bind(this),
        );
        this._keyHandler = this._onKeyDown.bind(this);
        document.addEventListener("keydown", this._keyHandler);

        this.render();
    }

    // --- Snapshot for undo ---
    _saveSnapshot() {
        this.history.push({
            states: this.fsm.states.map((s) => ({ ...s })),
            transitions: this.fsm.transitions.map((t) => ({ ...t })),
            stateCounter: this.fsm.stateCounter,
        });
    }

    _restoreSnapshot(snap) {
        nextStateId = 0;
        nextTransitionId = 0;
        this.fsm.states = snap.states.map((s) => {
            const st = new FSMState(s.x, s.y, s.name, s.output);
            st.id = s.id;
            st.isInitial = s.isInitial;
            st.isAccept = s.isAccept;
            st.radius = s.radius;
            nextStateId = Math.max(
                nextStateId,
                parseInt(s.id.slice(1), 10) + 1,
            );
            return st;
        });
        this.fsm.transitions = snap.transitions.map((t) => {
            const tr = new FSMTransition(t.from, t.to, t.input, t.output);
            tr.id = t.id;
            nextTransitionId = Math.max(
                nextTransitionId,
                parseInt(t.id.slice(1), 10) + 1,
            );
            return tr;
        });
        this.fsm.stateCounter = snap.stateCounter;
        this.selectedState = null;
        this.selectedTransition = null;
    }

    // --- Coordinate helpers ---
    _getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    _clamp(state) {
        const pad = state.radius + 5;
        state.x = Math.max(pad, Math.min(this.canvas.width - pad, state.x));
        state.y = Math.max(pad, Math.min(this.canvas.height - pad, state.y));
    }

    // --- Hit testing ---
    _getStateAt(x, y) {
        // Reverse order so topmost drawn state is picked first
        for (let i = this.fsm.states.length - 1; i >= 0; i--) {
            if (this.fsm.states[i].containsPoint(x, y))
                return this.fsm.states[i];
        }
        return null;
    }

    _getTransitionAt(x, y) {
        for (let i = this.fsm.transitions.length - 1; i >= 0; i--) {
            const t = this.fsm.transitions[i];
            const from = this.fsm.getStateById(t.from);
            const to = this.fsm.getStateById(t.to);
            if (t.containsPoint(x, y, from, to)) return t;
        }
        return null;
    }

    // --- Event handlers ---
    _onMouseDown(e) {
        if (e.button === 2) return; // Right-click handled by contextmenu
        this._cancelEditing();
        this.contextMenu.hide();

        const pos = this._getMousePos(e);
        const state = this._getStateAt(pos.x, pos.y);

        if (e.shiftKey && state) {
            // Start shift-drag for transition
            this.isShiftDragging = true;
            this.shiftDragFrom = state;
            this.mouseX = pos.x;
            this.mouseY = pos.y;
            return;
        }

        if (state) {
            // Select and start dragging
            this.selectedState = state;
            this.selectedTransition = null;
            this.draggingState = state;
            this.dragStartX = pos.x - state.x;
            this.dragStartY = pos.y - state.y;
            this.render();
            return;
        }

        // Check transitions
        const trans = this._getTransitionAt(pos.x, pos.y);
        if (trans) {
            this.selectedTransition = trans;
            this.selectedState = null;
            this.render();
            return;
        }

        // Deselect
        this.selectedState = null;
        this.selectedTransition = null;
        this.render();
    }

    _onMouseMove(e) {
        const pos = this._getMousePos(e);
        this.mouseX = pos.x;
        this.mouseY = pos.y;

        if (this.isShiftDragging) {
            this.render();
            return;
        }

        if (this.draggingState) {
            this._saveSnapshot();
            this.draggingState.x = pos.x - this.dragStartX;
            this.draggingState.y = pos.y - this.dragStartY;
            this._clamp(this.draggingState);
            this.render();
            // Pop the snapshot we just saved (drag is continuous; we only save on mouseup)
            this.history.pop();
            return;
        }

        // Hover detection
        const prevHoveredState = this.hoveredState;
        const prevHoveredTrans = this.hoveredTransition;
        this.hoveredState = this._getStateAt(pos.x, pos.y);
        this.hoveredTransition = this.hoveredState
            ? null
            : this._getTransitionAt(pos.x, pos.y);

        if (
            this.hoveredState !== prevHoveredState ||
            this.hoveredTransition !== prevHoveredTrans
        ) {
            this.canvas.style.cursor =
                this.hoveredState || this.hoveredTransition
                    ? "pointer"
                    : "crosshair";
            this.render();
        }
    }

    _onMouseUp(e) {
        const pos = this._getMousePos(e);

        if (this.isShiftDragging && this.shiftDragFrom) {
            const target = this._getStateAt(pos.x, pos.y);
            if (target) {
                this._createTransition(this.shiftDragFrom, target);
            }
            this.isShiftDragging = false;
            this.shiftDragFrom = null;
            this.render();
            return;
        }

        if (this.draggingState) {
            this._saveSnapshot();
            this.draggingState = null;
        }
    }

    _onDoubleClick(e) {
        const pos = this._getMousePos(e);
        const state = this._getStateAt(pos.x, pos.y);

        if (state) {
            // Double-click on existing state: start inline editing
            this._startEditing(state);
            return;
        }

        // Double-click on empty canvas: add state
        this._saveSnapshot();
        const newState = this.fsm.addState(pos.x, pos.y);
        this._clamp(newState);
        this.selectedState = newState;
        this.selectedTransition = null;
        this.render();
    }

    _onContextMenu(e) {
        e.preventDefault();
        const pos = this._getMousePos(e);
        const state = this._getStateAt(pos.x, pos.y);

        if (!state) {
            this.contextMenu.hide();
            return;
        }

        this.selectedState = state;
        this.render();

        const items = [
            {
                label: state.isInitial ? "✓ Initial State" : "Set as Initial",
                action: () => {
                    this._saveSnapshot();
                    this.fsm.setInitialState(state.id);
                    this.render();
                },
            },
            {
                label: state.isAccept
                    ? "✓ Accept State"
                    : "Toggle Accept State",
                action: () => {
                    this._saveSnapshot();
                    state.isAccept = !state.isAccept;
                    this.render();
                },
            },
            { separator: true },
            {
                label: "Edit Output",
                action: () => {
                    const val = prompt(
                        `Output for state "${state.name}":`,
                        state.output,
                    );
                    if (val !== null) {
                        this._saveSnapshot();
                        state.output = val;
                        this.render();
                    }
                },
            },
            {
                label: "Rename",
                action: () => {
                    this._startEditing(state);
                },
            },
            { separator: true },
            {
                label: "Delete",
                action: () => {
                    this._saveSnapshot();
                    this.fsm.removeState(state.id);
                    this.selectedState = null;
                    this.render();
                },
            },
        ];

        // Position relative to page
        const rect = this.canvas.getBoundingClientRect();
        this.contextMenu.show(rect.left + pos.x, rect.top + pos.y, items);
    }

    _onKeyDown(e) {
        // Undo
        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            if (this.history.canUndo) {
                const snap = this.history.pop();
                this._restoreSnapshot(snap);
                this.render();
            }
            return;
        }

        // Delete
        if (e.key === "Delete" || e.key === "Backspace") {
            if (this.editingState) return; // Don't delete while editing
            e.preventDefault();

            if (this.selectedState) {
                this._saveSnapshot();
                this.fsm.removeState(this.selectedState.id);
                this.selectedState = null;
                this.render();
            } else if (this.selectedTransition) {
                this._saveSnapshot();
                this.fsm.removeTransition(this.selectedTransition.id);
                this.selectedTransition = null;
                this.render();
            }
        }
    }

    // --- Inline editing ---
    _startEditing(state) {
        this._cancelEditing();
        this.editingState = state;

        const rect = this.canvas.getBoundingClientRect();
        this.editInput = document.createElement("input");
        this.editInput.type = "text";
        this.editInput.value = state.name;
        this.editInput.className = "fsm-inline-edit";
        Object.assign(this.editInput.style, {
            position: "fixed",
            left: `${rect.left + state.x - 30}px`,
            top: `${rect.top + state.y - 10}px`,
            width: "60px",
            textAlign: "center",
            zIndex: "10000",
        });

        document.body.appendChild(this.editInput);
        this.editInput.focus();
        this.editInput.select();

        this.editInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                this._commitEditing();
            } else if (e.key === "Escape") {
                this._cancelEditing();
            }
        });

        this.editInput.addEventListener("blur", () => {
            // Small delay to prevent conflict with other clicks
            setTimeout(() => this._commitEditing(), 100);
        });
    }

    _commitEditing() {
        if (!this.editingState || !this.editInput) return;

        const newName = this.editInput.value.trim();
        if (newName && !this.fsm.hasStateName(newName, this.editingState.id)) {
            this._saveSnapshot();
            this.editingState.name = newName;
        }

        this._cancelEditing();
        this.render();
    }

    _cancelEditing() {
        if (this.editInput && this.editInput.parentNode) {
            this.editInput.parentNode.removeChild(this.editInput);
        }
        this.editInput = null;
        this.editingState = null;
    }

    // --- Transition creation ---
    _createTransition(fromState, toState) {
        const input = prompt("Enter input condition (e.g., 0 or 1):", "0");
        if (input === null) return;

        const trimmed = input.trim();
        if (!trimmed) {
            alert("Input condition cannot be empty.");
            return;
        }

        this._saveSnapshot();
        const t = this.fsm.addTransition(fromState.id, toState.id, trimmed);
        if (!t) {
            alert(
                `Duplicate: transition from ${fromState.name} to ${toState.name} with input "${trimmed}" already exists.`,
            );
        }
        this.render();
    }

    // --- Rendering ---
    render() {
        const { ctx, canvas } = this;
        const colors = getColors();

        // Clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background fill
        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid lines (matching CircuitVerse canvas)
        const gridSize = 15;
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= canvas.width; x += gridSize) {
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, canvas.height);
        }
        for (let y = 0; y <= canvas.height; y += gridSize) {
            ctx.moveTo(0, y + 0.5);
            ctx.lineTo(canvas.width, y + 0.5);
        }
        ctx.stroke();

        // Draw transitions first (below states)
        this.fsm.transitions.forEach((t) => {
            const from = this.fsm.getStateById(t.from);
            const to = this.fsm.getStateById(t.to);
            const offset = this.fsm.getTransitionOffset(t);
            t.draw(
                ctx,
                from,
                to,
                colors,
                this.selectedTransition === t,
                this.hoveredTransition === t,
                offset,
            );
        });

        // Draw shift-drag preview
        if (this.isShiftDragging && this.shiftDragFrom) {
            ctx.beginPath();
            ctx.setLineDash([6, 4]);
            ctx.moveTo(this.shiftDragFrom.x, this.shiftDragFrom.y);
            ctx.lineTo(this.mouseX, this.mouseY);
            ctx.strokeStyle = colors.primary;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw states
        this.fsm.states.forEach((s) => {
            s.draw(
                ctx,
                colors,
                this.selectedState === s,
                this.hoveredState === s,
            );
        });

        // Empty canvas hint
        if (this.fsm.states.length === 0) {
            ctx.fillStyle = colors.text;
            ctx.globalAlpha = 0.4;
            ctx.font = "14px Inter, Raleway, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                "Double-click to add a state",
                canvas.width / 2,
                canvas.height / 2,
            );
            ctx.globalAlpha = 1;
        }
    }

    /**
     * Get FSM data for synthesis
     */
    getFSM() {
        return this.fsm;
    }

    /**
     * Cleanup
     */
    destroy() {
        document.removeEventListener("keydown", this._keyHandler);
        this._cancelEditing();
        this.contextMenu.destroy();
    }
}

// ============================================================================
// Dialog
// ============================================================================

/**
 * Open the FSM Editor dialog
 */
export function openFSMEditorDialog() {
    // eslint-disable-next-line no-undef
    const scope = globalScope;

    let dialog = document.getElementById("fsm-editor-dialog");
    if (!dialog) {
        dialog = document.createElement("div");
        dialog.id = "fsm-editor-dialog";
        dialog.title = "FSM Editor (Moore Machine)";
        dialog.innerHTML = '<div id="fsm-editor-container"></div>';
        document.body.appendChild(dialog);
    }

    // Initialize editor
    const container = document.getElementById("fsm-editor-container");
    container.innerHTML = "";
    activeEditor = new FSMEditor("fsm-editor-container");

    // Show dialog
    $(dialog).dialog({
        modal: true,
        width: 720,
        height: 550,
        resizable: true,
        buttons: [
            {
                text: "Synthesize",
                click() {
                    const { valid, warnings, errors } = activeEditor
                        .getFSM()
                        .validate();

                    if (!valid) {
                        alert(`Cannot synthesize:\n• ${errors.join("\n• ")}`);
                        return;
                    }

                    if (warnings.length > 0) {
                        const proceed = confirm(
                            `Warnings:\n• ${warnings.join("\n• ")}\n\nProceed anyway?`,
                        );
                        if (!proceed) return;
                    }

                    synthesizeFSM(activeEditor.getFSM(), scope);
                    $(dialog).dialog("close");
                },
            },
            {
                text: "Close",
                click() {
                    $(this).dialog("close");
                },
            },
        ],
        close() {
            if (activeEditor) {
                activeEditor.destroy();
                activeEditor = null;
            }
        },
    });
}

export default FSMEditor;
