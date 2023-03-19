const { AudioCommand } = require("./convert");
const Discord = require("discord.js");

// 20 minutes
const timeUntilReset = 20 * 60 * 1000;

class Wheel {
    /**
     * @param {AudioCommand} cmd 
     */
    constructor(cmd) {
        this.cmd = cmd;
        this.lastReset = 0;
        this.wheel = cmd.files.slice();
    }

    reset() {
        shuffle(this.wheel);
    }

    /**
     * Returns the next sound of this wheel with an optional query.
     * @param {String} query
     */
    nextSound(query = "") {
        const now = Date.now();
        const diff = now - this.lastReset;

        if (diff > timeUntilReset) {
            this.reset();
        }

        this.lastReset = now;

        const q = query.toLowerCase();
        let result = "";
        let resultName = "";
        let searchesLeft = this.wheel.length;

        do {
            result = this.wheel.shift();
            this.wheel.push(result);

            resultName = Discord.basename(result);
            searchesLeft--;
        } while (searchesLeft >= 0 && !resultName.startsWith(q));

        return result;
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

    getSound(cmd, query) {
        const wheel = this.getWheel(cmd);
        return wheel.nextSound(query);
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