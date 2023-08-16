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
        this.wheel = [...cmd.files];
    }

    reset() {
        shuffle(this.wheel);
    }

    resetIfNecessary() {
        const now = Date.now();
        const diff = now - this.lastReset;

        if (diff > timeUntilReset) {
            this.reset();
        }

        this.lastReset = now;
    }

    /**
     * Returns all files in this wheel mapped to their query score.
     * @param {string[]} queryParts
     */
    computeScores(queryParts) {
        /** @type {Map<string, number>} */
        const scores = new Map();

        for (const file of this.wheel) {
            scores.set(file, computeScore(Discord.basename(file), queryParts));
        }

        return scores;
    }

    /**
     * Returns the next sound of this wheel with an optional query.
     * @param {string} query
     */
    nextSound(query = "") {
        this.resetIfNecessary();

        if (!query.length) {
            const result = this.wheel.shift();
            this.wheel.push(result);
            return result;
        }

        const queryParts = query.toLowerCase().split(/\W+/gm);
        const fileScores = this.computeScores(queryParts);
        const bestScoring = getBestScoring(fileScores);

        for (let i = 0; i < this.wheel.length; i++) {
            const result = this.wheel.shift();
            this.wheel.push(result);

            if (bestScoring.includes(result)) {
                return result;
            }
        }
    }
}

/**
 * Returns the best scoring items of `map`.
 * @param {Map<string, number>} map
 */
function getBestScoring(map) {
    let maxScore = 0;
    for (const score of map.values()) {
        if (score > maxScore) {
            maxScore = score;
        }
    }

    const result = [];
    for (const entry of map.entries()) {
        const score = entry[1];

        if (score == maxScore) {
            const item = entry[0];
            result.push(item);
        }
    }

    return result;
}

/**
 * Returns true if any part of `query` is included in the file name.
 * 
 * @param {string} fileName
 * @param {string[]} queryParts Query, split at whitespaces, all lowercase.
 * @returns {number}
 */
function computeScore(fileName, queryParts) {
    const fileNameLower = fileName.toLowerCase();
    let score = 0;

    for (const queryPart of queryParts) {
        if (fileNameLower.includes(queryPart)) {
            score++;
        }
    }

    return score;
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