'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Menu, OrderItem } from '@/types'

const TABLE_FEE_PER_PERSON = 1000

// 세트 구성품 품절 시 대체 메뉴 (고객 메뉴명 기준)
const SET_SUBSTITUTIONS: Record<string, Record<string, string>> = {
  'A세트': { '오뎅탕': '일반 대패', '탕수육': '오뎅탕', '계란말이': '토스트' },
  'B세트': { '마라샹궈': '일반 대패', '탕수육': '오뎅탕' },
  'C세트': { '일반 대패': '마라샹궈', '오뎅탕': '탕수육', '불닭볶음면': '라면' },
}


type SetGroup = {
  id: number
  set_menu_id: number
  name: string
  min_select: number
  max_select: number
  items: Menu[]
}

function MenuContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tableNumber = Number(searchParams.get('table') ?? 1)

  const [menus, setMenus] = useState<Menu[]>([])
  const [cart, setCart] = useState<OrderItem[]>([])
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  const [personCount, setPersonCount] = useState<number | null>(null)
  const [selectedPerson, setSelectedPerson] = useState(2)
  const [showNotice, setShowNotice] = useState(false)

  const [setGroups, setSetGroups] = useState<Record<number, SetGroup[]>>({})
  const [activeSet, setActiveSet] = useState<Menu | null>(null)
  const [groupSelections, setGroupSelections] = useState<Record<number, number[]>>({})
  const [setQty, setSetQty] = useState(1)

  const [activeCategory, setActiveCategory] = useState('전체')
  const [activeDesc, setActiveDesc] = useState<Menu | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const saved = sessionStorage.getItem('personCount')
    if (saved) setPersonCount(Number(saved))

    const fetchData = async () => {
      const [menusRes, groupsRes, itemsRes] = await Promise.all([
        supabase.from('menus').select('*').order('category'),
        supabase.from('set_groups').select('*'),
        supabase.from('set_group_items').select('*')
      ])

      if (!menusRes.data) return
      setMenus(menusRes.data)

      if (groupsRes.data && itemsRes.data) {
        const menuMap = new Map(menusRes.data.map((m: Menu) => [m.id, m]))
        const itemsByGroup = new Map<number, Menu[]>()
        for (const row of itemsRes.data) {
          if (!itemsByGroup.has(row.group_id)) itemsByGroup.set(row.group_id, [])
          const menu = menuMap.get(row.menu_id)
          if (menu) itemsByGroup.get(row.group_id)!.push(menu)
        }
        const grouped: Record<number, SetGroup[]> = {}
        for (const g of groupsRes.data) {
          if (!grouped[g.set_menu_id]) grouped[g.set_menu_id] = []
          grouped[g.set_menu_id].push({ ...g, items: itemsByGroup.get(g.id) ?? [] })
        }
        setSetGroups(grouped)
      }
    }
    fetchData()

    const channel = supabase
      .channel('menus-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'menus' }, (payload) => {
        const updated = payload.new as Menu
        setMenus(prev => prev.map(m => m.id === updated.id ? updated : m))
      })
      .subscribe()

    // Publications 미설정 대비: 5초마다 메뉴 가용성 재조회
    const fetchMenusOnly = async () => {
      const { data } = await supabase.from('menus').select('*')
      if (data) setMenus(data)
    }
    const menuPoll = setInterval(fetchMenusOnly, 5_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(menuPoll)
    }
  }, [])

  const confirmPersonCount = () => {
    setShowNotice(true)
  }

  const confirmNotice = () => {
    sessionStorage.setItem('personCount', String(selectedPerson))
    setPersonCount(selectedPerson)
    setShowNotice(false)
  }

  const goAdditionalOrder = () => {
    sessionStorage.setItem('personCount', '0')
    setPersonCount(0)
  }

  const getQuantity = (menuId: number) => quantities[menuId] ?? 1

  const changeQuantity = (menuId: number, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [menuId]: Math.max(1, (prev[menuId] ?? 1) + delta)
    }))
  }

  const addToCart = (menu: Menu) => {
    const qty = getQuantity(menu.id)
    setCart(prev => {
      const existing = prev.find(i => i.menu_id === menu.id)
      if (existing) {
        return prev.map(i =>
          i.menu_id === menu.id ? { ...i, quantity: i.quantity + qty } : i
        )
      }
      return [...prev, {
        menu_id: menu.id,
        name: menu.name,
        admin_name: menu.admin_name ?? undefined,
        price: menu.price,
        quantity: qty,
      }]
    })
    setQuantities(prev => ({ ...prev, [menu.id]: 1 }))
  }

  const removeFromCart = (menuId: number, name?: string) => {
    setCart(prev => prev.filter(i => {
      if (i.menu_id !== menuId) return true
      if (name !== undefined) return i.name !== name
      return false
    }))
  }

  const openSetModal = (setMenu: Menu) => {
    setActiveSet(setMenu)
    setSetQty(1)
    const initial: Record<number, number[]> = {}
    for (const g of setGroups[setMenu.id] ?? []) initial[g.id] = []
    setGroupSelections(initial)
  }

  const isChoiceGroup = (g: SetGroup) => g.max_select < g.items.length

  const toggleSelection = (groupId: number, menuId: number, maxSelect: number) => {
    setGroupSelections(prev => {
      const current = prev[groupId] ?? []
      if (current.includes(menuId)) {
        return { ...prev, [groupId]: current.filter(id => id !== menuId) }
      }
      if (maxSelect === 1) return { ...prev, [groupId]: [menuId] }
      if (current.length < maxSelect) return { ...prev, [groupId]: [...current, menuId] }
      return { ...prev, [groupId]: [...current.slice(0, maxSelect - 1), menuId] }
    })
  }

  const isSelectionComplete = () => {
    if (!activeSet) return false
    return (setGroups[activeSet.id] ?? []).every(g => {
      if (!isChoiceGroup(g)) return true
      return (groupSelections[g.id] ?? []).length >= g.min_select
    })
  }

  const addSetToCart = () => {
    if (!activeSet || !isSelectionComplete()) return

    const fixedGroups = (setGroups[activeSet.id] ?? []).filter(g => !isChoiceGroup(g))
    const fixedLabels = fixedGroups.flatMap(g => g.items.map(i => resolveSubstitute(activeSet.name, i)))
    const fixedAdminLabels = fixedGroups.flatMap(g => g.items.map(i => resolveSubstituteAdmin(activeSet.name, i)))

    const choiceGroups = (setGroups[activeSet.id] ?? []).filter(isChoiceGroup)
    const choiceLabels = choiceGroups
      .map(g =>
        (groupSelections[g.id] ?? [])
          .map(id => g.items.find(i => i.id === id)?.name)
          .filter(Boolean)
          .join(', ')
      )
      .filter(Boolean)
    const choiceAdminLabels = choiceGroups
      .map(g =>
        (groupSelections[g.id] ?? [])
          .map(id => { const item = g.items.find(i => i.id === id); return item?.admin_name || item?.name })
          .filter(Boolean)
          .join(', ')
      )
      .filter(Boolean)

    const allLabels = [...fixedLabels, ...choiceLabels]
    const allAdminLabels = [...fixedAdminLabels, ...choiceAdminLabels]

    const name = allLabels.length > 0
      ? `${activeSet.name} (${allLabels.join(' · ')})`
      : activeSet.name
    const admin_name = allAdminLabels.length > 0
      ? `${activeSet.admin_name || activeSet.name} (${allAdminLabels.join(' · ')})`
      : (activeSet.admin_name || activeSet.name)

    setCart(prev => {
      const existing = prev.find(i => i.menu_id === activeSet.id && i.name === name)
      if (existing) {
        return prev.map(i =>
          i.menu_id === activeSet.id && i.name === name
            ? { ...i, quantity: i.quantity + setQty }
            : i
        )
      }
      return [...prev, { menu_id: activeSet.id, name, admin_name, price: activeSet.price, quantity: setQty }]
    })
    setActiveSet(null)
  }

  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)
  const menuCategoryMap = new Map(menus.map(m => [m.id, m.category]))
  const menuAvailableMap = new Map(menus.map(m => [m.id, m.is_available]))
  // admin_name(짧은 이름) → 고객용 전체 이름 매핑
  const adminToCustomerName = new Map(menus.map(m => [(m.admin_name || m.name).trim(), m.name]))

  // 품절 시 대체 메뉴 이름(고객용) 반환 — admin_name 기준으로 매칭
  const resolveSubstitute = (setName: string, item: Menu): string => {
    const isAvail = menuAvailableMap.get(item.id) ?? true
    if (isAvail) return item.name
    const key = (item.admin_name || item.name).trim()
    const subKey = SET_SUBSTITUTIONS[setName.trim()]?.[key]
    if (!subKey) return item.name
    return adminToCustomerName.get(subKey.trim()) ?? item.name
  }

  // admin 표시용 대체 이름 반환
  const resolveSubstituteAdmin = (setName: string, item: Menu): string => {
    const isAvail = menuAvailableMap.get(item.id) ?? true
    if (isAvail) return item.admin_name || item.name
    const key = (item.admin_name || item.name).trim()
    return SET_SUBSTITUTIONS[setName.trim()]?.[key] ?? (item.admin_name || item.name)
  }

  const isSetMenu = (menuId: number) => menuId in setGroups
  const isAdditionalOrder = personCount === 0

  const requiredMainCount = (!isAdditionalOrder && personCount) ? Math.floor(personCount / 2) : 0
  const mainMenuCount = cart.reduce((sum, i) => {
    const cat = menuCategoryMap.get(i.menu_id) ?? ''
    if (cat === '메인' || cat === '메인메뉴') return sum + i.quantity
    if (isSetMenu(i.menu_id)) {
      const groups = setGroups[i.menu_id] ?? []
      const fixedMainCount = groups
        .filter(g => !isChoiceGroup(g))
        .flatMap(g => g.items)
        .filter(item => {
          const c = menuCategoryMap.get(item.id) ?? ''
          return c === '메인' || c === '메인메뉴'
        }).length
      return sum + fixedMainCount * i.quantity
    }
    return sum
  }, 0)
  const meetsMinOrder = isAdditionalOrder || mainMenuCount >= requiredMainCount

  // 세트를 맨 앞으로
  const CATEGORY_ORDER = ['세트', '이벤트', '메인메뉴', '사이드메뉴', '음료']
  const rawCategoryOrder = Array.from(new Set(menus.map(m => m.category)))
  const categoryOrder = [
    ...CATEGORY_ORDER.filter(c => rawCategoryOrder.includes(c)),
    ...rawCategoryOrder.filter(c => !CATEGORY_ORDER.includes(c)),
  ]

  const menusByCategory = categoryOrder.map(cat => {
    const items = menus.filter(m => m.category === cat)
    const sorted = cat === '세트'
      ? [...items].sort((a, b) => a.name.localeCompare(b.name))
      : [...items].sort((a, b) => b.price - a.price)
    return { category: cat, items: sorted }
  })

  const visibleCategories = activeCategory === '전체'
    ? menusByCategory
    : menusByCategory.filter(({ category }) => category === activeCategory)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const goToPayment = () => {
    if (!meetsMinOrder) {
      const needed = requiredMainCount - mainMenuCount
      showToast(`2인당 메인메뉴 1개 이상 주문해주세요 🙏\n메인메뉴가 ${needed}개 더 필요해요!`)
      return
    }
    sessionStorage.setItem('cart', JSON.stringify(cart))
    sessionStorage.setItem('tableNumber', String(tableNumber))
    router.push('/order')
  }

  // ── 자리 비움 안내 화면 ──────────────────────────────────
  if (personCount === null && showNotice) {
    return (
      <div className="min-h-screen bg-[#1c1208] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col items-center gap-7">
          <div className="text-8xl text-center">⏰</div>

          <div className="w-full bg-[#e07640] rounded-3xl px-6 py-8 text-center shadow-2xl">
            <p className="text-white/80 font-bold text-base mb-3 tracking-wide">주의사항</p>
            <p className="text-white font-black leading-tight" style={{ fontSize: '2rem' }}>
              15분 이상<br />자리 비울 시<br />테이블이 정리됩니다
            </p>
            <div className="w-16 h-0.5 bg-white/30 mx-auto my-4" />
            <p className="text-white/70 text-sm leading-relaxed">
              분실 시 책임지지 않습니다
            </p>
          </div>

          <button
            onClick={confirmNotice}
            className="w-full py-5 bg-white text-[#1c1208] rounded-2xl font-black text-xl shadow-md active:scale-95 transition-transform"
          >
            확인했어요 →
          </button>
        </div>
      </div>
    )
  }

  // ── 인원수 선택 화면 ──────────────────────────────────────
  if (personCount === null) {
    return (
      <div className="min-h-screen bg-[#1c1208] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm flex flex-col items-center gap-6">
          <div className="text-center">
            <div className="text-5xl mb-4">🏮</div>
            <h1 className="font-bold text-2xl text-amber-50 tracking-tight">게스트하우스융</h1>
            <p className="text-amber-300/60 text-sm mt-1">{tableNumber}번 테이블에 오신 걸 환영해요</p>
          </div>

          <div className="bg-[#faf5ee] rounded-3xl p-6 w-full flex flex-col gap-5">
            <p className="text-sm font-semibold text-[#5c3d1e] text-center">
              인원수를 선택해주세요.
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <button
                  key={n}
                  onClick={() => setSelectedPerson(n)}
                  className={`py-3.5 rounded-2xl font-bold text-lg transition-all
                    ${selectedPerson === n
                      ? 'bg-[#e07640] text-white shadow-md'
                      : 'bg-white text-[#5c3d1e] shadow-sm'}`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-center">
              <p className="text-xs text-amber-700/70 mb-0.5">테이블비</p>
              <p className="font-bold text-[#e07640] text-xl">
                {(TABLE_FEE_PER_PERSON * selectedPerson).toLocaleString()}원
              </p>
              <p className="text-xs text-amber-700/50 mt-0.5">
                {selectedPerson}명 × {TABLE_FEE_PER_PERSON.toLocaleString()}원
              </p>
            </div>

            <button
              onClick={confirmPersonCount}
              className="w-full py-4 bg-[#e07640] text-white rounded-2xl font-bold text-base shadow-md active:scale-95 transition-transform"
            >
              메뉴 보러 가기 →
            </button>
          </div>

          <div className="w-full flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 h-px bg-amber-200/20" />
              <span className="text-xs text-amber-300/40">또는</span>
              <div className="flex-1 h-px bg-amber-200/20" />
            </div>
            <button
              onClick={goAdditionalOrder}
              className="w-full py-4 bg-white/10 border border-white/20 text-amber-100 rounded-2xl font-semibold text-base active:bg-white/20 transition"
            >
              추가 주문하기
              <span className="block text-xs text-amber-300/50 font-normal mt-0.5">
                이미 테이블비를 내셨나요? 여기서 시작하세요
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 메뉴 화면 ──────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#faf5ee]">
      {/* 헤더 + 카테고리 탭 */}
      <div className="bg-[#1c1208] sticky top-0 z-10">
        <div className="px-4 pt-4 pb-3 flex justify-between items-start">
          <div>
            <h1 className="font-bold text-lg text-amber-50 tracking-tight">🏮 게스트하우스융</h1>
            <p className="text-xs text-amber-300/50 mt-0.5">
              {tableNumber}번 테이블 · {isAdditionalOrder ? '추가 주문' : `${personCount}명`}
            </p>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('personCount')
              setPersonCount(null)
            }}
            className="text-xs text-amber-200/40 border border-amber-200/20 px-2.5 py-1 rounded-lg mt-1 active:bg-white/10 transition"
          >
            {isAdditionalOrder ? '처음으로' : '인원 변경'}
          </button>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex overflow-x-auto border-t border-white/5" style={{ scrollbarWidth: 'none' }}>
          {['전체', ...categoryOrder].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2
                ${activeCategory === cat
                  ? 'text-amber-50 border-[#e07640]'
                  : 'text-amber-300/40 border-transparent'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 카테고리별 메뉴 */}
      <div className="pb-36">
        {visibleCategories.map(({ category, items }, sectionIdx) => (
          <div key={category}>
            {activeCategory === '전체' ? (
              <div className={`px-4 pt-6 pb-3 ${sectionIdx > 0 ? 'mt-2' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-base text-[#1c1208]">{category}</span>
                  <div className="flex-1 h-px bg-[#d4a87a]/30" />
                </div>
              </div>
            ) : (
              <div className="h-5" />
            )}

            <div className="px-4 flex flex-col gap-2">
              {items.map(menu => {
                const cartItems = cart.filter(i => i.menu_id === menu.id)
                const isSet = isSetMenu(menu.id)
                const groups = setGroups[menu.id] ?? []

                if (isSet) {
                  return (
                    <div
                      key={menu.id}
                      className={`bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden ${!menu.is_available ? 'opacity-50' : ''}`}
                    >
                      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs bg-[#e07640] text-white px-2 py-0.5 rounded-full font-semibold">
                              세트
                            </span>
                            <span className="font-bold text-base text-[#1c1208]">{menu.name}</span>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            {menu.original_price ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-gray-400 text-sm line-through">
                                  {menu.original_price.toLocaleString()}원
                                </span>
                                <span className="text-[#e07640] font-bold text-base">
                                  {menu.price === 0 ? '무료' : `${menu.price.toLocaleString()}원`}
                                </span>
                              </div>
                            ) : (
                              <p className="text-[#e07640] font-bold text-base">
                                {menu.price.toLocaleString()}원
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {groups.map(g => (
                              <div key={g.id} className="flex items-start gap-1.5 text-xs text-[#5c3d1e]/80">
                                {isChoiceGroup(g) ? (
                                  <>
                                    <span className="bg-amber-200 text-amber-800 rounded px-1 py-0.5 font-semibold shrink-0 leading-relaxed">
                                      택1
                                    </span>
                                    <span className="leading-relaxed">
                                      {g.items.filter(i => menuAvailableMap.get(i.id) ?? true).map(i => i.name).join(' 또는 ')}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-amber-500 mt-0.5 shrink-0">✦</span>
                                    <span className="leading-relaxed flex flex-col gap-0.5">
                                      {g.items.map(i => (
                                        <span key={i.id}>{resolveSubstitute(menu.name, i)}</span>
                                      ))}
                                    </span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {menu.is_available ? (
                          <button
                            onClick={() => openSetModal(menu)}
                            className="px-3 py-2 rounded-xl bg-[#e07640] text-white text-sm font-semibold shrink-0 shadow-sm active:scale-95 transition-transform"
                          >
                            선택
                          </button>
                        ) : (
                          <span className="px-3 py-2 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold shrink-0">
                            품절
                          </span>
                        )}
                      </div>

                      {cartItems.length > 0 && (
                        <div className="border-t border-amber-200 px-4 py-2 flex flex-col gap-1">
                          {cartItems.map(cartItem => (
                            <div key={cartItem.name} className="flex items-center justify-between">
                              <span className="text-xs text-amber-700 font-medium">
                                ✓ {cartItem.name} · {cartItem.quantity}개
                              </span>
                              <button
                                onClick={() => removeFromCart(menu.id, cartItem.name)}
                                className="text-xs text-amber-400"
                              >
                                취소
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <div key={menu.id} className={`bg-white rounded-2xl shadow-sm overflow-hidden ${!menu.is_available ? 'opacity-50' : ''}`}>
                    <div className="px-4 py-3.5 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-[#1c1208] leading-snug">{menu.name}</p>
                        {menu.original_price ? (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-gray-400 text-xs line-through">
                              {menu.original_price.toLocaleString()}원
                            </span>
                            <span className="text-[#e07640] font-bold text-sm">
                              {menu.price === 0 ? '무료' : `${menu.price.toLocaleString()}원`}
                            </span>
                          </div>
                        ) : (
                          <p className="text-[#e07640] font-bold text-sm mt-0.5">
                            {menu.price.toLocaleString()}원
                          </p>
                        )}
                      </div>
                      {menu.is_available ? (
                        <button
                          onClick={() => setActiveDesc(menu)}
                          className="px-3 py-2 rounded-xl bg-[#e07640] text-white text-sm font-semibold shrink-0 shadow-sm active:scale-95 transition-transform"
                        >
                          선택
                        </button>
                      ) : (
                        <span className="px-3 py-2 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold shrink-0">
                          품절
                        </span>
                      )}
                    </div>

                    {cartItems.length > 0 && (
                      <div className="border-t border-[#faf5ee] px-4 py-2 flex items-center justify-between bg-orange-50">
                        <span className="text-xs text-[#e07640] font-semibold">
                          ✓ 장바구니 {cartItems[0].quantity}개
                        </span>
                        <button
                          onClick={() => removeFromCart(menu.id)}
                          className="text-xs text-gray-400"
                        >
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        <div className="h-4" />
      </div>

      {/* ── 세트 선택 모달 ── */}
      {activeSet && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setActiveSet(null)}
        >
          <div
            className="bg-[#faf5ee] w-full rounded-t-3xl flex flex-col max-h-[88vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-[#d4a87a]/40" />
            </div>

            <div className="overflow-y-auto px-6 pb-8 flex flex-col gap-5">
              <div className="flex justify-between items-start pt-2">
                <div>
                  <span className="text-xs bg-[#e07640] text-white px-2 py-0.5 rounded-full font-semibold">세트</span>
                  <h2 className="font-bold text-xl text-[#1c1208] mt-1.5">{activeSet.name}</h2>
                  <p className="text-[#e07640] font-bold text-lg">{activeSet.price.toLocaleString()}원</p>
                </div>
                <button
                  onClick={() => setActiveSet(null)}
                  className="w-8 h-8 rounded-full bg-[#e8d9c5] text-[#5c3d1e] flex items-center justify-center text-lg font-medium mt-1"
                >
                  ×
                </button>
              </div>

              {(setGroups[activeSet.id] ?? []).map(g => (
                <div key={g.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="font-semibold text-sm text-[#1c1208]">{g.name}</p>
                    {isChoiceGroup(g) && (
                      <span className="text-xs bg-amber-100 text-amber-700 border border-amber-300 px-2 py-0.5 rounded-full font-medium">
                        {g.min_select}개 선택
                      </span>
                    )}
                  </div>

                  {isChoiceGroup(g) ? (
                    <div className="flex flex-col gap-2">
                      {g.items.filter(item => menuAvailableMap.get(item.id) ?? true).map(item => {
                        const selected = (groupSelections[g.id] ?? []).includes(item.id)
                        return (
                          <button
                            key={item.id}
                            onClick={() => toggleSelection(g.id, item.id, g.max_select)}
                            className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all text-left active:scale-[0.98]
                              ${selected
                                ? 'border-[#e07640] bg-orange-50'
                                : 'border-[#e8d9c5] bg-white'}`}
                          >
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                              ${selected ? 'border-[#e07640] bg-[#e07640]' : 'border-[#c4a07a]'}`}>
                              {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                            <span className={`font-medium text-sm ${selected ? 'text-[#e07640]' : 'text-[#1c1208]'}`}>
                              {item.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-[#e8d9c5] px-4 py-3 flex flex-col gap-2">
                      {g.items.map(item => (
                        <div key={item.id} className="flex items-center gap-2 text-sm text-[#5c3d1e]">
                          <span className="text-amber-400">✦</span>
                          <span>{resolveSubstitute(activeSet.name, item)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-center gap-5 py-2">
                <button
                  onClick={() => setSetQty(q => Math.max(1, q - 1))}
                  className="w-10 h-10 rounded-full bg-[#e8d9c5] text-[#5c3d1e] font-bold text-xl flex items-center justify-center active:scale-90 transition-transform"
                >
                  −
                </button>
                <span className="font-bold text-xl text-[#1c1208] w-8 text-center">{setQty}</span>
                <button
                  onClick={() => setSetQty(q => q + 1)}
                  className="w-10 h-10 rounded-full bg-[#e8d9c5] text-[#5c3d1e] font-bold text-xl flex items-center justify-center active:scale-90 transition-transform"
                >
                  +
                </button>
              </div>

              <button
                onClick={addSetToCart}
                disabled={!isSelectionComplete()}
                className="w-full py-4 bg-[#e07640] text-white rounded-2xl font-bold text-base shadow-md disabled:opacity-40 active:scale-95 transition-all"
              >
                {isSelectionComplete()
                  ? `장바구니에 담기 · ${(activeSet.price * setQty).toLocaleString()}원`
                  : '메뉴를 선택해주세요'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 메뉴 설명 모달 ── */}
      {activeDesc && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setActiveDesc(null)}
        >
          <div
            className="bg-[#faf5ee] w-full rounded-t-3xl flex flex-col max-h-[85vh] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-[#d4a87a]/40" />
            </div>

            <div className="overflow-y-auto flex flex-col">
              {/* 메뉴명 + 가격 헤더 */}
              <div className="px-6 pt-2 pb-4 flex justify-between items-start border-b border-[#e8d9c5]">
                <div>
                  <p className="font-black text-2xl text-[#1c1208] leading-tight">{activeDesc.name}</p>
                  {activeDesc.original_price ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-gray-400 line-through text-base">
                        {activeDesc.original_price.toLocaleString()}원
                      </span>
                      <span className="text-[#e07640] font-bold text-xl">
                        {activeDesc.price === 0 ? '무료' : `${activeDesc.price.toLocaleString()}원`}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[#e07640] font-bold text-xl mt-1">
                      {activeDesc.price.toLocaleString()}원
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setActiveDesc(null)}
                  className="w-8 h-8 rounded-full bg-[#e8d9c5] text-[#5c3d1e] flex items-center justify-center text-lg font-medium mt-1 shrink-0"
                >
                  ×
                </button>
              </div>

              {/* 설명 */}
              {activeDesc.description && (
                <div className="px-6 py-5">
                  <p className="text-base text-[#3d2410] leading-loose tracking-wide whitespace-pre-line">
                    {activeDesc.description}
                  </p>
                </div>
              )}

              {/* 수량 + 담기 버튼 */}
              <div className="px-6 pb-8 pt-2 flex flex-col gap-4 border-t border-[#e8d9c5]">
                <div className="flex items-center justify-center gap-6 py-2">
                  <button
                    onClick={() => changeQuantity(activeDesc.id, -1)}
                    className="w-11 h-11 rounded-full bg-[#e8d9c5] text-[#5c3d1e] font-bold text-2xl flex items-center justify-center active:scale-90 transition-transform"
                  >
                    −
                  </button>
                  <span className="font-black text-2xl text-[#1c1208] w-10 text-center">
                    {getQuantity(activeDesc.id)}
                  </span>
                  <button
                    onClick={() => changeQuantity(activeDesc.id, +1)}
                    className="w-11 h-11 rounded-full bg-[#e8d9c5] text-[#5c3d1e] font-bold text-2xl flex items-center justify-center active:scale-90 transition-transform"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => { addToCart(activeDesc); setActiveDesc(null) }}
                  className="w-full py-4 bg-[#e07640] text-white rounded-2xl font-bold text-base shadow-md active:scale-95 transition-all"
                >
                  장바구니에 담기 · {(activeDesc.price * getQuantity(activeDesc.id)).toLocaleString()}원
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
          <div className="bg-[#1c1208] text-amber-50 rounded-2xl px-5 py-4 shadow-2xl text-center animate-fade-in">
            {toast.split('\n').map((line, i) => (
              <p key={i} className={i === 0 ? 'font-bold text-sm' : 'text-xs text-amber-300/70 mt-1'}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* 주문하기 버튼 */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-linear-to-t from-[#faf5ee] via-[#faf5ee] to-transparent">
          {!isAdditionalOrder && requiredMainCount > 0 && (
            <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl mb-2 text-sm font-semibold
              ${meetsMinOrder
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-800'}`}
            >
              <span>
                {meetsMinOrder
                  ? `✓ 메인메뉴 조건 충족`
                  : `메인메뉴 ${requiredMainCount}개 이상 주문해주세요`}
              </span>
              <span className={`font-black ${meetsMinOrder ? 'text-green-600' : 'text-amber-700'}`}>
                {mainMenuCount} / {requiredMainCount}
              </span>
            </div>
          )}
          <button
            onClick={goToPayment}
            className="w-full py-4 bg-[#1c1208] text-amber-50 rounded-2xl font-bold text-base flex justify-between items-center px-5 shadow-xl active:scale-[0.98] transition-transform"
          >
            <span className="bg-[#e07640] rounded-full px-2.5 py-0.5 text-sm text-white font-bold">
              {cartCount}
            </span>
            <span>주문하기</span>
            <span className="text-amber-300 font-bold">{totalPrice.toLocaleString()}원</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default function MenuPage() {
  return (
    <Suspense>
      <MenuContent />
    </Suspense>
  )
}
