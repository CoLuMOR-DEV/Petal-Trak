export type UserRole = 'customer' | 'owner' | 'system';

export interface CustomerUser {
  id: string;
  username?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  age?: number;
  role: UserRole;
  createdAt?: string;
}

export type FlowerType = 'rose' | 'dahlia' | 'tulip' | 'peony' | 'sunflower' | 'carnation' | 'lily' | (string & {});

export type FlowerColor = 
  | 'Pastel Pink'
  | 'Pink'
  | 'Violet'
  | 'White'
  | 'Yellow'
  | 'Sage Green'
  | 'Emerald'
  | 'Brown';

export type WrapperColor = 
  | 'Transparent Rainbow'
  | 'Green'
  | 'Yellow'
  | 'Brown'
  | 'Violet'
  | 'Pink'
  | 'White';

export type RibbonColor = 
  | 'Yellow'
  | 'Green'
  | 'Pink'
  | 'Violet'
  | 'Emerald'
  | 'Brown';

export interface ProductItem {
  id: string;
  name: string;
  flowerType: FlowerType;
  basePrice: number;
  description: string;
  badge: string;
  imageUrl: string;
  availableColors: FlowerColor[];
  active: boolean;
  updatedAt?: string;
}

export interface CartItem {
  id: string;
  type: 'premade' | 'customized';
  flowerType: FlowerType;
  flowerName: string;
  color?: FlowerColor;
  colors?: FlowerColor[];
  stemsCount: number;
  wrapperColor?: WrapperColor;
  ribbonColor?: RibbonColor;
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  createdAt: string;
}

export type PaymentMode = 
  | 'GCash'
  | 'Cash on Delivery / Pick-up'
  | 'Cash on Pick-up / Delivery'
  | 'Maya'
  | 'Bank Transfer (BDO/BPI)';

export type PaymentStatus = 'pending' | 'partial' | 'paid';

export type OrderStatus = 'pending' | 'in-progress' | 'completed' | 'delivered' | 'cancelled';

export interface CustomerOrderSnapshot {
  name: string;
  email: string;
  phone: string;
  address: string;
  age?: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerInfo: CustomerOrderSnapshot;
  items: CartItem[];
  totalAmount: number;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  balance: number;
  status: OrderStatus;
  deadline?: string;
  notes?: string;
  deviceId?: string;
  deviceFingerprint?: string;
  rating?: number;
  ratingComment?: string;
  ratingSatisfied?: boolean;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: 'customer' | 'owner' | 'system';
  receiptSent?: boolean;
  receiptSentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderId: string;
  senderRole: UserRole;
  senderName: string;
  text: string;
  createdAt: string;
}

export type InventoryCategory = 'flower' | 'color' | 'wrapper' | 'ribbon' | 'craft_supply';

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  stock: number;
  unit: string;
  lowStockThreshold: number;
  colorHex?: string;
  updatedAt?: string;
}

export interface ShowcasePhotoItem {
  id: string;
  name: string;
  price: string;
  imageUrl: string;
  alt?: string;
  flowerType?: 'rose' | 'dahlia';
}

export interface StudioSettings {
  id?: string;
  businessName: string;
  ownerName: string;
  ownerTitle: string;
  headline?: string;
  ownerIntro: string;
  story: string;
  ownerPhotoUrl?: string;
  contactPhone: string;
  contactEmail: string;
  pickupAddress: string;
  facebookPage?: string;
  instagramHandle?: string;
  twoFactorEmails?: string;
  senderEmail?: string;
  showcasePhotos?: ShowcasePhotoItem[];
  updatedAt?: string;
}
