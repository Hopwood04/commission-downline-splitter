import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabaseClient'
import { CheckCircle2, DollarSign, LogOut, Plus, Search, Trash2, Users } from 'lucide-react'
import './styles.css'
import type { Session } from '@supabase/supabase-js'

type Agent = {
  id: string
  name: string
  email: string | null
  phone: string | null
  default_agent_split_percent: number
  default_upline_split_percent: number
  upline_agent_id: string | null
  active: boolean
  notes: string | null
}

type Sale = {
  id: string
  writing_agent_id: string
  upline_agent_id: string | null
  client_name: string
  product_type: string | null
  carrier: string | null
  policy_number: string | null
  sale_date: string
  premium: number
  commission_rate_percent: number
  agent_split_percent: number
  upline_split_percent: number
  gross_commission: number
  writing_agent_commission: number
  upline_commission: number
  house_commission: number
  status: 'pending' | 'unpaid' | 'paid' | 'chargeback' | 'void'
  notes: string | null
  writing_agent_name?: string
  upline_agent_name?: string | null
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const today = new Date().toISOString().slice(0, 10)

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (loading) return <div className="center">Loading...</div>
  if (!session) return <Auth />
  return <Dashboard session={session} />
}

function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
  }

  async function signUp() {
    setMessage('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setMessage(error.message)
    else setMessage('Account created. Check email confirmation settings in Supabase if login does not start automatically.')
  }

  return <div className="auth-page">
    <form className="auth-card" onSubmit={signIn}>
      <div className="badge"><DollarSign size={16}/> Commission Downline Splitter</div>
      <h1>Login to your commission tracker</h1>
      <p>Track agent sales, split commissions, pay downlines, and monitor unpaid balances.</p>
      <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label>
      <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={6}/></label>
      {message && <div className="notice">{message}</div>}
      <button className="primary" type="submit">Sign In</button>
      <button type="button" onClick={signUp} className="secondary">Create Account</button>
    </form>
  </div>
}

function Dashboard({ session }: { session: Session }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const userId = session.user.id

  const [agentForm, setAgentForm] = useState({ name: '', email: '', phone: '', default_agent_split_percent: 70, default_upline_split_percent: 0, upline_agent_id: '', notes: '' })
  const [saleForm, setSaleForm] = useState({ client_name: '', writing_agent_id: '', upline_agent_id: '', product_type: '', carrier: '', policy_number: '', sale_date: today, premium: '', commission_rate_percent: '', agent_split_percent: 70, upline_split_percent: 0, notes: '' })

  async function loadData() {
    setError('')
    const [{ data: a, error: ae }, { data: s, error: se }] = await Promise.all([
      supabase.from('agents').select('*').order('name'),
      supabase.from('sales_with_agents').select('*').order('sale_date', { ascending: false })
    ])
    if (ae || se) setError(ae?.message || se?.message || 'Could not load data')
    setAgents((a || []) as Agent[])
    setSales((s || []) as Sale[])
  }

  useEffect(() => { loadData() }, [])

  const agentMap = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents])
  const filteredSales = sales.filter(s => {
    const hay = [s.client_name, s.carrier, s.product_type, s.policy_number, s.writing_agent_name, s.upline_agent_name].join(' ').toLowerCase()
    return (status === 'all' || s.status === status) && hay.includes(search.toLowerCase())
  })

  const totals = useMemo(() => sales.reduce((acc, s) => {
    if (s.status !== 'void') {
      acc.premium += Number(s.premium || 0)
      acc.gross += Number(s.gross_commission || 0)
      acc.agent += Number(s.writing_agent_commission || 0)
      acc.upline += Number(s.upline_commission || 0)
      acc.house += Number(s.house_commission || 0)
      if (s.status === 'paid') acc.paid += Number(s.writing_agent_commission || 0) + Number(s.upline_commission || 0)
      if (s.status === 'unpaid' || s.status === 'pending') acc.unpaid += Number(s.writing_agent_commission || 0) + Number(s.upline_commission || 0)
    }
    return acc
  }, { premium: 0, gross: 0, agent: 0, upline: 0, house: 0, paid: 0, unpaid: 0 }), [sales])

  async function addAgent(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const payload = { ...agentForm, owner_user_id: userId, upline_agent_id: agentForm.upline_agent_id || null, email: agentForm.email || null, phone: agentForm.phone || null, notes: agentForm.notes || null }
    const { error } = await supabase.from('agents').insert(payload)
    setBusy(false)
    if (error) return setError(error.message)
    setAgentForm({ name: '', email: '', phone: '', default_agent_split_percent: 70, default_upline_split_percent: 0, upline_agent_id: '', notes: '' })
    loadData()
  }

  function selectWritingAgent(id: string) {
    const a = agentMap[id]
    setSaleForm(f => ({ ...f, writing_agent_id: id, upline_agent_id: a?.upline_agent_id || '', agent_split_percent: Number(a?.default_agent_split_percent ?? 70), upline_split_percent: Number(a?.default_upline_split_percent ?? 0) }))
  }

  async function addSale(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const payload = {
      owner_user_id: userId,
      writing_agent_id: saleForm.writing_agent_id,
      upline_agent_id: saleForm.upline_agent_id || null,
      client_name: saleForm.client_name,
      product_type: saleForm.product_type || null,
      carrier: saleForm.carrier || null,
      policy_number: saleForm.policy_number || null,
      sale_date: saleForm.sale_date,
      premium: Number(saleForm.premium || 0),
      commission_rate_percent: Number(saleForm.commission_rate_percent || 0),
      agent_split_percent: Number(saleForm.agent_split_percent || 0),
      upline_split_percent: Number(saleForm.upline_split_percent || 0),
      status: 'unpaid',
      notes: saleForm.notes || null
    }
    const { error } = await supabase.from('sales').insert(payload)
    setBusy(false)
    if (error) return setError(error.message)
    setSaleForm({ client_name: '', writing_agent_id: saleForm.writing_agent_id, upline_agent_id: saleForm.upline_agent_id, product_type: '', carrier: '', policy_number: '', sale_date: today, premium: '', commission_rate_percent: '', agent_split_percent: saleForm.agent_split_percent, upline_split_percent: saleForm.upline_split_percent, notes: '' })
    loadData()
  }

  async function markStatus(id: string, nextStatus: Sale['status']) {
    const { error } = await supabase.from('sales').update({ status: nextStatus, paid_at: nextStatus === 'paid' ? new Date().toISOString() : null }).eq('id', id)
    if (error) setError(error.message)
    loadData()
  }

  async function deleteSale(id: string) {
    const { error } = await supabase.from('sales').delete().eq('id', id)
    if (error) setError(error.message)
    loadData()
  }

  return <div className="app">
    <header className="hero">
      <div><div className="badge"><DollarSign size={16}/> Commission Downline Splitter</div><h1>Sales, downlines, overrides, and payouts.</h1><p>Enter a sale once. The app calculates writing agent commission, upline override, house commission, and unpaid balances.</p></div>
      <button className="secondary" onClick={() => supabase.auth.signOut()}><LogOut size={16}/> Sign Out</button>
    </header>

    {error && <div className="error">{error}</div>}

    <section className="stats">
      <Stat label="Total Premium" value={money.format(totals.premium)} />
      <Stat label="Gross Commission" value={money.format(totals.gross)} />
      <Stat label="Writing Agent Pay" value={money.format(totals.agent)} />
      <Stat label="Upline Override" value={money.format(totals.upline)} />
      <Stat label="House Commission" value={money.format(totals.house)} />
      <Stat label="Unpaid Balance" value={money.format(totals.unpaid)} highlight />
    </section>

    <main className="grid">
      <section className="card wide"><h2><Plus size={20}/> Enter Sale</h2><form onSubmit={addSale} className="form-grid">
        <label>Client Name<input required value={saleForm.client_name} onChange={e=>setSaleForm({...saleForm, client_name:e.target.value})}/></label>
        <label>Writing Agent<select required value={saleForm.writing_agent_id} onChange={e=>selectWritingAgent(e.target.value)}><option value="">Select agent</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Upline / Recruiter<select value={saleForm.upline_agent_id} onChange={e=>setSaleForm({...saleForm, upline_agent_id:e.target.value})}><option value="">None</option>{agents.filter(a=>a.id!==saleForm.writing_agent_id).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Product<input value={saleForm.product_type} onChange={e=>setSaleForm({...saleForm, product_type:e.target.value})} placeholder="Annuity, Life, Final Expense"/></label>
        <label>Carrier<input value={saleForm.carrier} onChange={e=>setSaleForm({...saleForm, carrier:e.target.value})}/></label>
        <label>Policy #<input value={saleForm.policy_number} onChange={e=>setSaleForm({...saleForm, policy_number:e.target.value})}/></label>
        <label>Sale Date<input type="date" value={saleForm.sale_date} onChange={e=>setSaleForm({...saleForm, sale_date:e.target.value})}/></label>
        <label>Premium<input required type="number" min="0" step="0.01" value={saleForm.premium} onChange={e=>setSaleForm({...saleForm, premium:e.target.value})}/></label>
        <label>Commission Rate %<input required type="number" min="0" step="0.0001" value={saleForm.commission_rate_percent} onChange={e=>setSaleForm({...saleForm, commission_rate_percent:e.target.value})}/></label>
        <label>Agent Split %<input type="number" min="0" max="100" step="0.01" value={saleForm.agent_split_percent} onChange={e=>setSaleForm({...saleForm, agent_split_percent:Number(e.target.value)})}/></label>
        <label>Upline Split %<input type="number" min="0" max="100" step="0.01" value={saleForm.upline_split_percent} onChange={e=>setSaleForm({...saleForm, upline_split_percent:Number(e.target.value)})}/></label>
        <label>Notes<input value={saleForm.notes} onChange={e=>setSaleForm({...saleForm, notes:e.target.value})}/></label>
        <button disabled={busy} className="primary">Add Sale</button>
      </form></section>

      <section className="card"><h2><Users size={20}/> Add Agent</h2><form onSubmit={addAgent} className="stack">
        <label>Name<input required value={agentForm.name} onChange={e=>setAgentForm({...agentForm, name:e.target.value})}/></label>
        <label>Email<input value={agentForm.email} onChange={e=>setAgentForm({...agentForm, email:e.target.value})}/></label>
        <label>Phone<input value={agentForm.phone} onChange={e=>setAgentForm({...agentForm, phone:e.target.value})}/></label>
        <label>Default Agent Split %<input type="number" min="0" max="100" step="0.01" value={agentForm.default_agent_split_percent} onChange={e=>setAgentForm({...agentForm, default_agent_split_percent:Number(e.target.value)})}/></label>
        <label>Default Upline Split %<input type="number" min="0" max="100" step="0.01" value={agentForm.default_upline_split_percent} onChange={e=>setAgentForm({...agentForm, default_upline_split_percent:Number(e.target.value)})}/></label>
        <label>Upline Agent<select value={agentForm.upline_agent_id} onChange={e=>setAgentForm({...agentForm, upline_agent_id:e.target.value})}><option value="">None</option>{agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <button disabled={busy} className="secondary">Add Agent</button>
      </form></section>
    </main>

    <section className="card"><div className="ledger-head"><h2>Commission Ledger</h2><div className="filters"><Search size={16}/><input placeholder="Search client, agent, carrier..." value={search} onChange={e=>setSearch(e.target.value)}/><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All</option><option value="pending">Pending</option><option value="unpaid">Unpaid</option><option value="paid">Paid</option><option value="chargeback">Chargeback</option><option value="void">Void</option></select></div></div>
      <div className="table"><div className="row head"><span>Client</span><span>Agent / Upline</span><span>Premium</span><span>Gross</span><span>Agent Pay</span><span>Upline</span><span>House</span><span>Status</span><span>Actions</span></div>
      {filteredSales.map(s => <div className="row" key={s.id}><span><b>{s.client_name}</b><small>{s.carrier || 'No carrier'} • {s.product_type || 'No product'}</small></span><span>{s.writing_agent_name}<small>{s.upline_agent_name ? `Upline: ${s.upline_agent_name}` : 'No upline'}</small></span><span>{money.format(Number(s.premium))}</span><span>{money.format(Number(s.gross_commission))}</span><span>{money.format(Number(s.writing_agent_commission))}</span><span>{money.format(Number(s.upline_commission))}</span><span>{money.format(Number(s.house_commission))}</span><span className={`pill ${s.status}`}>{s.status}</span><span className="actions">{s.status === 'paid' ? <button onClick={()=>markStatus(s.id,'unpaid')}>Undo</button> : <button onClick={()=>markStatus(s.id,'paid')}><CheckCircle2 size={14}/> Paid</button>}<button onClick={()=>deleteSale(s.id)}><Trash2 size={14}/></button></span></div>)}
      </div></section>
  </div>
}

function Stat({ label, value, highlight=false }: { label: string, value: string, highlight?: boolean }) { return <div className={`stat ${highlight ? 'highlight' : ''}`}><small>{label}</small><strong>{value}</strong></div> }

createRoot(document.getElementById('root')!).render(<App />)
