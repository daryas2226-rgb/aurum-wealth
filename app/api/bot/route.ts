const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://aurum-wealth.vercel.app'
const TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const CHAT_ID = process.env.TELEGRAM_CHAT_ID!

async function send(text: string, keyboard?: object) {
  const body: Record<string, unknown> = {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'HTML',
  }
  if (keyboard) body.reply_markup = keyboard
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function sendWithWebApp(text: string, buttonLabel = '💰 Открыть Aurum') {
  await send(text, {
    inline_keyboard: [[
      { text: buttonLabel, web_app: { url: `${APP_URL}/wealth.html` } },
    ]],
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = body?.message
    if (!message?.text) return Response.json({ ok: true })

    // Only respond to the owner
    const fromId = String(message.from?.id ?? '')
    const chatId = String(message.chat?.id ?? '')
    const allowed = CHAT_ID.trim()
    if (fromId !== allowed && chatId !== allowed) return Response.json({ ok: true })

    const text = message.text.trim().toLowerCase()

    if (text === '/start' || text === '/help') {
      await sendWithWebApp(
        `<b>Aurum</b> — личный финансовый трекер 💰\n\n` +
        `Нажми кнопку чтобы открыть приложение 👇`,
        '💰 Открыть Aurum'
      )
      return Response.json({ ok: true })
    }

    if (text === '/wealth' || text === '/portfolio' || text === '/p') {
      await sendWithWebApp('Открываю твой портфель 📊')
      return Response.json({ ok: true })
    }

    await sendWithWebApp(
      `Не понимаю команду.\n\n/start — открыть приложение`,
      '💰 Открыть Aurum'
    )
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: true })
  }
}

// Register webhook via GET (call once to set up)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const webhookUrl = `${APP_URL}/api/bot`
  const res = await fetch(
    `https://api.telegram.org/bot${TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  )
  const data = await res.json()
  return Response.json(data)
}
