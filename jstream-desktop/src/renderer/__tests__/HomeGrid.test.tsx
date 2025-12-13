import React from 'react'
import { render, screen } from '@testing-library/react'
import HomeGrid from '../HomeGrid'
import { vi } from 'vitest'
import '@testing-library/jest-dom'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'

vi.mock('../../utils/tmdbClient', () => ({
  fetchTMDB: async (endpoint: string) => ({ results: [{ id: 1, title: 'Test Movie', poster_path: null, release_date: '2024-01-01', overview: 'Overview' }] })
}))

test('HomeGrid renders movie cards', async () => {
  // Mock preload database methods to avoid reading from undefined window.database
  (globalThis as any).window = Object.assign(globalThis.window || {}, {
    database: {
      favoritesList: vi.fn(async () => []),
      favoritesIs: vi.fn(async () => false),
    }
  });

  render(
    <ChakraProvider value={defaultSystem}>
      <HomeGrid />
    </ChakraProvider>
  )
  const matches = await screen.findAllByText('Test Movie');
  expect(matches.length).toBeGreaterThan(0);
})
