import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initDesktopLinks } from './lib/desktop'

// als Windows-Programm: Links im Standardbrowser bzw. zweiten Fenster öffnen
initDesktopLinks()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
