import 'colors'

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
                        if (this.activation[0]) console.log("[MESSAGE]: ".white + `${params.msg} - TYPE: Error`.red)
                        break
                    case this.TYPE_WARNING:
                        if (this.activation[3]) console.log("[MESSAGE]: ".white + `${params.msg} - TYPE: Warning`.yellow)
                        break
                    case this.TYPE_INFO: 
                        if (this.activation[1]) console.log("[MESSAGE]: ".white + `${params.msg} - TYPE: Info`.blue)
                        break
                    case this.TYPE_DEBUG: 
                        if (this.activation[2]) console.log("[MESSAGE]: ".white + `${params.msg} - TYPE: Debug`.magenta)
                        break
                }
                break
        }
    }
}