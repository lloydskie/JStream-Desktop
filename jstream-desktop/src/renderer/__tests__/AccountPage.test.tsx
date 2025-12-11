import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import AccountPage from '../AccountPage'
import { vi } from 'vitest'
import '@testing-library/jest-dom'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { act } from 'react'

// Mock tmdbClient to return known movie data
vi.mock('../../utils/tmdbClient', () => ({
  fetchTMDB: async (endpoint: string) => {
    const idMatch = endpoint.match(/movie\/(\d+)/);
    if (idMatch) {
      const id = idMatch[1]
      return { id: Number(id), title: `Test Movie ${id}`, poster_path: null }
    }
    return { results: [] }
  }
}))

test('AccountPage shows favorites and supports remove and swap', async () => {
  let dbRows: any[] = [
    { id: 10, item_type: 'movie', item_id: '1', sort_order: 0 },
    { id: 11, item_type: 'movie', item_id: '2', sort_order: 1 },
  ];

  const mocks = {
    favoritesList: vi.fn(async () => dbRows.slice()),
    favoritesRemove: vi.fn(async (itemId: string) => {
      dbRows = dbRows.filter(r => r.item_id !== itemId);
      return true;
    }),
    favoritesSwap: vi.fn(async (a: number, b: number) => {
      const ai = dbRows.findIndex(r => r.id === a);
      const bi = dbRows.findIndex(r => r.id === b);
      if (ai >= 0 && bi >= 0) {
        const tmp = dbRows[ai];
        dbRows[ai] = dbRows[bi];
        dbRows[bi] = tmp;
      }
      return true;
    })
  };

  (globalThis as any).window = Object.assign(globalThis.window || {}, { database: mocks });

  const { rerender, unmount } = render(
    <ChakraProvider value={defaultSystem}>
      <AccountPage />
    </ChakraProvider>
  )

  // Wait for both favorites to show
  expect(await screen.findByText('Test Movie 1')).toBeInTheDocument()
  expect(await screen.findByText('Test Movie 2')).toBeInTheDocument()

  // Remove the first movie
  const removeBtn = screen.getAllByText('Remove')[0]
  await act(async () => { fireEvent.click(removeBtn) })
  // The database removal function should have been called
  expect(mocks.favoritesRemove).toHaveBeenCalledWith('1', 'movie')
  // And the UI should no longer show movie 1
  expect(screen.queryByText('Test Movie 1')).not.toBeInTheDocument()

  // Now swap the two favorites (since only one remains after removal, add one back)
  dbRows = [
    { id: 10, item_type: 'movie', item_id: '1', sort_order: 0 },
    { id: 11, item_type: 'movie', item_id: '2', sort_order: 1 },
  ];
  // Re-render or force a refresh by re-mounting AccountPage
  // Unmount and re-render the component so the useEffect will re-run
  unmount()
  const { rerender: rerenderAgain } = render(
    <ChakraProvider value={defaultSystem}>
      <AccountPage />
    </ChakraProvider>
  )

  // Click Move Down on the first item to swap
  const moveDown = await screen.findAllByText('Move Down')
  await act(async () => { fireEvent.click(moveDown[0]) })
  expect(mocks.favoritesSwap).toHaveBeenCalled()
  // After swap, re-fetch occurs and the first item should now be movie 2
  expect(await screen.findByText('Test Movie 2')).toBeInTheDocument()
})
