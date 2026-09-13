import { emitCall, subscribe } from './socket'
import type { CallKind, CallPeer, CallSdp } from './types'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

const NO_ANSWER_MS = 30_000

export type CallStage = 'idle' | 'outgoing' | 'incoming' | 'active'

export interface CallControls {
  muted: boolean
  cameraOn: boolean
}

export interface CallSnapshot {
  stage: CallStage
  callId: string
  kind: CallKind
  peer: CallPeer | null
  conversationId: string | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  muted: boolean
  cameraOn: boolean
  startedAt: number | null
  notice: string | null
}

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function idleSnapshot(): CallSnapshot {
  return {
    stage: 'idle',
    callId: '',
    kind: 'audio',
    peer: null,
    conversationId: null,
    localStream: null,
    remoteStream: null,
    muted: false,
    cameraOn: true,
    startedAt: null,
    notice: null,
  }
}

/* ----------------------------- ringtones ----------------------------- */

class Ringtone {
  private ctx: AudioContext | null = null
  private timer: number | null = null

  start(kind: 'incoming' | 'outgoing') {
    this.stop()
    try {
      const ctx = new AudioContext()
      this.ctx = ctx
      const pattern = kind === 'incoming' ? [0, 600, 140, 600] : [400, 400, 400, 400]
      const play = () => {
        if (!this.ctx) return
        pattern.forEach((delay, i) => {
          const t = this.ctx!.currentTime + (i * pattern.reduce((a, b) => a + b, 0)) / 4 + delay / 1000
          this.beep(t, i % 2 === 0 ? 440 : 550)
        })
      }
      play()
      this.timer = window.setInterval(play, pattern.reduce((a: number, b: number) => a + b, 0) / 4)
    } catch {
      /* audio unavailable */
    }
  }

  private beep(when: number, freq: number) {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.08, when)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.4)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(when)
    osc.stop(when + 0.45)
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.ctx?.close().catch(() => undefined)
    this.ctx = null
  }
}

/* ---------------------------- call manager ---------------------------- */

class CallManager {
  private state: CallSnapshot = idleSnapshot()
  private listeners = new Set<(s: CallSnapshot) => void>()
  private pc: RTCPeerConnection | null = null
  private pendingOffer: RTCSessionDescriptionInit | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private ringtone = new Ringtone()
  private noAnswerTimer: ReturnType<typeof setTimeout> | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    subscribe('callInitiated', (c) => {
      // already busy -> politely decline the incoming call
      if (this.state.stage !== 'idle') {
        emitCall('call:reject', { callId: c.callId, to: c.peer.id })
        return
      }
      this.mutate({
        stage: 'incoming',
        callId: c.callId,
        kind: c.kind,
        peer: c.peer,
        conversationId: c.conversationId,
        startedAt: null,
      })
      this.ringtone.start('incoming')
    })

    subscribe('callOffer', (c) => {
      if (this.state.stage !== 'incoming' || this.state.callId !== c.callId) return
      this.pendingOffer = c.sdp
    })

    subscribe('callAccepted', (c) => {
      if (this.state.stage !== 'outgoing' || this.state.callId !== c.callId) return
      void this.applyRemote(c)
    })

    subscribe('callAnswer', (c) => {
      if (this.state.stage !== 'outgoing' || this.state.callId !== c.callId) return
      void this.applyRemote(c)
    })

    subscribe('callIce', (c) => {
      if (this.state.callId !== c.callId) return
      const candidate = c.candidate as RTCIceCandidateInit
      if (this.pc) this.pc.addIceCandidate(candidate).catch(() => undefined)
      else this.pendingCandidates.push(candidate)
    })

    subscribe('callRejected', (c) => {
      if (this.state.callId !== c.callId) return
      this.setNotice('Call declined')
      this.cleanup(true)
    })

    subscribe('callCanceled', (c) => {
      if (this.state.callId !== c.callId) return
      this.cleanup(true)
    })

    subscribe('callEnded', (c) => {
      if (this.state.callId !== c.callId) return
      if (this.state.stage === 'active') this.setNotice('Call ended')
      this.cleanup(true)
    })

    subscribe('callUnavailable', (c) => {
      if (this.state.callId !== c.callId) return
      this.setNotice('Not available right now')
      this.cleanup(true)
    })
  }

  get snapshot(): CallSnapshot {
    return this.state
  }

  subscribe(cb: (s: CallSnapshot) => void): () => void {
    this.listeners.add(cb)
    cb(this.state)
    return () => this.listeners.delete(cb)
  }

  private mutate(partial: Partial<CallSnapshot>) {
    this.state = { ...this.state, ...partial }
    this.listeners.forEach((l) => l(this.state))
  }

  private setNotice(notice: string) {
    this.mutate({ notice })
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.noticeTimer = setTimeout(() => this.mutate({ notice: null }), 3500)
  }

  /* ---------------------- call lifecycle (caller) ---------------------- */

  async startOutgoing(peer: CallPeer, kind: CallKind, conversationId: string, self?: CallPeer) {
    if (this.state.stage !== 'idle') return
    const callId = uid()
    this.mutate({
      stage: 'outgoing',
      callId,
      kind,
      peer,
      conversationId,
      localStream: null,
      remoteStream: null,
      muted: false,
      cameraOn: true,
      startedAt: null,
    })
    this.ringtone.start('outgoing')

    try {
      const [pc, local] = await this.createPeer(kind)
      this.pc = pc
      this.mutate({ localStream: local })
      emitCall('call:initiate', { callId, to: peer.id, conversationId, kind, peer: self ?? peer })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this.sendSdp('call:offer', callId, peer.id)
    } catch {
      this.setNotice('Could not start the call')
      this.cleanup(true)
      return
    }

    this.noAnswerTimer = setTimeout(() => {
      if (this.state.stage !== 'outgoing') return
      emitCall('call:cancel', { callId, to: peer.id })
      this.setNotice('No answer')
      this.cleanup(true)
    }, NO_ANSWER_MS)
  }

  /* --------------------- call lifecycle (callee) --------------------- */

  async accept() {
    if (this.state.stage !== 'incoming') return
    this.ringtone.stop()
    const callId = this.state.callId
    const peer = this.state.peer
    if (!peer) return
    try {
      const [pc, local] = await this.createPeer(this.state.kind)
      this.pc = pc
      this.mutate({ localStream: local, startedAt: Date.now() })

      if (!this.pendingOffer) {
        // the offer may still be in flight; wait briefly for it
        const deadline = Date.now() + 3000
        while (!this.pendingOffer && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 30))
        }
      }
      if (this.pendingOffer) await pc.setRemoteDescription(this.pendingOffer)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.pendingCandidates.splice(0).forEach((cand) => pc.addIceCandidate(cand).catch(() => undefined))
      emitCall('call:accept', { callId, to: peer.id, sdp: pc.localDescription })
      this.mutate({ stage: 'active' })
    } catch {
      this.setNotice('Could not join the call')
      this.cleanup(true)
    }
  }

  reject() {
    if (this.state.stage !== 'incoming') return
    this.ringtone.stop()
    emitCall('call:reject', { callId: this.state.callId, to: this.state.peer?.id })
    this.cleanup(true)
  }

  /* ----------------------------- shared ----------------------------- */

  private async createPeer(kind: CallKind): Promise<[RTCPeerConnection, MediaStream]> {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    const local = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video',
    })

    local.getTracks().forEach((t) => pc.addTrack(t, local))

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const peer = this.state.peer
      if (!peer) return
      emitCall('call:ice', {
        callId: this.state.callId,
        to: peer.id,
        candidate: e.candidate.toJSON(),
      })
    }

    pc.ontrack = (e) => {
      const stream = e.streams[0]
      if (stream) this.mutate({ remoteStream: stream, stage: 'active', startedAt: this.state.startedAt ?? Date.now() })
      this.ringtone.stop()
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.mutate({ stage: 'active', startedAt: this.state.startedAt ?? Date.now() })
        this.ringtone.stop()
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (this.state.stage === 'active') this.setNotice('Call ended')
        this.cleanup(true)
      }
    }

    return [pc, local]
  }

  private async applyRemote(c: CallSdp) {
    if (!this.pc) return
    try {
      await this.pc.setRemoteDescription(c.sdp)
    } catch (e) {
      console.warn('[call] setRemoteDescription failed', e)
    }
  }

  private sendSdp(event: string, callId: string, to: string) {
    if (!this.pc?.localDescription) return
    emitCall(event, { callId, to, sdp: this.pc.localDescription })
  }

  /* ------------------------------ controls ------------------------------ */

  toggleMute() {
    const next = !this.state.muted
    this.state.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !next
    })
    this.mutate({ muted: next })
  }

  toggleCamera() {
    const next = !this.state.cameraOn
    this.state.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = next
    })
    this.mutate({ cameraOn: next })
  }

  end() {
    const wasActive = this.state.stage === 'active'
    if (this.state.peer && this.state.callId) {
      emitCall('call:end', { callId: this.state.callId, to: this.state.peer.id })
    }
    if (wasActive) this.setNotice('You ended the call')
    this.cleanup(true)
  }

  cancel() {
    if (this.state.stage !== 'outgoing') return
    emitCall('call:cancel', { callId: this.state.callId, to: this.state.peer?.id })
    this.cleanup(true)
  }

  private cleanup(reset: boolean) {
    this.ringtone.stop()
    if (this.noAnswerTimer) {
      clearTimeout(this.noAnswerTimer)
      this.noAnswerTimer = null
    }
    this.state.localStream?.getTracks().forEach((t) => t.stop())
    this.pc?.close()
    this.pc = null
    this.pendingOffer = null
    this.pendingCandidates = []
    if (reset) {
      const notice = this.state.notice
      this.mutate({ ...idleSnapshot(), notice })
    }
  }
}

export const callManager = new CallManager()