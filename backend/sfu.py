import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRelay
from aiortc.sdp import candidate_from_sdp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sfu")


class UserRole(Enum):
    SHARER = "sharer"
    VIEWER = "viewer"


@dataclass
class RoomMedia:
    sharer_id: str
    video_track: Optional[object] = None
    audio_track: Optional[object] = None

    def has_tracks(self) -> bool:
        return self.video_track is not None or self.audio_track is not None


@dataclass
class UserConnection:
    user_id: str
    room_id: str
    peer_connection: RTCPeerConnection
    role: UserRole
    pending_ice_candidates: List[dict] = field(default_factory=list)


class SFUManager:
    def __init__(self):
        self._connections: Dict[str, UserConnection] = {}
        self._rooms: Dict[str, Set[str]] = {}  # room_id -> set of user_ids
        self._relay = MediaRelay()
        self._room_media: Dict[str, RoomMedia] = {}

    async def create_connection(self, room_id: str, user_id: str, role: UserRole) -> RTCPeerConnection:
        if user_id in self._connections:
            await self.cleanup_user(room_id, user_id)

        pc = RTCPeerConnection()
        connection = UserConnection(user_id=user_id, room_id=room_id, peer_connection=pc, role=role)
        self._connections[user_id] = connection
        if room_id not in self._rooms:
            self._rooms[room_id] = set()
        self._rooms[room_id].add(user_id)
        self._setup_connection_handlers(pc, room_id, user_id)
        return pc

    def _setup_connection_handlers(self, pc: RTCPeerConnection, room_id: str, user_id: str) -> None:
        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            if pc.connectionState in ["failed", "closed"]:
                await self.cleanup_user(room_id, user_id)

    async def handle_offer(self, room_id: str, user_id: str, sdp: str, is_sharer: bool) -> RTCSessionDescription:
        role = UserRole.SHARER if is_sharer else UserRole.VIEWER

        if is_sharer and room_id in self._room_media:
            existing_sharer = self._room_media[room_id].sharer_id
            if existing_sharer != user_id:
                raise ValueError(f"Room {room_id} already has a sharer: {existing_sharer}")

        pc = await self.create_connection(room_id, user_id, role)
        if is_sharer:
            self._setup_sharer_tracks(pc, room_id, user_id)
        else:
            await self._add_viewer_tracks(pc, room_id, user_id)

        # Process the offer
        await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp, type="offer"))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await self._process_pending_ice_candidates(user_id)
        return answer

    def _setup_sharer_tracks(self, pc: RTCPeerConnection, room_id: str, user_id: str) -> None:
        @pc.on("track")
        def on_track(track):
            if room_id not in self._room_media:
                self._room_media[room_id] = RoomMedia(sharer_id=user_id)

            room_media = self._room_media[room_id]
            if track.kind == "video":
                room_media.video_track = track
            elif track.kind == "audio":
                room_media.audio_track = track
            else:
                logger.warning(f"Unknown track kind: {track.kind}")

            self._notify_viewers_of_new_track(room_id, track)

    def _notify_viewers_of_new_track(self, room_id: str, track) -> None:
        if room_id not in self._rooms:
            return
        for user_id in self._rooms[room_id]:
            connection = self._connections.get(user_id)
            if connection and connection.role == UserRole.VIEWER:
                relayed_track = self._relay.subscribe(track)
                connection.peer_connection.addTrack(relayed_track)

    async def _add_viewer_tracks(self, pc: RTCPeerConnection, room_id: str, user_id: str) -> None:
        room_media = self._room_media.get(room_id)

        if not room_media:
            return

        tracks_added = 0
        for kind in ["video", "audio"]:
            track = getattr(room_media, f"{kind}_track", None)
            if track:
                relayed_track = self._relay.subscribe(track)
                pc.addTrack(relayed_track)
                tracks_added += 1

        if tracks_added == 0:
            pass

    async def handle_ice_candidate(self, user_id: str, candidate_dict: dict) -> None:
        candidate_str = candidate_dict.get("candidate")

        if not candidate_str:
            return

        connection = self._connections.get(user_id)

        if not connection:
            return

        try:
            await self._add_ice_candidate(connection.peer_connection, candidate_dict)
        except Exception:
            connection.pending_ice_candidates.append(candidate_dict)

    async def _add_ice_candidate(self, pc: RTCPeerConnection, candidate_dict: dict) -> None:
        candidate_str = candidate_dict.get("candidate", "")
        if candidate_str.startswith("candidate:"):
            candidate_str = candidate_str.split(":", 1)[1]

        candidate = candidate_from_sdp(candidate_str)
        candidate.sdpMid = candidate_dict.get("sdpMid")
        candidate.sdpMLineIndex = candidate_dict.get("sdpMLineIndex")

        await pc.addIceCandidate(candidate)

    async def _process_pending_ice_candidates(self, user_id: str) -> None:
        connection = self._connections.get(user_id)
        if not connection or not connection.pending_ice_candidates:
            return

        candidates = connection.pending_ice_candidates
        connection.pending_ice_candidates = []

        for candidate_dict in candidates:
            try:
                await self._add_ice_candidate(connection.peer_connection, candidate_dict)
            except Exception:
                pass

    async def cleanup_user(self, room_id: str, user_id: str) -> None:
        connection = self._connections.pop(user_id, None)
        if connection:
            try:
                await connection.peer_connection.close()
            except Exception:
                pass

        if room_id in self._rooms:
            self._rooms[room_id].discard(user_id)
            if not self._rooms[room_id]:
                del self._rooms[room_id]

        room_media = self._room_media.get(room_id)
        if room_media and room_media.sharer_id == user_id:
            del self._room_media[room_id]

            # notify remaining viewers about sharer leaving

    async def cleanup_room(self, room_id: str) -> None:
        if room_id not in self._rooms:
            return

        user_ids = list(self._rooms[room_id])

        for user_id in user_ids:
            await self.cleanup_user(room_id, user_id)

    def get_room_info(self, room_id: str) -> Optional[Dict]:
        if room_id not in self._rooms:
            return None

        users = list(self._rooms[room_id])
        room_media = self._room_media.get(room_id)

        return {
            "room_id": room_id,
            "user_count": len(users),
            "users": users,
            "has_sharer": room_media is not None,
            "sharer_id": room_media.sharer_id if room_media else None,
            "has_video": room_media.video_track is not None if room_media else False,
            "has_audio": room_media.audio_track is not None if room_media else False,
        }

    def get_user_info(self, user_id: str) -> Optional[Dict]:
        connection = self._connections.get(user_id)
        if not connection:
            return None

        pc = connection.peer_connection
        return {
            "user_id": user_id,
            "room_id": connection.room_id,
            "role": connection.role.value,
            "connection_state": pc.connectionState,
            "ice_connection_state": pc.iceConnectionState,
            "ice_gathering_state": pc.iceGatheringState,
        }


sfu = SFUManager()
