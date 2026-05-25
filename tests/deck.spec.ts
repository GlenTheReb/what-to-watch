import { test, expect } from '@playwright/test';

test('deck page loads cards and handles keep/pass', async ({ page }) => {
  // 1. Mock the API so we don't hit real TMDB/Gemini limits during automated testing
  await page.route('/api/deck', async route => {
    const json = {
      cards: [
        {
          id: 'm-100',
          title: 'Test Action Movie',
          year: 2024,
          kind: 'movie',
          reason: 'Because you love action.',
          voteAverage: 8.5,
          posterPath: null,
          genres: ['Action', 'Sci-Fi'],
          director: 'Jane Doe',
          cast: ['John Smith']
        },
        {
          id: 'm-200',
          title: 'Test Comedy Movie',
          year: 2023,
          kind: 'movie',
          reason: 'You need a laugh.',
          voteAverage: 7.2,
          posterPath: null,
          genres: ['Comedy'],
          director: 'Bob Bobson',
          cast: ['Alice Alison']
        }
      ]
    };
    await route.fulfill({ json });
  });

  // 2. Go straight to the deck page with a query
  await page.goto('/deck?q=test query');

  // 3. Verify the heading reflects our query
  await expect(page.getByRole('heading', { name: '"test query"' })).toBeVisible();

  // 4. Verify the first mocked card is displayed
  await expect(page.getByText('Test Action Movie').first()).toBeVisible();
  await expect(page.getByText('Card 1 / 2')).toBeVisible();

  // 5. Click "Keep" on the first movie
  await page.getByRole('button', { name: 'Keep' }).click();

  // 6. Verify it moved to the second movie
  await expect(page.getByText('Test Comedy Movie').first()).toBeVisible();
  await expect(page.getByText('Card 2 / 2')).toBeVisible();

  // 7. Verify the first movie ID was saved to localStorage (your "Likes" database)
  const likes = await page.evaluate(() => localStorage.getItem('wtw:likes'));
  expect(likes).toContain('m-100');

  // 8. Click "Pass" on the second movie
  await page.getByRole('button', { name: 'Pass' }).click();

  // 9. Verify the deck says it is done
  await expect(page.getByText('Done. Try another search.')).toBeVisible();

  // 10. Verify the second movie ID was saved to localStorage under passes
  const passes = await page.evaluate(() => localStorage.getItem('wtw:passes'));
  expect(passes).toContain('m-200');
});
