/**
 * Custom error class that carries an HTTP status code.
 * Services throw AppError; controllers catch it and forward the status + message.
 */
export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = "AppError";
        // Maintain proper prototype chain in compiled JS
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
