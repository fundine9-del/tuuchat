export type UserStatus = 'online' | 'offline' | 'away' | 'busy'
export type ConversationType = 'direct' | 'group'
export type MessageType = 'text' | 'image' | 'file'

export interface User {
  id: string
  username: string
  email: string
  display_name: string
  bio: string | null
  avatar_url: string | null
  status: UserStatus
  last_seen: string
  created_at: string
  online?: boolean
}

export interface Participant {
  id: string
  display_name: string
  avatar_url: string | null
  role: 'member' | 'admin'
  status?: UserStatus
  online?: boolean
}

export interface LastMessage {
  id: string
  sender_id: string
  message_type: MessageType
  content: string
  created_at: string
  sender_name?: string | null
}

export interface Conversation {
  id: string
  type: ConversationType
  name: string | null
  avatar_url: string | null
  created_by: string | null
  created_at: string
  participant_count: number
  last_message: LastMessage | null
  participants: Participant[]
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  message_type: MessageType
  content: string
  reply_to_id: string | null
  created_at: string
  edited_at: string | null
  sender_name?: string
  sender_avatar?: string | null
}

export interface TypingUpdate {
  conversationId: string
  userId: string
  isTyping: boolean
}

export interface PresenceUpdate {
  userId: string
  status: UserStatus
  last_seen: string | null
}

export interface Status {
  id: string
  user_id: string
  content: string
  created_at: string
  expires_at: string
  user: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
    status: string
  }
}

export interface StatusDeleted {
  statusId: string
  userId: string
}

/* ------------------------------- calls ------------------------------- */

export type CallKind = 'audio' | 'video'

export interface CallPeer {
  id: string
  display_name: string
  avatar_url: string | null
}

export interface CallInitiate {
  callId: string
  to: string
  conversationId: string
  kind: CallKind
  peer: CallPeer
}

export interface CallSdp {
  callId: string
  to: string
  sdp: RTCSessionDescriptionInit
}

export interface CallIce {
  callId: string
  to: string
  candidate: RTCIceCandidateInit
}

export interface CallUpdate {
  callId: string
  to: string
}

/* --------------------------- live broadcast --------------------------- */

export interface LiveSession {
  id: string
  host_id: string
  title: string
  started_at: string
  host: {
    id: string
    username: string
    display_name: string
    avatar_url: string | null
  }
  viewer_count: number
  likes: number
}

export interface LiveLikes {
  liveId: string
  likes: number
  by?: string
}

export interface LiveComment {
  id: string
  liveId: string
  userId: string
  displayName: string
  avatarUrl: string | null
  content: string
  createdAt: string
}

export interface LiveEnded {
  liveId: string
}

export interface LiveViewerCount {
  liveId: string
  viewers: number
}

export interface LiveJoined {
  liveId: string
  viewers: number
}

export interface LiveNoSuch {
  liveId: string
}

export interface LiveWatchOffer {
  liveId: string
  sdp: RTCSessionDescriptionInit
  viewerSocketId: string
}

export interface LiveHostAnswer {
  liveId: string
  sdp: RTCSessionDescriptionInit
}

export interface LiveIce {
  liveId: string
  candidate: RTCIceCandidateInit
  to: 'host' | 'viewer'
  viewerSocketId?: string
}