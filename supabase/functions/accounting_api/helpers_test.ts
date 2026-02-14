import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";
import { maybeSwapSupplierCustomer } from "./helpers.ts";

Deno.test("swap supplier/customer when supplier matches client patterns", () => {
  const result = maybeSwapSupplierCustomer(
    { name: "Jesús Moreno", nif: "X" },
    { name: "BigMat Chiclana", nif: "Y" },
  );
  assertEquals(result.swapped, true);
  assertEquals(result.supplier.name, "BigMat Chiclana");
  assertEquals(result.customer.name, "Jesús Moreno");
});
