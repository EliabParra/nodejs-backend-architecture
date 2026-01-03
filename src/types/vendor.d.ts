// Minimal ambient module declarations for the TS migration.
// We intentionally treat these runtime dependencies as `any` until we decide to add @types packages.

declare module 'express' {
    const express: any
    export default express
}

declare module 'cors' {
    const cors: any
    export default cors
}

declare module 'helmet' {
    const helmet: any
    export default helmet
}

declare module 'express-session' {
    const session: any
    export default session
}

declare module 'connect-pg-simple' {
    const connectPgSimple: any
    export default connectPgSimple
}

declare module 'express-rate-limit' {
    const rateLimit: any
    export default rateLimit
}
