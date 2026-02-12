/**
 * Context menu for FSM editor states
 */
export default class ContextMenu {
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
