import { translate, type Lang, type MessageKey } from "@/lib/i18n";

const exact: Record<string, MessageKey> = {
  "Something went wrong. Try again.": "err.generic",
  "Sign in to continue.": "err.signIn",
  "Sign in to see profile orders.": "err.signInOrders",
  "This account opens the admin desk.": "err.role.admin",
  "This account opens the driver route.": "err.role.driver",
  "This account opens your profile.": "err.role.customer",
  "This account opens the chef kitchen.": "err.role.chef",
  "This chef account is not linked to a kitchen yet.": "err.chefUnlinked",
  "This driver profile is incomplete.": "err.driverIncomplete",
  "Those credentials were not recognized.": "auth.invalid",
  "Please confirm your email first.": "auth.confirmEmail",
  "Please upload a clear, high-quality photo.": "photo.quality",
  "The local order book could not be read.": "err.store",
  "That driver could not be found.": "err.driverMissing",
  "That phone is already registered.": "err.phoneTaken",
  "That email is already registered.": "err.emailTaken",
  "This meal is not on today's board.": "err.mealToday",
  "Not enough portions left.": "err.portions",
  "This kitchen is not active.": "err.kitchenInactive",
  "Your account is under review. You cannot publish meals until approved.": "err.underReview",
  "That meal could not be found.": "err.mealMissing",
  "That order could not be found.": "err.orderMissing",
  "Your application is still waiting for approval.": "err.driverPending",
  "That delivery could not be found.": "err.deliveryMissing",
  "That delivery is outside your zone.": "err.zone",
  "That delivery was just taken.": "err.taken",
  "That delivery is not yours.": "err.notYours",
  "That code does not match.": "err.code",
  "This driver still needs the required documents.": "err.docsNeeded",
  "That document is not required for this vehicle.": "err.docVehicle",
  "That document could not be found.": "err.docMissing",
  "That document could not be read.": "err.docRead",
  "That kitchen could not be found.": "err.kitchenMissing",
  "That document is not required.": "err.docOptional",
  "That photo could not be found.": "err.photoMissing",
  "The request body is missing.": "err.bodyMissing",
  "The request body must be JSON.": "err.bodyJson",
  "Enter a valid phone number.": "err.phone",
  "Enter a valid email.": "err.email",
  "Price must be a number in MAD.": "err.priceNumber",
  "Price must be between 1 and 500 MAD.": "err.priceRange",
  "Publish state is required.": "err.publish",
  "That status is not recognized.": "err.status",
  "Password must be 8–80 characters.": "err.passwordLength",
  "Add your electronic signature.": "err.signature",
  "The signature must stay under 500 KB.": "err.signatureSize",
  "Accept the food safety commitment to open a kitchen.": "err.foodSafety",
  "Upload the front of your CIN.": "err.cin",
  "Upload a JPG, PNG, or WEBP photo under 4 MB.": "err.photoType",
  "The auto-entrepreneur number must be 10 to 15 digits.": "err.autoNumber",
  "Choose approve or reject.": "err.decision",
  "That document type is not recognized.": "err.docType",
  "Enter the 4-digit code from the customer.": "err.deliveryCode",
  "Password confirmation does not match.": "err.passwordMatch",
  "Choose Casablanca, Rabat, or Marrakech.": "err.city",
  "Choose a bicycle, a motorbike, or a car.": "err.vehicle",
  "Choose the chef kitchen or the admin desk.": "err.desk",
  "Choose a customer, chef, or driver sign-in.": "err.googleDesk",
  "Google sign-in is not configured yet.": "err.googleConfig",
  "Google did not confirm that sign-in.": "err.googleDenied",
  "Google did not share a verified email.": "err.googleEmail",
  "Supabase is not configured. Add the URL and anon key.": "err.supabase",
  "The database returned an unexpected number.": "err.dbNumber",
  "Could not open the kitchen.": "err.openKitchen",
  "Could not open the profile.": "err.openProfile",
  "Could not save the account.": "err.saveAccount",
  "The account was saved, but sign-in needs email confirmations turned off in Supabase Auth.": "err.confirmations",
  "Could not load your meals.": "err.loadMeals",
  "Could not load your orders.": "err.loadOrders",
  "Could not load the order.": "err.loadOrder",
  "Could not update the order.": "err.updateOrder",
  "Could not load orders.": "err.loadAllOrders",
  "Could not load kitchens.": "err.loadKitchens",
  "Could not load drivers.": "err.loadDrivers",
  "Could not load the driver profile.": "err.loadDriver",
  "Could not load deliveries.": "err.loadDeliveries",
  "Could not store the document.": "err.storeDoc",
  "Could not load the document.": "err.loadDoc",
  "Could not update the kitchen.": "err.updateKitchen",
  "Could not load the kitchen.": "err.loadKitchen",
  "Upload a photo.": "profile.uploadFailed",
  "That photo must stay under 500 KB.": "err.photoSize",
  "Choose a city we serve.": "err.cityServed",
  "Could not save the profile.": "profile.saveFailed",
  "Could not open the driver route.": "err.openDriver",
  "That status change is not allowed.": "err.statusChange",
  "That account could not be found.": "err.accountMissing",
  "That conversation could not be found.": "err.threadMissing",
  "Your wallet balance is empty. Top it up before publishing or accepting orders.": "err.walletEmpty",
  "Phone numbers, emails, and links are not allowed in chat.": "err.chatBlocked",
  "Request failed.": "err.request",
  "The server returned an unreadable response.": "err.unreadable",
};

const fields: Record<string, MessageKey> = {
  Meal: "err.field.meal",
  Phone: "order.phone",
  Name: "order.name",
  "Delivery address": "err.field.address",
  Quantity: "order.quantity",
  Order: "err.field.order",
  Email: "auth.email",
  Notes: "order.notes",
  Title: "err.field.title",
  Description: "err.field.description",
  "Max quantity": "err.field.max",
  Kitchen: "err.field.kitchen",
  Driver: "err.field.driver",
  "Phone or email": "err.field.phoneOrEmail",
  City: "err.field.city",
};

function fieldLabel(lang: Lang, label: string): string {
  const key = fields[label];
  return key ? translate(lang, key) : label;
}

export function localizeKnownError(lang: Lang, message: string): string {
  const key = exact[message];
  if (key) return translate(lang, key);
  const required = /^(.*) is required\.$/.exec(message);
  if (required?.[1]) return translate(lang, "err.required", { label: fieldLabel(lang, required[1]) });
  const length = /^(.*) must be (\d+)[–-](\d+) characters\.$/.exec(message);
  if (length?.[1] && length[2] && length[3]) {
    return translate(lang, "err.length", { label: fieldLabel(lang, length[1]), min: length[2], max: length[3] });
  }
  const whole = /^(.*) must be a whole number from (\d+) to (\d+)\.$/.exec(message);
  if (whole?.[1] && whole[2] && whole[3]) {
    return translate(lang, "err.whole", { label: fieldLabel(lang, whole[1]), min: whole[2], max: whole[3] });
  }
  return message;
}
