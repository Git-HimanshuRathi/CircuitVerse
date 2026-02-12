/* eslint-disable import/no-cycle */

let nextStateId = 0;

/**
 * FSM State
 */
export default class FSMState {
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

export function resetStateIdCounter() {
    nextStateId = 0;
}

export function setStateIdCounter(val) {
    nextStateId = val;
}

export function getStateIdCounter() {
    return nextStateId;
}
