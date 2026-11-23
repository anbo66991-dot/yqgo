

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

type AuthMode = 'login' | 'signup'
type MemberForm = {
  display_name: string
  gender: string
  birth_date: string
  city: string
}

type ProfileForm = {
  introduction: string
  interests: string
  skills: string
  service_areas: string
  availability: string
  is_public: boolean
}
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
}
function App() {
  const [activeTab, setActiveTab] = useState<'find' | 'offer'>('find')
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
// 會員中心
const [showMemberCenter, setShowMemberCenter] = useState(false)
const [profileLoading, setProfileLoading] = useState(false)
const [profileSaving, setProfileSaving] = useState(false)
const [profileMessage, setProfileMessage] = useState('')

const [memberForm, setMemberForm] = useState<MemberForm>({
  display_name: '',
  gender: '',
  birth_date: '',
  city: '',
})

const [profileForm, setProfileForm] = useState<ProfileForm>({
  introduction: '',
  interests: '',
  skills: '',
  service_areas: '',
  availability: '',
  is_public: false,
})
// 發布旅遊需求
const [showRequestForm, setShowRequestForm] = useState(false)
const [requestSaving, setRequestSaving] = useState(false)
const [requestMessage, setRequestMessage] = useState('')

const [requestForm, setRequestForm] = useState({
  title: '',
  description: '',
  destination: '',
  start_date: '',
  end_date: '',
  budget_min: '',
  budget_max: '',
})
// 旅遊委託大廳
const [publicRequests, setPublicRequests] = useState<TravelRequest[]>([])
const [requestsLoading, setRequestsLoading] = useState(false)
const [requestsError, setRequestsError] = useState('')
const [requestKeyword, setRequestKeyword] = useState('')
const [requestStartDate, setRequestStartDate] = useState('')
const [requestBudgetLimit, setRequestBudgetLimit] = useState('')
const [selectedRequest, setSelectedRequest] = useState<TravelRequest | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
      })

    return () => subscription.unsubscribe()
  }, [])
// 讀取公開旅遊委託
const loadPublicRequests = useCallback(async () => {
  setRequestsLoading(true)
  setRequestsError('')

  try {
    const { data, error } = await supabase
      .from('requests')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) throw error

    setPublicRequests((data ?? []) as TravelRequest[])
  } catch (error) {
    setRequestsError(
      error instanceof Error ? error.message : '讀取旅遊委託失敗，請稍後再試。'
    )
    setPublicRequests([])
  } finally {
    setRequestsLoading(false)
  }
}, [])

// 會員登入後自動載入公開委託
useEffect(() => {
  if (user) {
    loadPublicRequests()
  } else {
    setPublicRequests([])
  }
}, [user, loadPublicRequests])

const openAuth = (mode: AuthMode) => {
  setAuthMode(mode)
  setEmail('')
  setPassword('')
  setMessage('')
}

const closeAuth = () => {
  setAuthMode(null)
  setMessage('')
}

  const handleAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })

        if (error) throw error

        if (data.session) {
          setMessage('註冊成功！歡迎加入一起去。')
        } else {
          setMessage('註冊成功！請到電子郵件收件匣確認信箱，再登入。')
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        setMessage('登入成功！')
        setAuthMode(null)
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '操作失敗，請稍後再試。'
      )
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      alert(error.message)
      return
    }

    alert('已成功登出')
  }
  // 開啟發布需求表單
const openRequestForm = () => {
  if (!user) {
    openAuth('login')
    return
  }

  setRequestMessage('')
  setShowRequestForm(true)
}

// 儲存旅遊需求
const saveRequest = async (e: FormEvent) => {
  e.preventDefault()

  if (!user) {
    setRequestMessage('請先登入會員')
    return
  }

  if (requestForm.start_date > requestForm.end_date) {
    setRequestMessage('結束日期不可早於開始日期')
    return
  }

  const minBudget = requestForm.budget_min === ''
    ? null
    : Number(requestForm.budget_min)

  const maxBudget = requestForm.budget_max === ''
    ? null
    : Number(requestForm.budget_max)

  if (
    (minBudget !== null && minBudget < 0) ||
    (maxBudget !== null && maxBudget < 0)
  ) {
    setRequestMessage('預算不可為負數')
    return
  }

  if (
    minBudget !== null &&
    maxBudget !== null &&
    minBudget > maxBudget
  ) {
    setRequestMessage('最高預算不可低於最低預算')
    return
  }

  setRequestSaving(true)
  setRequestMessage('')

  try {
    const { error } = await supabase
      .from('requests')
      .insert({
        member_id: user.id,
        title: requestForm.title.trim(),
        description: requestForm.description.trim(),
        destination: requestForm.destination.trim(),
        start_date: requestForm.start_date,
        end_date: requestForm.end_date,
        budget_min: minBudget,
        budget_max: maxBudget,
        status: 'open',
      })

    if (error) throw error

    await loadPublicRequests()
    setRequestMessage('旅遊需求已成功發布！')

    setRequestForm({
      title: '',
      description: '',
      destination: '',
      start_date: '',
      end_date: '',
      budget_min: '',
      budget_max: '',
    })

    window.setTimeout(() => {
      setShowRequestForm(false)
      setRequestMessage('')
    }, 1500)
  } catch (error) {
    setRequestMessage(
      `發布失敗：${error instanceof Error ? error.message : '請稍後再試。'}`
    )
  } finally {
    setRequestSaving(false)
  }
}

  // 讀取會員基本資料與個人檔案
  const openMemberCenter = async () => {
    if (!user) return

    setShowMemberCenter(true)
    setProfileLoading(true)
    setProfileMessage('')

    try {
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('id', user.id)
        .single()

      if (memberError) throw memberError

      const { data: profile, error: profileError } = await supabase
        .from('member_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      setMemberForm({
        display_name: member.display_name ?? '',
        gender: member.gender ?? '',
        birth_date: member.birth_date ?? '',
        city: member.city ?? '',
      })

      setProfileForm({
        introduction: profile.introduction ?? '',
        interests: (profile.interests ?? []).join(', '),
        skills: (profile.skills ?? []).join(', '),
        service_areas: (profile.service_areas ?? []).join(', '),
        availability: profile.availability?.description ?? '',
        is_public: profile.is_public ?? false,
      })
    } catch (error) {
      setProfileMessage(
        error instanceof Error ? error.message : '讀取會員資料失敗。'
      )
    } finally {
      setProfileLoading(false)
    }
  }

  // 儲存會員資料
  const saveMemberProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!user) return

    setProfileSaving(true)
    setProfileMessage('')

    try {
      const { error: memberError } = await supabase
        .from('members')
        .update({
          display_name: memberForm.display_name.trim() || null,
          gender: memberForm.gender || null,
          birth_date: memberForm.birth_date || null,
          city: memberForm.city.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (memberError) throw memberError

      const { error: profileError } = await supabase
        .from('member_profiles')
        .update({
          introduction: profileForm.introduction,
          interests: profileForm.interests
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
          skills: profileForm.skills
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
          service_areas: profileForm.service_areas
            .split(',')
            .map(item => item.trim())
            .filter(Boolean),
          availability: {
            description: profileForm.availability,
          },
          is_public: profileForm.is_public,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)

      if (profileError) throw profileError

      setProfileMessage('會員資料已成功儲存！')
    } catch (error) {
      setProfileMessage(
        error instanceof Error ? error.message : '儲存失敗，請稍後再試。'
      )
    } finally {
      setProfileSaving(false)
    }
  }

  const formatRequestDate = (dateValue: string) => {
    if (!dateValue) return '日期未指定'

    const date = new Date(`${dateValue}T00:00:00`)
    return Number.isNaN(date.getTime())
      ? dateValue
      : new Intl.DateTimeFormat('zh-TW', {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
        }).format(date)
  }

  const formatRequestBudget = (
    minimum: number | null,
    maximum: number | null
  ) => {
    const formatAmount = (amount: number) =>
      `NT$ ${amount.toLocaleString('zh-TW')}`

    if (minimum === null && maximum === null) return '預算可討論'
    if (minimum === null) return `最高 ${formatAmount(maximum!)}`
    if (maximum === null) return `至少 ${formatAmount(minimum)}`
    if (minimum === maximum) return formatAmount(minimum)

    return `${formatAmount(minimum)} – ${formatAmount(maximum)}`
  }

  const filteredRequests = publicRequests.filter((request) => {
    const keyword = requestKeyword.trim().toLowerCase()
    const matchesKeyword =
      !keyword ||
      (request.title ?? '').toLowerCase().includes(keyword) ||
      (request.destination ?? '').toLowerCase().includes(keyword) ||
      (request.description ?? '').toLowerCase().includes(keyword)

    const matchesDate =
      !requestStartDate || request.start_date >= requestStartDate

    const matchesBudget =
      !requestBudgetLimit ||
      request.budget_max === null ||
      request.budget_max <= Number(requestBudgetLimit)

    return matchesKeyword && matchesDate && matchesBudget
  })

  return (
    <div className="site">
      <header className="navbar">
        <a className="brand" href="#">
          <span className="brand-icon">去</span>
          <span>一起去</span>
        </a>

        <nav className="nav-links">
          <a href="#how-it-works">如何使用</a>
          <a href="#requests">公開委託</a>
          <a href="#features">平台特色</a>
          <a href="#safety">安全與評價</a>
        </nav>

        <div className="nav-actions">
        {user ? (
  <>
    <span className="member-email">
      {user.email}
    </span>

    <button
      className="login-button"
      type="button"
      onClick={openMemberCenter}
    >
      會員中心
    </button>

    <button
      className="login-button"
      type="button"
      onClick={handleLogout}
    >
      登出
    </button>
  </>
          ) : (
            <>
              <button
                className="login-button"
                type="button"
                onClick={() => openAuth('login')}
              >
                登入
              </button>
              <button
                className="nav-join-button"
                type="button"
                onClick={() => openAuth('signup')}
              >
                免費加入
              </button>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              讓每一段旅程，都有人同行
            </div>

            <h1>
              一個人出發，
              <br />
              也能有<span className="highlight">人一起去。</span>
            </h1>

            <p className="hero-description">
              不論是想找人一起探索城市、品嚐在地美食，
              或是分享生活中的每一段旅程，
              在這裡，找到適合你的同行夥伴。
            </p>

            <div className="hero-buttons">
              <a className="primary-button" href="#how-it-works">
                開始尋找夥伴 <span>→</span>
              </a>
              <a className="secondary-button" href="#features">
                認識一起去
              </a>
            </div>

            <div className="hero-note">
              <span>✦</span> 跨世代交流・在地陪伴・安心媒合
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-sun" />
            <div className="visual-card">
              <div className="visual-label">YOUR NEXT JOURNEY</div>
              <div className="visual-title">
                美好的旅程，
                <br />
                從相遇開始。
              </div>
              <div className="visual-illustration">
                <div className="hill hill-back" />
                <div className="hill hill-front" />
                <div className="sun-small" />
                <div className="path" />
                <div className="person person-one"><span /></div>
                <div className="person person-two"><span /></div>
              </div>
              <div className="visual-bottom">
                <span>一起探索生活的更多可能</span>
                <span className="visual-arrow">↗</span>
              </div>
            </div>
            <div className="floating-note">
              <span className="floating-icon">♡</span>
              <span>
                <strong>找到你的旅伴</strong>
                <small>讓旅程不再孤單</small>
              </span>
            </div>
            <div className="visual-sparkle sparkle-one">✳</div>
            <div className="visual-sparkle sparkle-two">✦</div>
          </div>
        </section>

        <section className="choice-section" id="how-it-works">
          <div className="section-heading">
            <span className="section-kicker">LET'S GO TOGETHER</span>
            <h2>今天，你想怎麼一起去？</h2>
            <p>不論你想尋找陪伴，或是分享你的時間，都能從這裡開始。</p>
          </div>

          <div className="choice-tabs">
            <button
              className={activeTab === 'find' ? 'choice-tab active' : 'choice-tab'}
              onClick={() => setActiveTab('find')}
              type="button"
            >
              我想找人陪伴
            </button>
            <button
              className={activeTab === 'offer' ? 'choice-tab active' : 'choice-tab'}
              onClick={() => setActiveTab('offer')}
              type="button"
            >
              我想提供陪伴
            </button>
          </div>

          {activeTab === 'find' ? (
            <div className="choice-card">
              <div className="choice-icon">☀</div>
              <div className="choice-text">
                <h3>尋找一位適合你的同行夥伴</h3>
                <p>依照地區、活動、時間與預算，找到能陪你探索生活的人。</p>
              </div>
              <div className="choice-actions">
  <a href="#features" className="choice-link">
    探索陪伴者 <span>→</span>
  </a>

  <button
  type="button"
  className="choice-link"
  onClick={openRequestForm}
>
  發布旅遊需求 <span>＋</span>
</button>
</div>
            </div>
          ) : (
            <div className="choice-card">
              <div className="choice-icon">✿</div>
              <div className="choice-text">
                <h3>把你的時間與在地經驗分享出去</h3>
                <p>建立個人介紹與服務檔案，讓有需要的人認識你。</p>
              </div>
              <a href="#features" className="choice-link">
                了解如何加入 <span>→</span>
              </a>
            </div>
          )}
        </section>

        <section className="request-hall-section" id="requests">
          <div className="section-heading">
            <span className="section-kicker">TRAVEL REQUESTS</span>
            <h2>看看大家正在尋找什麼旅伴</h2>
            <p>瀏覽公開旅遊需求，找到適合一起出發的旅程。</p>
          </div>

          {!user ? (
            <div className="request-hall-guest">
              <div className="request-hall-guest-icon">✦</div>
              <h3>登入後，探索更多同行機會</h3>
              <p>成為一起去的會員，就能瀏覽公開委託並尋找適合的旅程。</p>
              <button
                type="button"
                className="request-hall-primary"
                onClick={() => openAuth('login')}
              >
                登入會員，瀏覽委託
              </button>
            </div>
          ) : (
            <>
              <div className="request-filter-panel">
                <div className="request-filter-field request-search-field">
                  <label htmlFor="request-keyword">搜尋旅程</label>
                  <input
                    id="request-keyword"
                    type="search"
                    value={requestKeyword}
                    onChange={(event) => setRequestKeyword(event.target.value)}
                    placeholder="輸入目的地、標題或需求內容"
                  />
                </div>

                <div className="request-filter-field">
                  <label htmlFor="request-start-date">出發日期（不早於）</label>
                  <input
                    id="request-start-date"
                    type="date"
                    value={requestStartDate}
                    onChange={(event) => setRequestStartDate(event.target.value)}
                  />
                </div>

                <div className="request-filter-field">
                  <label htmlFor="request-budget-limit">預算上限（元）</label>
                  <input
                    id="request-budget-limit"
                    type="number"
                    min="0"
                    value={requestBudgetLimit}
                    onChange={(event) => setRequestBudgetLimit(event.target.value)}
                    placeholder="不限預算"
                  />
                </div>

                <button
                  type="button"
                  className="request-filter-reset"
                  onClick={() => {
                    setRequestKeyword('')
                    setRequestStartDate('')
                    setRequestBudgetLimit('')
                  }}
                >
                  清除條件
                </button>
              </div>

              <div className="request-hall-toolbar">
                <p>
                  目前有 <strong>{filteredRequests.length}</strong> 筆符合條件的公開委託
                </p>
                <button
                  type="button"
                  className="request-refresh-button"
                  onClick={loadPublicRequests}
                  disabled={requestsLoading}
                >
                  {requestsLoading ? '更新中...' : '↻ 重新整理'}
                </button>
              </div>

              {requestsError && (
                <div className="request-state request-state-error" role="alert">
                  <strong>委託資料讀取失敗</strong>
                  <p>{requestsError}</p>
                  <button type="button" onClick={loadPublicRequests}>
                    再試一次
                  </button>
                </div>
              )}

              {requestsLoading ? (
                <div className="request-state">
                  <div className="request-loading-mark" />
                  <p>正在尋找適合的旅程...</p>
                </div>
              ) : !requestsError && filteredRequests.length === 0 ? (
                <div className="request-state">
                  <div className="request-empty-icon">☀</div>
                  <h3>
                    {publicRequests.length === 0
                      ? '目前還沒有公開的旅遊需求'
                      : '沒有符合這些搜尋條件的委託'}
                  </h3>
                  <p>
                    {publicRequests.length === 0
                      ? '成為第一位發布旅程的人，邀請大家一起出發。'
                      : '試著調整搜尋條件，或清除篩選後再看看。'}
                  </p>
                  {publicRequests.length === 0 ? (
                    <button
                      type="button"
                      className="request-hall-primary"
                      onClick={openRequestForm}
                    >
                      發布第一筆旅遊需求
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="request-filter-reset request-empty-reset"
                      onClick={() => {
                        setRequestKeyword('')
                        setRequestStartDate('')
                        setRequestBudgetLimit('')
                      }}
                    >
                      清除搜尋條件
                    </button>
                  )}
                </div>
              ) : (
                <div className="request-card-grid">
                  {filteredRequests.map((request) => (
                    <button
                      type="button"
                      className="request-card"
                      key={request.id}
                      onClick={() => setSelectedRequest(request)}
                    >
                      <div className="request-card-topline">
                        <span className="request-open-label">公開委託</span>
                        <span className="request-card-date">
                          {formatRequestDate(request.start_date)}
                        </span>
                      </div>
                      <h3>{request.title}</h3>
                      <div className="request-card-destination">
                        <span>⌖</span> {request.destination}
                      </div>
                      <p className="request-card-description">
                        {request.description}
                      </p>
                      <div className="request-card-bottom">
                        <span className="request-budget">
                          {formatRequestBudget(request.budget_min, request.budget_max)}
                        </span>
                        <span className="request-card-more">查看詳情 →</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="features-section" id="features">
          <div className="section-heading">
            <span className="section-kicker">WHY TOGETHER</span>
            <h2>不只是找個人陪你出門</h2>
            <p>我們希望建立的是一個能安心交流、彼此尊重的陪伴平台。</p>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <div className="feature-icon peach">⌖</div>
              <h3>找到適合的夥伴</h3>
              <p>依照興趣、地區、服務內容與時間，尋找符合期待的陪伴者。</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon green">♡</div>
              <h3>雙向交流與選擇</h3>
              <p>需求者與陪伴者都能表達想法，讓每一次合作建立在雙方同意之上。</p>
            </article>
            <article className="feature-card">
              <div className="feature-icon yellow">✧</div>
              <h3>真實的服務評價</h3>
              <p>從需求達成、聊天互動到整體感受，讓評價更貼近真實體驗。</p>
            </article>
          </div>
        </section>

        <section className="safety-section" id="safety">
          <div className="safety-mark">✓</div>
          <div>
            <span className="section-kicker">SAFETY & RESPECT</span>
            <h2>陪伴的前提，是安心與尊重。</h2>
            <p>
              我們重視每一次互動中的感受與界線。
              透過雙向評價、隱私回報與平台管理機制，
              讓每個人都能更安心地認識新夥伴。
            </p>
          </div>
          <a href="#how-it-works" className="safety-link">
            了解平台理念 →
          </a>
        </section>

        <section className="closing-section">
          <span className="section-kicker">YOUR JOURNEY STARTS HERE</span>
          <h2>
            下一段美好旅程，
            <br />
            等一個剛剛好的相遇。
          </h2>
          <a href="#how-it-works" className="primary-button">
            和我們一起出發 <span>→</span>
          </a>
        </section>
      </main>

      <footer className="footer">
        <a className="brand footer-brand" href="#">
          <span className="brand-icon">去</span>
          <span>一起去</span>
        </a>
        <p>讓每一段旅程，都有人同行。</p>
        <span className="copyright">© 2026 一起去 Together Go</span>
      </footer>

      {authMode && (
        <div
          className="auth-overlay"
          onClick={closeAuth}
        >
          <div
            className="auth-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="auth-close"
              type="button"
              onClick={closeAuth}
              aria-label="關閉"
            >
              ×
            </button>

            <div className="auth-brand-icon">去</div>

            <h2>
              {authMode === 'login' ? '歡迎回到一起去' : '加入一起去'}
            </h2>

            <p className="auth-description">
              {authMode === 'login'
                ? '登入帳號，繼續探索你的下一段旅程。'
                : '建立帳號，開啟你的陪伴與交流旅程。'}
            </p>

            <form onSubmit={handleAuth}>
              <label htmlFor="auth-email">電子郵件</label>
              <input
                id="auth-email"
                type="email"
                placeholder="請輸入電子郵件"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />

              <label htmlFor="auth-password">密碼</label>
              <input
                id="auth-password"
                type="password"
                placeholder="至少 6 個字元"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                autoComplete={
                  authMode === 'login' ? 'current-password' : 'new-password'
                }
              />

              {message && (
                <p className="auth-message" role="status">
                  {message}
                </p>
              )}

              <button
                className="auth-submit"
                type="submit"
                disabled={loading}
              >
                {loading
                  ? '處理中...'
                  : authMode === 'login'
                    ? '登入'
                    : '建立帳號'}
              </button>
            </form>

            <div className="auth-switch">
              {authMode === 'login' ? '還沒有帳號嗎？' : '已經有帳號了？'}
              <button
                type="button"
                onClick={() => openAuth(
                  authMode === 'login' ? 'signup' : 'login'
                )}
              >
                {authMode === 'login' ? '免費加入' : '立即登入'}
              </button>
            </div>
          </div>
        </div>
      )}

{showMemberCenter && (
        <div
          className="auth-overlay"
          onClick={() => setShowMemberCenter(false)}
        >
          <div
            className="auth-modal member-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="auth-close"
              type="button"
              onClick={() => setShowMemberCenter(false)}
            >
              ×
            </button>

            <h2>我的會員資料</h2>

            <p className="auth-description">
              管理你的基本資料與個人介紹。
            </p>

            {profileLoading ? (
              <p>正在讀取會員資料...</p>
            ) : (
              <form onSubmit={saveMemberProfile}>
                <h3>一、會員基本資料</h3>

                <label>姓名／顯示名稱</label>
                <input
                  value={memberForm.display_name}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      display_name: e.target.value,
                    })
                  }
                  placeholder="請輸入名稱"
                />

                <label>性別</label>
                <select
                  value={memberForm.gender}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      gender: e.target.value,
                    })
                  }
                >
                  <option value="">請選擇</option>
                  <option value="male">男性</option>
                  <option value="female">女性</option>
                  <option value="other">其他</option>
                  <option value="prefer_not_to_say">不透露</option>
                </select>

                <label>出生日期</label>
                <input
                  type="date"
                  value={memberForm.birth_date}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      birth_date: e.target.value,
                    })
                  }
                />

                <label>所在城市</label>
                <input
                  value={memberForm.city}
                  onChange={(e) =>
                    setMemberForm({
                      ...memberForm,
                      city: e.target.value,
                    })
                  }
                  placeholder="例如：台北市"
                />

                <h3>二、個人介紹與服務檔案</h3>

                <label>自我介紹</label>
                <textarea
                  value={profileForm.introduction}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      introduction: e.target.value,
                    })
                  }
                  placeholder="介紹一下自己..."
                  rows={4}
                />

                <label>興趣（使用逗號分隔）</label>
                <input
                  value={profileForm.interests}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      interests: e.target.value,
                    })
                  }
                  placeholder="例如：美食、登山、攝影"
                />

                <label>專長與技能（使用逗號分隔）</label>
                <input
                  value={profileForm.skills}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      skills: e.target.value,
                    })
                  }
                  placeholder="例如：導覽、攝影、語言"
                />

                <label>可服務地區（使用逗號分隔）</label>
                <input
                  value={profileForm.service_areas}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      service_areas: e.target.value,
                    })
                  }
                  placeholder="例如：台北市、新北市"
                />

                <label>可服務時間</label>
                <textarea
                  value={profileForm.availability}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      availability: e.target.value,
                    })
                  }
                  placeholder="例如：平日晚上、週末全天"
                  rows={2}
                />

                <label className="member-public-option">
                  <input
                    type="checkbox"
                    checked={profileForm.is_public}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        is_public: e.target.checked,
                      })
                    }
                  />
                  公開我的個人檔案
                </label>

                {profileMessage && (
                  <p className="auth-message" role="status">
                    {profileMessage}
                  </p>
                )}

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={profileSaving}
                >
                  {profileSaving ? '儲存中...' : '儲存會員資料'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
{selectedRequest && (
  <div
    className="auth-overlay"
    onClick={() => setSelectedRequest(null)}
  >
    <div
      className="auth-modal request-detail-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="auth-close"
        type="button"
        onClick={() => setSelectedRequest(null)}
        aria-label="關閉委託詳情"
      >
        ×
      </button>

      <span className="request-open-label request-detail-status">公開委託</span>
      <h2>{selectedRequest.title}</h2>
      <p className="request-detail-destination">
        ⌖ {selectedRequest.destination}
      </p>

      <div className="request-detail-info-grid">
        <div>
          <span>出發日期</span>
          <strong>{formatRequestDate(selectedRequest.start_date)}</strong>
        </div>
        <div>
          <span>結束日期</span>
          <strong>{formatRequestDate(selectedRequest.end_date)}</strong>
        </div>
        <div>
          <span>預算範圍</span>
          <strong>
            {formatRequestBudget(
              selectedRequest.budget_min,
              selectedRequest.budget_max
            )}
          </strong>
        </div>
      </div>

      <div className="request-detail-description">
        <h3>需求內容</h3>
        <p>{selectedRequest.description}</p>
      </div>

      <p className="request-detail-note">
        想進一步了解這筆委託，可以先記下需求內容；後續將逐步加入提案與聯絡功能。
      </p>
      <button
        type="button"
        className="auth-submit"
        onClick={() => setSelectedRequest(null)}
      >
        關閉詳情
      </button>
    </div>
  </div>
)}

{showRequestForm && (
  <div
    className="auth-overlay"
    onClick={() => setShowRequestForm(false)}
  >
    <div
      className="auth-modal member-modal"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        className="auth-close"
        type="button"
        onClick={() => setShowRequestForm(false)}
      >
        ×
      </button>

      <h2>發布旅遊需求</h2>

      <p className="auth-description">
        告訴大家你的旅程計畫，尋找適合的同行夥伴。
      </p>

      <form onSubmit={saveRequest}>
        <label>委託標題</label>
        <input
          value={requestForm.title}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              title: e.target.value,
            })
          }
          placeholder="例如：想找人一起探索九份"
          required
          maxLength={100}
        />

        <label>旅遊目的地</label>
        <input
          value={requestForm.destination}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              destination: e.target.value,
            })
          }
          placeholder="例如：新北市九份"
          required
        />

        <label>需求描述</label>
        <textarea
          value={requestForm.description}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              description: e.target.value,
            })
          }
          placeholder="請描述希望進行的活動、陪伴需求等..."
          rows={4}
          required
        />

        <label>開始日期</label>
        <input
          type="date"
          value={requestForm.start_date}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              start_date: e.target.value,
            })
          }
          required
        />

        <label>結束日期</label>
        <input
          type="date"
          value={requestForm.end_date}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              end_date: e.target.value,
            })
          }
          min={requestForm.start_date || undefined}
          required
        />

        <label>最低預算（元，可不填）</label>
        <input
          type="number"
          min="0"
          value={requestForm.budget_min}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              budget_min: e.target.value,
            })
          }
          placeholder="例如：1000"
        />

        <label>最高預算（元，可不填）</label>
        <input
          type="number"
          min="0"
          value={requestForm.budget_max}
          onChange={(e) =>
            setRequestForm({
              ...requestForm,
              budget_max: e.target.value,
            })
          }
          placeholder="例如：3000"
        />

        {requestMessage && (
          <p className="auth-message" role="status">
            {requestMessage}
          </p>
        )}

        <button
          className="auth-submit"
          type="submit"
          disabled={requestSaving}
        >
          {requestSaving ? '發布中...' : '確認發布需求'}
        </button>
      </form>
    </div>
  </div>
)}
    </div>
  )
}

export default App


