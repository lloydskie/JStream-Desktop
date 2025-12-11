import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import VideoPlayer from '../VideoPlayer'
import { act } from 'react'
import { vi } from 'vitest'
// Mock remoteConfig so tests don't attempt to initialize Firebase (IndexedDB not available in Node test env)
vi.mock('../../utils/remoteConfig', () => ({
  getPlayerConfig: async () => ({
    tmdbApiKey: 'fake',
    movieBaseUrl: 'https://player.videasy.net/movie/',
    tvBaseUrl: 'https://player.videasy.net/tv/',
    animeBaseUrl: 'https://player.videasy.net/anime/',
    defaultColor: '8B5CF6',
    enableOverlay: true,
    enableEpisodeSelector: true,
    enableAutoplayNext: true,
  }),
  buildVideasyUrl: (config: any, type: string, params: any) => `https://player.videasy.net/movie/${params.tmdbId}`
}))
import '@testing-library/jest-dom'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'

test('VideoPlayer listens for progress messages and calls watchHistorySet', async () => {
  Object.assign(window as any, {
    database: {
      watchHistorySet: vi.fn(async () => true),
    }
  })
  render(
    <ChakraProvider value={defaultSystem}>
      <VideoPlayer type='movie' params={{ tmdbId: 123 }} />
    </ChakraProvider>
  )
  // Dispatch a message similar to what the player would send
  await act(async () => {
    window.postMessage({ type: 'videasy:progress', position: 25 }, '*')
    // The listener is async - allow microtask time
    await new Promise(r => setTimeout(r, 50))
  })
  expect((window as any).database.watchHistorySet).toHaveBeenCalled()
})

test('VideoPlayer seeks on load when watch history exists', async () => {
  const postSpy = vi.spyOn(window as any, 'postMessage')
  Object.assign(window as any, {
    database: {
      watchHistorySet: vi.fn(async () => true),
      watchHistoryGet: vi.fn(async () => 45),
    }
  })
  render(
    <ChakraProvider value={defaultSystem}>
      <VideoPlayer type='movie' params={{ tmdbId: 123 }} />
    </ChakraProvider>
  )
  // Ensure iframe is present
  const iframe = await screen.findByTitle('Videasy Player') as HTMLIFrameElement
  // Override the postMessage on the iframe contentWindow
  const cw: any = (iframe as any).contentWindow
  cw.postMessage = postSpy
  // Trigger onLoad event to cause the player to attempt a seek
  fireEvent.load(iframe)
  // Allow microtask queue to flush
  await new Promise(r => setTimeout(r, 25))
  expect(postSpy).toHaveBeenCalled()
  expect(postSpy).toHaveBeenCalledWith({ type: 'videasy:seek', position: 45 }, '*')
  postSpy.mockRestore()
})
