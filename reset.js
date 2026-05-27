const { REST, Routes } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID     = process.env.CLIENT_ID;
const GUILD_ID      = process.env.GUILD_ID;

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

async function reset() {
  console.log('Clearing global commands...');
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
  console.log('✅ Global commands cleared');

  if (GUILD_ID) {
    console.log('Clearing guild commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] });
    console.log('✅ Guild commands cleared');

    console.log('Re-registering guild commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: [
        {
          name: 'start',
          description: 'Log start of your tech issue',
          options: [{
            name: 'issue',
            description: 'Describe the issue e.g. internet dropped',
            type: 3,
            required: true
          }]
        },
        {
          name: 'end',
          description: 'Log end of your tech issue',
          options: []
        }
      ]
    });
    console.log('✅ Commands re-registered for guild');
  }
}

reset().catch(console.error);
