const { AudioCommand } = require("./convert");

// 20 minutes
const timeUntilReset = 20 * 60 * 1000;

class Wheel {
    /**
     * @param {AudioCommand} cmd 
     */
    constructor(cmd) {
        this.index = -1;
        this.cmd = cmd;
        this.lastReset = 0;
        this.wheel = cmd.files.slice();
    }

    reset() {
        shuffle(this.wheel);
        this.index = 0;
    }

    nextSound() {
        const now = Date.now();
        const diff = now - this.lastReset;

        if (diff > timeUntilReset) {
            this.reset();
        }

        this.lastReset = now;
        this.index = (this.index + 1) % this.wheel.length;
        return this.wheel[this.index];
    }
}

class Connection {
    constructor() {
        /** @type {Object.<string, Wheel>} */
        this.wheels = {};
    }

    getWheel(cmd) {
        if (!(cmd.folder in this.wheels)) {
            this.wheels[cmd.folder] = new Wheel(cmd);
        }
        return this.wheels[cmd.folder];
    }

    getSound(cmd) {
        let wheel = this.getWheel(cmd);
        return wheel.nextSound();
    }
}

/**
 * Shuffles array in place.
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
    var j, x, i;
    for (i = a.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        x = a[i];
        a[i] = a[j];
        a[j] = x;
    }
    return a;
}

exports.Connection = Connection;