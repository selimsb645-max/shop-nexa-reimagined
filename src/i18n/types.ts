/**
 * Supported languages for Shop Nexa.
 * To add a new language, add it here and create a translation file in /src/i18n/locales/.
 */
export type Locale = "en" | "bn";

export const SUPPORTED_LOCALES: { code: Locale; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
];

/**
 * Translation key shape — all UI strings must be defined here.
 * This ensures type-safety: you can't use a key that doesn't exist.
 */
export interface TranslationKeys {
  // Common
  "common.loading": string;
  "common.save": string;
  "common.cancel": string;
  "common.delete": string;
  "common.edit": string;
  "common.confirm": string;
  "common.close": string;
  "common.back": string;
  "common.next": string;
  "common.retry": string;
  "common.search": string;
  "common.filter": string;
  "common.sort": string;
  "common.clear": string;
  "common.apply": string;
  "common.all": string;
  "common.none": string;
  "common.yes": string;
  "common.no": string;
  "common.error": string;
  "common.success": string;
  "common.optional": string;
  "common.required": string;
  "common.viewAll": string;
  "common.seeMore": string;
  "common.outOfStock": string;
  "common.inStock": string;
  "common.added": string;
  "common.removed": string;

  // Nav
  "nav.home": string;
  "nav.categories": string;
  "nav.shop": string;
  "nav.cart": string;
  "nav.wishlist": string;
  "nav.orders": string;
  "nav.account": string;
  "nav.settings": string;
  "nav.notifications": string;
  "nav.search": string;
  "nav.compare": string;
  "nav.flashSales": string;

  // Home
  "home.heroTitle": string;
  "home.heroSubtitle": string;
  "home.shopNow": string;
  "home.flashSale": string;
  "home.featuredProducts": string;
  "home.newArrivals": string;
  "home.topCategories": string;
  "home.trendingProducts": string;
  "home.dealsOfTheDay": string;
  "home.seeAll": string;
  "home.shopByCategory": string;
  "home.justForYou": string;

  // Product
  "product.addToCart": string;
  "product.buyNow": string;
  "product.addToWishlist": string;
  "product.removeFromWishlist": string;
  "product.specifications": string;
  "product.reviews": string;
  "product.relatedProducts": string;
  "product.description": string;
  "product.quantity": string;
  "product.brand": string;
  "product.seller": string;
  "product.deliveryFee": string;
  "product.freeDelivery": string;
  "product.estimatedDelivery": string;
  "product.shareProduct": string;
  "product.color": string;
  "product.size": string;
  "product.off": string;
  "product.sold": string;
  "product.ratings": string;
  "product.questions": string;
  "product.writeReview": string;
  "product.askQuestion": string;

  // Cart
  "cart.title": string;
  "cart.empty": string;
  "cart.emptyHint": string;
  "cart.startShopping": string;
  "cart.subtotal": string;
  "cart.shipping": string;
  "cart.discount": string;
  "cart.total": string;
  "cart.checkout": string;
  "cart.removeItem": string;
  "cart.clearAll": string;
  "cart.selectItems": string;
  "cart.continueShopping": string;
  "cart.free": string;
  "cart.items": string;
  "cart.item": string;

  // Checkout
  "checkout.title": string;
  "checkout.shippingAddress": string;
  "checkout.addAddress": string;
  "checkout.selectAddress": string;
  "checkout.paymentMethod": string;
  "checkout.orderSummary": string;
  "checkout.placeOrder": string;
  "checkout.couponCode": string;
  "checkout.applyCoupon": string;
  "checkout.deliveryInstructions": string;
  "checkout.orderTotal": string;
  "checkout.cod": string;
  "checkout.online": string;
  "checkout.processing": string;

  // Orders
  "orders.title": string;
  "orders.orderPlaced": string;
  "orders.orderConfirmed": string;
  "orders.packed": string;
  "orders.shipped": string;
  "orders.outForDelivery": string;
  "orders.delivered": string;
  "orders.cancelled": string;
  "orders.returned": string;
  "orders.trackOrder": string;
  "orders.orderId": string;
  "orders.orderDate": string;
  "orders.total": string;
  "orders.status": string;
  "orders.viewDetails": string;
  "orders.noOrders": string;
  "orders.noOrdersHint": string;
  "orders.all": string;
  "orders.pending": string;
  "orders.processing": string;
  "orders.confirmed": string;
  "orders.toPay": string;
  "orders.toShip": string;
  "orders.toReceive": string;
  "orders.toReview": string;
  "orders.completed": string;
  "orders.buyAgain": string;
  "orders.reorder": string;
  "orders.writeReview": string;
  "orders.contactSeller": string;
  "orders.returnRefund": string;
  "orders.cancelOrder": string;
  "orders.reason": string;
  "orders.tracking": string;
  "orders.courier": string;
  "orders.trackingNumber": string;

  // Account
  "account.title": string;
  "account.myOrders": string;
  "account.myWishlist": string;
  "account.myCoupons": string;
  "account.myReviews": string;
  "account.addressBook": string;
  "account.recentlyViewed": string;
  "account.paymentWallet": string;
  "account.rewards": string;
  "account.following": string;
  "account.messages": string;
  "account.referrals": string;
  "account.signOut": string;
  "account.helpCenter": string;
  "account.customerService": string;

  // Settings
  "settings.title": string;
  "settings.subtitle": string;
  "settings.accountInfo": string;
  "settings.notificationPrefs": string;
  "settings.regionLanguage": string;
  "settings.currency": string;
  "settings.currencyHint": string;
  "settings.language": string;
  "settings.languageHint": string;
  "settings.accountSecurity": string;
  "settings.changePassword": string;
  "settings.resetLinkHint": string;
  "settings.reset": string;
  "settings.signedInDevice": string;
  "settings.signedInDeviceHint": string;
  "settings.thisDevice": string;
  "settings.otherDevices": string;
  "settings.revokeSession": string;
  "settings.revokeAllOther": string;
  "settings.noOtherDevices": string;
  "settings.signOutAll": string;
  "settings.emailVerified": string;
  "settings.emailNotVerified": string;
  "settings.emailVerifiedHint": string;
  "settings.emailNotVerifiedHint": string;
  "settings.orderUpdatesEmail": string;
  "settings.orderUpdatesEmailHint": string;
  "settings.promotionsEmail": string;
  "settings.promotionsEmailHint": string;
  "settings.smsOrderUpdates": string;
  "settings.smsOrderUpdatesHint": string;
  "settings.pushNotifications": string;
  "settings.pushNotificationsHint": string;
  "settings.savePreferences": string;
  "settings.saved": string;
  "settings.saveError": string;
  "settings.legal": string;
  "settings.termsConditions": string;
  "settings.privacyPolicy": string;
  "settings.aboutShopNexa": string;
  "settings.aboutHint": string;

  // Device info
  "device.currentDevice": string;
  "device.otherSessions": string;
  "device.browser": string;
  "device.os": string;
  "device.platform": string;
  "device.loginTime": string;
  "device.lastActive": string;
  "device.sessionStatus": string;
  "device.active": string;
  "device.unknown": string;
  "device.notAvailable": string;
  "device.signOut": string;
  "device.signingOut": string;
  "device.revoked": string;
  "device.revoking": string;
  "device.confirmRevoke": string;
  "device.confirmRevokeHint": string;
  "device.revokeError": string;

  // Notifications
  "notifications.title": string;
  "notifications.markAllRead": string;
  "notifications.empty": string;
  "notifications.orderUpdate": string;
  "notifications.promo": string;

  // Auth
  "auth.signIn": string;
  "auth.signUp": string;
  "auth.signOut": string;
  "auth.email": string;
  "auth.password": string;
  "auth.confirmPassword": string;
  "auth.fullName": string;
  "auth.forgotPassword": string;
  "auth.resetPassword": string;
  "auth.resetEmailSent": string;
  "auth.verifyEmail": string;
  "auth.emailNotVerified": string;
  "auth.continueWithGoogle": string;
  "auth.or": string;
  "auth.noAccount": string;
  "auth.haveAccount": string;
  "auth.welcomeBack": string;
  "auth.createAccount": string;
  "auth.invalidCredentials": string;
  "auth.weakPassword": string;
  "auth.emailInUse": string;

  // Forms / Validation
  "validation.required": string;
  "validation.invalidEmail": string;
  "validation.invalidPhone": string;
  "validation.passwordTooShort": string;
  "validation.passwordMismatch": string;
  "validation.selectOption": string;
  "validation.fillField": string;

  // Messages
  "message.addedToCart": string;
  "message.removedFromCart": string;
  "message.addedToWishlist": string;
  "message.removedFromWishlist": string;
  "message.settingsSaved": string;
  "message.settingsError": string;
  "message.passwordResetSent": string;
  "message.passwordResetError": string;
  "message.signedOut": string;
  "message.orderPlaced": string;
  "message.orderError": string;
  "message.copied": string;

  // Misc
  "misc.version": string;
  "misc.tagline": string;
}
