import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initDesktopLinks } from './lib/desktop'
import { saveTarget } from './lib/save.svelte'

// als Windows-Programm: Links im Standardbrowser bzw. zweiten Fenster öffnen
initDesktopLinks()
// gewählter Ordner für die Downloads
void saveTarget.init()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
