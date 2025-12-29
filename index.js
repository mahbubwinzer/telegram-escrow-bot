import { Telegraf, session } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

async function startBot() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      throw new Error('Bot token missing');
    }

    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    bot.use(session());

    const escrowDeals = new Map();
    let dealCounter = 1000;

    bot.start((ctx) => {
      ctx.reply(
`🤝 Welcome to WinzerEscrowBot

/create - Create deal
/mydeals - My deals
/deal <id> - Deal info
/help - Help`
      );
    });

    bot.command('help', (ctx) => {
      ctx.reply('This bot helps buyers and sellers use escrow.');
    });

    bot.command('create', (ctx) => {
      ctx.session = { step: 'seller' };
      ctx.reply('Enter seller Telegram user ID:');
    });

    bot.on('text', (ctx) => {
      if (!ctx.session?.step) return;

      const text = ctx.message.text;

      if (ctx.session.step === 'seller') {
        if (isNaN(text)) return ctx.reply('Invalid user ID');
        ctx.session.sellerId = Number(text);
        ctx.session.step = 'amount';
        return ctx.reply('Enter amount:');
      }

      if (ctx.session.step === 'amount') {
        if (isNaN(text) || Number(text) <= 0) return ctx.reply('Invalid amount');
        ctx.session.amount = Number(text);
        ctx.session.step = 'currency';
        return ctx.reply('Enter currency (USD):');
      }

      if (ctx.session.step === 'currency') {
        ctx.session.currency = text.toUpperCase();
        ctx.session.step = 'desc';
        return ctx.reply('Enter description:');
      }

      if (ctx.session.step === 'desc') {
        const dealId = ++dealCounter;

        escrowDeals.set(dealId, {
          id: dealId,
          buyerId: ctx.from.id,
          sellerId: ctx.session.sellerId,
          amount: ctx.session.amount,
          currency: ctx.session.currency,
          description: text,
          status: 'pending',
          buyerApproved: false,
          sellerApproved: false
        });

        ctx.session = null;

        ctx.reply(`✅ Deal created (#${dealId})\nUse /deal ${dealId}`);
      }
    });

    bot.command('deal', (ctx) => {
      const id = Number(ctx.message.text.split(' ')[1]);
      const deal = escrowDeals.get(id);
      if (!deal) return ctx.reply('Deal not found');

      if (![deal.buyerId, deal.sellerId].includes(ctx.from.id)) {
        return ctx.reply('Not your deal');
      }

      ctx.reply(
`📋 Deal #${deal.id}
Amount: ${deal.amount} ${deal.currency}
Status: ${deal.status}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: `approve_${id}` },
              { text: '❌ Reject', callback_data: `reject_${id}` }
            ]]
          }
        }
      );
    });

    bot.on('callback_query', (ctx) => {
      const [action, id] = ctx.callbackQuery.data.split('_');
      const deal = escrowDeals.get(Number(id));
      if (!deal) return ctx.answerCbQuery('Deal not found');

      if (action === 'approve') {
        if (ctx.from.id === deal.buyerId) deal.buyerApproved = true;
        if (ctx.from.id === deal.sellerId) deal.sellerApproved = true;

        if (deal.buyerApproved && deal.sellerApproved) {
          deal.status = 'completed';
          ctx.reply(`✅ Deal #${id} completed`);
        } else {
          ctx.reply('Waiting for other party');
        }
      }

      if (action === 'reject') {
        deal.status = 'rejected';
        ctx.reply(`❌ Deal #${id} rejected`);
      }

      ctx.answerCbQuery();
    });

    bot.launch();
    console.log('Bot running...');
  } catch (e) {
    console.error(e);
  }
}

startBot();
