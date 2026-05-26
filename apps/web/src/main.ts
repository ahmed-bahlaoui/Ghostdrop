import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/share-target-sw.js')
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error)
      })
  })
}

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
