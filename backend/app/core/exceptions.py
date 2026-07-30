from typing import Any


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: list[Any] | None = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, resource: str = "Resource", details: list[Any] | None = None):
        super().__init__("NOT_FOUND", f"{resource} not found", 404, details)


class ForbiddenError(AppError):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__("FORBIDDEN", message, 403)


class UnauthorizedError(AppError):
    def __init__(self, message: str = "Not authenticated"):
        super().__init__("UNAUTHORIZED", message, 401)


class ConflictError(AppError):
    def __init__(self, message: str, details: list[Any] | None = None):
        super().__init__("CONFLICT", message, 409, details)


class ValidationAppError(AppError):
    def __init__(self, message: str, details: list[Any] | None = None):
        super().__init__("VALIDATION_ERROR", message, 422, details)
