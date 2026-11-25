import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Room = {
  id: string
  request_id: string
  status: 'open' | 'closed'
  created_at: string
  title: string
  destination: string
  partner_id: string
  partner_name: string
}
type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

const timeText = (value: string) => new Date(value).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function ChatCenter({ user }: { user: User }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const loadRooms = useCallback(async () => {
    setLoadingRooms(true)
    setNotice('')
    try {
      const { data: memberships, error: membershipError } = await supabase
        .from('conversation_members').select('conversation_id').eq('member_id', user.id)
      if (membershipError) throw membershipError
      const ids = [...new Set((memberships ?? []).map((item: { conversation_id: string }) => item.conversation_id))]
      if (!ids.length) { setRooms([]); return }

      const { data: conversations, error: conversationError } = await supabase
        .from('conversations').select('id,request_id,status,created_at').in('id', ids).order('created_at', { ascending: false })
      if (conversationError) throw conversationError

      const result = await Promise.all((conversations ?? []).map(async (conversation: any) => {
        const [{ data: request, error: requestError }, { data: people, error: peopleError }] = await Promise.all([
          supabase.from('requests').select('title,destination').eq('id', conversation.request_id).single(),
          supabase.from('conversation_members').select('member_id').eq('conversation_id', conversation.id),
        ])
        if (requestError) throw requestError
        if (peopleError) throw peopleError
        const partnerId = (people ?? []).find((person: { member_id: string }) => person.member_id !== user.id)?.member_id
        let partnerName = '媒合夥伴'
        if (partnerId) {
          const { data: member, error: memberError } = await supabase.from('members').select('display_name').eq('id', partnerId).maybeSingle()
          if (memberError) throw memberError
          partnerName = member?.display_name || partnerName
        }
        return { ...conversation, title: request?.title || '旅遊委託', destination: request?.destination || '', partner_id: partnerId || '', partner_name: partnerName } as Room
      }))
      setRooms(result)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '讀取聊天室失敗。')
    } finally { setLoadingRooms(false) }
  }, [user.id])

  const loadMessages = useCallback(async (roomId: string) => {
    setLoadingMessages(true)
    const { data, error } = await supabase.from('messages').select('id,conversation_id,sender_id,content,created_at')
      .eq('conversation_id', roomId).order('created_at', { ascending: true })
    if (error) setNotice(error.message)
    else setMessages((data ?? []) as Message[])
    setLoadingMessages(false)
  }, [])

  useEffect(() => { void loadRooms() }, [loadRooms])

  useEffect(() => {
    if (!activeRoom) return
    void loadMessages(activeRoom.id)
    const channel = supabase.channel(`chat-${activeRoom.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${activeRoom.id}` }, payload => {
        const incoming = payload.new as Message
        setMessages(current => current.some(item => item.id === incoming.id) ? current : [...current, incoming])
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeRoom?.id, loadMessages])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeRoom || activeRoom.status !== 'open' || !draft.trim() || sending) return
    setSending(true); setNotice('')
    const content = draft.trim()
    const { error } = await supabase.from('messages').insert({ conversation_id: activeRoom.id, sender_id: user.id, content })
    if (error) setNotice(error.message)
    else setDraft('')
    setSending(false)
  }

  return <div className="chat-center">
    <style>{`
      .chat-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:8px 0 18px}.chat-heading h3{margin:0 0 5px}.chat-heading p{margin:0;color:#778078;font-size:14px}
      .chat-layout{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);min-height:520px;border:1px solid #e6e7df;border-radius:18px;overflow:hidden;background:#fff}
      .chat-room-list{border-right:1px solid #e6e7df;background:#fbfaf6;overflow:auto}.chat-room-item{width:100%;display:flex;align-items:center;gap:11px;padding:15px;border:0;border-bottom:1px solid #ecece5;background:transparent;text-align:left;cursor:pointer;color:#29372f}.chat-room-item.active{background:#eaf0e8}.chat-avatar{width:42px;height:42px;flex:0 0 42px;border-radius:50%;display:grid;place-items:center;background:#dce8dc;color:#405d46;font-weight:700}.chat-room-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:3px}.chat-room-copy strong,.chat-room-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-room-copy small{font-size:12px;color:#7a817a}.chat-room-status{font-size:11px;white-space:nowrap;color:#57735c}.chat-room-status.closed{color:#8a7770}.chat-panel{display:flex;flex-direction:column;min-width:0;min-height:520px}.chat-panel-header{padding:15px 18px;border-bottom:1px solid #ecece5;display:flex;justify-content:space-between;align-items:center;gap:10px}.chat-panel-header p{margin:4px 0 0;color:#788078;font-size:13px}.chat-messages{flex:1;min-height:330px;max-height:520px;overflow:auto;padding:20px;background:#fdfcf9}.chat-message-row{display:flex;margin:10px 0}.chat-message-row.mine{justify-content:flex-end}.chat-bubble{max-width:min(78%,520px);padding:11px 14px;border-radius:16px;background:#f0f0eb;color:#354139;overflow-wrap:anywhere}.chat-message-row.mine .chat-bubble{background:#e1ecdf}.chat-bubble p{margin:0;white-space:pre-wrap;line-height:1.55}.chat-bubble time{display:block;margin-top:6px;font-size:10px;color:#788078;text-align:right}.chat-placeholder,.chat-empty-message{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#788078;min-height:320px;padding:25px}.chat-placeholder span{font-size:32px;color:#729078}.chat-placeholder strong{margin-top:12px;color:#354139}.chat-placeholder p{font-size:13px}.chat-composer{display:flex;gap:10px;padding:13px;border-top:1px solid #ecece5}.chat-composer textarea{flex:1;resize:vertical;min-height:48px;border:1px solid #dfe3da;border-radius:12px;padding:11px;font:inherit}.chat-composer button{align-self:stretch;min-width:76px}.chat-safety-note{margin:0;padding:0 14px 12px;color:#858b83;font-size:11px}.chat-center .marketplace-notice{margin:10px 0}.chat-center .marketplace-empty{padding:20px;font-size:13px}
      @media(max-width:700px){.chat-layout{grid-template-columns:1fr}.chat-room-list{border-right:0;border-bottom:1px solid #e6e7df;max-height:220px}.chat-panel{min-height:480px}.chat-messages{min-height:300px}.chat-heading{align-items:flex-start}.chat-room-item{padding:11px}}
    `}</style>
    <div className="chat-heading">
      <div><h3>站內聊天室</h3><p>只有這筆委託的媒合雙方可以查看對話。</p></div>
      <button type="button" className="marketplace-secondary" onClick={() => void loadRooms()}>重新整理</button>
    </div>
    {notice && <p className="marketplace-notice" role="status">{notice}</p>}
    <div className="chat-layout">
      <aside className="chat-room-list">
        {loadingRooms ? <p className="marketplace-loading">聊天室載入中…</p> : rooms.length === 0 ? <div className="marketplace-empty">目前沒有聊天室。接受提案並成功媒合後，聊天室會自動建立。</div> : rooms.map(room =>
          <button type="button" key={room.id} className={`chat-room-item ${activeRoom?.id === room.id ? 'active' : ''}`} onClick={() => { setActiveRoom(room); setNotice('') }}>
            <span className="chat-avatar">{room.partner_name.slice(0, 1)}</span>
            <span className="chat-room-copy"><strong>{room.partner_name}</strong><small>{room.title}</small><small>{room.destination}</small></span>
            <span className={`chat-room-status ${room.status}`}>{room.status === 'open' ? '交流中' : '已關閉'}</span>
          </button>
        )}
      </aside>
      <section className="chat-panel">
        {!activeRoom ? <div className="chat-placeholder"><span>✉</span><strong>選擇一個聊天室</strong><p>從左側選擇已媒合的委託，開始討論旅程。</p></div> : <>
          <header className="chat-panel-header"><div><strong>{activeRoom.partner_name}</strong><p>{activeRoom.title} ・ {activeRoom.destination}</p></div><span className={`chat-room-status ${activeRoom.status}`}>{activeRoom.status === 'open' ? '已媒合' : '交流已關閉'}</span></header>
          <div className="chat-messages">
            {loadingMessages ? <p className="marketplace-loading">訊息載入中…</p> : messages.length === 0 ? <div className="chat-empty-message">聊天室已建立，傳送第一則訊息，開始討論行程吧！</div> : messages.map(message => <div key={message.id} className={`chat-message-row ${message.sender_id === user.id ? 'mine' : 'theirs'}`}><div className="chat-bubble"><p>{message.content}</p><time>{timeText(message.created_at)}</time></div></div>)}
            <div ref={bottomRef} />
          </div>
          <form className="chat-composer" onSubmit={sendMessage}>
            <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder={activeRoom.status === 'open' ? '輸入訊息，討論行程與集合細節…' : '此聊天室已關閉'} maxLength={5000} rows={2} disabled={activeRoom.status !== 'open' || sending} />
            <button type="submit" className="marketplace-primary" disabled={activeRoom.status !== 'open' || sending || !draft.trim()}>{sending ? '傳送中…' : '傳送'}</button>
          </form>
          <p className="chat-safety-note">提醒：請勿在聊天中提供密碼、驗證碼或銀行帳戶等敏感資訊。平台內付款功能尚未開放。</p>
        </>}
      </section>
    </div>
  </div>
}
