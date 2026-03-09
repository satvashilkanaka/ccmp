export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request') { super(400, message); }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(401, message); }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(403, message); }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not Found') { super(404, message); }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') { super(409, message); }
}

export class UnprocessableError extends AppError {
  constructor(message = 'Unprocessable Entity') { super(422, message); }
}
