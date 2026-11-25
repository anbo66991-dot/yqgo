import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import ChatCenter from './ChatCenter'

type TravelRequest = {
  id: string
  member_id: string
  title: string
  description: string
  destination: string
  start_date: string
  end_date: string
  budget_min: number | null
  budget_max: number | null
  status: string
  created_at: string
  selected_proposal_id?: string | null
}
type Proposal = {
  id: string
  request_id: string
  member_id: string
  introduction: string
  plan: string
  price: number
  note: string | null
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn'
  created_at: string
}
type Companion = {
  id: string
  display_name: string
  city: string
  introduction: string
  interests: string[]
  skills: string[]
  service_areas: string[]
  availability: { description?: string } | null
  media: MediaItem[]
}
type MediaItem = { path: string; url: string; name: string; type: string }
type Tab = 'companions' | 'proposals' | 'requests' | 'media' | 'chat'

const money = (value: number | null) => value === null ? '可討論' : `NT$ ${value.toLocaleString('zh-TW')}`
const dateText = (value: string) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('zh-TW') : '未指定'
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失敗，請稍後再試。'

export default function Marketplace({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('companions')
  const [companions, setCompanions] = useState<Companion[]>([])
  const [myRequests, setMyRequests] = useState<TravelRequest[]>([])
  const [myProposals, setMyProposals] = useState<Proposal[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [keyword, setKeyword] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [selectedCompanion, setSelectedCompanion] = useState<Companion | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [proposalForm, setProposalForm] = useState({ introduction: '', plan: '', price: '', note: '' })
  const [proposalBusy, setProposalBusy] = useState(false)
  const [editingRequest, setEditingRequest] = useState<TravelRequest | null>(null)
  const [editForm, setEditForm] = useState({ title: '', description: '', destination: '', start_date: '', end_date: '', budget_min: '', budget_max: '' })
  const [isCompanion, setIsCompanion] = useState(false)
  const [isPublic, setIsPublic] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [uploadBusy, setUploadBusy] = useState(false)

  const loadCompanions = useCallback(async () => {
    const { data: profiles, error } = await supabase.from('member_profiles')
      .select('id,introduction,interests,skills,service_areas,availability,media')
      .eq('is_public', true).eq('is_companion', true)
    if (error) throw error
    const rows = profiles ?? []
    if (!rows.length) { setCompanions([]); return }
    const ids = rows.map((row: any) => row.id)
    const { data: members, error: memberError } = await supabase.from('members')
      .select('id,display_name,city').in('id', ids)
    if (memberError) throw memberError
    const memberMap = new Map<string, any>((members ?? []).map((m: any) => [m.id, m] as [string, any]))
    setCompanions(rows.map((p: any) => {
      const m = memberMap.get(p.id) as any
      return {
        id: p.id,
        display_name: m?.display_name || '一起去會員',
        city: m?.city || '',
        introduction: p.introduction || '',
        interests: p.interests || [],
        skills: p.skills || [],
        service_areas: p.service_areas || [],
        availability: p.availability || null,
        media: Array.isArray(p.media) ? p.media : [],
      }
    }))
  }, [])

  const loadMyRequests = useCallback(async () => {
    const { data, error } = await supabase.from('requests').select('*')
      .eq('member_id', user.id).order('created_at', { ascending: false })
    if (error) throw error
    setMyRequests((data ?? []) as TravelRequest[])
  }, [user.id])

  const loadMyProposals = useCallback(async () => {
    const { data, error } = await supabase.from('proposals').select('*')
      .eq('member_id', user.id).order('created_at', { ascending: false })
    if (error) throw error
    setMyProposals((data ?? []) as Proposal[])
  }, [user.id])

  const refreshAll = useCallback(async () => {
    setBusy(true); setNotice('')
    try { await Promise.all([loadCompanions(), loadMyRequests(), loadMyProposals()]) }
    catch (error) { setNotice(errorText(error)) }
    finally { setBusy(false) }
  }, [loadCompanions, loadMyRequests, loadMyProposals])

  useEffect(() => { void refreshAll() }, [refreshAll])

  useEffect(() => {
    let active = true
    const loadProfileOptions = async () => {
      const { data, error } = await supabase.from('member_profiles')
        .select('is_companion,is_public,media').eq('id', user.id).single()
      if (!active) return
      if (error) { setNotice(error.message); return }
      setIsCompanion(Boolean(data.is_companion)); setIsPublic(Boolean(data.is_public))
      setMediaItems(Array.isArray(data.media) ? data.media as MediaItem[] : [])
    }
    void loadProfileOptions()
    return () => { active = false }
  }, [user.id])

  const filteredCompanions = useMemo(() => companions.filter((p) => {
    const text = `${p.display_name} ${p.city} ${p.introduction} ${p.interests.join(' ')} ${p.skills.join(' ')} ${p.service_areas.join(' ')}`.toLowerCase()
    return (!keyword || text.includes(keyword.toLowerCase())) && (!cityFilter || p.service_areas.some(a => a.includes(cityFilter)) || p.city.includes(cityFilter))
  }), [companions, keyword, cityFilter])

  const openRequest = async (request: TravelRequest) => {
    setSelectedRequest(request); setProposals([]); setNotice('')
    if (request.member_id === user.id) {
      const { data, error } = await supabase.from('proposals').select('*').eq('request_id', request.id).order('created_at', { ascending: true })
      if (error) setNotice(error.message)
      else setProposals((data ?? []) as Proposal[])
    } else {
      const { data, error } = await supabase.from('proposals').select('*').eq('request_id', request.id).eq('member_id', user.id).maybeSingle()
      if (error) setNotice(error.message)
      else if (data) setProposals([data as Proposal])
    }
  }

  const submitProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedRequest) return
    const price = Number(proposalForm.price)
    if (!Number.isSafeInteger(price) || price < 0) { setNotice('請輸入有效的整數報價。'); return }
    setProposalBusy(true); setNotice('')
    try {
      const { error } = await supabase.from('proposals').insert({
        request_id: selectedRequest.id, member_id: user.id,
        introduction: proposalForm.introduction.trim(), plan: proposalForm.plan.trim(),
        price, note: proposalForm.note.trim() || null, status: 'pending',
      })
      if (error) throw error
      setNotice('提案已送出。只有你與委託人能查看這份提案。')
      setProposalForm({ introduction: '', plan: '', price: '', note: '' })
      await loadMyProposals()
      const { data } = await supabase.from('proposals').select('*').eq('request_id', selectedRequest.id).eq('member_id', user.id).maybeSingle()
      setProposals(data ? [data as Proposal] : [])
    } catch (error) { setNotice(errorText(error)) }
    finally { setProposalBusy(false) }
  }

  const acceptProposal = async (proposalId: string) => {
    if (!window.confirm('確定接受這份提案？接受後其他待審提案將自動標記為未獲選。')) return
    setBusy(true); setNotice('')
    try {
      const { error } = await supabase.rpc('accept_proposal', { p_proposal_id: proposalId })
      if (error) throw error
      setNotice('已接受提案，委託狀態已更新。')
      await refreshAll()
      if (selectedRequest) setSelectedRequest({ ...selectedRequest, status: 'matched', selected_proposal_id: proposalId })
      const { data } = await supabase.from('proposals').select('*').eq('request_id', selectedRequest?.id)
      setProposals((data ?? []) as Proposal[])
    } catch (error) { setNotice(errorText(error)) }
    finally { setBusy(false) }
  }

  const withdrawProposal = async (proposal: Proposal) => {
    if (!window.confirm('確定撤回這份提案？')) return
    const { error } = await supabase.from('proposals').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', proposal.id).eq('status', 'pending')
    if (error) setNotice(error.message)
    else { setNotice('提案已撤回。'); await loadMyProposals() }
  }

  const startEditRequest = (request: TravelRequest) => {
    setEditingRequest(request)
    setEditForm({ title: request.title, description: request.description, destination: request.destination, start_date: request.start_date, end_date: request.end_date, budget_min: request.budget_min === null ? '' : String(request.budget_min), budget_max: request.budget_max === null ? '' : String(request.budget_max) })
  }

  const saveRequestEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editingRequest) return
    if (editForm.end_date < editForm.start_date) { setNotice('結束日期不可早於開始日期。'); return }
    const min = editForm.budget_min === '' ? null : Number(editForm.budget_min)
    const max = editForm.budget_max === '' ? null : Number(editForm.budget_max)
    if ((min !== null && min < 0) || (max !== null && max < 0) || (min !== null && max !== null && min > max)) { setNotice('請確認預算範圍。'); return }
    const { error } = await supabase.from('requests').update({ title: editForm.title.trim(), description: editForm.description.trim(), destination: editForm.destination.trim(), start_date: editForm.start_date, end_date: editForm.end_date, budget_min: min, budget_max: max, updated_at: new Date().toISOString() }).eq('id', editingRequest.id).eq('member_id', user.id)
    if (error) setNotice(error.message)
    else { setNotice('委託已更新。'); setEditingRequest(null); await loadMyRequests() }
  }

  const cancelRequest = async (request: TravelRequest) => {
    if (!window.confirm('確定取消這筆委託？取消後不會再出現在公開委託大廳。')) return
    const { error } = await supabase.from('requests').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', request.id).eq('member_id', user.id)
    if (error) setNotice(error.message)
    else { setNotice('委託已取消。'); await loadMyRequests() }
  }

  const saveCompanionSettings = async () => {
    setBusy(true); setNotice('')
    const { error } = await supabase.from('member_profiles').update({ is_companion: isCompanion, is_public: isPublic, media: mediaItems, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (error) setNotice(error.message)
    else { setNotice('陪伴者公開設定已儲存。'); await loadCompanions() }
    setBusy(false)
  }

  const uploadMedia = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav']
    for (const file of files) {
      if (!allowed.includes(file.type)) { setNotice(`不支援的檔案格式：${file.name}`); return }
      if (file.size > 50 * 1024 * 1024) { setNotice(`${file.name} 超過 50 MB。`); return }
    }
    setUploadBusy(true); setNotice('')
    try {
      const uploaded: MediaItem[] = []
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, '_')
        const path = `${user.id}/${Date.now()}-${safeName}`
        const { error } = await supabase.storage.from('profile-media').upload(path, file, { upsert: false, contentType: file.type })
        if (error) throw error
        const { data } = supabase.storage.from('profile-media').getPublicUrl(path)
        uploaded.push({ path, url: data.publicUrl, name: file.name, type: file.type })
      }
      const next = [...mediaItems, ...uploaded]
      const { error } = await supabase.from('member_profiles').update({ media: next, updated_at: new Date().toISOString() }).eq('id', user.id)
      if (error) throw error
      setMediaItems(next); setNotice('媒體檔案已上傳。')
    } catch (error) { setNotice(errorText(error)) }
    finally { setUploadBusy(false) }
  }

  const deleteMedia = async (item: MediaItem) => {
    if (!window.confirm(`確定刪除「${item.name}」？`)) return
    const { error } = await supabase.storage.from('profile-media').remove([item.path])
    if (error) { setNotice(error.message); return }
    const next = mediaItems.filter(m => m.path !== item.path)
    const { error: updateError } = await supabase.from('member_profiles').update({ media: next, updated_at: new Date().toISOString() }).eq('id', user.id)
    if (updateError) setNotice(updateError.message)
    else { setMediaItems(next); setNotice('檔案已刪除。') }
  }

  return <section className="marketplace-section" id="marketplace">
    <div className="section-heading">
      <span className="section-kicker">TOGETHER MARKETPLACE</span>
      <h2>讓每一段相遇，都從認識開始</h2>
      <p>尋找陪伴者、管理委託與提案，並完善你的服務檔案。</p>
    </div>
    <div className="marketplace-tabs">
      {([['companions', '尋找陪伴者'], ['proposals', '我送出的提案'], ['requests', '我的委託'], ['media', '陪伴者檔案'], ['chat', '聊天室']] as [Tab, string][]).map(([value, label]) => <button key={value} type="button" className={tab === value ? 'marketplace-tab active' : 'marketplace-tab'} onClick={() => { setTab(value); setNotice('') }}>{label}</button>)}
    </div>
    {notice && <p className="marketplace-notice" role="status">{notice}</p>}
    {busy && <p className="marketplace-loading">資料更新中…</p>}

    {tab === 'companions' && <>
      <div className="marketplace-filters">
        <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜尋姓名、興趣、專長或地區" aria-label="搜尋陪伴者" />
        <input value={cityFilter} onChange={e => setCityFilter(e.target.value)} placeholder="服務地區，例如台北市" aria-label="服務地區" />
        <button type="button" onClick={() => { setKeyword(''); setCityFilter('') }}>清除條件</button>
      </div>
      {filteredCompanions.length === 0 ? <div className="marketplace-empty">目前沒有符合條件的公開陪伴者。你可以稍後再來看看。</div> : <div className="companion-grid">{filteredCompanions.map(person => <article className="companion-card" key={person.id}>
        <div className="companion-avatar">{person.display_name.slice(0, 1)}</div>
        <h3>{person.display_name}</h3><p className="companion-city">{person.city || '尚未填寫所在地'}</p>
        <p className="companion-intro">{person.introduction || '這位會員尚未填寫自我介紹。'}</p>
        <div className="companion-tags">{[...person.skills, ...person.service_areas].slice(0, 5).map(tag => <span key={tag}>{tag}</span>)}</div>
        <button type="button" className="marketplace-primary" onClick={() => setSelectedCompanion(person)}>查看陪伴者資料</button>
      </article>)}</div>}
    </>}

    {tab === 'proposals' && <div className="marketplace-list">{myProposals.length === 0 ? <div className="marketplace-empty">你目前還沒有送出提案。可以到公開委託大廳尋找合適的旅程。</div> : myProposals.map(p => <article className="marketplace-list-card" key={p.id}>
      <div><strong>{p.introduction}</strong><p>{p.plan}</p><small>報價：{money(p.price)} ・ {new Date(p.created_at).toLocaleDateString('zh-TW')}</small></div>
      <span className={`proposal-status status-${p.status}`}>{({ pending: '待審核', accepted: '已接受', rejected: '未獲選', withdrawn: '已撤回' })[p.status]}</span>
      {p.status === 'pending' && <button type="button" className="marketplace-secondary" onClick={() => void withdrawProposal(p)}>撤回提案</button>}
    </article>)}</div>}

    {tab === 'requests' && <div className="marketplace-list">{myRequests.length === 0 ? <div className="marketplace-empty">你還沒有發布委託。可以從首頁的「發布旅遊需求」開始。</div> : myRequests.map(r => <article className="marketplace-list-card" key={r.id}>
      <div className="marketplace-list-main"><strong>{r.title}</strong><p>{r.destination} ・ {dateText(r.start_date)} 至 {dateText(r.end_date)}</p><small>狀態：{({ draft: '草稿', open: '公開招募中', matched: '已媒合', completed: '已完成', cancelled: '已取消' } as Record<string, string>)[r.status] || r.status}</small></div>
      <div className="marketplace-list-actions"><button type="button" className="marketplace-secondary" onClick={() => void openRequest(r)}>查看提案</button>{r.status === 'open' && <><button type="button" className="marketplace-secondary" onClick={() => startEditRequest(r)}>編輯</button><button type="button" className="marketplace-danger" onClick={() => void cancelRequest(r)}>取消委託</button></>}</div>
    </article>)}</div>}

    {tab === 'chat' && <ChatCenter user={user} />}

    {tab === 'media' && <div className="companion-settings">
      <h3>公開陪伴者服務檔案</h3>
      <p>開啟陪伴者身分並公開個人檔案後，其他登入會員才能在搜尋頁看到你。自我介紹、興趣與專長可在會員中心編輯。</p>
      <label className="marketplace-check"><input type="checkbox" checked={isCompanion} onChange={e => setIsCompanion(e.target.checked)} /> 我要提供旅遊陪伴服務</label>
      <label className="marketplace-check"><input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} /> 公開我的個人檔案</label>
      <label className="marketplace-upload">上傳照片、影片或音訊（單檔上限 50 MB）<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav" onChange={uploadMedia} disabled={uploadBusy} /></label>
      {uploadBusy && <p>檔案上傳中…</p>}
      <div className="media-grid">{mediaItems.map(item => <div className="media-item" key={item.path}>
        {item.type.startsWith('image/') ? <img src={item.url} alt={item.name} /> : item.type.startsWith('video/') ? <video src={item.url} controls /> : <audio src={item.url} controls />}
        <span title={item.name}>{item.name}</span><button type="button" className="marketplace-danger" onClick={() => void deleteMedia(item)}>刪除</button>
      </div>)}</div>
      <button type="button" className="marketplace-primary" onClick={() => void saveCompanionSettings()} disabled={busy}>儲存公開設定</button>
    </div>}

    {selectedCompanion && <div className="marketplace-overlay" onClick={() => setSelectedCompanion(null)}><div className="marketplace-dialog" onClick={e => e.stopPropagation()}>
      <button type="button" className="marketplace-close" onClick={() => setSelectedCompanion(null)}>×</button>
      <div className="companion-avatar large">{selectedCompanion.display_name.slice(0, 1)}</div><h2>{selectedCompanion.display_name}</h2><p className="companion-city">{selectedCompanion.city}</p>
      <h4>自我介紹</h4><p>{selectedCompanion.introduction || '尚未填寫'}</p>
      <h4>興趣</h4><p>{selectedCompanion.interests.join('、') || '尚未填寫'}</p>
      <h4>專長與技能</h4><p>{selectedCompanion.skills.join('、') || '尚未填寫'}</p>
      <h4>服務地區</h4><p>{selectedCompanion.service_areas.join('、') || '尚未填寫'}</p>
      <h4>可服務時間</h4><p>{selectedCompanion.availability?.description || '請透過提案進一步確認'}</p>
      <div className="media-grid">{selectedCompanion.media.map(item => <div className="media-item" key={item.path}>{item.type.startsWith('image/') ? <img src={item.url} alt={item.name} /> : item.type.startsWith('video/') ? <video src={item.url} controls /> : <audio src={item.url} controls />}</div>)}</div>
    </div></div>}

    {selectedRequest && <div className="marketplace-overlay" onClick={() => setSelectedRequest(null)}><div className="marketplace-dialog" onClick={e => e.stopPropagation()}>
      <button type="button" className="marketplace-close" onClick={() => setSelectedRequest(null)}>×</button>
      <span className="request-open-label">{selectedRequest.status === 'matched' ? '已媒合' : '委託詳情'}</span><h2>{selectedRequest.title}</h2>
      <p>{selectedRequest.destination} ・ {dateText(selectedRequest.start_date)} 至 {dateText(selectedRequest.end_date)}</p><p>{selectedRequest.description}</p>
      <p>委託預算：{money(selectedRequest.budget_min)} – {money(selectedRequest.budget_max)}</p>
      {selectedRequest.member_id === user.id ? <>
        <h3>收到的提案</h3>
        {proposals.length === 0 ? <p>目前尚無提案。</p> : proposals.map(p => <article className="proposal-card" key={p.id}>
          <strong>{p.introduction}</strong><p>{p.plan}</p><p>報價：{money(p.price)}</p>{p.note && <p>補充：{p.note}</p>}<small>狀態：{({ pending: '待審核', accepted: '已接受', rejected: '未獲選', withdrawn: '已撤回' })[p.status]}</small>
          {p.status === 'pending' && selectedRequest.status === 'open' && <button type="button" className="marketplace-primary" disabled={busy} onClick={() => void acceptProposal(p.id)}>接受這份提案</button>}
        </article>)}
      </> : <>
        <h3>提交你的提案</h3>
        {!isCompanion ? <p>你尚未啟用陪伴者身分。請先到「陪伴者檔案」開啟提供陪伴服務的設定，再提交提案。</p> : proposals.length ? <div className="proposal-card"><strong>你已提交提案</strong><p>報價：{money(proposals[0].price)}</p><p>狀態：{({ pending: '待審核', accepted: '已接受', rejected: '未獲選', withdrawn: '已撤回' })[proposals[0].status]}</p></div> : <form className="proposal-form" onSubmit={submitProposal}>
          <label>自我介紹<textarea required minLength={5} value={proposalForm.introduction} onChange={e => setProposalForm({ ...proposalForm, introduction: e.target.value })} /></label>
          <label>陪伴計畫<textarea required minLength={5} value={proposalForm.plan} onChange={e => setProposalForm({ ...proposalForm, plan: e.target.value })} /></label>
          <label>報價（新台幣元）<input type="number" min="0" step="1" required value={proposalForm.price} onChange={e => setProposalForm({ ...proposalForm, price: e.target.value })} /></label>
          <label>補充說明（選填）<textarea value={proposalForm.note} onChange={e => setProposalForm({ ...proposalForm, note: e.target.value })} /></label>
          <button type="submit" className="marketplace-primary" disabled={proposalBusy}>{proposalBusy ? '送出中…' : '送出密封提案'}</button>
        </form>}
      </>}
    </div></div>}

    {editingRequest && <div className="marketplace-overlay" onClick={() => setEditingRequest(null)}><form className="marketplace-dialog proposal-form" onClick={e => e.stopPropagation()} onSubmit={saveRequestEdit}>
      <button type="button" className="marketplace-close" onClick={() => setEditingRequest(null)}>×</button><h2>編輯旅遊委託</h2>
      <label>委託標題<input required value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} /></label>
      <label>目的地<input required value={editForm.destination} onChange={e => setEditForm({ ...editForm, destination: e.target.value })} /></label>
      <label>需求描述<textarea required value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} /></label>
      <label>開始日期<input type="date" required value={editForm.start_date} onChange={e => setEditForm({ ...editForm, start_date: e.target.value })} /></label>
      <label>結束日期<input type="date" required min={editForm.start_date} value={editForm.end_date} onChange={e => setEditForm({ ...editForm, end_date: e.target.value })} /></label>
      <label>最低預算<input type="number" min="0" value={editForm.budget_min} onChange={e => setEditForm({ ...editForm, budget_min: e.target.value })} /></label>
      <label>最高預算<input type="number" min="0" value={editForm.budget_max} onChange={e => setEditForm({ ...editForm, budget_max: e.target.value })} /></label>
      <button type="submit" className="marketplace-primary">儲存修改</button>
    </form></div>}
  </section>
}
