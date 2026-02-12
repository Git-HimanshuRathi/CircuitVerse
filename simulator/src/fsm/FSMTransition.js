/* eslint-disable import/no-cycle */

let nextTransitionId = 0;

/**
 * FSM Transition
 */
export default class FSMTransition {
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
        const loopRadius = r * 0.55;
        const cx = state.x;
        const cy = state.y - r - loopRadius + 2;

        // Draw full circle
        ctx.beginPath();
        ctx.arc(cx, cy, loopRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected
            ? colors.selected
            : isHovered
              ? colors.primary
              : colors.stroke;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Arrowhead at the bottom-right where loop meets state
        const arrowAngle = 0.25 * Math.PI;
        const ax = cx + loopRadius * Math.cos(arrowAngle);
        const ay = cy + loopRadius * Math.sin(arrowAngle);
        this._drawArrowHead(
            ctx,
            ax,
            ay,
            arrowAngle + Math.PI / 2,
            ctx.strokeStyle,
        );

        // Label above the loop
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
            const loopRadius = r * 0.55;
            const cx = fromState.x;
            const cy = fromState.y - r - loopRadius + 2;
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
        const ddx = px - closestX;
        const ddy = py - closestY;
        return ddx * ddx + ddy * ddy < 100; // 10px threshold
    }
}

export function resetTransitionIdCounter() {
    nextTransitionId = 0;
}

export function setTransitionIdCounter(val) {
    nextTransitionId = val;
}

export function getTransitionIdCounter() {
    return nextTransitionId;
}
