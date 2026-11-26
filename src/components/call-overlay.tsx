"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Phone, PhoneOff, Video, VideoOff } from "lucide-react";
import { api } from "@/lib/client";
import type { UserLite } from "@/lib/types";

export type CallSignal = { id: number; initiator_id: number; kind: "audio" | "video"; status: string; offer: string | null; answer: string | null; caller_ice: string; callee_ice: string };

export function CallOverlay({ conversationId, meId, other, startKind, incoming, onClose }: { conversationId: number; meId: number; other: UserLite; startKind?: "audio" | "video"; incoming?: CallSignal | null; onClose: () => void }) {
  const [call, setCall] = useState<CallSignal | null>(incoming ?? null);
  const [status, setStatus] = useState(incoming ? "Incoming call" : "Connecting…");
  const [muted, setMuted] = useState(false);
  const peer = useRef<RTCPeerConnection | null>(null);
  const local = useRef<MediaStream | null>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const addedIce = useRef(new Set<string>());
  const callId = useRef<number | null>(incoming?.id ?? null);

  const end = useCallback(async (notify = true) => {
    if (notify && callId.current) await api(`/api/calls/${callId.current}`, { method: "PATCH", body: { status: "ended" } }).catch(() => {});
    onClose();
  }, [onClose]);

  useEffect(() => {
    let stopped = false;
    const setup = async () => {
      try {
        const kind = startKind ?? incoming?.kind ?? "audio";
        let current = incoming ?? null;
        if (!current) {
          const created = await api<{ callId: number }>(`/api/conversations/${conversationId}/calls`, { method: "POST", body: { kind } });
          current = { id: created.callId, initiator_id: meId, kind, status: "ringing", offer: null, answer: null, caller_ice: "[]", callee_ice: "[]" };
          setCall(current);
        }
        callId.current = current.id;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return undefined;
        }
        local.current = stream;
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        peer.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        pc.ontrack = (event) => {
          const [remote] = event.streams;
          if (remoteVideo.current) remoteVideo.current.srcObject = remote;
          if (remoteAudio.current) remoteAudio.current.srcObject = remote;
        };
        pc.onicecandidate = (event) => event.candidate && api(`/api/calls/${current!.id}`, { method: "PATCH", body: { ice: JSON.stringify(event.candidate.toJSON()) } }).catch(() => {});
        if (current.initiator_id === meId) {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await api(`/api/calls/${current.id}`, { method: "PATCH", body: { offer: JSON.stringify(offer) } });
          setStatus("Calling…");
        } else if (current.offer) {
          await pc.setRemoteDescription(JSON.parse(current.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await api(`/api/calls/${current.id}`, { method: "PATCH", body: { answer: JSON.stringify(answer) } });
          setStatus("Connected");
        }
        const timer = window.setInterval(async () => {
          const response = await api<{ call: CallSignal | null }>(`/api/conversations/${conversationId}/calls?call=${current!.id}`).catch(() => ({ call: null }));
          const remoteCall = response.call;
          if (!remoteCall || remoteCall.status === "ended") return end(false);
          setCall(remoteCall);
          if (remoteCall.answer && current!.initiator_id === meId && !pc.remoteDescription) {
            await pc.setRemoteDescription(JSON.parse(remoteCall.answer));
            setStatus("Connected");
          }
          const candidates = JSON.parse(current!.initiator_id === meId ? remoteCall.callee_ice : remoteCall.caller_ice) as RTCIceCandidateInit[];
          for (const candidate of candidates) {
            const key = JSON.stringify(candidate);
            if (!addedIce.current.has(key)) {
              addedIce.current.add(key);
              await pc.addIceCandidate(candidate).catch(() => {});
            }
          }
        }, 1000);
        return () => window.clearInterval(timer);
      } catch (error) {
        setStatus((error as Error).message || "Could not start the call.");
      }
    };
    let cleanup: (() => void) | undefined;
    setup().then((value) => { cleanup = value; });
    return () => { stopped = true; cleanup?.(); peer.current?.close(); local.current?.getTracks().forEach((track) => track.stop()); };
  }, [conversationId, end, incoming, meId, startKind]);

  const toggleMute = () => {
    const next = !muted;
    local.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#080b12]/90 p-4 text-white"><div className="relative flex h-[min(720px,92vh)] w-full max-w-[520px] flex-col items-center justify-between overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-b from-[#202846] to-[#090c15] p-6 shadow-2xl"><div className="text-center"><div className="text-sm text-white/60">{status}</div><h2 className="mt-1 text-2xl font-bold">{other.name || other.username}</h2><div className="text-sm text-white/60">{call?.kind === "video" ? "Video call" : "Voice call"}</div></div>{call?.kind === "video" ? <video ref={remoteVideo} autoPlay playsInline className="h-full max-h-[500px] w-full rounded-3xl bg-black/30 object-cover" /> : <div className="flex flex-1 items-center justify-center"><div className="flex h-40 w-40 items-center justify-center rounded-full bg-white/10 ring-8 ring-white/5"><Phone size={64} className="text-white/80" /></div><audio ref={remoteAudio} autoPlay /></div>}{call?.kind === "video" && <video ref={(element) => { if (element && local.current) element.srcObject = local.current; }} autoPlay muted playsInline className="absolute bottom-28 right-6 h-28 w-20 rounded-xl bg-black object-cover" />}{call?.initiator_id !== meId && status === "Incoming call" && <div className="text-sm text-white/70">Accepting will use your microphone{call?.kind === "video" ? " and camera" : ""}.</div>}<div className="flex items-center gap-4"><button onClick={toggleMute} className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Toggle microphone">{muted ? <VideoOff size={22} /> : <Mic size={22} />}</button><button onClick={() => void end()} className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 hover:bg-red-400" aria-label="End call"><PhoneOff size={26} /></button><span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">{call?.kind === "video" ? <Video size={22} /> : <Phone size={22} />}</span></div></div></div>;
}
