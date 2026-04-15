export type Menu = {
  id: number
  name: string
  price: number
  category: string
  is_available: boolean
  image_url: string | null
}

export type OrderItem = {
  menu_id: number
  name: string
  price: number
  quantity: number
}

export type Order = {
  id: number
  table_number: number
  items: OrderItem[]
  total_price: number
  status: 'pending' | 'confirmed'
  created_at: string
  receipt_url?: string
}