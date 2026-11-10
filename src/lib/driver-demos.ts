export type DriverDemo = {
  name: string;
  phone: string;
  password: string;
  city: string;
  vehicle: "motorbike" | "car";
  status: "pending" | "approved";
};

/** Local-mode driver sign-in. Supabase mode never sends these to the browser. */
export const DRIVER_DEMOS: DriverDemo[] = [
  {
    name: "Hassan El Fassi",
    phone: "0661555010",
    password: "driver-demo",
    city: "Casablanca",
    vehicle: "motorbike",
    status: "approved",
  },
  {
    name: "Imane Ouardi",
    phone: "0661555011",
    password: "driver-demo",
    city: "Rabat",
    vehicle: "car",
    status: "pending",
  },
];
