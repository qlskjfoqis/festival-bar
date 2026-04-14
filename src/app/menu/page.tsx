'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Menu, OrderItem } from '@/types'

function MenuContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tableNumber = Number(searchParams.get('table') ?? 1)

  const [menus, setMenus] = useState<Menu[]>([])
  const [cart, setCart] = useState<OrderItem[]>([])
  const [activeCategory, setActiveCategory] = useState('전체')

  useEffect(() => {
    const fetchMenus = async () => {
      const { data } = await supabase
        .from('menus')
        .select('*')
        .eq('is_available', true)
        .order('category')
      if (data) setMenus(data)
    }
    fetchMenus()
  }, [])

  const addToCart = (menu: Menu) => {
    setCart(prev => {
      const existing = prev.find(i => i.menu_id === menu.id)
      if (existing) {
        return prev.map(i =>
          i.menu_id === menu.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, {
        menu_id: menu.id,
        name: menu.name,
        price: menu.price,
        quantity: 1
      }]
    })
  }

  const removeFromCart = (menuId: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.menu_id === menuId)
      if (existing?.quantity === 1) {
        return prev.filter(i => i.menu_id !== menuId)
      }
      return prev.map(i =>
        i.menu_id === menuId
          ? { ...i, quantity: i.quantity - 1 }
          : i
      )
    })
  }

  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0)

  const categories = ['전체', ...Array.from(new Set(menus.map(m => m.category)))]
  const filtered = activeCategory === '전체'
    ? menus
    : menus.filter(m => m.category === activeCategory)

  const goToPayment = () => {
    sessionStorage.setItem('cart', JSON.stringify(cart))
    sessionStorage.setItem('tableNumber', String(tableNumber))
    router.push('/order')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white sticky top-0 z-10 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg text-black">🍺 축제 주점</h1>
            <p className="text-xs text-gray-700">{tableNumber}번 테이블</p>
          </div>
        </div>

        {/* 카테고리 탭 */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition
                ${activeCategory === cat
                  ? 'bg-[#189ad3] text-white'
                  : 'bg-gray-100 text-gray-600'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 메뉴 목록 */}
      <div className="p-4 grid grid-cols-2 gap-3 pb-32">
        {filtered.map(menu => {
          const cartItem = cart.find(i => i.menu_id === menu.id)
          return (
            <div key={menu.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="font-medium text-sm text-black">{menu.name}</div>
              <div className="text-[#189ad3] font-bold mt-1">
                {menu.price.toLocaleString()}원
              </div>
              <div className="mt-3 flex items-center justify-between">
                {cartItem ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => removeFromCart(menu.id)}
                      className="w-7 h-7 rounded-full bg-orange-100 text-[#189ad3] font-bold"
                    >−</button>
                    <span className="font-bold text-gray-700">{cartItem.quantity}</span>
                    <button
                      onClick={() => addToCart(menu)}
                      className="w-7 h-7 rounded-full bg-[#189ad3] text-white font-bold"
                    >+</button>
                  </div>
                ) : (
                  <button
                    onClick={() => addToCart(menu)}
                    className="w-full py-1.5 rounded-lg bg-[#189ad3] text-white text-sm font-medium"
                  >
                    담기
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 하단 장바구니 버튼 */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
          <button
            onClick={goToPayment}
            className="w-full py-4 bg-[#189ad3] text-white rounded-xl font-bold text-base flex justify-between items-center px-5"
          >
            <span className="bg-[#189ad3] rounded-full px-2 py-0.5 text-sm">
              {cartCount}
            </span>
            <span>주문하기</span>
            <span>{totalPrice.toLocaleString()}원</span>
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