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
  const [quantities, setQuantities] = useState<Record<number, number>>({})

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
          i.menu_id === menu.id
            ? { ...i, quantity: i.quantity + qty }
            : i
        )
      }
      return [...prev, {
        menu_id: menu.id,
        name: menu.name,
        price: menu.price,
        quantity: qty
      }]
    })
    // 담고 나면 수량 1로 초기화
    setQuantities(prev => ({ ...prev, [menu.id]: 1 }))
  }

  const removeFromCart = (menuId: number) => {
    setCart(prev => prev.filter(i => i.menu_id !== menuId))
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
        <div className="px-4 py-3">
          <h1 className="font-bold text-lg text-black">🍺 축제 주점</h1>
          <p className="text-xs text-gray-500">{tableNumber}번 테이블</p>
        </div>
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
                const qty = getQuantity(menu.id)
                return (
                    <div key={menu.id} className="bg-white rounded-xl shadow-sm flex flex-col gap-2 overflow-hidden">
        {/* 메뉴 이미지 */}
        <div className="w-full h-30 aspect-square relative">
        {menu.image_url ? (
            <img
            src={menu.image_url}
            alt={menu.name}
            className="absolute inset-0 w-full h-full object-cover"
            />
        ) : (
            <div className="absolute inset-0 bg-gray-100 flex items-center justify-center">
            <span className="text-3xl">🍽</span>
            </div>
        )}
        </div>
        <div className="px-3 pb-3 flex flex-col gap-2">
        <div className="font-medium text-sm text-gray-800">{menu.name}</div>
        <div className="text-[#189ad3] font-bold">
            {menu.price.toLocaleString()}원
        </div>

              {/* 수량 선택 */}
              <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeQuantity(menu.id, -1)}
                    className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-bold text-sm"
                  >
                    −
                  </button>
                  <span className="font-bold text-sm w-4 text-center text-gray-700">{qty}</span>
                  <button
                    onClick={() => changeQuantity(menu.id, +1)}
                    className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 font-bold text-sm"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => addToCart(menu)}
                  className="px-3 py-1.5 rounded-lg bg-[#189ad3] text-white text-sm font-medium"
                >
                  담기
                </button>
              </div>

              {/* 이미 담긴 경우 표시 */}
              {cartItem && (
                <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-[#189ad3] font-medium">
                    장바구니 {cartItem.quantity}개
                  </span>
                  <button
                    onClick={() => removeFromCart(menu.id)}
                    className="text-xs text-gray-400"
                  >
                    빼기
                  </button>
                </div>
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