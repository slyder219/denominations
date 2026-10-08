import { useMemo, useState } from 'react'

const DEFAULT_DENOMS = [100, 50, 20, 10, 5, 2, 1, 0.25, 0.1, 0.05, 0.01]
const DEFAULT_ON = [100, 50, 20, 10, 5, 1]

// "$1,234.50" -> 1234.5 ; returns null if not a number
function parseAmount(s) {
  if (s == null) return null
  let t = String(s).trim()
  if (!t) return null
  const neg = /^\(.*\)$/.test(t)
  t = t.replace(/[^0-9.\-]/g, '')
  if (!t || t === '-' || t === '.') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

function parsePaste(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '')
  if (!lines.length) return { rows: [], header: null }
  const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(',') && !/\d,\d{3}/.test(lines[0]) ? ',' : /\s{2,}/.test(lines[0]) ? /\s{2,}/ : '\t'
  const rows = lines.map((l) => l.split(delim).map((c) => c.trim()))
  // header if first row has no numeric cells but later rows do
  const hasNum = (r) => r.some((c) => parseAmount(c) !== null)
  const header = rows.length > 1 && !hasNum(rows[0]) && hasNum(rows[1]) ? rows[0] : null
  return { rows: header ? rows.slice(1) : rows, header }
}

function guessColumns(rows, ncols) {
  let nameCol = 0
  let amountCol = ncols - 1
  const numericShare = []
  for (let c = 0; c < ncols; c++) {
    const vals = rows.map((r) => r[c]).filter((v) => v)
    numericShare[c] = vals.length ? vals.filter((v) => parseAmount(v) !== null).length / vals.length : 0
  }
  const firstText = numericShare.findIndex((s) => s < 0.5)
  if (firstText >= 0) nameCol = firstText
  for (let c = ncols - 1; c >= 0; c--) {
    if (numericShare[c] >= 0.8 && c !== nameCol) { amountCol = c; break }
  }
  return { nameCol, amountCol }
}

// greedy breakdown in integer cents
function breakdown(amount, denoms) {
  let cents = Math.round(Math.abs(amount) * 100)
  const counts = {}
  for (const d of denoms) {
    const dc = Math.round(d * 100)
    counts[d] = Math.floor(cents / dc)
    cents -= counts[d] * dc
  }
  return { counts, remainder: cents / 100 }
}

const fmtDenom = (d) => (d >= 1 ? `$${d}` : `${Math.round(d * 100)}¢`)
const fmtMoney = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const SAMPLE = `Name\tPay
Alice Smith\t1,234.56
Bob Jones\t987.00
Carla Diaz\t$512.75`

export default function App() {
  const [text, setText] = useState('')
  const [denoms, setDenoms] = useState(DEFAULT_DENOMS)
  const [enabled, setEnabled] = useState(new Set(DEFAULT_ON))
  const [custom, setCustom] = useState('')
  const [colOverride, setColOverride] = useState({})
  const [copied, setCopied] = useState(false)

  const parsed = useMemo(() => parsePaste(text), [text])
  const ncols = Math.max(0, ...parsed.rows.map((r) => r.length))
  const guess = useMemo(() => guessColumns(parsed.rows, ncols), [parsed, ncols])
  const nameCol = colOverride.name ?? guess.nameCol
  const amountCol = colOverride.amount ?? guess.amountCol
  const colLabel = (i) => (parsed.header?.[i] ? `${parsed.header[i]}` : `Column ${i + 1}`)

  const active = denoms.filter((d) => enabled.has(d)).sort((a, b) => b - a)

  const people = parsed.rows
    .map((r) => ({ name: r[nameCol] ?? '', amount: parseAmount(r[amountCol]) }))
    .filter((p) => p.amount !== null)
    .map((p) => ({ ...p, ...breakdown(p.amount, active) }))

  const totals = { amount: 0, remainder: 0, counts: {} }
  for (const d of active) totals.counts[d] = 0
  for (const p of people) {
    totals.amount += p.amount
    totals.remainder += p.remainder
    for (const d of active) totals.counts[d] += p.counts[d]
  }
  const anyRemainder = people.some((p) => p.remainder > 0)

  const toggle = (d) => {
    const next = new Set(enabled)
    next.has(d) ? next.delete(d) : next.add(d)
    setEnabled(next)
  }

  const addCustom = () => {
    const n = parseAmount(custom)
    if (n && n > 0 && !denoms.includes(n)) {
      setDenoms([...denoms, n].sort((a, b) => b - a))
      setEnabled(new Set([...enabled, n]))
    }
    setCustom('')
  }

  const copyTable = async () => {
    const head = ['Name', 'Amount', ...active.map(fmtDenom), ...(anyRemainder ? ['Remainder'] : [])]
    const body = people.map((p) => [p.name, p.amount.toFixed(2), ...active.map((d) => p.counts[d]), ...(anyRemainder ? [p.remainder.toFixed(2)] : [])])
    const foot = ['TOTAL', totals.amount.toFixed(2), ...active.map((d) => totals.counts[d]), ...(anyRemainder ? [totals.remainder.toFixed(2)] : [])]
    await navigator.clipboard.writeText([head, ...body, foot].map((r) => r.join('\t')).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app">
      <h1>Denomination Breakdown</h1>

      <section>
        <div className="row-between">
          <h2>1. Paste data</h2>
          <button className="link" onClick={() => setText(SAMPLE)}>load sample</button>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setColOverride({}) }}
          placeholder="Paste from Excel / Sheets (names + amounts)…"
          rows={8}
        />
        {ncols > 0 && (
          <div className="cols">
            <label>Name column
              <select value={nameCol} onChange={(e) => setColOverride({ ...colOverride, name: +e.target.value })}>
                {Array.from({ length: ncols }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
              </select>
            </label>
            <label>Amount column
              <select value={amountCol} onChange={(e) => setColOverride({ ...colOverride, amount: +e.target.value })}>
                {Array.from({ length: ncols }, (_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
              </select>
            </label>
            <span className="muted">{people.length} rows parsed{parsed.header ? ' (header detected)' : ''}</span>
          </div>
        )}
      </section>

      <section>
        <h2>2. Denominations</h2>
        <div className="denoms">
          {denoms.map((d) => (
            <label key={d} className={`chip ${enabled.has(d) ? 'on' : ''}`}>
              <input type="checkbox" checked={enabled.has(d)} onChange={() => toggle(d)} />
              {fmtDenom(d)}
            </label>
          ))}
          <span className="add">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCustom()} placeholder="custom" />
            <button onClick={addCustom}>+</button>
          </span>
        </div>
        <div className="quick">
          <button className="link" onClick={() => setEnabled(new Set(denoms))}>all</button>
          <button className="link" onClick={() => setEnabled(new Set(denoms.filter((d) => d >= 1)))}>bills only</button>
          <button className="link" onClick={() => setEnabled(new Set())}>none</button>
        </div>
      </section>

      {people.length > 0 && (
        <section>
          <div className="row-between">
            <h2>3. Breakdown</h2>
            <button onClick={copyTable}>{copied ? 'Copied!' : 'Copy for Excel'}</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="left">Name</th>
                  <th>Amount</th>
                  {active.map((d) => <th key={d}>{fmtDenom(d)}</th>)}
                  {anyRemainder && <th className="warn">Remainder</th>}
                </tr>
              </thead>
              <tbody>
                {people.map((p, i) => (
                  <tr key={i}>
                    <td className="left">{p.name}</td>
                    <td>{fmtMoney(p.amount)}</td>
                    {active.map((d) => <td key={d} className={p.counts[d] ? '' : 'zero'}>{p.counts[d]}</td>)}
                    {anyRemainder && <td className={p.remainder ? 'warn' : 'zero'}>{fmtMoney(p.remainder)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="left">TOTAL</td>
                  <td>{fmtMoney(totals.amount)}</td>
                  {active.map((d) => <td key={d}>{totals.counts[d]}</td>)}
                  {anyRemainder && <td className="warn">{fmtMoney(totals.remainder)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
