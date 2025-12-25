export default class Log {
    constructor() {
        this.TYPE_ERROR = 0
        this.TYPE_INFO = 1
        this.TYPE_DEBUG = 2
        this.TYPE_WARNING = 3
        this.activation = config.log.activation
    }

    show(params) {
        switch(typeof params) {
            case 'string':
                console.log(params)
                break
            case 'object':
                switch(params.type) {
                    case this.TYPE_ERROR: 
                        if (this.activation[0]) console.log("MESSAGE:", params.msg + " - TYPE: Error")
                        break
                    case this.TYPE_WARNING:
                        if (this.activation[3]) console.log("MESSAGE:", params.msg + " - TYPE: Warning")
                        break
                    case this.TYPE_INFO: 
                        if (this.activation[1]) console.log("MESSAGE:", params.msg + " - TYPE: Info")
                        break
                    case this.TYPE_DEBUG: 
                        if (this.activation[2]) console.log("MESSAGE:", params.msg + " - TYPE: Debug")
                        break
                }
                break
        }
    }
}