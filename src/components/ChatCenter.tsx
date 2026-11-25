import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Room = {
  id: string
  request_id: string
  status: 'open' | 'closed'
  title: string
  destination: string
  partner_name: string
  last_read_at: string | null
  unread_count: number
  last_message?: string
  last_message_at?: string
}
type Message = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失敗，請稍後再試。'

export default function ChatCenter({ user }: { user: User }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const activeRoomRef = useRef<string | null>(null)

  const loadRooms = useCallback(async () => {
    const { data: memberships, error: memberError } = await supabase
      .from('conversation_members')
      .select('conversation_id,last_read_at')
      .eq('member_id', user.id)
    if (memberError) throw memberError
    const membershipRows = memberships ?? []
    if (!membershipRows.length) { setRooms([]); return }

    const ids = membershipRows.map(row => row.conversation_id)
    const readMap = new Map(membershipRows.map(row => [row.conversation_id, row.last_read_at]))
    const { data: conversations, error: conversationError } = await supabase
      .from('conversations')
      .select('id,request_id,status')
      .in('id', ids)
      .order('created_at', { ascending: false })
    if (conversationError) throw conversationError
    const conversationRows = conversations ?? []
    if (!conversationRows.length) { setRooms([]); return }

    const requestIds = [...new Set(conversationRows.map(row => row.request_id))]
    const { data: requests, error: requestError } = await supabase
      .from('requests').select('id,title,destination').in('id', requestIds)
    if (requestError) throw requestError
    const requestMap = new Map((requests ?? []).map(row => [row.id, row]))

    const roomResults = await Promise.all(conversationRows.map(async conversation => {
      const { data: members, error: membersError } = await supabase
        .from('conversation_members').select('member_id')
        .eq('conversation_id', conversation.id)
        .neq('member_id', user.id)
      if (membersError) throw membersError
      const partnerId = members?.[0]?.member_id
      let partnerName = '同行夥伴'
      if (partnerId) {
        const { data: partner, error: partnerError } = await supabase
          .from('members').select('display_name').eq('id', partnerId).maybeSingle()
        if (partnerError) throw partnerError
        partnerName = partner?.display_name || partnerName
      }

      const lastReadAt = readMap.get(conversation.id) ?? null
      let unreadQuery = supabase.from('messages').select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversation.id).neq('sender_id', user.id)
      if (lastReadAt) unreadQuery = unreadQuery.gt('created_at', lastReadAt)
      const { count, error: unreadError } = await unreadQuery
      if (unreadError) throw unreadError

      const { data: latest, error: latestError } = await supabase.from('messages')
        .select('content,created_at').eq('conversation_id', conversation.id)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (latestError) throw latestError
      const request = requestMap.get(conversation.request_id)
      return {
        id: conversation.id,
        request_id: conversation.request_id,
        status: conversation.status,
        title: request?.title || '旅程聊天室',
        destination: request?.destination || '',
        partner_name: partnerName,
        last_read_at: lastReadAt,
        unread_count: count ?? 0,
        last_message: latest?.content,
        last_message_at: latest?.created_at,
      } as Room
    }))
    setRooms(roomResults.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || '')))
    setActiveRoom(current => current ? roomResults.find(room => room.id === current.id) ?? current : null)
  }, [user.id])

  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase.from('messages').select('*')
      .eq('conversation_id', conversationId).order('created_at', { ascending: true })
    if (error) throw error
    setMessages((data ?? []) as Message[])
  }, [])

  const markRoomRead = useCallback(async (conversationId: string) => {
    const readAt = new Date().toISOString()
    const { error } = await supabase.from('conversation_members')
      .update({ last_read_at: readAt })
      .eq('conversation_id', conversationId).eq('member_id', user.id)
    if (error) throw error
    setRooms(current => current.map(room => room.id === conversationId
      ? { ...room, last_read_at: readAt, unread_count: 0 }
      : room))
    setActiveRoom(current => current?.id === conversationId
      ? { ...current, last_read_at: readAt, unread_count: 0 }
      : current)
  }, [user.id])

  const openRoom = async (room: Room) => {
    setActiveRoom(room)
    activeRoomRef.current = room.id
    setMessages([])
    setNotice('')
    try {
      await loadMessages(room.id)
      await markRoomRead(room.id)
    } catch (error) { setNotice(errorText(error)) }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try { await loadRooms() }
      catch (error) { if (!cancelled) setNotice(errorText(error)) }
      finally { if (!cancelled) setLoading(false) }
    }
    void run()
    return () => { cancelled = true }
  }, [loadRooms])

  useEffect(() => {
    const channel = supabase.channel(`chat-inbox-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const incoming = payload.new as Message
        if (incoming.sender_id === user.id) return
        if (activeRoomRef.current === incoming.conversation_id) {
          setMessages(current => current.some(item => item.id === incoming.id) ? current : [...current, incoming])
          void markRoomRead(incoming.conversation_id).catch(error => setNotice(errorText(error)))
        } else {
          void loadRooms().catch(error => setNotice(errorText(error)))
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [user.id, loadRooms, markRoomRead])

  useEffect(() => {
    if (!activeRoom) return
    const channel = supabase.channel(`chat-room-${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeRoom.id}`,
      }, payload => {
        const incoming = payload.new as Message
        setMessages(current => current.some(item => item.id === incoming.id) ? current : [...current, incoming])
        if (incoming.sender_id !== user.id) {
          void markRoomRead(activeRoom.id).catch(error => setNotice(errorText(error)))
        }
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeRoom?.id, user.id, markRoomRead])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeRoom || !draft.trim() || sending) return
    const content = draft.trim()
    setSending(true); setNotice('')
    try {
      const { error } = await supabase.from('messages').insert({
        conversation_id: activeRoom.id, sender_id: user.id, content,
      })
      if (error) throw error
      setDraft('')
      await loadMessages(activeRoom.id)
      await loadRooms()
    } catch (error) { setNotice(errorText(error)) }
    finally { setSending(false) }
  }

  const totalUnread = rooms.reduce((sum, room) => sum + room.unread_count, 0)

  return <section className="chat-center">
    <div className="chat-heading">
      <div><span className="section-kicker">TOGETHER CHAT</span><h2>站內聊天室</h2>
        <p>與成功媒合的同行夥伴保持聯繫。請勿在聊天中分享密碼或驗證碼。</p></div>
      {totalUnread > 0 && <span className="chat-total-unread">{totalUnread > 99 ? '99+' : totalUnread} 則未讀</span>}
    </div>
    {notice && <p className="chat-notice" role="status">{notice}</p>}
    {loading ? <div className="chat-empty">聊天室載入中…</div> : <div className="chat-layout">
      <aside className="chat-room-list">
        <h3>我的對話</h3>
        {rooms.length === 0 ? <p className="chat-empty">目前沒有聊天室。委託成功媒合後，聊天室會自動建立。</p> : rooms.map(room => <button key={room.id} type="button"
          className={`chat-room-item ${activeRoom?.id === room.id ? 'active' : ''}`}
          onClick={() => void openRoom(room)}>
          <span className="chat-room-avatar">{room.partner_name.slice(0, 1)}</span>
          <span className="chat-room-info"><strong>{room.partner_name}</strong><small>{room.title}{room.destination ? ` ・ ${room.destination}` : ''}</small>
            <small className="chat-last-message">{room.last_message || '開始你們的對話吧'}</small></span>
          {room.unread_count > 0 && <span className="chat-unread-badge">{room.unread_count > 99 ? '99+' : room.unread_count}</span>}
        </button>)}
      </aside>
      <div className="chat-conversation">
        {!activeRoom ? <div className="chat-empty">選擇左側聊天室，開始交流。</div> : <>
          <header className="chat-conversation-header"><strong>{activeRoom.partner_name}</strong><span>{activeRoom.title} ・ {activeRoom.destination}</span></header>
          <div className="chat-messages">
            {messages.length === 0 ? <p className="chat-empty">還沒有訊息，傳送第一則訊息吧。</p> : messages.map(message => <div key={message.id} className={`chat-message ${message.sender_id === user.id ? 'mine' : 'theirs'}`}>
              <p>{message.content}</p><time>{new Date(message.created_at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
            </div>)}
            <div ref={bottomRef} />
          </div>
          <form className="chat-compose" onSubmit={sendMessage}>
            <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="輸入訊息…" maxLength={5000} rows={2} disabled={activeRoom.status !== 'open'} />
            <button type="submit" disabled={sending || !draft.trim() || activeRoom.status !== 'open'}>{sending ? '傳送中…' : '傳送'}</button>
          </form>
          {activeRoom.status !== 'open' && <p className="chat-closed-note">此聊天室已關閉，無法繼續傳送訊息。</p>}
        </>}
      </div>
    </div>}
    <style>{`
      .chat-center{max-width:1120px;margin:0 auto;padding:55px 24px 75px;color:#405144}
      .chat-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:22px}
      .chat-heading h2{margin:8px 0;color:#304438;font-size:26px}.chat-heading p{margin:0;color:#899188;font-size:13px;line-height:1.8}
      .chat-total-unread,.chat-unread-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:30px;background:#d97752;color:white;font-size:12px;font-weight:700;padding:6px 11px;white-space:nowrap}
      .chat-layout{display:grid;grid-template-columns: minmax(250px, .85fr) minmax(0, 1.7fr);min-height:510px;border:1px solid #e9e7df;border-radius:16px;overflow:hidden;background:#fffefa}
      .chat-room-list{border-right:1px solid #eeeae1;padding:18px;overflow-y:auto}.chat-room-list h3{margin:0 0 14px;font-size:16px}
      .chat-room-item{width:100%;display:flex;align-items:center;gap:11px;text-align:left;padding:13px 9px;border:0;border-bottom:1px solid #f0eee8;background:transparent;cursor:pointer;color:inherit}
      .chat-room-item.active{background:#f5f4ed;border-radius:10px}.chat-room-avatar{width:40px;height:40px;flex:0 0 40px;display:grid;place-items:center;border-radius:50%;background:#e8eee3;color:#526b54;font-weight:700}
      .chat-room-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}.chat-room-info strong{font-size:13px}.chat-room-info small{font-size:11px;color:#92988f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-last-message{max-width:230px}
      .chat-unread-badge{min-width:22px;padding:4px 7px;font-size:10px}.chat-conversation{display:flex;flex-direction:column;min-width:0;min-height:510px}.chat-conversation-header{padding:17px 20px;border-bottom:1px solid #eeeae1;display:flex;flex-direction:column;gap:5px}.chat-conversation-header strong{font-size:15px}.chat-conversation-header span{font-size:11px;color:#92988f}
      .chat-messages{flex:1;min-height:340px;max-height:500px;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px;background:#fbfaf6}.chat-message{max-width:78%;display:flex;flex-direction:column;gap:4px}.chat-message p{margin:0;padding:11px 14px;border-radius:13px;font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.chat-message time{font-size:10px;color:#9a9f96}.chat-message.mine{align-self:flex-end;align-items:flex-end}.chat-message.mine p{background:#e6eee3;color:#405144;border-bottom-right-radius:4px}.chat-message.theirs{align-self:flex-start}.chat-message.theirs p{background:white;border:1px solid #eeeae1;color:#514f48;border-bottom-left-radius:4px}
      .chat-compose{display:flex;gap:10px;padding:14px;border-top:1px solid #eeeae1}.chat-compose textarea{flex:1;resize:vertical;min-height:44px;border:1px solid #e5e1d8;border-radius:10px;padding:10px;font:inherit;font-size:13px}.chat-compose button{border:0;border-radius:10px;padding:0 20px;background:#405b48;color:white;font-weight:700;cursor:pointer}.chat-compose button:disabled{opacity:.5;cursor:not-allowed}.chat-empty{margin:auto;padding:28px;text-align:center;color:#99998f;font-size:13px;line-height:1.8}.chat-notice{padding:10px 14px;border-radius:9px;background:#fff4ed;color:#a75e40;font-size:12px}.chat-closed-note{margin:0;padding:0 16px 12px;color:#a75e40;font-size:12px}
      @media(max-width:700px){.chat-center{padding:42px 15px}.chat-layout{grid-template-columns:1fr}.chat-room-list{border-right:0;border-bottom:1px solid #eeeae1;max-height:240px}.chat-conversation{min-height:430px}.chat-messages{min-height:280px}.chat-heading{align-items:flex-start}.chat-message{max-width:90%}}
    `}</style>
  </section>
}
