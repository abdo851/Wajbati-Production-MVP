import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessOrderChat,
  defaultOrderChatPeer,
  orderChatThreadsCollide,
  orderThreadId,
  parseOrderThreadId,
} from "../../src/lib/order-chat.ts";

const orderId = "11111111-2222-3333-4444-555555555555";
const order = {
  chefId: "chef-1",
  driverId: "driver-1",
  customerPhone: "+212612345678",
};

test("order thread ids keep chef and driver peers separate", () => {
  assert.equal(orderThreadId(orderId, "driver"), `order:${orderId}`);
  assert.equal(orderThreadId(orderId, "chef"), `order:${orderId}:chef`);
  assert.deepEqual(parseOrderThreadId(`order:${orderId}`), { orderId, peer: "driver" });
  assert.deepEqual(parseOrderThreadId(`order:${orderId}:chef`), { orderId, peer: "chef" });
  assert.equal(parseOrderThreadId("meal:x:customer:y"), null);
  assert.equal(orderChatThreadsCollide(orderId), false);
});

test("default order chat peer routes by role", () => {
  assert.equal(defaultOrderChatPeer("driver"), "driver");
  assert.equal(defaultOrderChatPeer("chef"), "chef");
  assert.equal(defaultOrderChatPeer("customer"), "chef");
});

test("order chat authorization scopes participants by peer", () => {
  const customer = { role: "customer", phone: "212612345678" };
  const chef = { role: "chef", chefId: "chef-1" };
  const otherChef = { role: "chef", chefId: "chef-other" };
  const driver = { role: "driver", driverId: "driver-1" };
  const otherDriver = { role: "driver", driverId: "driver-other" };
  const stranger = { role: "customer", phone: "0699999999" };

  assert.equal(canAccessOrderChat(customer, order, "chef"), true);
  assert.equal(canAccessOrderChat(customer, order, "driver"), true);
  assert.equal(canAccessOrderChat(chef, order, "chef"), true);
  assert.equal(canAccessOrderChat(chef, order, "driver"), false);
  assert.equal(canAccessOrderChat(driver, order, "driver"), true);
  assert.equal(canAccessOrderChat(driver, order, "chef"), false);
  assert.equal(canAccessOrderChat(otherChef, order, "chef"), false);
  assert.equal(canAccessOrderChat(otherDriver, order, "driver"), false);
  assert.equal(canAccessOrderChat(stranger, order, "chef"), false);
  assert.equal(canAccessOrderChat(stranger, order, "driver"), false);
});
