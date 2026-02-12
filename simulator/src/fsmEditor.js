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
import FSMState, { setStateIdCounter } from "./fsm/FSMState";
import FSMTransition, { setTransitionIdCounter } from "./fsm/FSMTransition";
import FSM from "./fsm/FSM";
import UndoHistory from "./fsm/UndoHistory";
import ContextMenu from "./fsm/ContextMenu";

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

        // Current tool mode: 'select' | 'addState' | 'addTransition'
        this.mode = "select";
        this.transitionSource = null;

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

        // Toolbar buttons reference
        this.toolbarBtns = {};

        this.init();
    }

    init() {
        if (!this.container) {
            console.error("FSM Editor container not found");
            return;
        }

        // Create toolbar
        this._createToolbar();

        // Create canvas
        this.canvas = document.createElement("canvas");
        this.canvas.width = 650;
        this.canvas.height = 370;
        this.canvas.className = "fsm-editor-canvas";
        this.canvas.tabIndex = 0;
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

    // --- Toolbar ---
    _createToolbar() {
        const toolbar = document.createElement("div");
        toolbar.className = "fsm-toolbar";

        const buttons = [
            {
                id: "select",
                icon: "⊹",
                label: "Select",
                tooltip: "Select / Move (V)",
            },
            {
                id: "addState",
                icon: "◯",
                label: "State",
                tooltip: "Add State (S)",
            },
            {
                id: "addTransition",
                icon: "→",
                label: "Transition",
                tooltip: "Add Transition (T)",
            },
            { id: "sep1", separator: true },
            {
                id: "delete",
                icon: "✕",
                label: "Delete",
                tooltip: "Delete Selected (Del)",
                action: true,
            },
            {
                id: "undo",
                icon: "↺",
                label: "Undo",
                tooltip: "Undo (Ctrl+Z)",
                action: true,
            },
        ];

        buttons.forEach((btn) => {
            if (btn.separator) {
                const sep = document.createElement("div");
                sep.className = "fsm-toolbar-sep";
                toolbar.appendChild(sep);
                return;
            }

            const el = document.createElement("button");
            el.className = "fsm-toolbar-btn";
            el.title = btn.tooltip;
            el.innerHTML = `<span class="fsm-toolbar-icon">${btn.icon}</span><span class="fsm-toolbar-label">${btn.label}</span>`;

            if (btn.action) {
                el.addEventListener("click", () =>
                    this._handleToolbarAction(btn.id),
                );
            } else {
                el.addEventListener("click", () => this._setMode(btn.id));
                if (btn.id === "select") el.classList.add("active");
            }

            this.toolbarBtns[btn.id] = el;
            toolbar.appendChild(el);
        });

        // Status text
        this.statusText = document.createElement("span");
        this.statusText.className = "fsm-toolbar-status";
        this.statusText.textContent = "";
        toolbar.appendChild(this.statusText);

        this.container.appendChild(toolbar);
    }

    _setMode(mode) {
        this.mode = mode;
        this.transitionSource = null;

        ["select", "addState", "addTransition"].forEach((m) => {
            if (this.toolbarBtns[m]) {
                this.toolbarBtns[m].classList.toggle("active", m === mode);
            }
        });

        const statusMap = {
            select: "Click to select, drag to move, right-click for options",
            addState: "Click on canvas to place a new state",
            addTransition: "Click source state, then click target state",
        };
        this.statusText.textContent = statusMap[mode] || "";

        const cursorMap = {
            select: "default",
            addState: "crosshair",
            addTransition: "pointer",
        };
        if (this.canvas) {
            this.canvas.style.cursor = cursorMap[mode] || "default";
        }

        this.render();
    }

    _handleToolbarAction(action) {
        if (action === "delete") {
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
            } else {
                this.statusText.textContent = "Nothing selected to delete";
            }
        } else if (action === "undo") {
            if (this.history.canUndo) {
                const snap = this.history.pop();
                this._restoreSnapshot(snap);
                this.render();
            }
        }
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
        setStateIdCounter(0);
        setTransitionIdCounter(0);
        this.fsm.states = snap.states.map((s) => {
            const st = new FSMState(s.x, s.y, s.name, s.output);
            st.id = s.id;
            st.isInitial = s.isInitial;
            st.isAccept = s.isAccept;
            st.radius = s.radius;
            setStateIdCounter(Math.max(0, parseInt(s.id.slice(1), 10) + 1));
            return st;
        });
        this.fsm.transitions = snap.transitions.map((t) => {
            const tr = new FSMTransition(t.from, t.to, t.input, t.output);
            tr.id = t.id;
            setTransitionIdCounter(
                Math.max(0, parseInt(t.id.slice(1), 10) + 1),
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
        if (e.button === 2) return;
        this._cancelEditing();
        this.contextMenu.hide();

        const pos = this._getMousePos(e);
        const state = this._getStateAt(pos.x, pos.y);

        // --- Mode: Add State ---
        if (this.mode === "addState") {
            const output = prompt(
                "Enter Moore output for new state (e.g., 0 or 1):",
            );
            if (output === null) return;
            const trimmedOutput = output.trim();
            if (trimmedOutput === "") {
                alert("Output cannot be empty.");
                return;
            }

            this._saveSnapshot();
            const newState = this.fsm.addState(pos.x, pos.y);
            newState.output = trimmedOutput;
            this._clamp(newState);
            this.selectedState = newState;
            this.selectedTransition = null;
            this.statusText.textContent = `Created state "${newState.name}" with output /${trimmedOutput}`;
            this.render();
            return;
        }

        // --- Mode: Add Transition ---
        if (this.mode === "addTransition") {
            if (state) {
                if (!this.transitionSource) {
                    this.transitionSource = state;
                    this.selectedState = state;
                    this.statusText.textContent = `Source: "${state.name}" — now click target state`;
                    this.render();
                } else {
                    this._createTransition(this.transitionSource, state);
                    this.transitionSource = null;
                    this.statusText.textContent =
                        "Click source state, then click target state";
                }
            } else {
                this.transitionSource = null;
                this.statusText.textContent =
                    "Click on a state to start a transition";
                this.render();
            }
            return;
        }

        // --- Mode: Select (default) ---
        if (e.shiftKey && state) {
            this.isShiftDragging = true;
            this.shiftDragFrom = state;
            this.mouseX = pos.x;
            this.mouseY = pos.y;
            return;
        }

        if (state) {
            this.selectedState = state;
            this.selectedTransition = null;
            this.draggingState = state;
            this.dragStartX = pos.x - state.x;
            this.dragStartY = pos.y - state.y;
            this.statusText.textContent = `Selected state "${state.name}"`;
            this.render();
            return;
        }

        const trans = this._getTransitionAt(pos.x, pos.y);
        if (trans) {
            this.selectedTransition = trans;
            this.selectedState = null;
            this.statusText.textContent = `Selected transition "${trans.label}"`;
            this.render();
            return;
        }

        this.selectedState = null;
        this.selectedTransition = null;
        this.statusText.textContent = "";
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
            this.history.pop();
            return;
        }

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
            this._startEditing(state);
            return;
        }

        const output = prompt(
            "Enter Moore output for new state (e.g., 0 or 1):",
        );
        if (output === null) return;
        const trimmedOutput = output.trim();
        if (trimmedOutput === "") {
            alert("Output cannot be empty.");
            return;
        }

        this._saveSnapshot();
        const newState = this.fsm.addState(pos.x, pos.y);
        newState.output = trimmedOutput;
        this._clamp(newState);
        this.selectedState = newState;
        this.selectedTransition = null;
        this.statusText.textContent = `Created state "${newState.name}" with output /${trimmedOutput}`;
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

        const rect = this.canvas.getBoundingClientRect();
        this.contextMenu.show(rect.left + pos.x, rect.top + pos.y, items);
    }

    _onKeyDown(e) {
        if (this.editingState) return;

        if ((e.ctrlKey || e.metaKey) && e.key === "z") {
            e.preventDefault();
            if (this.history.canUndo) {
                const snap = this.history.pop();
                this._restoreSnapshot(snap);
                this.render();
            }
            return;
        }

        if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            this._handleToolbarAction("delete");
            return;
        }

        if (e.key === "v" || e.key === "V") {
            this._setMode("select");
            return;
        }
        if (e.key === "s" || e.key === "S") {
            if (!e.ctrlKey && !e.metaKey) {
                this._setMode("addState");
                return;
            }
        }
        if (e.key === "t" || e.key === "T") {
            this._setMode("addTransition");
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

        this.editInput.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                this._commitEditing();
            } else if (ev.key === "Escape") {
                this._cancelEditing();
            }
        });

        this.editInput.addEventListener("blur", () => {
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
        const input = prompt(
            `Transition from "${fromState.name}" to "${toState.name}"\n\nEnter input condition (e.g., 0, 1, 00, 01, etc.):`,
        );
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
                `Duplicate: transition from "${fromState.name}" to "${toState.name}" with input "${trimmed}" already exists.`,
            );
        } else {
            this.statusText.textContent = `Added transition ${fromState.name} →(${trimmed})→ ${toState.name}`;
        }
        this.render();
    }

    // --- Rendering ---
    render() {
        const { ctx, canvas } = this;
        const colors = getColors();

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = colors.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grid lines
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

        // Draw transitions
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
            ctx.globalAlpha = 0.25;
            ctx.font = "14px Inter, Raleway, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
                "Use the toolbar above to add states and transitions",
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

    const container = document.getElementById("fsm-editor-container");
    container.innerHTML = "";
    activeEditor = new FSMEditor("fsm-editor-container");

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
