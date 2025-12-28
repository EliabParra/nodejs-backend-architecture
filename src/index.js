import './globals.js'
import './router/routes.js'
import Dispatcher from "./BSS/Dispatcher.js"

const dispatcher = new Dispatcher()
dispatcher.serverOn()