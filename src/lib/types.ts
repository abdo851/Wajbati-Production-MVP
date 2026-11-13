export type Role = "customer" | "chef" | "admin" | "driver";
export type OrderStatus = "pending" | "confirmed" | "assigned" | "picked_up" | "delivered" | "cancelled";
export type DriverAccountStatus = "pending" | "approved" | "rejected";
export type ChefApprovalStatus = "pending" | "approved" | "rejected";

export type StaffAccount = {
  id: string;
  name: string;
  role: "chef" | "driver";
  status: string;
  city: string;
  email: string;
};
export type ChefDocumentKind = "cin_front" | "cin_back" | "auto_entrepreneur";
export type Vehicle = "bike" | "motorbike" | "car";
export type DocumentKind = "cin_front" | "cin_back" | "license" | "vehicle_papers";
export type PaymentMethod = "cash" | "wallet";
export type PaymentStatus = "unpaid" | "due_on_delivery" | "pending" | "paid";
export type DataProvider = "local" | "supabase";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  chefId: string | null;
  kitchenName: string | null;
  driverId: string | null;
  driverStatus: DriverAccountStatus | null;
  city: string | null;
  phone: string | null;
  vehicle: Vehicle | null;
  documentsReady: boolean | null;
  chefApprovalStatus: ChefApprovalStatus | null;
  approvalStatus: ChefApprovalStatus | null;
  emailConfirmed: boolean;
  avatarDataUrl?: string | null;
  bio?: string | null;
  gallery?: string[];
};

export type DemoAccount = {
  role: "chef" | "admin";
  name: string;
  kitchen: string | null;
  email: string;
  password: string;
};

export type PublicMeal = {
  id: string;
  title: string;
  description: string;
  priceMad: number;
  maxQuantity: number;
  remainingQuantity: number;
  serviceDate: string;
  kitchenName: string;
  city: string;
    photoUrl: string | null;
  photoUrls?: string[];
};

export type ChefMeal = PublicMeal & {
  isPublished: boolean;
};

export type ReviewDocument = {
  id: string;
  kind: string;
};

export type Chef = {
  id: string;
  ownerId: string;
  kitchenName: string;
  city: string;
  fullName: string;
  phone: string | null;
  bio: string;
  cin_storage_path?: string | null;
  auto_entrepreneur_number?: string | null;
  food_safety_accepted_at?: string | null;
  approval_status: ChefApprovalStatus;
  cinDocumentId?: string | null;
  signature_data_url?: string | null;
  documents: ReviewDocument[];
  is_active: boolean;
  postponed: boolean;
  balanceMad: number;
  createdAt: string;
};

export type PlaceOrderInput = {
  mealId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  customerNotes: string;
  quantity: number;
};

export type CreateMealInput = {
  title: string;
  description: string;
  priceMad: number;
  maxQuantity: number;
};

export type OrderReceipt = {
  id: string;
  mealTitle: string;
  kitchenName: string;
  customerName: string;
  deliveryAddress: string;
  quantity: number;
  unitPriceMad: number;
  totalMad: number;
  deliveryFeeMad: number;
  customerNotes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryCode: string;
  trackToken: string;
  createdAt: string;
};

export type OrderTracking = {
  mealTitle: string;
  kitchenName: string;
  deliveryAddress: string;
  quantity: number;
  totalMad: number;
  deliveryFeeMad: number;
  customerNotes: string;
  status: OrderStatus;
  deliveryCode: string;
  createdAt: string;
};

export type ChefOrder = {
  id: string;
  mealTitle: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  quantity: number;
  unitPriceMad: number;
  totalMad: number;
  commissionMad: number;
  netMad: number;
  customerNotes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  createdAt: string;
};

export type MoneySnapshot = {
  orders: number;
  portions: number;
  grossRevenueMad: number;
  commissionMad: number;
  chefPayoutMad: number;
};

export type FinanceSummary = {
  orders: number;
  portions: number;
  cashCollectedMad: number;
  platformCommissionMad: number;
  chefPayoutMad: number;
  driverEarningsMad: number;
  deliveryPlatformMad: number;
};

export type KitchenStat = {
  chefId: string;
  kitchenName: string;
  city: string;
  orders: number;
  portions: number;
  revenueMad: number;
  commissionMad: number;
  payoutMad: number;
};

export type RecentOrder = ChefOrder & {
  kitchenName: string;
};

export type CommissionSettings = {
  chefCommissionMad: number;
  driverCommissionMad: number;
};

export type ChatActor = {
  id: string;
  role: Role;
  fullName: string;
  chefId: string | null;
  driverId: string | null;
  phone: string | null;
};

export type DirectMessageView = {
  id: string;
  senderRole: "customer" | "chef" | "driver";
  senderName: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

export type DirectThread = {
  threadId: string;
  mealId: string;
  orderId: string | null;
  title: string;
  peerName: string;
  messages: DirectMessageView[];
};

export type AdminOverview = {
  commissionPerMealMad: number;
  deliveryFeeMad: number;
  driverCommissionPerTripMad: number;
  chefWalletCommissionMad: number;
  driverWalletCommissionMad: number;
  serviceDate: string;
  today: MoneySnapshot;
  allTime: MoneySnapshot;
  todayBooks: FinanceSummary;
  weekBooks: FinanceSummary;
  openOrders: number;
  cancelledOrders: number;
  kitchens: KitchenStat[];
  recentOrders: RecentOrder[];
  drivers: DriverRecord[];
  activeDeliveries: ActiveDelivery[];
};

export type SessionResponse = {
  user: AuthUser | null;
  provider: DataProvider;
};

export type ChefBoard = {
  serviceDate: string;
  meals: ChefMeal[];
  orders: ChefOrder[];
  approvalStatus: ChefApprovalStatus;
};

export type MealListResponse = {
  serviceDate: string;
  meals: PublicMeal[];
};

export type DriverDocumentMeta = {
  id: string;
  kind: DocumentKind;
  contentType: string;
};

export type DriverRecord = {
  id: string;
  ownerId: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  vehicle: Vehicle;
  status: DriverAccountStatus;
  documents: DriverDocumentMeta[];
  documentsReady: boolean;
  createdAt: string;
  signature_data_url?: string | null;
  notes: string;
  is_active: boolean;
  postponed: boolean;
  balanceMad: number;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  participantRole: "chef" | "driver";
  participantName: string;
  sender: "user" | "admin";
  body: string;
  createdAt: string;
};

export type ChatThread = {
  threadId: string;
  participantRole: "chef" | "driver";
  participantName: string;
  lastBody: string;
  lastAt: string;
  messages: ChatMessage[];
};

export type WalletView = {
  balanceMad: number;
  transactions: Array<{
    id: string;
    amountMad: number;
    note: "commission" | "adjustment";
    createdAt: string;
  }>;
};

export type DeliveryJob = {
  id: string;
  mealTitle: string;
  kitchenName: string;
  city: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  quantity: number;
  status: OrderStatus;
  deliveryFeeMad: number;
  driverCommissionMad: number;
  driverNetMad: number;
  customerNotes: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  createdAt: string;
};

export type ActiveDelivery = DeliveryJob & {
  driverName: string;
};

export type DriverBoard = {
  city: string;
  accountStatus: DriverAccountStatus;
  available: DeliveryJob[];
  active: DeliveryJob[];
  completed: DeliveryJob[];
  earnings: {
    trips: number;
    feesMad: number;
    commissionMad: number;
    netMad: number;
  };
};

export type DriverApplication = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  city: string;
  vehicle: Vehicle;
  signature: string;
};

export type ChefApplication = {
  fullName: string;
  kitchenName: string;
  email: string;
  phone: string;
  password: string;
  city: string;
  foodSafetyAccepted: true;
  autoEntrepreneurNumber: string | null;
  signature: string;
};

export type CustomerAccountInput = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
};

export type CustomerOrder = {
  id: string;
  mealTitle: string;
  kitchenName: string;
  deliveryAddress: string;
  quantity: number;
  totalMad: number;
  deliveryFeeMad: number;
  customerNotes: string;
  status: OrderStatus;
  deliveryCode: string;
  createdAt: string;
};

export type GoogleIdentity = {
  sub: string;
  email: string;
  name: string;
};
