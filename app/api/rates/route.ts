// Официальный курс Нацбанка РК → JSON для wealth.html
// Возвращает: { usdKzt, rubKzt, usdRub, date, source }
// Fallback: exchangerate-api.com если НБК недоступен

export const revalidate = 3600 // Vercel кэш 1 час

function parseNbkXml(xml: string): { usdKzt: number; rubKzt: number } | null {
  try {
    // Ищем блоки <item>...</item> или <currency>...</currency>
    const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || xml.match(/<currency>[\s\S]*?<\/currency>/g) || []
    let usdKzt = 0, rubKzt = 0

    for (const block of blocks) {
      const title = (block.match(/<title>(.*?)<\/title>/) || [])[1]?.trim()
      const valueStr = (block.match(/<value>([\d.,]+)<\/value>/) || [])[1]?.replace(',', '.')
      const quantStr = (block.match(/<quant>(\d+)<\/quant>/) || [])[1]
      if (!title || !valueStr) continue
      const value = parseFloat(valueStr)
      const quant = parseInt(quantStr || '1') || 1
      const ratePerUnit = value / quant

      if (title === 'USD') usdKzt = ratePerUnit
      if (title === 'RUB') rubKzt = ratePerUnit
    }

    if (usdKzt > 0 && rubKzt > 0) return { usdKzt, rubKzt }
    return null
  } catch {
    return null
  }
}

export async function GET() {
  const today = new Date()
  // НБК использует формат DD.MM.YYYY
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  const dateStr = `${dd}.${mm}.${yyyy}`

  // 1. Пробуем Нацбанк РК
  try {
    const nbkRes = await fetch(
      `https://nationalbank.kz/rss/get_rates.cfm?fdate=${dateStr}`,
      { headers: { 'Accept': 'application/xml, text/xml, */*' }, signal: AbortSignal.timeout(5000) }
    )
    if (nbkRes.ok) {
      const xml = await nbkRes.text()
      const parsed = parseNbkXml(xml)
      if (parsed) {
        const { usdKzt, rubKzt } = parsed
        const usdRub = Math.round(usdKzt / rubKzt)
        return Response.json({
          usdKzt: Math.round(usdKzt),
          rubKzt: parseFloat(rubKzt.toFixed(4)),
          usdRub,
          date: dateStr,
          source: 'nbk'
        })
      }
    }
  } catch { /* fallback */ }

  // 2. Fallback: exchangerate-api.com
  try {
    const erRes = await fetch(
      'https://api.exchangerate-api.com/v4/latest/USD',
      { signal: AbortSignal.timeout(5000) }
    )
    if (erRes.ok) {
      const data = await erRes.json()
      const usdKzt = Math.round(data.rates?.KZT || 0)
      const usdRub = Math.round(data.rates?.RUB || 0)
      const rubKzt = usdRub > 0 ? parseFloat((usdKzt / usdRub).toFixed(4)) : 0
      if (usdKzt && usdRub) {
        return Response.json({ usdKzt, rubKzt, usdRub, date: dateStr, source: 'exchangerate-api' })
      }
    }
  } catch { /* both failed */ }

  return Response.json({ error: 'Курс недоступен' }, { status: 503 })
}
