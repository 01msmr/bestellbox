// Fehler mit HTTP-Status für Server und Logik
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
