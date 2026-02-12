/**
 * Undo history stack for FSM editor
 */
export default class UndoHistory {
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
