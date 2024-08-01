import BasePlugin from './base-plugin.js';

export default class AutoTKWarn extends BasePlugin {
  static get description() {
    return 'The <code>AutoTkWarn</code> plugin will automatically warn players with a message when they teamkill. If they do not apologize in all chat within 60 seconds, they will be kicked.';
  }

  static get defaultEnabled() {
    return true;
  }

  static get optionsSpecification() {
    return {
      attackerMessage: {
        required: false,
        description: 'The message to warn attacking players with.',
        default: 'Please apologise for ALL TKs in ALL chat!'
      },
      reminderMessage: {
        required: false,
        description: 'The reminder message to warn attacking players with after 30 seconds.',
        default: 'You have 30 seconds left to apologize for the teamkill!'
      },
      victimMessage: {
        required: false,
        description: 'The message that will be sent to the victim.',
        default: null // 'You were killed by your own team.'
      },
      apologyKeywords: {
        required: false,
        description: 'The keywords that will be accepted as an apology.',
        default: ['sorry', 'sry', 'apologies', 'my bad', 'forgive me']
      },
      thankYouMessage: {
        required: false,
        description: 'The message to thank the player after they apologize.',
        default: 'Thank you for apologizing.'
      }
    };
  }

  constructor(server, options, connectors) {
    super(server, options, connectors);

    this.onTeamkill = this.onTeamkill.bind(this);
    this.onChatMessage = this.onChatMessage.bind(this);

    // To keep track of pending apologies
    this.pendingApologies = new Map();
  }

  async mount() {
    this.server.on('TEAMKILL', this.onTeamkill);
    this.server.on('CHAT_MESSAGE', this.onChatMessage);
    console.log('AutoTKWarn plugin mounted.');
  }

  async unmount() {
    this.server.removeEventListener('TEAMKILL', this.onTeamkill);
    this.server.removeEventListener('CHAT_MESSAGE', this.onChatMessage);
    console.log('AutoTKWarn plugin unmounted.');
  }

  async onTeamkill(info) {
    console.log('Teamkill event detected:', info);
    if (info.attacker && info.attacker.steamID && this.options.attackerMessage) {
      await this.server.rcon.warn(info.attacker.steamID, this.options.attackerMessage);

      // Set a timeout to remind the player if they don't apologize within 30 seconds
      const reminderTimeoutId = setTimeout(async () => {
        if (this.pendingApologies.has(info.attacker.steamID)) {
          await this.server.rcon.warn(info.attacker.steamID, this.options.reminderMessage);
          console.log(`Reminder sent to player ${info.attacker.steamID} to apologize.`);
        }
      }, 30000);

      // Set a timeout to kick the player if they don't apologize within 60 seconds
      const kickTimeoutId = setTimeout(async () => {
        if (this.pendingApologies.has(info.attacker.steamID)) {
          this.pendingApologies.delete(info.attacker.steamID);
          await this.server.rcon.kick(info.attacker.steamID, 'You were kicked for not saying sorry in ALL chat after teamkilling');
          console.log(`Player ${info.attacker.steamID} was kicked for not apologizing.`);
        }
      }, 60000);

      // Store the timeout IDs so we can clear them if they apologize
      this.pendingApologies.set(info.attacker.steamID, { reminderTimeoutId, kickTimeoutId });
      console.log(`Pending apology for player ${info.attacker.steamID} set.`);
    }
    if (info.victim && info.victim.steamID && this.options.victimMessage) {
      await this.server.rcon.warn(info.victim.steamID, this.options.victimMessage);
    }
  }

  async onChatMessage(info) {
    console.log('Chat message received:', info);
    const apologyKeywords = this.options.apologyKeywords || ['sorry'];
    if (info.message && apologyKeywords.some(keyword => info.message.toLowerCase().includes(keyword))) {
      // If the message contains any apology keyword, clear the kick timeout
      if (this.pendingApologies.has(info.steamID)) {
        const timeouts = this.pendingApologies.get(info.steamID);
        clearTimeout(timeouts.reminderTimeoutId);
        clearTimeout(timeouts.kickTimeoutId);
        this.pendingApologies.delete(info.steamID);
        await this.server.rcon.warn(info.steamID, this.options.thankYouMessage);
        console.log(`Player ${info.steamID} apologized and was not kicked. Thank you message sent.`);
      }
    }
  }
}