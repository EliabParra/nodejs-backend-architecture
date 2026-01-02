export class StatusBar {
    constructor() {
        this.bar = document.createElement('div')
        this.bar.classList.add('status-bar')
        document.body.appendChild(this.bar)
        this.hide()
    }

    msg(msg) {
        this.bar.innerText = msg
        return this
    }

    show(msg) {
        if (msg) this.msg(msg)
        this.bar.style.left = '10px'
        this.bar.style.top = '10px'
        this.bar.style.display = 'flex'
        setTimeout(() => {
            this.hide()
        }, 3000)
        return this
    }

    hide() {
        this.bar.style.display = 'none'
        this.bar.innerHTML = ''
        return this
    }

    showAlerts(alerts) {
        alerts.forEach((alert) => (this.bar.innerHTML += `<p>${alert}</p>` + '<br>'))
        this.show()
        return this
    }
}
