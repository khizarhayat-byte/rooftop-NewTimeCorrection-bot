const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');

const WORKER_URL = 'https://restless-star-87b5.khizar-hayat.workers.dev/';
const BOT_TOKEN  = 'YOUR_BOT_TOKEN_HERE';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase().trim();

  if (content.startsWith('!start') || content === '!end') {
    try {
      await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'discordEvent',
          channelId: message.channel.id,
          message: {
            id: message.id,
            content: message.content,
            author: {
              id: message.author.id,
              username: message.author.username,
              global_name: message.author.globalName,
              bot: message.author.bot
            },
            member: {
              nick: message.member?.nickname || null
            }
          }
        })
      });
      console.log(`📨 Forwarded: ${message.content} from ${message.author.username}`);
    } catch (e) {
      console.log('❌ Error forwarding message:', e.message);
    }
  }
});

client.login(BOT_TOKEN);
