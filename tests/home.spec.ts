import { test, expect } from '@playwright/test';

test('homepage loads and can submit search', async ({ page }) => {
  // Go to the homepage (uses the baseURL we configured earlier)
  await page.goto('/');

  // Verify the main heading is visible
  await expect(page.getByRole('heading', { name: 'What to watch' })).toBeVisible();

  // Find the search input and the submit button
  const searchInput = page.locator('input');
  const getPicksButton = page.getByRole('button', { name: 'Get picks' });

  // Make sure the input is visible, and the button starts off disabled
  await expect(searchInput).toBeVisible();
  await expect(getPicksButton).toBeDisabled();

  // Type a query
  await searchInput.fill('action movies from the 90s');

  // The button should now become enabled
  await expect(getPicksButton).toBeEnabled();

  // Submit the search
  await getPicksButton.click();

  // Verify that the app navigated to the deck page and passed the query in the URL
  await expect(page).toHaveURL(/\/deck\?q=action%20movies%20from%20the%2090s/i);
});
