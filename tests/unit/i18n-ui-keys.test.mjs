import assert from "node:assert/strict";
import test from "node:test";
import { translate } from "../../src/lib/i18n.ts";

const keys = [
  "home.ctaMeals",
  "home.whyTitle",
  "home.partnerCta",
  "board.emptyTitle",
  "board.emptyBody",
  "account.guestLead",
  "account.joinRolesCta",
  "account.staffHint",
  "join.chefCta",
  "join.driverCta",
  "nav.join",
];

test("ui refinement keys resolve in ar/en/fr", () => {
  for (const lang of ["ar", "en", "fr"]) {
    for (const key of keys) {
      const value = translate(lang, key);
      assert.ok(value && value !== key, `${lang}:${key}`);
    }
  }
});

test("join document title keys differ by language", () => {
  const ar = translate("ar", "nav.join");
  const en = translate("en", "nav.join");
  const fr = translate("fr", "nav.join");
  assert.equal(ar, "انضم إلينا");
  assert.equal(en, "Join us");
  assert.equal(fr, "Rejoignez-nous");
  assert.notEqual(ar, en);
  assert.notEqual(en, fr);
  assert.notEqual(ar, fr);
});
