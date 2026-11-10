import { SUPER_ADMIN_EMAIL } from "@/lib/super-admin";
import type { DemoAccount } from "@/lib/types";

/** Local-mode sign-in only. Supabase mode never sends these to the browser. */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: "chef",
    name: "Fatima Benali",
    kitchen: "Dar Fatima",
    email: "fatima@wajbati.ma",
    password: "fatima-kitchen",
  },
  {
    role: "chef",
    name: "Youssef El Amrani",
    kitchen: "Youssef's Table",
    email: "youssef@wajbati.ma",
    password: "youssef-kitchen",
  },
  {
    role: "chef",
    name: "Khadija Mansouri",
    kitchen: "Khadija's Kitchen",
    email: "khadija@wajbati.ma",
    password: "khadija-kitchen",
  },
  {
    role: "admin",
    name: "Super Admin",
    kitchen: null,
    email: SUPER_ADMIN_EMAIL,
    password: "SahriAdmin2026!",
  },
];
