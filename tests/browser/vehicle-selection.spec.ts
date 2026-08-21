import { test, expect } from "@playwright/test";

test("choosing another vehicle card updates an already-open booking form", async ({ page }) => {
  await page.goto("/cars");

  const quoteButtons = page.getByRole("button", { name: "Get Quote" });
  await quoteButtons.nth(0).click(); // Fiat Panda
  await page.locator("#booking-form").waitFor({ state: "visible" });

  const vehicleSelect = page.locator("#booking-form select").first();
  await expect(vehicleSelect).toHaveValue("Fiat Panda");

  // A customer can reconsider without losing their selected dates or other
  // details. Selecting the Hyundai card must therefore update this existing
  // form, rather than opening it with the former car's rate still selected.
  await quoteButtons.nth(3).click(); // Hyundai i20
  await expect(vehicleSelect).toHaveValue("Hyundai i20");
});
