import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import HomeGrid from '../HomeGrid'
import { vi } from 'vitest'
import '@testing-library/jest-dom'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'

vi.mock('../../utils/tmdbClient', () => ({
  fetchTMDB: async (endpoint: string) => ({ results: [{ id: 1, title: 'Test Movie', poster_path: null, release_date: '2024-01-01', overview: 'Overview' }] })
}))

test('Favorites toggle calls database IPC', async () => {
  // Mock preload database methods
  (globalThis as any).window = Object.assign(globalThis.window || {}, {
    database: {
      favoritesList: vi.fn(async () => []),
      favoritesAdd: vi.fn(async () => true),
      favoritesRemove: vi.fn(async () => true),
    }
  });

  render(
    <ChakraProvider value={defaultSystem}>
      <HomeGrid />
    </ChakraProvider>
  )

  const favBtns = await screen.findAllByLabelText('Favorite Test Movie')
  expect(favBtns.length).toBeGreaterThan(0)
  const favBtn = favBtns[0]
  await act(async () => {
    fireEvent.click(favBtn)
  })
  expect((window as any).database.favoritesAdd).toHaveBeenCalledWith('1', 'movie')
})
