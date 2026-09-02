import { Room } from './room';

const ROOM_ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';  // O, I 제외 (오독 방지)
const ROOM_ID_LENGTH = 4;

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): { roomId: string; room: Room } {
    let roomId: string;
    do {
      roomId = Array.from({ length: ROOM_ID_LENGTH }, () =>
        ROOM_ID_CHARS[Math.floor(Math.random() * ROOM_ID_CHARS.length)],
      ).join('');
    } while (this.rooms.has(roomId));

    const room = new Room(roomId, () => this.removeRoom(roomId));
    this.rooms.set(roomId, room);
    return { roomId, room };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  removeRoom(roomId: string): void {
    this.rooms.delete(roomId);
  }
}
