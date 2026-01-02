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
