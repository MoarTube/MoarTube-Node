interface Socket {
  readyState: number;
  bufferedAmount?: number;
  send(message: string): void;
  close(code: number, reason: string): void;
}

export function sendBounded(socket: Socket, message: string): boolean {
  if (socket.readyState !== 1) {
    return false;
  }
  if ((socket.bufferedAmount ?? 0) + Buffer.byteLength(message) > 1024 ** 2) {
    socket.close(1013, 'Slow consumer');
    return false;
  }
  socket.send(message);
  return true;
}
