export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(message: string, code = 'error', exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class NotLoggedInError extends CliError {
  constructor(env: string) {
    super(`Not logged in to ${env}. Run: uncola login`, 'not_logged_in', 4);
  }
}
