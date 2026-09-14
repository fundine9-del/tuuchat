import { livesApi } from './api'
import { emitLive, subscribe } from './socket'
import type { LiveComment, LiveSession } from './types'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export type LiveStage = 'idle' | 'live' | 'joining' | 'watching' | 'ended'

export interface LiveSnapshot {
  stage: LiveStage
  live: LiveSession | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  viewers: number
  likes: number
  comments: LiveComment[]
  notice: string | null
}

function idleSnapshot(): LiveSnapshot {
  return {
    stage: 'idle',
    live: null,
    localStream: null,
    remoteStream: null,
    viewers: 0,
    likes: 0,
    comments: [],
    notice: null,
  }
}

class LiveManager {
  private state: LiveSnapshot = idleSnapshot()
  private listeners = new Set<(s: LiveSnapshot) => void>()
  private noticeTimer: ReturnType<typeof setTimeout> | null = null

  // host side: one RTCPeerConnection per joined viewer
  private hostPcs = new Map<string, RTCPeerConnection>()

  // viewer side: one RTCPeerConnection to the host
  private viewerPc: RTCPeerConnection | null = null

  constructor() {
    subscribe('liveViewerCount', (l) => {
      if (this.state.live?.id !== l.liveId) return
      this.mutate({ viewers: l.viewers })
    })

    subscribe('liveJoined', (l) => {
      if (this.state.live?.id !== l.liveId) return
      this.mutate({ stage: 'watching', viewers: l.viewers })
    })

    subscribe('liveNoSuch', () => {
      if (this.state.stage !== 'joining') return
      this.setNotice('Live not found')
      this.cleanup(true)
    })

    subscribe('liveWatchOffer', ({ liveId, sdp, viewerSocketId }) => {
      if (this.state.stage !== 'live' || this.state.live?.id !== liveId) return
      void this.handleViewerOffer(viewerSocketId, sdp)
    })

    subscribe('liveHostAnswer', ({ liveId, sdp }) => {
      if (!this.viewerPc || this.state.live?.id !== liveId) return
      void this.viewerPc.setRemoteDescription(sdp).catch(() => undefined)
    })

    subscribe('liveIce', ({ liveId, candidate, to, viewerSocketId }) => {
      if (this.state.live?.id !== liveId) return
      if (to === 'host' && viewerSocketId) {
        const pc = this.hostPcs.get(viewerSocketId)
        if (pc) pc.addIceCandidate(candidate).catch(() => undefined)
      } else if (to === 'viewer' && this.viewerPc) {
        this.viewerPc.addIceCandidate(candidate).catch(() => undefined)
      }
    })

    subscribe('liveComment', (comment) => {
      if (this.state.live?.id !== comment.liveId) return
      this.mutate({ comments: [...this.state.comments, comment] })
    })

    subscribe('liveLikes', (l) => {
      if (this.state.live?.id !== l.liveId) return
      this.mutate({ likes: l.likes })
    })

    subscribe('liveEnded', ({ liveId }) => {
      if (this.state.live?.id !== liveId) return
      if (this.state.stage === 'watching' || this.state.stage === 'joining') {
        this.setNotice('Live ended')
        this.cleanupLive()
        this.mutate({ stage: 'ended' })
      } else if (this.state.stage === 'live') {
        this.cleanupLive()
        this.mutate({ stage: 'ended', notice: 'Your live has ended' })
      }
    })
  }

  get snapshot(): LiveSnapshot {
    return this.state
  }

  subscribe(cb: (s: LiveSnapshot) => void): () => void {
    this.listeners.add(cb)
    cb(this.state)
    return () => this.listeners.delete(cb)
  }

  private mutate(partial: Partial<LiveSnapshot>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l(this.state))
  }

  private setNotice(notice: string) {
    this.mutate({ notice })
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => this.mutate({ notice: null }), 3500)
  }

  /* -------------------------- host: start -------------------------- */

  async start(title: string) {
    if (this.state.stage !== 'idle') return null
    try {
      const local = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      let live: LiveSession
      try {
        ;({ live } = await livesApi.start(title))
      } catch {
        local.getTracks().forEach((t) => t.stop())
        this.setNotice('Could not start your live')
        return null
      }
      this.mutate({ stage: 'live', live, localStream: local, viewers: 0, likes: 0, comments: [] })
      return live
    } catch {
      this.setNotice('Could not access camera / microphone')
      return null
    }
  }

  private async handleViewerOffer(viewerSocketId: string, offer: RTCSessionDescriptionInit) {
    const local = this.state.localStream
    if (!local) return
    const pc = new RTCPeerConnection(RTC_CONFIG)
    this.hostPcs.set(viewerSocketId, pc)
    local.getTracks().forEach((t) => pc.addTrack(t, local))
    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.state.live) return
      emitLive('live:ice', {
        liveId: this.state.live.id,
        candidate: e.candidate.toJSON(),
        to: 'viewer',
        viewerSocketId,
      })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.hostPcs.delete(viewerSocketId)
      }
    }
    try {
      await pc.setRemoteDescription(offer)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      emitLive('live:host-answer', {
        liveId: this.state.live!.id,
        sdp: pc.localDescription,
        viewerSocketId,
      })
    } catch {
      this.hostPcs.delete(viewerSocketId)
      pc.close()
    }
  }

  /* ------------------------- viewer: join ------------------------- */

  async join(live: LiveSession) {
    if (this.state.stage !== 'idle' && this.state.stage !== 'ended') return
    this.mutate({ stage: 'joining', live, remoteStream: null, viewers: live.viewer_count, likes: live.likes ?? 0, comments: [] })
    void this.loadComments()
    try {
      const pc = new RTCPeerConnection(RTC_CONFIG)
      this.viewerPc = pc
      pc.ontrack = (e) => {
        const stream = e.streams[0]
        if (stream) this.mutate({ remoteStream: stream })
      }
      pc.onicecandidate = (e) => {
        if (!e.candidate || !this.state.live) return
        emitLive('live:ice', {
          liveId: this.state.live.id,
          candidate: e.candidate.toJSON(),
          to: 'host',
        })
      }
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          this.setNotice('Connection lost')
          this.leave()
        }
      }
      // receive-only: viewers publish no media, but the offer MUST still carry
      // m-lines so the host's answer negotiates audio+video back to us
      pc.addTransceiver('audio', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })
      emitLive('live:watch', { liveId: live.id })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      emitLive('live:watch-offer', { liveId: live.id, sdp: pc.localDescription })
    } catch {
      this.setNotice('Could not join the live')
      this.leave()
    }
  }

  leave() {
    if (this.state.live && (this.state.stage === 'joining' || this.state.stage === 'watching')) {
      emitLive('live:leave', { liveId: this.state.live.id })
    }
    this.cleanup(true)
  }

  end() {
    if (this.state.live && this.state.stage === 'live') {
      emitLive('live:end', { liveId: this.state.live.id })
    }
    this.cleanupLive()
    this.mutate({ stage: 'ended', notice: 'You ended your live' })
  }

  /* ---------------------------- live comments ---------------------------- */

  async sendComment(content: string) {
    const text = content.trim().slice(0, 500)
    const live = this.state.live
    if (!text || !live || (this.state.stage !== 'live' && this.state.stage !== 'watching')) return
    emitLive('live:comment', { liveId: live.id, content: text })
  }

  sendLike() {
    const live = this.state.live
    if (!live || (this.state.stage !== 'live' && this.state.stage !== 'watching')) return
    emitLive('live:like', { liveId: live.id })
  }

  async loadComments() {
    const live = this.state.live
    if (!live) return
    try {
      const { comments } = await livesApi.comments(live.id, 50)
      this.mutate({ comments })
    } catch {
      /* ignore */
    }
  }

  /* ---------------------------- cleanup ---------------------------- */

  private cleanupLive() {
    this.state.localStream?.getTracks().forEach((t) => t.stop())
    for (const pc of this.hostPcs.values()) pc.close()
    this.hostPcs.clear()
    if (this.viewerPc) this.viewerPc.close()
    this.viewerPc = null
    this.mutate({ localStream: null, remoteStream: null })
  }

  private cleanup(reset: boolean) {
    if (this.noticeTimer) {
      clearTimeout(this.noticeTimer)
      this.noticeTimer = null
    }
    this.cleanupLive()
    if (reset) {
      const notice = this.state.notice
      this.mutate({ ...idleSnapshot(), notice })
    }
  }
}

export const liveManager = new LiveManager()