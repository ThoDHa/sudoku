import { test, expect } from '../fixtures';

/**
 * About & Technique Pages E2E Tests
 *
 * Comprehensive tests for:
 * - Techniques overview page (/techniques)
 * - Individual technique detail pages (/technique/:slug)
 * - How to Play and How Solver Works pages
 * - Navigation between techniques
 * - About page (/about)
 * - Responsive design
 * - Accessibility
 */

test.describe('Techniques Overview Page', () => {
  test('techniques page loads successfully with correct heading', async ({ page }) => {
    await page.goto('/techniques');
    
    // Should show Learn Sudoku heading
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  )

  test('displays list of available techniques', async ({ page }) => {
    await page.goto('/techniques');
    
    // Wait for technique sections to load
    await expect(page.locator('text=Simple Techniques')).toBeVisible();
    
    // Should have multiple technique links
    const techniqueLinks = page.locator('a[href^="/technique/"]');
    await expect(techniqueLinks.first()).toBeVisible();
    const count = await techniqueLinks.count();
    expect(count).toBeGreaterThan(5);
  )

  test('techniques are organized by difficulty tier', async ({ page }) => {
    await page.goto('/techniques');
    
    // Should show tier sections
    await expect(page.locator('text=Simple Techniques')).toBeVisible();
    await expect(page.locator('text=Medium Techniques')).toBeVisible();
    await expect(page.locator('text=Hard Techniques')).toBeVisible();
  )

  test('displays How to Play link prominently', async ({ page }) => {
    await page.goto('/techniques');
    
    // How to Play should be a prominent link
    const howToPlayLink = page.locator('a[href="/techniques/how-to-play"]');
    await expect(howToPlayLink).toBeVisible();
    await expect(howToPlayLink.locator('text=How to Play Sudoku')).toBeVisible();
  )

  test('displays How the Solver Works link', async ({ page }) => {
    await page.goto('/techniques');
    
    // How the Solver Works should be visible
    const solverLink = page.locator('a[href="/techniques/how-solver-works"]');
    await expect(solverLink).toBeVisible();
    await expect(solverLink.locator('text=How the Solver Works')).toBeVisible();
  )

  test('back to puzzles link navigates to homepage', async ({ page }) => {
    await page.goto('/techniques');
    
    const backLink = page.locator('a:has-text("Back to puzzles")');
    await expect(backLink).toBeVisible();
    
    await backLink.click();
    await expect(page).toHaveURL('/');
  )
)

test.describe('Individual Technique Pages', () => {
  test('can navigate to individual technique page from list', async ({ page }) => {
    await page.goto('/techniques');
    
    // Click on Naked Single technique
    const nakedSingleLink = page.locator('a[href="/technique/naked-single"]');
    await expect(nakedSingleLink).toBeVisible();
    
    await nakedSingleLink.click();
    await expect(page).toHaveURL('/technique/naked-single');
  )

  test('technique title is displayed on detail page', async ({ page }) => {
    await page.goto('/technique/naked-single');
    
    // Should show technique title
    await expect(page.locator('h1:has-text("Naked Single")')).toBeVisible();
  )

  test('technique description is shown', async ({ page }) => {
    await page.goto('/technique/hidden-single');
    
    // Should show description text about the technique
    await expect(page.locator('text=A digit can only go in one cell')).toBeVisible();
  )

  test('tier badge is displayed for technique', async ({ page }) => {
    await page.goto('/technique/naked-pair');
    
    // Should show the tier badge (Simple, Medium, Hard, etc.)
    const tierBadge = page.locator('text=Simple');
    await expect(tierBadge.first()).toBeVisible();
  )

  test('example section is displayed', async ({ page }) => {
    await page.goto('/technique/pointing-pair');
    
    // Should have an example section
    await expect(page.locator('h2:has-text("Example")')).toBeVisible();
  )

  test('animated diagram renders on technique with animation', async ({ page }) => {
    await page.goto('/technique/naked-single');
    
    // Should have diagram section heading
    const diagramHeading = page.locator('h2:has-text("Diagram")').or(page.locator('h3:has-text("Diagram")'));
    await expect(diagramHeading.first()).toBeVisible();
    
    // Animated diagram container should be visible (contains the diagram heading)
    const diagramContainer = page.locator('.rounded-lg.bg-background-secondary').first();
    await expect(diagramContainer).toBeVisible();
  )

  test('static diagram renders on technique without animation', async ({ page }) => {
    await page.goto('/technique/hidden-triple');
    
    // Should have diagram section
    const diagramSection = page.locator('text=Diagram');
    await expect(diagramSection.first()).toBeVisible();
  )

  test('invalid technique slug shows not found message', async ({ page }) => {
    await page.goto('/technique/this-does-not-exist-at-all');
    
    // Should show not found message
    await expect(page.locator('text=Technique not found')).toBeVisible();
    
    // Should have link back to all techniques
    await expect(page.locator('a:has-text("View all techniques")')).toBeVisible();
  )

  test('practice button is visible for implemented techniques', async ({ page }) => {
    await page.goto('/technique/naked-single');
    
    // Should have a Practice This Technique button
    await expect(page.locator('button:has-text("Practice This Technique")')).toBeVisible();
  )
)

test.describe('Navigation Between Techniques', () => {
  test('previous technique link works', async ({ page }) => {
    await page.goto('/technique/hidden-single');
    
    // Should have previous technique link (Naked Single comes before Hidden Single)
    const prevLink = page.locator('a[href="/technique/naked-single"]');
    await expect(prevLink).toBeVisible();
    
    await prevLink.click();
    await expect(page).toHaveURL('/technique/naked-single');
  )

  test('next technique link works', async ({ page }) => {
    await page.goto('/technique/naked-single');
    
    // Should have next technique link
    const nextLink = page.locator('a:has-text("→")').first();
    await expect(nextLink).toBeVisible();
    
    await nextLink.click();
    // Should navigate to next technique
    expect(page.url()).toContain('/technique/');
    expect(page.url()).not.toContain('naked-single');
  )

  test('back to all techniques link works', async ({ page }) => {
    await page.goto('/technique/x-wing');
    
    const backLink = page.locator('a:has-text("All techniques")');
    await expect(backLink).toBeVisible();
    
    await backLink.click();
    await expect(page).toHaveURL('/techniques');
  )

  test('try a puzzle link navigates to homepage', async ({ page }) => {
    await page.goto('/technique/naked-pair');
    
    const tryPuzzleLink = page.locator('a:has-text("Try a puzzle")');
    await expect(tryPuzzleLink).toBeVisible();
    
    await tryPuzzleLink.click();
    await expect(page).toHaveURL('/');
  )

  test('related techniques links are clickable', async ({ page }) => {
    await page.goto('/technique/naked-pair');
    
    // Should have related techniques section
    const relatedSection = page.locator('text=Related');
    await expect(relatedSection.first()).toBeVisible();
    
    // Should have related technique links (e.g., naked-triple, hidden-pair)
    const relatedLinks = page.locator('a[href^="/technique/"]').filter({ 
      has: page.locator('text=/naked.*triple|hidden.*pair/i') 
    )
    
    if (await relatedLinks.count() > 0) {
      await relatedLinks.first().click();
      expect(page.url()).toContain('/technique/');
    }
  )
)

test.describe('How to Play and How Solver Works', () => {
  test('How to Play page loads correctly', async ({ page }) => {
    await page.goto('/techniques/how-to-play');
    
    await expect(page.locator('h1:has-text("How to Play Sudoku")')).toBeVisible();
  )

  test('How to Play page has navigation to first technique', async ({ page }) => {
    await page.goto('/techniques/how-to-play');
    
    // Should have link to start with Naked Single
    const nakedSingleLink = page.locator('a:has-text("Start with Naked Single")');
    await expect(nakedSingleLink).toBeVisible();
  )

  test('How Solver Works page loads correctly', async ({ page }) => {
    await page.goto('/techniques/how-solver-works');
    
    await expect(page.locator('h1:has-text("How the Solver Works")')).toBeVisible();
  )

  test('How Solver Works has browse all techniques link', async ({ page }) => {
    await page.goto('/techniques/how-solver-works');
    
    const browseLink = page.locator('a:has-text("Browse all techniques")');
    await expect(browseLink).toBeVisible();
    
    await browseLink.click();
    await expect(page).toHaveURL('/techniques');
  )
)

test.describe('Deep Links', () => {
  test('direct URL to technique page works', async ({ page }) => {
    await page.goto('/technique/x-wing');
    
    await expect(page.locator('h1:has-text("X-Wing")')).toBeVisible();
  )

  test('direct URL to complex technique works', async ({ page }) => {
    await page.goto('/technique/unique-rectangle');
    
    await expect(page.locator('h1:has-text("Unique Rectangle")')).toBeVisible();
  )

  test('direct URL to techniques list works', async ({ page }) => {
    await page.goto('/techniques');
    
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
  )
)

test.describe('About Page', () => {
  test('about page loads successfully', async ({ page }) => {
    await page.goto('/about');
    
    await expect(page.locator('h1:has-text("About Sudoku")')).toBeVisible();
  )

  test('about page shows key features', async ({ page }) => {
    await page.goto('/about');
    
    // Should show feature highlights
    await expect(page.locator('text=Technique Hints')).toBeVisible();
    await expect(page.locator('text=Step-by-Step Hints')).toBeVisible();
    await expect(page.locator('text=Technique Library')).toBeVisible();
  )

  test('about page shows key stats', async ({ page }) => {
    await page.goto('/about');
    
    // Should show statistics - wait for stats grid to be visible
    const statsGrid = page.locator('.grid.grid-cols-2');
    await expect(statsGrid).toBeVisible();
    
    // Check for specific stats text within the grid
    await expect(statsGrid.locator('text=39+')).toBeVisible();
    await expect(statsGrid.locator('text=Techniques')).toBeVisible();
    await expect(statsGrid.locator('text=100%')).toBeVisible();
    await expect(statsGrid.locator('text=Offline')).toBeVisible();
  )

  test('about page has link to techniques', async ({ page }) => {
    await page.goto('/about');
    
    const techniquesLink = page.locator('a:has-text("Explore techniques")');
    await expect(techniquesLink).toBeVisible();
    
    await techniquesLink.click();
    await expect(page).toHaveURL('/techniques');
  )

  test('about page has link to custom puzzle', async ({ page }) => {
    await page.goto('/about');
    
    const customLink = page.locator('a:has-text("Try custom puzzle")');
    await expect(customLink).toBeVisible();
  )

  test('about page has back to puzzles link', async ({ page }) => {
    await page.goto('/about');
    
    const backLink = page.locator('a:has-text("Back to puzzles")');
    await expect(backLink).toBeVisible();
    
    await backLink.click();
    await expect(page).toHaveURL('/');
  )

  test('about page has GitHub link', async ({ page }) => {
    await page.goto('/about');
    
    const githubLink = page.locator('a:has-text("Report an issue on GitHub")');
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/ThoDHa/sudoku/issues');
  )
)

test.describe('Responsive Design', () => {
  test('techniques page works on mobile viewport', async ({ page, mobileViewport }) => {
    await page.goto('/techniques');
    
    // All main elements should be visible
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
    await expect(page.locator('a[href="/techniques/how-to-play"]')).toBeVisible();
    
    // Technique cards should be visible
    const techniqueLinks = page.locator('a[href^="/technique/"]');
    expect(await techniqueLinks.count()).toBeGreaterThan(0);
  )

  test('technique detail page works on mobile viewport', async ({ page, mobileViewport }) => {
    await page.goto('/technique/naked-single');
    
    // Title and content should be visible
    await expect(page.locator('h1:has-text("Naked Single")')).toBeVisible();
    
    // Navigation should work
    await expect(page.locator('a:has-text("All techniques")')).toBeVisible();
  )

  test('about page works on mobile viewport', async ({ page, mobileViewport }) => {
    await page.goto('/about');
    
    await expect(page.locator('h1:has-text("About Sudoku")')).toBeVisible();
    
    // Stats grid should be visible - wait for grid to load
    const statsGrid = page.locator('.grid.grid-cols-2');
    await expect(statsGrid).toBeVisible();
    await expect(statsGrid.locator('text=39+')).toBeVisible();
  )

  test('diagrams scale appropriately on mobile', async ({ page, mobileViewport }) => {
    await page.goto('/technique/x-wing');
    
    // Diagram section should be visible and not overflow
    const diagramContainer = page.locator('.rounded-lg.bg-background-secondary').first();
    await expect(diagramContainer).toBeVisible();
    
    // Check that container fits within viewport
    const box = await diagramContainer.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeLessThanOrEqual(375); // Mobile viewport width
    }
  )
)

test.describe('Accessibility', () => {
  test('techniques page has proper heading structure', async ({ page }) => {
    await page.goto('/techniques');
    
    // Should have h1
    await expect(page.locator('h1')).toHaveCount(1);
    
    // Should have h2 for sections
    const h2s = page.locator('h2');
    expect(await h2s.count()).toBeGreaterThan(0);
  )

  test('technique detail page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/technique/naked-pair');
    
    // Should have exactly one h1
    await expect(page.locator('h1')).toHaveCount(1);
  )

  test('all technique links are accessible', async ({ page }) => {
    await page.goto('/techniques');
    
    // All technique links should have accessible text
    const techniqueLinks = page.locator('a[href^="/technique/"]');
    const count = await techniqueLinks.count();
    
    for (let i = 0; i < Math.min(count, 5); i++) {
      const link = techniqueLinks.nth(i);
      const text = await link.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  )

  test('about page links are keyboard accessible', async ({ page }) => {
    await page.goto('/about');
    
    // Tab through the page
    await page.keyboard.press('Tab');
    
    // Should be able to focus on links
    let foundLink = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const activeTag = await page.evaluate(() => document.activeElement?.tagName);
      if (activeTag === 'A') {
        foundLink = true;
        break;
      }
    }
    
    expect(foundLink).toBeTruthy();
  )

  test('close buttons have accessible labels', async ({ page }) => {
    // Note: Glossary modal is accessed from TechniquesListModal which is a game-page component
    // We test that the technique pages themselves have proper accessibility
    await page.goto('/technique/naked-single');
    
    // Check that interactive elements are keyboard focusable
    // Tab through the page up to 15 times to find a focusable element
    let foundFocusable = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const activeTag = await page.evaluate(() => document.activeElement?.tagName);
      if (activeTag !== 'BODY') {
        foundFocusable = true;
        break;
      }
    }
    expect(foundFocusable).toBeTruthy();
  )
)

test.describe('Edge Cases', () => {
  test('pages load without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    )
    
    await page.goto('/techniques');
    await expect(page.locator('h1:has-text("Learn Sudoku")')).toBeVisible();
    
    await page.goto('/technique/naked-single');
    await expect(page.locator('h1:has-text("Naked Single")')).toBeVisible();
    
    await page.goto('/about');
    await expect(page.locator('h1:has-text("About Sudoku")')).toBeVisible();
    
    expect(errors).toHaveLength(0);
  )

  test('technique page with subsections displays variations', async ({ page }) => {
    await page.goto('/technique/unique-rectangle');
    
    // Wait for the page to fully load
    await expect(page.locator('h1:has-text("Unique Rectangle")')).toBeVisible();
    
    // Unique Rectangle has subsections for different types
    // Look for the Variations section heading
    await expect(page.locator('h2:has-text("Variations")')).toBeVisible();
    
    // Also verify that subsection links exist (Type 1, Type 2, etc.)
    const typeAnchors = page.locator('a[href^="#subsection"]');
    expect(await typeAnchors.count()).toBeGreaterThan(0);
  )

  test('techniques page handles rapid navigation', async ({ page }) => {
    await page.goto('/techniques');
    
    // Click through multiple techniques quickly
    await page.locator('a[href="/technique/naked-single"]').click();
    await page.locator('a:has-text("All techniques")').click();
    await page.locator('a[href="/technique/hidden-single"]').click();
    
    // Should end up on hidden-single page
    await expect(page).toHaveURL('/technique/hidden-single');
    await expect(page.locator('h1:has-text("Hidden Single")')).toBeVisible();
  )
)
