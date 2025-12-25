import { StatusBar } from './StatusBar.js'
import { Sender } from './Sender.js'
const statusBar = new StatusBar()
const sender = new Sender(statusBar)

const login = async (e) => {
    e.preventDefault()
    const username = document.querySelector('#username').value
    const password = document.querySelector('#password').value

    if (!username || !password) return statusBar.show('Por favor, rellena todos los campos')
    const data = await sender.send({ body: { username, password } }, '/login')
    // if (data.status === 200) return window.location.href = '/content'
}

const logout = async (e) => {
    e.preventDefault()
    const data = await sender.send({ body: { msg: 'logout' } }, '/logout')
    if (data.status === 200) return window.location.href = '/'
}

const crudPerson = async (e, action) => {
    e.preventDefault()
    const id = parseInt(document.querySelector('#id').value)
    const name = document.querySelector('#name').value
    const lastName = document.querySelector('#lastName').value
    let tx = 0
    let params = []
    switch (action) {
        case 'get':
            tx = 53
            params = name ? [name] : [id]
            break
        case 'create':
            tx = 63
            params = [name, lastName]
            break
        case 'update':
            tx = 73
            params = [name, lastName, id]
            break
        case 'delete':
            tx = 83
            params = name ? [name] : [id]
            break
    }

    const data = await sender.send({ body: { tx, params } })
}

const getBtn = document.querySelector('#getBtn')
const createBtn = document.querySelector('#createBtn')
const updateBtn = document.querySelector('#updateBtn')
const deleteBtn = document.querySelector('#deleteBtn')
const submitBtn = document.querySelector('#submitBtn')
const logoutBtn = document.querySelector('#logoutBtn')
if (submitBtn) submitBtn.addEventListener('click', async (e) => login(e))
if (logoutBtn) logoutBtn.addEventListener('click', async (e) => logout(e))
if (getBtn) getBtn.addEventListener('click', (e) => crudPerson(e, 'get'))
if (createBtn) createBtn.addEventListener('click', (e) => crudPerson(e, 'create'))
if (updateBtn) updateBtn.addEventListener('click', (e) => crudPerson(e, 'update'))
if (deleteBtn) deleteBtn.addEventListener('click', (e) => crudPerson(e, 'delete'))