export class StoreError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StoreError";
    this.status = status;
  }
}

export type LoginFailureReason = "user not found" | "password mismatch" | "session error";

export class LoginFailure extends StoreError {
  readonly reason: LoginFailureReason;

  constructor(reason: LoginFailureReason) {
    super("Those credentials were not recognized.", reason === "session error" ? 500 : 401);
    this.name = "LoginFailure";
    this.reason = reason;
  }
}
