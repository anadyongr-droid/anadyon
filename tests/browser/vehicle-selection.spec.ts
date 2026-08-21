import { test, expect } from "@playwright/test";

const vehiclePages = [
  { path: "/cars", first: "Fiat Panda", replacement: "Hyundai i20", replacementIndex: 3 },
  { path: "/motorbikes", first: "Kymco Agility 50cc", replacement: "Kymco Agility 125cc", replacementIndex: 1 },
  { path: "/bikes", first: "Cinzia Bombi Retro Women", replacement: "Cinzia Bombi Retro Men", replacementIndex: 1 },
];

for (const vehiclePage of vehiclePages) {
  test(`changing vehicle cards updates an already-open ${vehiclePage.path} booking form`, async ({ page }) => {
    await page.goto(vehiclePage.path);

    const quoteButtons = page.getByRole("button", { name: "Get Quote" });
    await quoteButtons.nth(0).click();
    await page.locator("#booking-form").waitFor({ state: "visible" });

    const vehicleSelect = page.locator("#booking-form select").first();
    await expect(vehicleSelect).toHaveValue(vehiclePage.first);

    // A customer can reconsider without losing their selected dates or other
    // details. Selecting another card must update this existing form, rather
    // than leaving the former vehicle (and its rate) selected.
    await quoteButtons.nth(vehiclePage.replacementIndex).click();
    await expect(vehicleSelect).toHaveValue(vehiclePage.replacement);
  });
}
