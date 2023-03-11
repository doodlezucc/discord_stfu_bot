const Discord = require("discord.js");
const Voice = require("@discordjs/voice");

const fs = require("fs");
const converter = require("./convert");
const { Connection } = require("./wheel");

const rawDir = "audio/";
const audioDir = "audio_normalized/";
const opusDir = "audio_ready/";

const client = new Discord.Client({
    intents: [
        "Guilds",
        "GuildMessages",
        "GuildMessageReactions",
        "GuildVoiceStates",
        "MessageContent"
    ],
});

const {
    token,
    amp,
    normalize,
    cowardImg,
    statsHeader
} = require("../config.json");

const statsPath = "./stats.json";
let soundStats = {}

function loadStats() {
    if (fs.existsSync(statsPath)) {
        soundStats = JSON.parse(fs.readFileSync(statsPath));
    }
}

function saveStats() {
    fs.writeFile(statsPath, JSON.stringify(soundStats), () => { });
}


/** @type {converter.AudioCommand[]} */
let commands;

function initDirectories() {
    if (!fs.existsSync(rawDir)) {
        fs.mkdirSync(rawDir);
    }

    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir);
    }

    if (!fs.existsSync(opusDir)) {
        fs.mkdirSync(opusDir);
    }
}

async function clearConversions() {
    for (const dirent of fs.readdirSync(opusDir, { withFileTypes: true })) {
        if (dirent.isFile() && dirent.name.endsWith(".opus")) {
            await new Promise((resolve) => {
                fs.unlink(opusDir + dirent.name, () => {
                    resolve();
                });
            })
        }
    }
    console.log("Cleared conversions");
}

async function init() {
    initDirectories();
    //await clearConversions();

    const doNormalize = normalize ?? true;

    if (doNormalize) {
        await converter.normalize(rawDir, audioDir);
        return;
    }

    commands = await converter.convert(audioDir, opusDir, amp, 8, false);

    loadStats();

    client.login(token);

    client.once("ready", () => {
        console.log("Ready!");

        client.user.setPresence({
            status: "invisible"
        });
    });
    client.on("reconnecting", () => {
        console.log("Reconnecting!");
    });
    client.on("disconnect", () => {
        console.log("Disconnect!");
    });

    client.on("messageCreate", async message => {
        if (message.author.bot) return;

        handleMessage(message);
    });
}

init();

/** @param {Discord.Message} message */
function handleMessage(message) {
    if (message.content === "soundstats") {
        return respondStats(message);
    }

    for (const cmd of commands) {
        if (message.content === cmd.folder) {
            return respondPlay(message, cmd);
        }
    }
}

/** @param {Discord.Message} message */
async function respondStats(message) {
    const channel = message.channel;

    if (!(channel.guildId in soundStats)) {
        soundStats[channel.guildId] = {};
    }

    const channelStats = soundStats[channel.guildId];

    let maxPlays = 0;
    for (const cmd of commands) {
        if (!(cmd.folder in channelStats)) {
            channelStats[cmd.folder] = 0;
        }

        const plays = channelStats[cmd.folder];
        if (plays > maxPlays) {
            maxPlays = plays;
        }
    }

    const nameLength = commands.reduce((v, cmd) => Math.max(v, cmd.folder.length), 0);
    const maxPlaysLen = (maxPlays + "").length;

    let msg = statsHeader;
    for (const cmd of commands) {
        const plays = channelStats[cmd.folder];

        const clips = (cmd.files.length + "");
        const namePad = cmd.folder.padStart(nameLength + 1 - clips.length);
        const playsPad = ("" + plays).padStart(maxPlaysLen);
        msg += "\n`" + namePad + "(" + cmd.files.length + "): " + playsPad + "`";
    }

    channel.send(msg);
}

/** @type {Object.<string, Connection>} */
const connections = {};

function getConnection(guildId) {
    if (!(guildId in connections)) {
        connections[guildId] = new Connection();
    }
    return connections[guildId];
}

/** 
 * @param {Discord.Message} message
 * @param {converter.AudioCommand} cmd
*/
async function respondPlay(message, cmd) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        const reply = await message.channel.send({
            files: [cowardImg]
        });
        return setTimeout(() => {
            reply.delete();
            message.react("🖕");
        }, 3000);
    }

    const guildId = voiceChannel.guildId;

    if (!(guildId in soundStats)) {
        soundStats[guildId] = {};
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has("Connect") || !permissions.has("Speak")) {
        return message.channel.send("need permission to join voice channels somehow.");
    }

    const audio = getConnection(guildId).getSound(cmd);
    // console.log("Playing some sweet " + audio);

    const resource = Voice.createAudioResource(audio, {
        inlineVolume: true,
    });
    resource.volume.setVolume(0.12);

    const connection = Voice.joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfMute: false,
        selfDeaf: false,
    });

    const player = Voice.createAudioPlayer();
    player.addListener("stateChange", (_oldState, newState) => {
        if (newState.status == Voice.AudioPlayerStatus.Idle) {
            connection.disconnect();

            if (!(cmd.folder in soundStats[guildId])) {
                soundStats[guildId][cmd.folder] = 0;
            }
            soundStats[guildId][cmd.folder]++;

            saveStats();
        }
    }).addListener("error", (err) => {
        connection.disconnect();
        console.error(err);
    });

    connection.subscribe(player);
    player.play(resource);
}
